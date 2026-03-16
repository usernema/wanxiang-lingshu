package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type StringList []string

func (s StringList) Value() (driver.Value, error) {
	return json.Marshal(s)
}

func (s *StringList) Scan(value interface{}) error {
	if value == nil {
		*s = StringList{}
		return nil
	}

	var bytes []byte
	switch typed := value.(type) {
	case []byte:
		bytes = typed
	case string:
		bytes = []byte(typed)
	default:
		return fmt.Errorf("unsupported StringList scan type: %T", value)
	}

	if len(bytes) == 0 {
		*s = StringList{}
		return nil
	}

	return json.Unmarshal(bytes, s)
}

type DomainScores map[string]int

func (d DomainScores) Value() (driver.Value, error) {
	return json.Marshal(d)
}

func (d *DomainScores) Scan(value interface{}) error {
	if value == nil {
		*d = DomainScores{}
		return nil
	}

	var bytes []byte
	switch typed := value.(type) {
	case []byte:
		bytes = typed
	case string:
		bytes = []byte(typed)
	default:
		return fmt.Errorf("unsupported DomainScores scan type: %T", value)
	}

	if len(bytes) == 0 {
		*d = DomainScores{}
		return nil
	}

	return json.Unmarshal(bytes, d)
}

type AgentGrowthProfile struct {
	AID                         string                 `json:"aid" db:"aid"`
	Model                       string                 `json:"model" db:"model"`
	Provider                    string                 `json:"provider" db:"provider"`
	Capabilities                Capabilities           `json:"capabilities" db:"capabilities"`
	Reputation                  int                    `json:"reputation" db:"reputation"`
	Status                      string                 `json:"status" db:"status"`
	MembershipLevel             string                 `json:"membership_level" db:"membership_level"`
	TrustLevel                  string                 `json:"trust_level" db:"trust_level"`
	Headline                    string                 `json:"headline,omitempty" db:"headline"`
	Bio                         string                 `json:"bio,omitempty" db:"bio"`
	AvailabilityStatus          string                 `json:"availability_status,omitempty" db:"availability_status"`
	OwnerEmail                  string                 `json:"owner_email,omitempty" db:"owner_email"`
	PrimaryDomain               string                 `json:"primary_domain" db:"primary_domain"`
	DomainScores                DomainScores           `json:"domain_scores" db:"domain_scores"`
	CurrentMaturityPool         string                 `json:"current_maturity_pool" db:"current_maturity_pool"`
	RecommendedTaskScope        string                 `json:"recommended_task_scope" db:"recommended_task_scope"`
	AutoGrowthEligible          bool                   `json:"auto_growth_eligible" db:"auto_growth_eligible"`
	CompletedTaskCount          int                    `json:"completed_task_count" db:"completed_task_count"`
	ActiveSkillCount            int                    `json:"active_skill_count" db:"active_skill_count"`
	TotalTaskCount              int                    `json:"total_task_count" db:"total_task_count"`
	IncubatingDraftCount        int                    `json:"incubating_draft_count" db:"incubating_draft_count"`
	ValidatedDraftCount         int                    `json:"validated_draft_count" db:"validated_draft_count"`
	PublishedDraftCount         int                    `json:"published_draft_count" db:"published_draft_count"`
	EmployerTemplateCount       int                    `json:"employer_template_count" db:"employer_template_count"`
	TemplateReuseCount          int                    `json:"template_reuse_count" db:"template_reuse_count"`
	ExperienceCardCount         int                    `json:"experience_card_count" db:"experience_card_count"`
	CrossEmployerValidatedCount int                    `json:"cross_employer_validated_count" db:"cross_employer_validated_count"`
	ActiveRiskMemoryCount       int                    `json:"active_risk_memory_count" db:"active_risk_memory_count"`
	HighRiskMemoryCount         int                    `json:"high_risk_memory_count" db:"high_risk_memory_count"`
	GrowthScore                 int                    `json:"growth_score" db:"growth_score"`
	RiskScore                   int                    `json:"risk_score" db:"risk_score"`
	PromotionReadinessScore     int                    `json:"promotion_readiness_score" db:"promotion_readiness_score"`
	RecommendedNextPool         string                 `json:"recommended_next_pool" db:"recommended_next_pool"`
	PromotionCandidate          bool                   `json:"promotion_candidate" db:"promotion_candidate"`
	SuggestedActions            StringList             `json:"suggested_actions" db:"suggested_actions"`
	RiskFlags                   StringList             `json:"risk_flags" db:"risk_flags"`
	EvaluationSummary           string                 `json:"evaluation_summary" db:"evaluation_summary"`
	ForumPostCount              int                    `json:"forum_post_count" db:"-"`
	NextAction                  *AgentGrowthNextAction `json:"next_action,omitempty" db:"-"`
	AutopilotState              string                 `json:"autopilot_state,omitempty" db:"-"`
	InterventionReason          *string                `json:"intervention_reason,omitempty" db:"-"`
	LastEvaluatedAt             time.Time              `json:"last_evaluated_at" db:"last_evaluated_at"`
	CreatedAt                   time.Time              `json:"created_at" db:"created_at"`
	UpdatedAt                   time.Time              `json:"updated_at" db:"updated_at"`
}

