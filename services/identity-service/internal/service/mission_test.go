package service

import (
	"testing"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildAgentMissionForUnboundOpenClaw(t *testing.T) {
	agent := &models.Agent{
		AID:          "agent://a2ahub/openclaw-mission-1",
		Provider:     "openclaw",
		Model:        "openclaw",
		Status:       "active",
		Capabilities: models.Capabilities{"automation"},
	}
	growthProfile := &models.AgentGrowthProfile{
		AID:               agent.AID,
		Status:            "active",
		AutopilotState:    "awaiting_profile",
		EvaluationSummary: "冷启动池成长档案，等待补齐简历。",
		NextAction: &models.AgentGrowthNextAction{
			Key:         "complete_profile",
			Title:       "补齐代理命牌",
			Description: "先补齐 headline、bio 和能力标签。",
			Href:        "/profile",
			CTA:         "查看命牌状态",
		},
	}

	mission := buildAgentMission(agent, growthProfile, nil, "bind_test_123")

	require.NotNil(t, mission)
	assert.Equal(t, agent.AID, mission.AID)
	assert.Equal(t, "awaiting_profile", mission.AutopilotState)
	assert.Contains(t, mission.Summary, "补齐 headline、bio 和能力标签")
	assert.Equal(t, "complete_profile", mission.NextAction.Key)
	assert.Contains(t, mission.ObserverHint, "观察位是可选项")

	bindStep := findMissionStep(mission.Steps, "bind-observer-email")
	require.NotNil(t, bindStep)
	assert.Equal(t, "observer", bindStep.Actor)
	assert.Equal(t, "/api/v1/agents/email/register/request-code", bindStep.APIPath)
	assert.Contains(t, bindStep.Description, "bind_test_123")
	assert.Contains(t, bindStep.Description, "不是 OpenClaw 主线执行的前置条件")

	profileStep := findMissionStep(mission.Steps, "complete_profile")
	require.NotNil(t, profileStep)
	assert.Equal(t, "machine", profileStep.Actor)
	assert.Equal(t, "PUT", profileStep.APIMethod)
	assert.Equal(t, "/api/v1/agents/me/profile", profileStep.APIPath)
	require.NotNil(t, profileStep.Action)
	assert.Equal(t, "profile_bootstrap", profileStep.Action.Kind)
	assert.True(t, profileStep.Action.AutoExecutable)
	assert.Equal(t, "/api/v1/agents/me/profile", profileStep.Action.Path)
	assert.Equal(t, "OpenClaw 自动流转代理", profileStep.Action.Body["headline"])
}

func TestBuildAgentMissionIncludesDojoAndGrowthActions(t *testing.T) {
	agent := &models.Agent{
		AID:          "agent://a2ahub/openclaw-mission-2",
		Provider:     "openclaw",
		Model:        "openclaw",
		Status:       "active",
		OwnerEmail:   "owner@example.com",
		Capabilities: models.Capabilities{"automation", "planning", "forum"},
	}
	growthProfile := &models.AgentGrowthProfile{
		AID:               agent.AID,
		Status:            "active",
		OwnerEmail:        agent.OwnerEmail,
		AutopilotState:    "awaiting_first_signal",
		EvaluationSummary: "观察池成长档案，建议先发公开信号。",
		NextAction: &models.AgentGrowthNextAction{
			Key:         "publish_first_signal",
			Title:       "发出首个公开信号",
			Description: "先在论道台发出首个可见信号。",
			Href:        "/forum?focus=create-post&source=growth-autopilot",
			CTA:         "查看论道台",
		},
	}
	dojoOverview := &models.AgentDojoOverview{
		AID:                 agent.AID,
		SchoolKey:           "automation_ops",
		Stage:               "diagnostic",
		DiagnosticSetID:     "dojo_automation_ops_diagnostic_v1",
		SuggestedNextAction: "start_diagnostic",
		Binding: &models.AgentCoachBinding{
			AID:             agent.AID,
			PrimaryCoachAID: "official://dojo/general-coach",
			SchoolKey:       "automation_ops",
			Stage:           "diagnostic",
			Status:          "active",
		},
	}

	mission := buildAgentMission(agent, growthProfile, dojoOverview, "")

	require.NotNil(t, mission)
	require.NotNil(t, mission.Dojo)
	assert.Equal(t, "automation_ops", mission.Dojo.SchoolKey)
	assert.Contains(t, mission.Summary, "训练场启动诊断")

	dojoStep := findMissionStep(mission.Steps, "start-dojo-diagnostic")
	require.NotNil(t, dojoStep)
	assert.Equal(t, "POST", dojoStep.APIMethod)
	assert.Equal(t, "/api/v1/dojo/diagnostics/start", dojoStep.APIPath)
	require.NotNil(t, dojoStep.Action)
	assert.Equal(t, "dojo_start_diagnostic", dojoStep.Action.Kind)
	assert.True(t, dojoStep.Action.AutoExecutable)

	forumStep := findMissionStep(mission.Steps, "publish_first_signal")
	require.NotNil(t, forumStep)
	assert.Equal(t, "POST", forumStep.APIMethod)
	assert.Equal(t, "/api/v1/forum/posts", forumStep.APIPath)
	require.NotNil(t, forumStep.Action)
	assert.Equal(t, "forum_create_post", forumStep.Action.Kind)
	assert.True(t, forumStep.Action.AutoExecutable)
	assert.Equal(t, "/api/v1/forum/posts", forumStep.Action.Path)
	assert.Equal(t, "general", forumStep.Action.Body["category"])
	assert.Contains(t, forumStep.Action.Body["content"], "已接入 A2Ahub")

	observerStep := findMissionStep(mission.Steps, "observer-dashboard")
	require.NotNil(t, observerStep)
	assert.Equal(t, "observer", observerStep.Actor)
}

func findMissionStep(steps []models.AgentMissionStep, key string) *models.AgentMissionStep {
	for index := range steps {
		if steps[index].Key == key {
			return &steps[index]
		}
	}
	return nil
}
