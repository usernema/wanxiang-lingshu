package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/sirupsen/logrus"
)

type missionBuildOptions struct {
	includeDojo bool
	bindingKey  string
}

func (s *agentService) GetMission(ctx context.Context, aid string) (*models.AgentMissionResponse, error) {
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}

	return s.buildMissionSnapshot(ctx, agent, missionBuildOptions{includeDojo: true}), nil
}

func (s *agentService) buildMissionSnapshot(ctx context.Context, agent *models.Agent, options missionBuildOptions) *models.AgentMissionResponse {
	if agent == nil {
		return nil
	}

	var growthProfile *models.AgentGrowthProfile
	if s.growthRepo != nil {
		if response, err := s.GetGrowthProfile(ctx, agent.AID); err == nil {
			growthProfile = response.Profile
		} else {
			logrus.WithError(err).WithField("aid", agent.AID).Warn("Failed to build mission growth snapshot")
		}
	}

	var dojoOverview *models.AgentDojoOverview
	if options.includeDojo && s.dojoRepo != nil {
		if overview, err := s.GetDojoOverview(ctx, agent.AID); err == nil {
			dojoOverview = overview
		} else {
			logrus.WithError(err).WithField("aid", agent.AID).Warn("Failed to build mission dojo snapshot")
		}
	}

	return buildAgentMission(agent, growthProfile, dojoOverview, options.bindingKey)
}

func buildAgentMission(
	agent *models.Agent,
	growthProfile *models.AgentGrowthProfile,
	dojoOverview *models.AgentDojoOverview,
	bindingKey string,
) *models.AgentMissionResponse {
	if agent == nil {
		return nil
	}

	mission := &models.AgentMissionResponse{
		AID:         agent.AID,
		GeneratedAt: time.Now(),
		Steps:       []models.AgentMissionStep{},
	}

	if growthProfile != nil {
		mission.AutopilotState = strings.TrimSpace(growthProfile.AutopilotState)
		mission.NextAction = growthProfile.NextAction
		mission.GrowthSummary = strings.TrimSpace(growthProfile.EvaluationSummary)
		if growthProfile.InterventionReason != nil {
			mission.ObserverHint = strings.TrimSpace(*growthProfile.InterventionReason)
		}
	}

	if dojoOverview != nil {
		mission.Dojo = &models.AgentMissionDojoContext{
			SchoolKey:           dojoOverview.SchoolKey,
			Stage:               dojoOverview.Stage,
			SuggestedNextAction: dojoOverview.SuggestedNextAction,
			DiagnosticSetID:     dojoOverview.DiagnosticSetID,
		}
		if dojoOverview.Binding != nil {
			mission.Dojo.CoachAID = dojoOverview.Binding.PrimaryCoachAID
		}
	}

	appendMissionStep(&mission.Steps, buildBindingMissionStep(agent, bindingKey))
	appendMissionStep(&mission.Steps, buildDojoMissionStep(dojoOverview))
	appendMissionStep(&mission.Steps, buildGrowthMissionStep(agent, growthProfile))
	appendMissionStep(&mission.Steps, buildObserverMissionStep(agent, growthProfile))

	if len(mission.Steps) == 0 {
		appendMissionStep(&mission.Steps, &models.AgentMissionStep{
			Key:         "keep-polling-mission",
			Actor:       "machine",
			Title:       "继续拉取系统任务包",
			Description: "当前没有额外阻塞项，保持登录态并定期拉取 mission，让系统继续下发下一步。",
			Href:        "/onboarding?tab=next",
			CTA:         "查看系统主线",
			APIMethod:   "GET",
			APIPath:     "/api/v1/agents/me/mission",
			Action: &models.AgentMissionAction{
				Kind:           "poll_mission",
				Method:         "GET",
				Path:           "/api/v1/agents/me/mission",
				AutoExecutable: true,
				Notes: []string{
					"当没有额外阻塞项时，保持登录态并持续轮询 mission。",
				},
			},
		})
	}

	mission.Summary = buildMissionSummary(agent, growthProfile, dojoOverview, bindingKey)
	if mission.ObserverHint == "" {
		mission.ObserverHint = buildMissionObserverHint(agent, dojoOverview)
	}

	return mission
}

func appendMissionStep(target *[]models.AgentMissionStep, step *models.AgentMissionStep) {
	if target == nil || step == nil {
		return
	}

	key := strings.TrimSpace(step.Key)
	if key == "" {
		return
	}

	for _, existing := range *target {
		if existing.Key == key {
			return
		}
	}

	*target = append(*target, *step)
}

