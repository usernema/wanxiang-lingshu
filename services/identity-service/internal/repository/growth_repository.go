package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
	"github.com/lib/pq"
)

type GrowthRepository interface {
	UpsertProfile(ctx context.Context, profile *models.AgentGrowthProfile) error
	ReplacePoolMemberships(ctx context.Context, aid string, memberships []models.AgentPoolMembership) error
	InsertEvaluationRun(ctx context.Context, run *models.AgentEvaluationRun) error
	GetProfile(ctx context.Context, aid string) (*models.AgentGrowthProfile, error)
	ListProfiles(ctx context.Context, limit, offset int, maturityPool, primaryDomain string) ([]*models.AgentGrowthProfile, int, error)
	ListPoolMemberships(ctx context.Context, aid string) ([]models.AgentPoolMembership, error)
	GetStats(ctx context.Context, aid string) (*models.AgentGrowthStats, error)
	GetOverview(ctx context.Context) (*models.AgentGrowthOverview, error)
}

type growthRepository struct {
	db *database.PostgresDB
}

func NewGrowthRepository(db *database.PostgresDB) GrowthRepository {
	return &growthRepository{db: db}
}

type growthScannable interface {
	Scan(dest ...interface{}) error
}

func scanGrowthProfile(scanner growthScannable) (*models.AgentGrowthProfile, error) {
	profile := &models.AgentGrowthProfile{}
	var capabilitiesJSON []byte
	var domainScoresJSON []byte
	var suggestedActionsJSON []byte
	var riskFlagsJSON []byte

	err := scanner.Scan(
		&profile.AID,
		&profile.Model,
		&profile.Provider,
		&capabilitiesJSON,
		&profile.Reputation,
		&profile.Status,
		&profile.MembershipLevel,
		&profile.TrustLevel,
		&profile.Headline,
		&profile.Bio,
		&profile.AvailabilityStatus,
		&profile.OwnerEmail,
		&profile.PrimaryDomain,
		&domainScoresJSON,
		&profile.CurrentMaturityPool,
		&profile.RecommendedTaskScope,
		&profile.AutoGrowthEligible,
		&profile.CompletedTaskCount,
		&profile.ActiveSkillCount,
		&profile.TotalTaskCount,
		&profile.IncubatingDraftCount,
		&profile.ValidatedDraftCount,
		&profile.PublishedDraftCount,
		&profile.EmployerTemplateCount,
		&profile.TemplateReuseCount,
		&profile.PromotionReadinessScore,
		&profile.RecommendedNextPool,
		&profile.PromotionCandidate,
		&suggestedActionsJSON,
		&riskFlagsJSON,
		&profile.EvaluationSummary,
		&profile.LastEvaluatedAt,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(capabilitiesJSON, &profile.Capabilities); err != nil {
		return nil, fmt.Errorf("failed to unmarshal capabilities: %w", err)
	}
	if err := json.Unmarshal(domainScoresJSON, &profile.DomainScores); err != nil {
		return nil, fmt.Errorf("failed to unmarshal domain scores: %w", err)
	}
	if err := json.Unmarshal(suggestedActionsJSON, &profile.SuggestedActions); err != nil {
		return nil, fmt.Errorf("failed to unmarshal suggested actions: %w", err)
	}
	if err := json.Unmarshal(riskFlagsJSON, &profile.RiskFlags); err != nil {
		return nil, fmt.Errorf("failed to unmarshal risk flags: %w", err)
	}

	return profile, nil
}

func (r *growthRepository) UpsertProfile(ctx context.Context, profile *models.AgentGrowthProfile) error {
	domainScoresJSON, err := json.Marshal(profile.DomainScores)
	if err != nil {
		return fmt.Errorf("failed to marshal domain scores: %w", err)
	}
	riskFlagsJSON, err := json.Marshal(profile.RiskFlags)
	if err != nil {
		return fmt.Errorf("failed to marshal risk flags: %w", err)
	}
	suggestedActionsJSON, err := json.Marshal(profile.SuggestedActions)
	if err != nil {
		return fmt.Errorf("failed to marshal suggested actions: %w", err)
	}

	query := `
		INSERT INTO agent_capability_profiles (
			aid, owner_email, primary_domain, domain_scores, current_maturity_pool,
			recommended_task_scope, auto_growth_eligible, completed_task_count,
			active_skill_count, total_task_count, incubating_draft_count,
			validated_draft_count, published_draft_count, employer_template_count,
			template_reuse_count, promotion_readiness_score, recommended_next_pool,
			promotion_candidate, suggested_actions, risk_flags, evaluation_summary,
			last_evaluated_at, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20::jsonb, $21, $22, $23, $24)
		ON CONFLICT (aid) DO UPDATE SET
			owner_email = EXCLUDED.owner_email,
			primary_domain = EXCLUDED.primary_domain,
			domain_scores = EXCLUDED.domain_scores,
			current_maturity_pool = EXCLUDED.current_maturity_pool,
			recommended_task_scope = EXCLUDED.recommended_task_scope,
			auto_growth_eligible = EXCLUDED.auto_growth_eligible,
			completed_task_count = EXCLUDED.completed_task_count,
			active_skill_count = EXCLUDED.active_skill_count,
			total_task_count = EXCLUDED.total_task_count,
			incubating_draft_count = EXCLUDED.incubating_draft_count,
			validated_draft_count = EXCLUDED.validated_draft_count,
			published_draft_count = EXCLUDED.published_draft_count,
			employer_template_count = EXCLUDED.employer_template_count,
			template_reuse_count = EXCLUDED.template_reuse_count,
			promotion_readiness_score = EXCLUDED.promotion_readiness_score,
			recommended_next_pool = EXCLUDED.recommended_next_pool,
			promotion_candidate = EXCLUDED.promotion_candidate,
			suggested_actions = EXCLUDED.suggested_actions,
			risk_flags = EXCLUDED.risk_flags,
			evaluation_summary = EXCLUDED.evaluation_summary,
			last_evaluated_at = EXCLUDED.last_evaluated_at,
			updated_at = EXCLUDED.updated_at
	`

	_, err = r.db.DB.ExecContext(ctx, query,
		profile.AID,
		profile.OwnerEmail,
		profile.PrimaryDomain,
		domainScoresJSON,
		profile.CurrentMaturityPool,
		profile.RecommendedTaskScope,
		profile.AutoGrowthEligible,
		profile.CompletedTaskCount,
		profile.ActiveSkillCount,
		profile.TotalTaskCount,
		profile.IncubatingDraftCount,
		profile.ValidatedDraftCount,
		profile.PublishedDraftCount,
		profile.EmployerTemplateCount,
		profile.TemplateReuseCount,
		profile.PromotionReadinessScore,
		profile.RecommendedNextPool,
		profile.PromotionCandidate,
		suggestedActionsJSON,
		riskFlagsJSON,
		profile.EvaluationSummary,
		profile.LastEvaluatedAt,
		profile.CreatedAt,
		profile.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to upsert growth profile: %w", err)
	}

	return nil
}

func (r *growthRepository) ReplacePoolMemberships(ctx context.Context, aid string, memberships []models.AgentPoolMembership) error {
	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin pool membership transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM agent_pool_memberships WHERE aid = $1`, aid); err != nil {
		return fmt.Errorf("failed to clear pool memberships: %w", err)
	}

	query := `
		INSERT INTO agent_pool_memberships (aid, pool_type, pool_key, pool_score, status, effective_at, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	for _, membership := range memberships {
		if _, err := tx.ExecContext(
			ctx,
			query,
			aid,
			membership.PoolType,
			membership.PoolKey,
			membership.PoolScore,
			membership.Status,
			membership.EffectiveAt,
			membership.ExpiresAt,
			membership.CreatedAt,
		); err != nil {
			return fmt.Errorf("failed to insert pool membership: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit pool memberships: %w", err)
	}
	return nil
}

func (r *growthRepository) InsertEvaluationRun(ctx context.Context, run *models.AgentEvaluationRun) error {
	domainScoresJSON, err := json.Marshal(run.DomainScores)
	if err != nil {
		return fmt.Errorf("failed to marshal evaluation domain scores: %w", err)
	}
	riskFlagsJSON, err := json.Marshal(run.RiskFlags)
	if err != nil {
		return fmt.Errorf("failed to marshal evaluation risk flags: %w", err)
	}

	query := `
		INSERT INTO agent_evaluation_runs (
			evaluation_id, aid, trigger_type, primary_domain, maturity_pool,
			domain_scores, risk_flags, decision_summary, profile_snapshot, created_at
		)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb, $10)
	`

	_, err = r.db.DB.ExecContext(ctx, query,
		run.EvaluationID,
		run.AID,
		run.TriggerType,
		run.PrimaryDomain,
		run.MaturityPool,
		domainScoresJSON,
		riskFlagsJSON,
		run.DecisionSummary,
		run.ProfileSnapshot,
		run.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert evaluation run: %w", err)
	}

	return nil
}

func (r *growthRepository) GetProfile(ctx context.Context, aid string) (*models.AgentGrowthProfile, error) {
	query := `
		SELECT
			p.aid,
			a.model,
			a.provider,
			a.capabilities,
			a.reputation,
			a.status,
			a.membership_level,
			a.trust_level,
			a.headline,
			a.bio,
			a.availability_status,
			a.owner_email,
			p.primary_domain,
			p.domain_scores,
			p.current_maturity_pool,
			p.recommended_task_scope,
			p.auto_growth_eligible,
			p.completed_task_count,
			p.active_skill_count,
			p.total_task_count,
			p.incubating_draft_count,
			p.validated_draft_count,
			p.published_draft_count,
			p.employer_template_count,
			p.template_reuse_count,
			p.promotion_readiness_score,
			p.recommended_next_pool,
			p.promotion_candidate,
			p.suggested_actions,
			p.risk_flags,
			p.evaluation_summary,
			p.last_evaluated_at,
			p.created_at,
			p.updated_at
		FROM agent_capability_profiles p
		JOIN agents a ON a.aid = p.aid
		WHERE p.aid = $1
	`

	profile, err := scanGrowthProfile(r.db.DB.QueryRowContext(ctx, query, aid))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("growth profile not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get growth profile: %w", err)
	}
	return profile, nil
}

func (r *growthRepository) ListProfiles(ctx context.Context, limit, offset int, maturityPool, primaryDomain string) ([]*models.AgentGrowthProfile, int, error) {
	conditions := []string{}
	args := []interface{}{}

	if maturityPool != "" {
		args = append(args, maturityPool)
		conditions = append(conditions, fmt.Sprintf("p.current_maturity_pool = $%d", len(args)))
	}
	if primaryDomain != "" {
		args = append(args, primaryDomain)
		conditions = append(conditions, fmt.Sprintf("p.primary_domain = $%d", len(args)))
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + conditions[0]
		for index := 1; index < len(conditions); index++ {
			whereClause += " AND " + conditions[index]
		}
	}

	countQuery := `SELECT COUNT(*)::int FROM agent_capability_profiles p` + whereClause
	var total int
	if err := r.db.DB.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count growth profiles: %w", err)
	}

	args = append(args, limit, offset)
	query := `
		SELECT
			p.aid,
			a.model,
			a.provider,
			a.capabilities,
			a.reputation,
			a.status,
			a.membership_level,
			a.trust_level,
			a.headline,
			a.bio,
			a.availability_status,
			a.owner_email,
			p.primary_domain,
			p.domain_scores,
			p.current_maturity_pool,
			p.recommended_task_scope,
			p.auto_growth_eligible,
			p.completed_task_count,
			p.active_skill_count,
			p.total_task_count,
			p.incubating_draft_count,
			p.validated_draft_count,
			p.published_draft_count,
			p.employer_template_count,
			p.template_reuse_count,
			p.promotion_readiness_score,
			p.recommended_next_pool,
			p.promotion_candidate,
			p.suggested_actions,
			p.risk_flags,
			p.evaluation_summary,
			p.last_evaluated_at,
			p.created_at,
			p.updated_at
		FROM agent_capability_profiles p
		JOIN agents a ON a.aid = p.aid
	` + whereClause + fmt.Sprintf(" ORDER BY p.last_evaluated_at DESC, p.updated_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.db.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query growth profiles: %w", err)
	}
	defer rows.Close()

	items := make([]*models.AgentGrowthProfile, 0, limit)
	for rows.Next() {
		profile, err := scanGrowthProfile(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan growth profile: %w", err)
		}
		items = append(items, profile)
	}

	return items, total, nil
}

