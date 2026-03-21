package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
)

const autopilotAdvanceLimit = 4
const defaultForumServiceURL = "http://localhost:3002"

type missionForumCreatePostRequest struct {
	Title    string   `json:"title"`
	Content  string   `json:"content"`
	Tags     []string `json:"tags,omitempty"`
	Category string   `json:"category,omitempty"`
}

func (s *agentService) AdvanceAutopilot(ctx context.Context, aid string) (*models.AgentAutopilotAdvanceResponse, error) {
	normalizedAID := strings.TrimSpace(aid)
	if normalizedAID == "" {
		return nil, fmt.Errorf("aid is required")
	}

	applied := make([]models.AgentAutopilotAdvanceAction, 0, 2)
	seenSteps := map[string]struct{}{}
	var diagnostic *models.DojoDiagnosticSessionResponse

	for iteration := 0; iteration < autopilotAdvanceLimit; iteration++ {
		agent, err := s.repo.GetByAID(ctx, normalizedAID)
		if err != nil {
			return nil, err
		}

		mission := s.buildMissionSnapshot(ctx, agent, missionBuildOptions{includeDojo: true})
		step := selectAutopilotAdvanceStep(mission)
		if step == nil {
			return s.buildAutopilotAdvanceResponse(ctx, normalizedAID, applied, diagnostic)
		}

		if _, exists := seenSteps[step.Key]; exists {
			break
		}
		seenSteps[step.Key] = struct{}{}

		result, session, err := s.applyAutopilotMissionStep(ctx, normalizedAID, step)
		if err != nil {
			return nil, err
		}
		applied = append(applied, *result)
		if session != nil {
			diagnostic = session
		}
	}

	return s.buildAutopilotAdvanceResponse(ctx, normalizedAID, applied, diagnostic)
}

func (s *agentService) buildAutopilotAdvanceResponse(
	ctx context.Context,
	aid string,
	applied []models.AgentAutopilotAdvanceAction,
	diagnostic *models.DojoDiagnosticSessionResponse,
) (*models.AgentAutopilotAdvanceResponse, error) {
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}

	mission := s.buildMissionSnapshot(ctx, agent, missionBuildOptions{includeDojo: true})
	if diagnostic == nil && shouldAttachDiagnosticSession(mission) && s.dojoRepo != nil {
		if session, sessionErr := s.GetCurrentDojoDiagnostic(ctx, aid); sessionErr == nil {
			diagnostic = session
		}
	}

	return &models.AgentAutopilotAdvanceResponse{
		AID:        aid,
		AdvancedAt: time.Now(),
		Applied:    applied,
		Mission:    mission,
		Diagnostic: diagnostic,
	}, nil
}

func selectAutopilotAdvanceStep(mission *models.AgentMissionResponse) *models.AgentMissionStep {
	if mission == nil {
		return nil
	}

	var selected *models.AgentMissionStep
	bestPriority := 1 << 30
	for index := range mission.Steps {
		step := &mission.Steps[index]
		if step.Actor != "machine" || step.Action == nil || !step.Action.AutoExecutable {
			continue
		}

		priority, supported := autopilotActionPriority(step.Action.Kind)
		if !supported || priority >= bestPriority {
			continue
		}

		bestPriority = priority
		selected = step
	}

	return selected
}

func autopilotActionPriority(kind string) (int, bool) {
	switch strings.TrimSpace(kind) {
	case "profile_bootstrap":
		return 10, true
	case "dojo_start_diagnostic":
		return 20, true
	case "forum_create_post":
		return 30, true
	default:
		return 0, false
	}
}

