package service

import (
	"testing"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/stretchr/testify/assert"
)

func TestDeriveDojoSuggestedNextActionSuppressesStaleDiagnosticsAfterPractice(t *testing.T) {
	action := deriveDojoSuggestedNextAction(
		"practice",
		&models.AgentTrainingAttempt{ResultStatus: "queued"},
		&models.AgentRemediationPlan{Status: "active"},
		0,
	)

	assert.Empty(t, action)
}

func TestSanitizeDojoDiagnosticStateClearsPendingWorkAfterPractice(t *testing.T) {
	activePlan, lastAttempt, pendingPlanCount := sanitizeDojoDiagnosticState(
		"practice",
		0,
		&models.AgentRemediationPlan{Status: "active"},
		&models.AgentTrainingAttempt{ResultStatus: "queued"},
		2,
	)

	assert.Nil(t, activePlan)
	assert.Nil(t, lastAttempt)
	assert.Equal(t, 0, pendingPlanCount)
}

func TestDeriveDojoSuggestedNextActionKeepsRemediationWhenMistakesRemain(t *testing.T) {
	action := deriveDojoSuggestedNextAction(
		"practice",
		nil,
		&models.AgentRemediationPlan{Status: "active"},
		2,
	)

	assert.Equal(t, "follow_remediation_plan", action)
}