func (r *growthRepository) ListPoolMemberships(ctx context.Context, aid string) ([]models.AgentPoolMembership, error) {
	query := `
		SELECT id, aid, pool_type, pool_key, pool_score, status, effective_at, expires_at, created_at
		FROM agent_pool_memberships
		WHERE aid = $1
		ORDER BY pool_type ASC, pool_score DESC, pool_key ASC
	`

	rows, err := r.db.DB.QueryContext(ctx, query, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to query pool memberships: %w", err)
	}
	defer rows.Close()

	items := make([]models.AgentPoolMembership, 0)
	for rows.Next() {
		var membership models.AgentPoolMembership
		if err := rows.Scan(
			&membership.ID,
			&membership.AID,
			&membership.PoolType,
			&membership.PoolKey,
			&membership.PoolScore,
			&membership.Status,
			&membership.EffectiveAt,
			&membership.ExpiresAt,
			&membership.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan pool membership: %w", err)
		}
		items = append(items, membership)
	}

	return items, nil
}

func (r *growthRepository) countOrZeroOnMissingTable(ctx context.Context, query string, args ...interface{}) (int, error) {
	var count int
	err := r.db.DB.QueryRowContext(ctx, query, args...).Scan(&count)
	if err == nil {
		return count, nil
	}

	var pgErr *pq.Error
	if errors.As(err, &pgErr) && pgErr.Code == "42P01" {
		return 0, nil
	}

	return 0, err
}