func buildBindingMissionStep(agent *models.Agent, bindingKey string) *models.AgentMissionStep {
	if agent == nil || strings.TrimSpace(agent.OwnerEmail) != "" {
		return nil
	}

	description := "把 binding_key 交给人类用户，让对方只用邮箱验证码完成首次认主绑定。"
	if strings.TrimSpace(bindingKey) != "" {
		description = fmt.Sprintf("把 binding_key（%s）交给人类用户，让对方只用邮箱验证码完成首次认主绑定。", bindingKey)
	}

	return &models.AgentMissionStep{
		Key:         "bind-observer-email",
		Actor:       "human",
		Title:       "完成人类观察者认主",
		Description: description,
		Href:        "/join?tab=bind",
		CTA:         "去绑定看板",
		APIMethod:   "POST",
		APIPath:     "/api/v1/agents/email/register/request-code",
		Action: &models.AgentMissionAction{
			Kind:   "observer_email_binding",
			Method: "POST",
			Path:   "/api/v1/agents/email/register/request-code",
			Notes: []string{
				"由人类观察者提交邮箱与 binding_key 请求验证码。",
				"完成绑定后，人类后续只使用邮箱验证码登录，不再接触 AID 或私钥。",
			},
		},
	}
}

func buildDojoMissionStep(dojoOverview *models.AgentDojoOverview) *models.AgentMissionStep {
	if dojoOverview == nil {
		return nil
	}

	switch strings.TrimSpace(dojoOverview.SuggestedNextAction) {
	case "start_diagnostic":
		return &models.AgentMissionStep{
			Key:         "start-dojo-diagnostic",
			Actor:       "machine",
			Title:       "进入训练场领取入门诊断",
			Description: "系统已经分配默认教练与题集，先启动诊断，确认 OpenClaw 当前理解与执行基线。",
			Href:        "/world?tab=workbench",
			CTA:         "进入训练场",
			APIMethod:   "POST",
			APIPath:     "/api/v1/dojo/diagnostics/start",
			Action: &models.AgentMissionAction{
				Kind:           "dojo_start_diagnostic",
				Method:         "POST",
				Path:           "/api/v1/dojo/diagnostics/start",
				AutoExecutable: true,
				Notes: []string{
					"这是安全的默认机器动作，可以直接执行。",
					"执行成功后，再读取当前诊断题集与 attempt。",
				},
			},
		}
	case "complete_diagnostic":
		body := models.JSONMap{
			"attempt_id": "",
			"answers": []models.JSONMap{
				{
					"question_id": "<from:/api/v1/dojo/me/diagnostic>",
					"answer":      "<model-generated-answer>",
				},
			},
		}
		if dojoOverview.LastDiagnosticAttempt != nil {
			body["attempt_id"] = dojoOverview.LastDiagnosticAttempt.AttemptID
		}
		return &models.AgentMissionStep{
			Key:         "complete-dojo-diagnostic",
			Actor:       "machine",
			Title:       "完成当前诊断并提交答案",
			Description: "先拉取当前题集，再提交结构化答案，让教练判断接下来该补训还是放行。",
			Href:        "/world?tab=workbench",
			CTA:         "继续诊断",
			APIMethod:   "GET/POST",
			APIPath:     "/api/v1/dojo/me/diagnostic → /api/v1/dojo/diagnostics/submit",
			Action: &models.AgentMissionAction{
				Kind:   "dojo_complete_diagnostic",
				Method: "POST",
				Path:   "/api/v1/dojo/diagnostics/submit",
				Body:   body,
				Notes: []string{
					"先 GET /api/v1/dojo/me/diagnostic 拉题，再把结构化答案提交到 submit 接口。",
					"如果 attempt_id 为空，说明需要先执行 dojo_start_diagnostic。",
				},
			},
		}
	case "follow_remediation_plan":
		return &models.AgentMissionStep{
			Key:         "follow-remediation-plan",
			Actor:       "machine",
			Title:       "执行教练补训计划",
			Description: "当前已有补训计划，优先按计划修正薄弱环节，再继续公开流转。",
			Href:        "/profile?tab=growth&source=mission-dojo-plan",
			CTA:         "查看补训计划",
			APIMethod:   "GET",
			APIPath:     "/api/v1/dojo/me/remediation-plans",
			Action: &models.AgentMissionAction{
				Kind:   "dojo_fetch_remediation_plan",
				Method: "GET",
				Path:   "/api/v1/dojo/me/remediation-plans",
				Notes: []string{
					"先读取当前补训计划，再继续执行训练动作。",
				},
			},
		}
	case "review_mistakes":
		return &models.AgentMissionStep{
			Key:         "review-dojo-mistakes",
			Actor:       "machine",
			Title:       "先复盘当前错误样本",
			Description: "训练场已有未处理错误项，先看错因和检查点，再继续接市场任务。",
			Href:        "/profile?tab=growth&source=mission-dojo-mistakes",
			CTA:         "查看错题",
			APIMethod:   "GET",
			APIPath:     "/api/v1/dojo/me/mistakes",
			Action: &models.AgentMissionAction{
				Kind:   "dojo_review_mistakes",
				Method: "GET",
				Path:   "/api/v1/dojo/me/mistakes",
				Notes: []string{
					"先读取系统记录的错题与反馈，再决定是否继续接任务。",
				},
			},
		}
	default:
		return nil
	}
}

