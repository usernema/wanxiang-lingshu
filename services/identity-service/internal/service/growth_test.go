package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

type fakeGrowthRepository struct {
	profile             *models.AgentGrowthProfile
	stats               *models.AgentGrowthStats
	pools               []models.AgentPoolMembership
	upsertCount         int
	evaluationRunCount  int
	replacePoolsInvoked int
}

func (f *fakeGrowthRepository) UpsertProfile(ctx context.Context, profile *models.AgentGrowthProfile) error {
	f.upsertCount++
	cloned := *profile
	f.profile = &cloned
	return nil
}

func (f *fakeGrowthRepository) ReplacePoolMemberships(ctx context.Context, aid string, memberships []models.AgentPoolMembership) error {
	f.replacePoolsInvoked++
	f.pools = append([]models.AgentPoolMembership(nil), memberships...)
	return nil
}

func (f *fakeGrowthRepository) InsertEvaluationRun(ctx context.Context, run *models.AgentEvaluationRun) error {
	f.evaluationRunCount++
	return nil
}

func (f *fakeGrowthRepository) GetProfile(ctx context.Context, aid string) (*models.AgentGrowthProfile, error) {
	if f.profile == nil {
		return nil, fmt.Errorf("growth profile not found")
	}
	cloned := *f.profile
	return &cloned, nil
}

func (f *fakeGrowthRepository) ListProfiles(ctx context.Context, limit, offset int, maturityPool, primaryDomain string) ([]*models.AgentGrowthProfile, int, error) {
	return nil, 0, nil
}

func (f *fakeGrowthRepository) ListPoolMemberships(ctx context.Context, aid string) ([]models.AgentPoolMembership, error) {
	return append([]models.AgentPoolMembership(nil), f.pools...), nil
}

func (f *fakeGrowthRepository) GetStats(ctx context.Context, aid string) (*models.AgentGrowthStats, error) {
	if f.stats == nil {
		return nil, fmt.Errorf("stats not found")
	}
	cloned := *f.stats
	return &cloned, nil
}

func (f *fakeGrowthRepository) GetOverview(ctx context.Context) (*models.AgentGrowthOverview, error) {
	return &models.AgentGrowthOverview{}, nil
}

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

func TestGetGrowthProfileReevaluatesWhenStatsDrift(t *testing.T) {
	mockRepo := new(MockAgentRepository)
	agent := &models.Agent{
		AID:                "agent://a2ahub/growth-refresh",
		Model:              "openclaw-growth-refresh",
		Provider:           "openclaw",
		Capabilities:       models.Capabilities{"automation", "planning"},
		Reputation:         100,
		Status:             "active",
		MembershipLevel:    "member",
		TrustLevel:         "active",
		Headline:           "自动化修士",
		Bio:                "能持续完成真实交付。",
		AvailabilityStatus: "available",
		OwnerEmail:         "observer@example.com",
	}
	mockRepo.On("GetByAID", mock.Anything, agent.AID).Return(agent, nil).Once()

	repo := &fakeGrowthRepository{
		profile: &models.AgentGrowthProfile{
			AID:                 agent.AID,
			Model:               agent.Model,
			Provider:            agent.Provider,
			Capabilities:        agent.Capabilities,
			Reputation:          agent.Reputation,
			Status:              agent.Status,
			MembershipLevel:     agent.MembershipLevel,
			TrustLevel:          agent.TrustLevel,
			Headline:            agent.Headline,
			Bio:                 agent.Bio,
			AvailabilityStatus:  agent.AvailabilityStatus,
			OwnerEmail:          agent.OwnerEmail,
			PrimaryDomain:       "automation",
			CurrentMaturityPool: "cold_start",
			LastEvaluatedAt:     time.Now().Add(-time.Hour),
			CreatedAt:           time.Now().Add(-time.Hour),
			UpdatedAt:           time.Now().Add(-time.Hour),
		},
		stats: &models.AgentGrowthStats{
			ForumPostCount:              1,
			CompletedTaskCount:          1,
			ActiveSkillCount:            0,
			TotalTaskCount:              1,
			IncubatingDraftCount:        0,
			ValidatedDraftCount:         0,
			PublishedDraftCount:         1,
			EmployerTemplateCount:       1,
			TemplateReuseCount:          0,
			ExperienceCardCount:         1,
			CrossEmployerValidatedCount: 0,
			ActiveRiskMemoryCount:       0,
			HighRiskMemoryCount:         0,
		},
	}

	svc := &agentService{
		repo:       mockRepo,
		growthRepo: repo,
	}

	resp, err := svc.GetGrowthProfile(context.Background(), agent.AID)
	require.NoError(t, err)
	require.NotNil(t, resp)
	require.NotNil(t, resp.Profile)
	assert.Equal(t, 1, resp.Profile.CompletedTaskCount)
	assert.Equal(t, 1, resp.Profile.PublishedDraftCount)
	assert.Equal(t, 1, resp.Profile.EmployerTemplateCount)
	assert.Equal(t, "standard", resp.Profile.CurrentMaturityPool)
	assert.Equal(t, 1, resp.Profile.ForumPostCount)
	assert.Equal(t, 1, repo.upsertCount)
	assert.Equal(t, 1, repo.evaluationRunCount)
	assert.Equal(t, 1, repo.replacePoolsInvoked)
	mockRepo.AssertExpectations(t)
}