func (r *growthRepository) GetStats(ctx context.Context, aid string) (*models.AgentGrowthStats, error) {
	completedTaskCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM tasks WHERE worker_aid = $1 AND status = 'completed'`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count completed tasks: %w", err)
	}
	activeSkillCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM skills WHERE author_aid = $1 AND status = 'active'`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count active skills: %w", err)
	}
	totalTaskCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM tasks WHERE worker_aid = $1`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count total tasks: %w", err)
	}
	incubatingDraftCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM agent_skill_drafts WHERE aid = $1 AND status = 'incubating'`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count incubating drafts: %w", err)
	}
	validatedDraftCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM agent_skill_drafts WHERE aid = $1 AND status = 'validated'`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count validated drafts: %w", err)
	}
	publishedDraftCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM agent_skill_drafts WHERE aid = $1 AND status = 'published'`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count published drafts: %w", err)
	}
	employerTemplateCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COUNT(*)::int FROM employer_task_templates WHERE owner_aid = $1`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count employer templates: %w", err)
	}
	templateReuseCount, err := r.countOrZeroOnMissingTable(ctx, `SELECT COALESCE(SUM(reuse_count), 0)::int FROM employer_task_templates WHERE owner_aid = $1`, aid)
	if err != nil {
		return nil, fmt.Errorf("failed to count template reuse: %w", err)
	}

	return &models.AgentGrowthStats{
		CompletedTaskCount:    completedTaskCount,
		ActiveSkillCount:      activeSkillCount,
		TotalTaskCount:        totalTaskCount,
		IncubatingDraftCount:  incubatingDraftCount,
		ValidatedDraftCount:   validatedDraftCount,
		PublishedDraftCount:   publishedDraftCount,
		EmployerTemplateCount: employerTemplateCount,
		TemplateReuseCount:    templateReuseCount,
	}, nil
}

func (r *growthRepository) GetOverview(ctx context.Context) (*models.AgentGrowthOverview, error) {
	overview := &models.AgentGrowthOverview{
		ByMaturityPool:  map[string]int{},
		ByPrimaryDomain: map[string]int{},
	}

	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(*)::int FROM agents`).Scan(&overview.TotalAgents); err != nil {
		return nil, fmt.Errorf("failed to count total agents: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(*)::int FROM agent_capability_profiles`).Scan(&overview.EvaluatedAgents); err != nil {
		return nil, fmt.Errorf("failed to count evaluated agents: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(*)::int FROM agent_capability_profiles WHERE auto_growth_eligible = true`).Scan(&overview.AutoGrowthEligible); err != nil {
		return nil, fmt.Errorf("failed to count auto growth eligible profiles: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(*)::int FROM agent_capability_profiles WHERE promotion_candidate = true`).Scan(&overview.PromotionCandidates); err != nil {
		return nil, fmt.Errorf("failed to count promotion candidates: %w", err)
	}

	maturityRows, err := r.db.DB.QueryContext(ctx, `SELECT current_maturity_pool, COUNT(*)::int FROM agent_capability_profiles GROUP BY current_maturity_pool`)
	if err != nil {
		return nil, fmt.Errorf("failed to query maturity overview: %w", err)
	}
	defer maturityRows.Close()
	for maturityRows.Next() {
		var pool string
		var count int
		if err := maturityRows.Scan(&pool, &count); err != nil {
			return nil, fmt.Errorf("failed to scan maturity overview: %w", err)
		}
		overview.ByMaturityPool[pool] = count
	}

	domainRows, err := r.db.DB.QueryContext(ctx, `SELECT primary_domain, COUNT(*)::int FROM agent_capability_profiles GROUP BY primary_domain`)
	if err != nil {
		return nil, fmt.Errorf("failed to query domain overview: %w", err)
	}
	defer domainRows.Close()
	for domainRows.Next() {
		var domain string
		var count int
		if err := domainRows.Scan(&domain, &count); err != nil {
			return nil, fmt.Errorf("failed to scan domain overview: %w", err)
		}
		overview.ByPrimaryDomain[domain] = count
	}

	var lastEvaluated sql.NullTime
	if err := r.db.DB.QueryRowContext(ctx, `SELECT MAX(last_evaluated_at) FROM agent_capability_profiles`).Scan(&lastEvaluated); err != nil {
		return nil, fmt.Errorf("failed to get last evaluated time: %w", err)
	}
	if lastEvaluated.Valid {
		overview.LastEvaluatedAt = &lastEvaluated.Time
	}

	return overview, nil
}
