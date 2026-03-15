package service

import (
	"testing"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEvaluateSectApplicationTreatsDojoRouteAsRecommendationForFirstFormalApplication(t *testing.T) {
	svc := &agentService{}

	evaluation := svc.evaluateSectApplication(
		&models.Agent{
			Headline:     "擅长自动化交付",
			Bio:          "能做自动化任务拆解与执行。",
			Capabilities: models.Capabilities{"planning", "automation"},
		},
		&models.AgentGrowthProfile{
			CurrentMaturityPool:  "standard",
			CompletedTaskCount:   1,
			IncubatingDraftCount: 1,
		},
		&models.AgentCoachBinding{
			SchoolKey: "automation_ops",
			Stage:     "practice",
		},
		"",
		"automation_ops",
	)

	require.NotNil(t, evaluation)
	assert.Equal(t, sectApplicationTypeApplication, evaluation.ApplicationType)
	assert.Equal(t, "", evaluation.CurrentSectKey)
	assert.Equal(t, "automation_ops", evaluation.TargetSectKey)
	assert.Equal(t, "ready", evaluation.Status)
	assert.Equal(t, 100, evaluation.ReadinessScore)
}

func TestEvaluateSectApplicationUsesApprovedSectMembershipForTransfer(t *testing.T) {
	svc := &agentService{}

	evaluation := svc.evaluateSectApplication(
		&models.Agent{
			Headline:     "擅长内容选题",
			Bio:          "能把研究结果转成内容生产流程。",
			Capabilities: models.Capabilities{"research", "content"},
		},
		&models.AgentGrowthProfile{
			CurrentMaturityPool: "standard",
			CompletedTaskCount:  2,
			ValidatedDraftCount: 1,
			PrimaryDomain:       "content",
		},
		&models.AgentCoachBinding{
			SchoolKey: "content_ops",
			Stage:     "practice",
		},
		"automation_ops",
		"content_ops",
	)

	require.NotNil(t, evaluation)
	assert.Equal(t, sectApplicationTypeTransfer, evaluation.ApplicationType)
	assert.Equal(t, "automation_ops", evaluation.CurrentSectKey)
	assert.Equal(t, "content_ops", evaluation.TargetSectKey)
	assert.Equal(t, "ready", evaluation.Status)
}

func TestLatestApprovedSectKeyReturnsNewestApprovedMembership(t *testing.T) {
	currentSectKey := latestApprovedSectKey([]models.SectMembershipApplication{
		{
			Status:        sectApplicationStatusSubmitted,
			TargetSectKey: "content_ops",
		},
		{
			Status:        sectApplicationStatusApproved,
			TargetSectKey: "research_ops",
		},
		{
			Status:        sectApplicationStatusApproved,
			TargetSectKey: "automation_ops",
		},
	})

	assert.Equal(t, "research_ops", currentSectKey)
}
