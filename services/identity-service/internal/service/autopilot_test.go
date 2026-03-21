package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSelectAutopilotAdvanceStepPrefersProfileBootstrap(t *testing.T) {
	mission := &models.AgentMissionResponse{
		Steps: []models.AgentMissionStep{
			{
				Key:   "start-dojo-diagnostic",
				Actor: "machine",
				Action: &models.AgentMissionAction{
					Kind:           "dojo_start_diagnostic",
					AutoExecutable: true,
				},
			},
			{
				Key:   "complete_profile",
				Actor: "machine",
				Action: &models.AgentMissionAction{
					Kind:           "profile_bootstrap",
					AutoExecutable: true,
				},
			},
		},
	}

	step := selectAutopilotAdvanceStep(mission)
	require.NotNil(t, step)
	assert.Equal(t, "complete_profile", step.Key)
}

func TestMissionProfileUpdateRequestFromAction(t *testing.T) {
	req, err := missionProfileUpdateRequestFromAction(&models.AgentMissionAction{
		Kind: "profile_bootstrap",
		Body: models.JSONMap{
			"headline":            "OpenClaw 自动流转代理",
			"bio":                 "自动推进训练与任务流转。",
			"availability_status": "available",
			"capabilities":        []interface{}{"code", "browser"},
		},
	})

	require.NoError(t, err)
	assert.Equal(t, "OpenClaw 自动流转代理", req.Headline)
	assert.Equal(t, "自动推进训练与任务流转。", req.Bio)
	assert.Equal(t, "available", req.AvailabilityStatus)
	assert.Equal(t, []string{"code", "browser"}, req.Capabilities)
}

func TestApplyAutopilotMissionStepPublishesForumSignal(t *testing.T) {
	const aid = "agent://a2ahub/autopilot-forum"

	var received struct {
		Title    string   `json:"title"`
		Content  string   `json:"content"`
		Tags     []string `json:"tags"`
		Category string   `json:"category"`
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/api/v1/forum/posts", r.URL.Path)
		assert.Equal(t, aid, r.Header.Get("x-agent-id"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&received))

		w.WriteHeader(http.StatusCreated)
		require.NoError(t, json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"title": received.Title,
			},
		}))
	}))
	defer server.Close()

	t.Setenv("FORUM_SERVICE_URL", server.URL)

	svc := &agentService{}
	result, session, err := svc.applyAutopilotMissionStep(context.Background(), aid, &models.AgentMissionStep{
		Key:   "publish_first_signal",
		Actor: "machine",
		Action: &models.AgentMissionAction{
			Kind:           "forum_create_post",
			AutoExecutable: true,
			Body: models.JSONMap{
				"title":    "OpenClaw 首个公开信号",
				"content":  "OpenClaw 已接入 A2Ahub，当前开始自动发布首帖。",
				"category": "general",
				"tags":     []interface{}{"openclaw", "signal"},
			},
		},
	})

	require.NoError(t, err)
	assert.Nil(t, session)
	require.NotNil(t, result)
	assert.Equal(t, "publish_first_signal", result.StepKey)
	assert.Equal(t, "forum_create_post", result.Kind)
	assert.Equal(t, "applied", result.Status)
	assert.Contains(t, result.Summary, "OpenClaw 首个公开信号")
	assert.Equal(t, "OpenClaw 首个公开信号", received.Title)
	assert.Equal(t, "general", received.Category)
	assert.Equal(t, []string{"openclaw", "signal"}, received.Tags)
}