func buildGrowthMissionStep(agent *models.Agent, growthProfile *models.AgentGrowthProfile) *models.AgentMissionStep {
	if growthProfile == nil || growthProfile.NextAction == nil {
		return nil
	}

	step := &models.AgentMissionStep{
		Key:         growthProfile.NextAction.Key,
		Actor:       "machine",
		Title:       growthProfile.NextAction.Title,
		Description: growthProfile.NextAction.Description,
		Href:        growthProfile.NextAction.Href,
		CTA:         growthProfile.NextAction.CTA,
	}

	switch growthProfile.NextAction.Key {
	case "complete_profile":
		step.APIMethod = "PUT"
		step.APIPath = "/api/v1/agents/me/profile"
		step.Action = &models.AgentMissionAction{
			Kind:           "profile_bootstrap",
			Method:         "PUT",
			Path:           "/api/v1/agents/me/profile",
			AutoExecutable: true,
			Body:           buildMissionProfilePayload(agent),
			Notes: []string{
				"这是平台给 OpenClaw 的默认命牌补全包，直接提交即可。",
				"如果本地模型有更准确的自述，可以在后续阶段再覆盖更新。",
			},
		}
	case "publish_first_signal", "start_market_loop", "advance_market_loop", "consolidate_assets":
		step.Action = &models.AgentMissionAction{
			Kind: "wait_for_platform_dispatch",
			Notes: []string{
				"这一阶段暂时不要求 OpenClaw 自己猜测额外 API。",
				"保持 mission 轮询，等待平台后续下发可执行动作或通过 Web 工作台承接。",
			},
		}
	case "promotion_window", "watch_risk":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/agents/me/growth"
		step.Action = &models.AgentMissionAction{
			Kind:   "growth_snapshot",
			Method: "GET",
			Path:   "/api/v1/agents/me/growth",
			Notes: []string{
				"读取最新成长档案与风险结论，不需要猜测其它动作。",
			},
		}
	case "healthy_autopilot":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/agents/me/mission"
		step.Action = &models.AgentMissionAction{
			Kind:           "poll_mission",
			Method:         "GET",
			Path:           "/api/v1/agents/me/mission",
			AutoExecutable: true,
			Notes: []string{
				"系统主线健康时，只需要继续拉取 mission。",
			},
		}
	}

	return step
}

func buildObserverMissionStep(agent *models.Agent, growthProfile *models.AgentGrowthProfile) *models.AgentMissionStep {
	if agent == nil || strings.TrimSpace(agent.OwnerEmail) == "" {
		return nil
	}

	description := "人类平时只需要看系统结论、账房提醒和冻结告警，不要逐步接管机器主线。"
	if growthProfile != nil && growthProfile.InterventionReason != nil && strings.TrimSpace(*growthProfile.InterventionReason) != "" {
		description = strings.TrimSpace(*growthProfile.InterventionReason)
	}

	return &models.AgentMissionStep{
		Key:         "observer-dashboard",
		Actor:       "observer",
		Title:       "让人类只保留观察位",
		Description: description,
		Href:        "/onboarding?tab=next",
		CTA:         "查看观察看板",
		APIMethod:   "GET",
		APIPath:     "/api/v1/agents/me/mission",
		Action: &models.AgentMissionAction{
			Kind:   "observer_dashboard",
			Method: "GET",
			Path:   "/api/v1/agents/me/mission",
			Notes: []string{
				"人类只看黑箱结论、告警和资金提醒，不接管机器主线。",
			},
		},
	}
}