type AgentGrowthNextAction struct {
	Key         string `json:"key"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Href        string `json:"href"`
	CTA         string `json:"cta"`
}

type AgentPoolMembership struct {
	ID          int64      `json:"id" db:"id"`
	AID         string     `json:"aid" db:"aid"`
	PoolType    string     `json:"pool_type" db:"pool_type"`
	PoolKey     string     `json:"pool_key" db:"pool_key"`
	PoolScore   int        `json:"pool_score" db:"pool_score"`
	Status      string     `json:"status" db:"status"`
	EffectiveAt time.Time  `json:"effective_at" db:"effective_at"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty" db:"expires_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

type AgentEvaluationRun struct {
	ID              int64        `json:"id" db:"id"`
	EvaluationID    string       `json:"evaluation_id" db:"evaluation_id"`
	AID             string       `json:"aid" db:"aid"`
	TriggerType     string       `json:"trigger_type" db:"trigger_type"`
	PrimaryDomain   string       `json:"primary_domain" db:"primary_domain"`
	MaturityPool    string       `json:"maturity_pool" db:"maturity_pool"`
	DomainScores    DomainScores `json:"domain_scores" db:"domain_scores"`
	RiskFlags       StringList   `json:"risk_flags" db:"risk_flags"`
	DecisionSummary string       `json:"decision_summary" db:"decision_summary"`
	ProfileSnapshot string       `json:"profile_snapshot" db:"profile_snapshot"`
	CreatedAt       time.Time    `json:"created_at" db:"created_at"`
}

type AgentGrowthStats struct {
	ForumPostCount              int `json:"forum_post_count"`
	CompletedTaskCount          int `json:"completed_task_count"`
	ActiveSkillCount            int `json:"active_skill_count"`
	TotalTaskCount              int `json:"total_task_count"`
	IncubatingDraftCount        int `json:"incubating_draft_count"`
	ValidatedDraftCount         int `json:"validated_draft_count"`
	PublishedDraftCount         int `json:"published_draft_count"`
	EmployerTemplateCount       int `json:"employer_template_count"`
	TemplateReuseCount          int `json:"template_reuse_count"`
	ExperienceCardCount         int `json:"experience_card_count"`
	CrossEmployerValidatedCount int `json:"cross_employer_validated_count"`
	ActiveRiskMemoryCount       int `json:"active_risk_memory_count"`
	HighRiskMemoryCount         int `json:"high_risk_memory_count"`
}

type AgentGrowthProfileResponse struct {
	Profile *AgentGrowthProfile   `json:"profile"`
	Pools   []AgentPoolMembership `json:"pools"`
}

type AgentGrowthOverview struct {
	TotalAgents         int            `json:"total_agents"`
	EvaluatedAgents     int            `json:"evaluated_agents"`
	AutoGrowthEligible  int            `json:"auto_growth_eligible"`
	PromotionCandidates int            `json:"promotion_candidates"`
	ByMaturityPool      map[string]int `json:"by_maturity_pool"`
	ByPrimaryDomain     map[string]int `json:"by_primary_domain"`
	LastEvaluatedAt     *time.Time     `json:"last_evaluated_at,omitempty"`
}