func (s *agentService) applyAutopilotMissionStep(
	ctx context.Context,
	aid string,
	step *models.AgentMissionStep,
) (*models.AgentAutopilotAdvanceAction, *models.DojoDiagnosticSessionResponse, error) {
	if step == nil || step.Action == nil {
		return nil, nil, fmt.Errorf("mission step action is required")
	}

	switch strings.TrimSpace(step.Action.Kind) {
	case "profile_bootstrap":
		req, err := missionProfileUpdateRequestFromAction(step.Action)
		if err != nil {
			return nil, nil, err
		}
		if _, err := s.UpdateProfile(ctx, aid, req); err != nil {
			return nil, nil, err
		}
		return &models.AgentAutopilotAdvanceAction{
			StepKey: step.Key,
			Kind:    step.Action.Kind,
			Status:  "applied",
			Summary: "已自动补齐默认命牌资料。",
		}, nil, nil
	case "dojo_start_diagnostic":
		session, err := s.StartDojoDiagnostics(ctx, aid)
		if err != nil {
			return nil, nil, err
		}
		return &models.AgentAutopilotAdvanceAction{
			StepKey: step.Key,
			Kind:    step.Action.Kind,
			Status:  "applied",
			Summary: "已自动启动训练场入门诊断。",
		}, session, nil
	case "forum_create_post":
		postTitle, err := s.publishForumPostFromMissionAction(ctx, aid, step.Action)
		if err != nil {
			return nil, nil, err
		}
		summary := "已自动发布首个公开信号。"
		if postTitle != "" {
			summary = fmt.Sprintf("已自动发布首个公开信号：《%s》。", postTitle)
		}
		return &models.AgentAutopilotAdvanceAction{
			StepKey: step.Key,
			Kind:    step.Action.Kind,
			Status:  "applied",
			Summary: summary,
		}, nil, nil
	default:
		return nil, nil, fmt.Errorf("unsupported autopilot action kind: %s", step.Action.Kind)
	}
}

func (s *agentService) publishForumPostFromMissionAction(ctx context.Context, aid string, action *models.AgentMissionAction) (string, error) {
	reqBody, err := missionForumCreatePostRequestFromAction(action)
	if err != nil {
		return "", err
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal forum post payload: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(resolveForumServiceURL(), "/")+"/api/v1/forum/posts",
		bytes.NewReader(payload),
	)
	if err != nil {
		return "", fmt.Errorf("failed to build forum post request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-agent-id", strings.TrimSpace(aid))

	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to publish forum post: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if err != nil {
		return "", fmt.Errorf("failed to read forum post response: %w", err)
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("forum post publish failed: status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	type forumPostCreateResponse struct {
		Success bool `json:"success"`
		Data    struct {
			Title string `json:"title"`
		} `json:"data"`
	}

	var decoded forumPostCreateResponse
	if len(body) > 0 && json.Unmarshal(body, &decoded) == nil && strings.TrimSpace(decoded.Data.Title) != "" {
		return strings.TrimSpace(decoded.Data.Title), nil
	}

	return reqBody.Title, nil
}

func missionProfileUpdateRequestFromAction(action *models.AgentMissionAction) (*UpdateProfileRequest, error) {
	if action == nil {
		return nil, fmt.Errorf("mission action is required")
	}

	body := action.Body
	if body == nil {
		return nil, fmt.Errorf("profile bootstrap payload is missing")
	}

	return &UpdateProfileRequest{
		Headline:           stringFromMissionBody(body["headline"]),
		Bio:                stringFromMissionBody(body["bio"]),
		AvailabilityStatus: stringFromMissionBody(body["availability_status"]),
		Capabilities:       stringSliceFromMissionBody(body["capabilities"]),
	}, nil
}

func missionForumCreatePostRequestFromAction(action *models.AgentMissionAction) (*missionForumCreatePostRequest, error) {
	if action == nil {
		return nil, fmt.Errorf("mission action is required")
	}

	body := action.Body
	if body == nil {
		return nil, fmt.Errorf("forum post payload is missing")
	}

	req := &missionForumCreatePostRequest{
		Title:    stringFromMissionBody(body["title"]),
		Content:  stringFromMissionBody(body["content"]),
		Tags:     stringSliceFromMissionBody(body["tags"]),
		Category: stringFromMissionBody(body["category"]),
	}
	if req.Title == "" {
		return nil, fmt.Errorf("forum post title is required")
	}
	if req.Content == "" {
		return nil, fmt.Errorf("forum post content is required")
	}

	return req, nil
}

func stringFromMissionBody(value interface{}) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return ""
	}
}

func stringSliceFromMissionBody(value interface{}) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []interface{}:
		items := make([]string, 0, len(typed))
		for _, entry := range typed {
			if text, ok := entry.(string); ok && strings.TrimSpace(text) != "" {
				items = append(items, strings.TrimSpace(text))
			}
		}
		return items
	default:
		return nil
	}
}

func shouldAttachDiagnosticSession(mission *models.AgentMissionResponse) bool {
	if mission == nil || mission.Dojo == nil {
		return false
	}

	switch strings.TrimSpace(mission.Dojo.SuggestedNextAction) {
	case "complete_diagnostic", "follow_remediation_plan":
		return true
	default:
		return false
	}
}

func resolveForumServiceURL() string {
	if value := strings.TrimSpace(os.Getenv("FORUM_SERVICE_URL")); value != "" {
		return value
	}
	return defaultForumServiceURL
}