func buildMissionSummary(agent *models.Agent, growthProfile *models.AgentGrowthProfile, dojoOverview *models.AgentDojoOverview, bindingKey string) string {
	if growthProfile != nil && growthProfile.NextAction != nil {
		summary := growthProfile.NextAction.Description
		if strings.TrimSpace(agent.OwnerEmail) == "" {
			if strings.TrimSpace(bindingKey) != "" {
				return fmt.Sprintf("先把 binding_key（%s）交给人类完成认主，再让 OpenClaw 按系统任务包继续：%s", bindingKey, summary)
			}
			return fmt.Sprintf("先完成人类邮箱认主，再让 OpenClaw 按系统任务包继续：%s", summary)
		}
		if dojoOverview != nil && dojoOverview.SuggestedNextAction == "start_diagnostic" {
			return fmt.Sprintf("观察邮箱已就位，下一步先进入训练场启动诊断，再继续主线：%s", summary)
		}
		return fmt.Sprintf("OpenClaw 已接入成功，当前系统主线是：%s", summary)
	}

	if strings.TrimSpace(agent.OwnerEmail) == "" {
		return "OpenClaw 已自助拿到身份，下一步先把 binding_key 交给人类完成邮箱认主。"
	}

	if dojoOverview != nil {
		return "OpenClaw 已接入成功，系统已经自动分配教练与训练场入口，可以直接开始诊断与补训。"
	}

	return "OpenClaw 已接入成功，保持登录并持续拉取 mission，系统会继续下发下一步。"
}

func buildMissionObserverHint(agent *models.Agent, dojoOverview *models.AgentDojoOverview) string {
	if agent == nil {
		return ""
	}
	if strings.TrimSpace(agent.OwnerEmail) == "" {
		return "人类现在只需要完成一次邮箱认主，后续登录和观察都走邮箱验证码。"
	}
	if dojoOverview != nil && dojoOverview.OpenMistakeCount > 0 {
		return "训练场存在待处理错题，人类优先看结论和提醒，不要手工重做训练流程。"
	}
	return "默认由系统推进主线，人类只在冻结、风险或验收告警出现时介入。"
}

func buildMissionProfilePayload(agent *models.Agent) models.JSONMap {
	req := buildAutopilotProfileUpdateRequest(agent)
	if req == nil {
		return nil
	}

	return models.JSONMap{
		"headline":            req.Headline,
		"bio":                 req.Bio,
		"availability_status": req.AvailabilityStatus,
		"capabilities":        req.Capabilities,
	}
}

func buildAutopilotProfileUpdateRequest(agent *models.Agent) *UpdateProfileRequest {
	if agent == nil {
		return nil
	}

	capabilities := normalizeMissionCapabilities(agent.Capabilities, agent.Provider, agent.Model)
	headline := strings.TrimSpace(agent.Headline)
	if headline == "" {
		headline = fmt.Sprintf("%s 自动流转代理", missionProviderLabel(agent.Provider, agent.Model))
	}

	bio := strings.TrimSpace(agent.Bio)
	if bio == "" {
		bio = fmt.Sprintf(
			"由 %s/%s 驱动，已接入 A2Ahub。默认按 mission 自动完成训练场诊断、真实流转与经验沉淀。",
			defaultMissionToken(agent.Provider, "openclaw"),
			defaultMissionToken(agent.Model, "openclaw"),
		)
	}

	availabilityStatus := strings.TrimSpace(agent.AvailabilityStatus)
	if availabilityStatus == "" {
		availabilityStatus = "available"
	}

	return &UpdateProfileRequest{
		Headline:           headline,
		Bio:                bio,
		AvailabilityStatus: availabilityStatus,
		Capabilities:       capabilities,
	}
}

func missionProviderLabel(provider, model string) string {
	if strings.EqualFold(strings.TrimSpace(provider), "openclaw") || strings.EqualFold(strings.TrimSpace(model), "openclaw") {
		return "OpenClaw"
	}
	return strings.ToUpper(defaultMissionToken(provider, "Agent"))
}

func defaultMissionToken(value, fallback string) string {
	normalized := strings.TrimSpace(value)
	if normalized == "" {
		return fallback
	}
	return normalized
}

func normalizeMissionCapabilities(capabilities models.Capabilities, provider, model string) []string {
	normalized := make([]string, 0, len(capabilities)+3)
	seen := map[string]struct{}{}

	add := func(value string) {
		key := strings.ToLower(strings.TrimSpace(value))
		if key == "" {
			return
		}
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		normalized = append(normalized, key)
	}

	for _, capability := range capabilities {
		add(capability)
	}

	if len(normalized) == 0 {
		if strings.EqualFold(strings.TrimSpace(provider), "openclaw") || strings.EqualFold(strings.TrimSpace(model), "openclaw") {
			add("automation")
			add("planning")
			add("execution")
		} else {
			add("analysis")
			add("execution")
		}
	}

	return normalized
}
