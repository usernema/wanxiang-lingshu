package service

import (
	"testing"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyGrowthRuntimeStateAwaitingProfile(t *testing.T) {
	profile := &models.AgentGrowthProfile{
		Status:     "active",
		OwnerEmail: "observer@example.com",
	}

	applyGrowthRuntimeState(profile)

	require.NotNil(t, profile.NextAction)
	assert.Equal(t, "awaiting_profile", profile.AutopilotState)
	assert.Equal(t, "补齐代理命牌", profile.NextAction.Title)
	assert.Nil(t, profile.InterventionReason)
}

func TestApplyGrowthRuntimeStateAwaitingFirstSignal(t *testing.T) {
	profile := &models.AgentGrowthProfile{
		Status:         "active",
		OwnerEmail:     "observer@example.com",
		Headline:       "自动化修士",
		Bio:            "能完成真实交付。",
		Capabilities:   models.Capabilities{"automation", "planning"},
		ForumPostCount: 0,
	}

	applyGrowthRuntimeState(profile)

	require.NotNil(t, profile.NextAction)
	assert.Equal(t, "awaiting_first_signal", profile.AutopilotState)
	assert.Equal(t, "/forum?focus=create-post&source=growth-autopilot", profile.NextAction.Href)
}

func TestApplyGrowthRuntimeStateAwaitingAssetConsolidation(t *testing.T) {
	profile := &models.AgentGrowthProfile{
		Status:             "active",
		OwnerEmail:         "observer@example.com",
		Headline:           "自动化修士",
		Bio:                "能完成真实交付。",
		Capabilities:       models.Capabilities{"automation", "planning"},
		ForumPostCount:     1,
		TotalTaskCount:     1,
		CompletedTaskCount: 1,
	}

	applyGrowthRuntimeState(profile)

	require.NotNil(t, profile.NextAction)
	assert.Equal(t, "awaiting_asset_consolidation", profile.AutopilotState)
	assert.Equal(t, "沉淀首轮成功经验", profile.NextAction.Title)
}

func TestApplyGrowthRuntimeStateAddsObserverInterventionHint(t *testing.T) {
	profile := &models.AgentGrowthProfile{
		Status:             "active",
		Headline:           "自动化修士",
		Bio:                "能完成真实交付。",
		Capabilities:       models.Capabilities{"automation", "planning"},
		ForumPostCount:     1,
		TotalTaskCount:     2,
		CompletedTaskCount: 1,
		ActiveSkillCount:   1,
	}

	applyGrowthRuntimeState(profile)

	require.NotNil(t, profile.NextAction)
	require.NotNil(t, profile.InterventionReason)
	assert.Equal(t, "healthy_autopilot", profile.AutopilotState)
	assert.Contains(t, *profile.InterventionReason, "观察邮箱")
}
