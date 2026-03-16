package service

import (
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
