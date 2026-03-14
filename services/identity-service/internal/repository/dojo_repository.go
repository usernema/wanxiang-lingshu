package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
)

type DojoRepository interface {
	EnsureCoachProfile(ctx context.Context, coach *models.CoachProfile) error
	GetCoachProfile(ctx context.Context, coachAID string) (*models.CoachProfile, error)
	ListCoachProfiles(ctx context.Context, limit, offset int, status string) ([]*models.CoachProfile, int, error)
	UpsertCoachBinding(ctx context.Context, binding *models.AgentCoachBinding) error
	GetCoachBinding(ctx context.Context, aid string) (*models.AgentCoachBinding, error)
	ListCoachBindings(ctx context.Context, limit, offset int, schoolKey, stage, status string) ([]models.AgentCoachBinding, int, error)
	EnsureQuestionSet(ctx context.Context, set *models.TrainingQuestionSet, questions []models.TrainingQuestion) error
	GetQuestionSet(ctx context.Context, setID string) (*models.TrainingQuestionSet, error)
	FindQuestionSetBySchoolAndScene(ctx context.Context, schoolKey, sceneType string) (*models.TrainingQuestionSet, error)
	CreateTrainingAttempt(ctx context.Context, attempt *models.AgentTrainingAttempt) error
	GetLatestTrainingAttempt(ctx context.Context, aid, sceneType string) (*models.AgentTrainingAttempt, error)
	CreateRemediationPlan(ctx context.Context, plan *models.AgentRemediationPlan) error
	GetActiveRemediationPlan(ctx context.Context, aid string) (*models.AgentRemediationPlan, error)
	ListMistakeItems(ctx context.Context, aid string, limit int) ([]models.AgentMistakeItem, error)
	ListRemediationPlans(ctx context.Context, aid string, limit int) ([]models.AgentRemediationPlan, error)
	CountMistakeItems(ctx context.Context, aid string) (int, int, error)
	GetOverview(ctx context.Context) (*models.AdminDojoOverview, error)
}

type dojoRepository struct {
	db *database.PostgresDB
}

func NewDojoRepository(db *database.PostgresDB) DojoRepository {
	return &dojoRepository{db: db}
}

type dojoScannable interface {
	Scan(dest ...interface{}) error
}

func scanCoachProfile(scanner dojoScannable) (*models.CoachProfile, error) {
	item := &models.CoachProfile{}
	var schoolsJSON []byte
	var pricingJSON []byte

	if err := scanner.Scan(
		&item.CoachAID,
		&item.CoachType,
		&schoolsJSON,
		&item.Bio,
		&pricingJSON,
		&item.Rating,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if err := json.Unmarshal(schoolsJSON, &item.Schools); err != nil {
		return nil, fmt.Errorf("failed to unmarshal coach schools: %w", err)
	}
	if err := json.Unmarshal(pricingJSON, &item.Pricing); err != nil {
		return nil, fmt.Errorf("failed to unmarshal coach pricing: %w", err)
	}

	return item, nil
}

func scanQuestionSet(scanner dojoScannable) (*models.TrainingQuestionSet, error) {
	item := &models.TrainingQuestionSet{}
	var tagsJSON []byte

	if err := scanner.Scan(
		&item.SetID,
		&item.SchoolKey,
		&item.SceneType,
		&item.Title,
		&item.Difficulty,
		&tagsJSON,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if err := json.Unmarshal(tagsJSON, &item.Tags); err != nil {
		return nil, fmt.Errorf("failed to unmarshal question set tags: %w", err)
	}

	return item, nil
}

func scanTrainingAttempt(scanner dojoScannable) (*models.AgentTrainingAttempt, error) {
	item := &models.AgentTrainingAttempt{}
	var artifactJSON []byte
	var feedbackJSON []byte

	if err := scanner.Scan(
		&item.AttemptID,
		&item.AID,
		&item.SetID,
		&item.QuestionID,
		&item.SceneType,
		&item.Score,
		&item.ResultStatus,
		&artifactJSON,
		&feedbackJSON,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if err := json.Unmarshal(artifactJSON, &item.Artifact); err != nil {
		return nil, fmt.Errorf("failed to unmarshal training attempt artifact: %w", err)
	}
	if err := json.Unmarshal(feedbackJSON, &item.Feedback); err != nil {
		return nil, fmt.Errorf("failed to unmarshal training attempt feedback: %w", err)
	}

	return item, nil
}

func scanMistakeItem(scanner dojoScannable) (*models.AgentMistakeItem, error) {
	item := &models.AgentMistakeItem{}
	var evidenceJSON []byte

	if err := scanner.Scan(
		&item.MistakeID,
		&item.AID,
		&item.SourceType,
		&item.SourceRefID,
		&item.CapabilityKey,
		&item.MistakeType,
		&item.Severity,
		&evidenceJSON,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if err := json.Unmarshal(evidenceJSON, &item.Evidence); err != nil {
		return nil, fmt.Errorf("failed to unmarshal mistake evidence: %w", err)
	}

	return item, nil
}

func scanRemediationPlan(scanner dojoScannable) (*models.AgentRemediationPlan, error) {
	item := &models.AgentRemediationPlan{}
	var goalJSON []byte
	var assignedSetIDsJSON []byte

	if err := scanner.Scan(
		&item.PlanID,
		&item.AID,
		&item.CoachAID,
		&item.TriggerType,
		&goalJSON,
		&assignedSetIDsJSON,
		&item.RequiredPassCount,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err != nil {
		return nil, err
	}

	if err := json.Unmarshal(goalJSON, &item.Goal); err != nil {
		return nil, fmt.Errorf("failed to unmarshal remediation goal: %w", err)
	}
	if err := json.Unmarshal(assignedSetIDsJSON, &item.AssignedSetIDs); err != nil {
		return nil, fmt.Errorf("failed to unmarshal assigned set ids: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) EnsureCoachProfile(ctx context.Context, coach *models.CoachProfile) error {
	schoolsJSON, err := json.Marshal(coach.Schools)
	if err != nil {
		return fmt.Errorf("failed to marshal coach schools: %w", err)
	}
	pricingJSON, err := json.Marshal(coach.Pricing)
	if err != nil {
		return fmt.Errorf("failed to marshal coach pricing: %w", err)
	}

	query := `
		INSERT INTO coach_profiles (
			coach_aid, coach_type, schools_json, bio, pricing_json, rating, status, created_at, updated_at
		)
		VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7, $8, $9)
		ON CONFLICT (coach_aid) DO UPDATE SET
			coach_type = EXCLUDED.coach_type,
			schools_json = EXCLUDED.schools_json,
			bio = EXCLUDED.bio,
			pricing_json = EXCLUDED.pricing_json,
			rating = EXCLUDED.rating,
			status = EXCLUDED.status,
			updated_at = EXCLUDED.updated_at
	`

	if _, err := r.db.DB.ExecContext(
		ctx,
		query,
		coach.CoachAID,
		coach.CoachType,
		schoolsJSON,
		coach.Bio,
		pricingJSON,
		coach.Rating,
		coach.Status,
		coach.CreatedAt,
		coach.UpdatedAt,
	); err != nil {
		return fmt.Errorf("failed to ensure coach profile: %w", err)
	}

	return nil
}

func (r *dojoRepository) GetCoachProfile(ctx context.Context, coachAID string) (*models.CoachProfile, error) {
	query := `
		SELECT coach_aid, coach_type, schools_json, bio, pricing_json, rating, status, created_at, updated_at
		FROM coach_profiles
		WHERE coach_aid = $1
	`

	item, err := scanCoachProfile(r.db.DB.QueryRowContext(ctx, query, coachAID))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("coach profile not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get coach profile: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) ListCoachProfiles(ctx context.Context, limit, offset int, status string) ([]*models.CoachProfile, int, error) {
	countQuery := `SELECT COUNT(1) FROM coach_profiles`
	listQuery := `
		SELECT coach_aid, coach_type, schools_json, bio, pricing_json, rating, status, created_at, updated_at
		FROM coach_profiles
	`

	var (
		args      []interface{}
		whereSQL  string
		total     int
		queryArgs []interface{}
	)

	if status != "" {
		whereSQL = ` WHERE status = $1`
		args = append(args, status)
	}

	if err := r.db.DB.QueryRowContext(ctx, countQuery+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count coach profiles: %w", err)
	}

	if status != "" {
		listQuery += whereSQL + ` ORDER BY updated_at DESC LIMIT $2 OFFSET $3`
		queryArgs = append(queryArgs, status, limit, offset)
	} else {
		listQuery += ` ORDER BY updated_at DESC LIMIT $1 OFFSET $2`
		queryArgs = append(queryArgs, limit, offset)
	}

	rows, err := r.db.DB.QueryContext(ctx, listQuery, queryArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list coach profiles: %w", err)
	}
	defer rows.Close()

	items := make([]*models.CoachProfile, 0, limit)
	for rows.Next() {
		item, err := scanCoachProfile(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("failed to iterate coach profiles: %w", err)
	}

	return items, total, nil
}

func (r *dojoRepository) UpsertCoachBinding(ctx context.Context, binding *models.AgentCoachBinding) error {
	query := `
		INSERT INTO agent_coach_bindings (
			aid, primary_coach_aid, shadow_coach_aid, school_key, stage, status, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (aid) DO UPDATE SET
			primary_coach_aid = EXCLUDED.primary_coach_aid,
			shadow_coach_aid = EXCLUDED.shadow_coach_aid,
			school_key = EXCLUDED.school_key,
			stage = EXCLUDED.stage,
			status = EXCLUDED.status,
			updated_at = EXCLUDED.updated_at
	`

	if _, err := r.db.DB.ExecContext(
		ctx,
		query,
		binding.AID,
		binding.PrimaryCoachAID,
		binding.ShadowCoachAID,
		binding.SchoolKey,
		binding.Stage,
		binding.Status,
		binding.CreatedAt,
		binding.UpdatedAt,
	); err != nil {
		return fmt.Errorf("failed to upsert coach binding: %w", err)
	}

	return nil
}

func (r *dojoRepository) GetCoachBinding(ctx context.Context, aid string) (*models.AgentCoachBinding, error) {
	query := `
		SELECT aid, primary_coach_aid, shadow_coach_aid, school_key, stage, status, created_at, updated_at
		FROM agent_coach_bindings
		WHERE aid = $1
	`

	item := &models.AgentCoachBinding{}
	if err := r.db.DB.QueryRowContext(ctx, query, aid).Scan(
		&item.AID,
		&item.PrimaryCoachAID,
		&item.ShadowCoachAID,
		&item.SchoolKey,
		&item.Stage,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
	); err == sql.ErrNoRows {
		return nil, fmt.Errorf("coach binding not found")
	} else if err != nil {
		return nil, fmt.Errorf("failed to get coach binding: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) ListCoachBindings(ctx context.Context, limit, offset int, schoolKey, stage, status string) ([]models.AgentCoachBinding, int, error) {
	countQuery := `SELECT COUNT(1) FROM agent_coach_bindings WHERE 1=1`
	listQuery := `
		SELECT aid, primary_coach_aid, shadow_coach_aid, school_key, stage, status, created_at, updated_at
		FROM agent_coach_bindings
		WHERE 1=1
	`

	args := make([]interface{}, 0, 3)
	if schoolKey != "" {
		args = append(args, schoolKey)
		countQuery += fmt.Sprintf(" AND school_key = $%d", len(args))
		listQuery += fmt.Sprintf(" AND school_key = $%d", len(args))
	}
	if stage != "" {
		args = append(args, stage)
		countQuery += fmt.Sprintf(" AND stage = $%d", len(args))
		listQuery += fmt.Sprintf(" AND stage = $%d", len(args))
	}
	if status != "" {
		args = append(args, status)
		countQuery += fmt.Sprintf(" AND status = $%d", len(args))
		listQuery += fmt.Sprintf(" AND status = $%d", len(args))
	}

	var total int
	if err := r.db.DB.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count coach bindings: %w", err)
	}

	listArgs := append(args, limit, offset)
	listQuery += fmt.Sprintf(" ORDER BY updated_at DESC LIMIT $%d OFFSET $%d", len(args)+1, len(args)+2)

	rows, err := r.db.DB.QueryContext(ctx, listQuery, listArgs...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list coach bindings: %w", err)
	}
	defer rows.Close()

	items := make([]models.AgentCoachBinding, 0, limit)
	for rows.Next() {
		item := models.AgentCoachBinding{}
		if err := rows.Scan(
			&item.AID,
			&item.PrimaryCoachAID,
			&item.ShadowCoachAID,
			&item.SchoolKey,
			&item.Stage,
			&item.Status,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan coach binding: %w", err)
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("failed to iterate coach bindings: %w", err)
	}

	return items, total, nil
}

func (r *dojoRepository) EnsureQuestionSet(ctx context.Context, set *models.TrainingQuestionSet, questions []models.TrainingQuestion) error {
	tagsJSON, err := json.Marshal(set.Tags)
	if err != nil {
		return fmt.Errorf("failed to marshal question set tags: %w", err)
	}

	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin question set transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(
		ctx,
		`
			INSERT INTO training_question_sets (
				set_id, school_key, scene_type, title, difficulty, tags_json, status, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
			ON CONFLICT (set_id) DO UPDATE SET
				school_key = EXCLUDED.school_key,
				scene_type = EXCLUDED.scene_type,
				title = EXCLUDED.title,
				difficulty = EXCLUDED.difficulty,
				tags_json = EXCLUDED.tags_json,
				status = EXCLUDED.status,
				updated_at = EXCLUDED.updated_at
		`,
		set.SetID,
		set.SchoolKey,
		set.SceneType,
		set.Title,
		set.Difficulty,
		tagsJSON,
		set.Status,
		set.CreatedAt,
		set.UpdatedAt,
	); err != nil {
		return fmt.Errorf("failed to ensure question set: %w", err)
	}

	for _, question := range questions {
		promptJSON, err := json.Marshal(question.Prompt)
		if err != nil {
			return fmt.Errorf("failed to marshal question prompt: %w", err)
		}
		rubricJSON, err := json.Marshal(question.Rubric)
		if err != nil {
			return fmt.Errorf("failed to marshal question rubric: %w", err)
		}
		answerKeyJSON, err := json.Marshal(question.AnswerKey)
		if err != nil {
			return fmt.Errorf("failed to marshal question answer key: %w", err)
		}

		if _, err := tx.ExecContext(
			ctx,
			`
				INSERT INTO training_questions (
					question_id, set_id, capability_key, prompt_json, rubric_json, answer_key_json, sort_order, created_at, updated_at
				)
				VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9)
				ON CONFLICT (question_id) DO UPDATE SET
					set_id = EXCLUDED.set_id,
					capability_key = EXCLUDED.capability_key,
					prompt_json = EXCLUDED.prompt_json,
					rubric_json = EXCLUDED.rubric_json,
					answer_key_json = EXCLUDED.answer_key_json,
					sort_order = EXCLUDED.sort_order,
					updated_at = EXCLUDED.updated_at
			`,
			question.QuestionID,
			question.SetID,
			question.CapabilityKey,
			promptJSON,
			rubricJSON,
			answerKeyJSON,
			question.SortOrder,
			question.CreatedAt,
			question.UpdatedAt,
		); err != nil {
			return fmt.Errorf("failed to ensure training question: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit question set transaction: %w", err)
	}

	return nil
}

func (r *dojoRepository) GetQuestionSet(ctx context.Context, setID string) (*models.TrainingQuestionSet, error) {
	query := `
		SELECT set_id, school_key, scene_type, title, difficulty, tags_json, status, created_at, updated_at
		FROM training_question_sets
		WHERE set_id = $1
	`

	item, err := scanQuestionSet(r.db.DB.QueryRowContext(ctx, query, setID))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("question set not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get question set: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) FindQuestionSetBySchoolAndScene(ctx context.Context, schoolKey, sceneType string) (*models.TrainingQuestionSet, error) {
	query := `
		SELECT set_id, school_key, scene_type, title, difficulty, tags_json, status, created_at, updated_at
		FROM training_question_sets
		WHERE school_key = $1 AND scene_type = $2 AND status = 'active'
		ORDER BY updated_at DESC
		LIMIT 1
	`

	item, err := scanQuestionSet(r.db.DB.QueryRowContext(ctx, query, schoolKey, sceneType))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("question set not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to find question set: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) CreateTrainingAttempt(ctx context.Context, attempt *models.AgentTrainingAttempt) error {
	artifactJSON, err := json.Marshal(attempt.Artifact)
	if err != nil {
		return fmt.Errorf("failed to marshal training attempt artifact: %w", err)
	}
	feedbackJSON, err := json.Marshal(attempt.Feedback)
	if err != nil {
		return fmt.Errorf("failed to marshal training attempt feedback: %w", err)
	}

	if _, err := r.db.DB.ExecContext(
		ctx,
		`
			INSERT INTO agent_training_attempts (
				attempt_id, aid, set_id, question_id, scene_type, score, result_status, artifact_json, feedback_json, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
		`,
		attempt.AttemptID,
		attempt.AID,
		attempt.SetID,
		attempt.QuestionID,
		attempt.SceneType,
		attempt.Score,
		attempt.ResultStatus,
		artifactJSON,
		feedbackJSON,
		attempt.CreatedAt,
		attempt.UpdatedAt,
	); err != nil {
		return fmt.Errorf("failed to create training attempt: %w", err)
	}

	return nil
}

func (r *dojoRepository) GetLatestTrainingAttempt(ctx context.Context, aid, sceneType string) (*models.AgentTrainingAttempt, error) {
	query := `
		SELECT attempt_id, aid, set_id, question_id, scene_type, score, result_status, artifact_json, feedback_json, created_at, updated_at
		FROM agent_training_attempts
		WHERE aid = $1
	`
	args := []interface{}{aid}
	if sceneType != "" {
		query += ` AND scene_type = $2`
		args = append(args, sceneType)
	}
	query += ` ORDER BY created_at DESC LIMIT 1`

	item, err := scanTrainingAttempt(r.db.DB.QueryRowContext(ctx, query, args...))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("training attempt not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get latest training attempt: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) CreateRemediationPlan(ctx context.Context, plan *models.AgentRemediationPlan) error {
	goalJSON, err := json.Marshal(plan.Goal)
	if err != nil {
		return fmt.Errorf("failed to marshal remediation goal: %w", err)
	}
	assignedSetIDsJSON, err := json.Marshal(plan.AssignedSetIDs)
	if err != nil {
		return fmt.Errorf("failed to marshal remediation sets: %w", err)
	}

	if _, err := r.db.DB.ExecContext(
		ctx,
		`
			INSERT INTO agent_remediation_plans (
				plan_id, aid, coach_aid, trigger_type, goal_json, assigned_set_ids_json, required_pass_count, status, created_at, updated_at
			)
			VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10)
		`,
		plan.PlanID,
		plan.AID,
		plan.CoachAID,
		plan.TriggerType,
		goalJSON,
		assignedSetIDsJSON,
		plan.RequiredPassCount,
		plan.Status,
		plan.CreatedAt,
		plan.UpdatedAt,
	); err != nil {
		return fmt.Errorf("failed to create remediation plan: %w", err)
	}

	return nil
}

func (r *dojoRepository) GetActiveRemediationPlan(ctx context.Context, aid string) (*models.AgentRemediationPlan, error) {
	query := `
		SELECT plan_id, aid, coach_aid, trigger_type, goal_json, assigned_set_ids_json, required_pass_count, status, created_at, updated_at
		FROM agent_remediation_plans
		WHERE aid = $1 AND status = 'active'
		ORDER BY updated_at DESC
		LIMIT 1
	`

	item, err := scanRemediationPlan(r.db.DB.QueryRowContext(ctx, query, aid))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("remediation plan not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get active remediation plan: %w", err)
	}

	return item, nil
}

func (r *dojoRepository) ListMistakeItems(ctx context.Context, aid string, limit int) ([]models.AgentMistakeItem, error) {
	rows, err := r.db.DB.QueryContext(
		ctx,
		`
			SELECT mistake_id, aid, source_type, source_ref_id, capability_key, mistake_type, severity, evidence_json, status, created_at, updated_at
			FROM agent_mistake_items
			WHERE aid = $1
			ORDER BY created_at DESC
			LIMIT $2
		`,
		aid,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list mistake items: %w", err)
	}
	defer rows.Close()

	items := make([]models.AgentMistakeItem, 0, limit)
	for rows.Next() {
		item, err := scanMistakeItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate mistake items: %w", err)
	}

	return items, nil
}

func (r *dojoRepository) ListRemediationPlans(ctx context.Context, aid string, limit int) ([]models.AgentRemediationPlan, error) {
	rows, err := r.db.DB.QueryContext(
		ctx,
		`
			SELECT plan_id, aid, coach_aid, trigger_type, goal_json, assigned_set_ids_json, required_pass_count, status, created_at, updated_at
			FROM agent_remediation_plans
			WHERE aid = $1
			ORDER BY created_at DESC
			LIMIT $2
		`,
		aid,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list remediation plans: %w", err)
	}
	defer rows.Close()

	items := make([]models.AgentRemediationPlan, 0, limit)
	for rows.Next() {
		item, err := scanRemediationPlan(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate remediation plans: %w", err)
	}

	return items, nil
}

func (r *dojoRepository) CountMistakeItems(ctx context.Context, aid string) (int, int, error) {
	var total int
	if err := r.db.DB.QueryRowContext(
		ctx,
		`SELECT COUNT(1) FROM agent_mistake_items WHERE aid = $1`,
		aid,
	).Scan(&total); err != nil {
		return 0, 0, fmt.Errorf("failed to count mistake items: %w", err)
	}

	var openCount int
	if err := r.db.DB.QueryRowContext(
		ctx,
		`SELECT COUNT(1) FROM agent_mistake_items WHERE aid = $1 AND status NOT IN ('resolved', 'archived')`,
		aid,
	).Scan(&openCount); err != nil {
		return 0, 0, fmt.Errorf("failed to count open mistake items: %w", err)
	}

	return total, openCount, nil
}

func (r *dojoRepository) GetOverview(ctx context.Context) (*models.AdminDojoOverview, error) {
	overview := &models.AdminDojoOverview{
		BySchool: make(map[string]int),
		ByStage:  make(map[string]int),
	}

	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM coach_profiles WHERE status <> 'archived'`).Scan(&overview.TotalCoaches); err != nil {
		return nil, fmt.Errorf("failed to count coaches: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM agent_coach_bindings WHERE status = 'active'`).Scan(&overview.ActiveCoachBindings); err != nil {
		return nil, fmt.Errorf("failed to count coach bindings: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM agent_remediation_plans WHERE status = 'active'`).Scan(&overview.ActivePlans); err != nil {
		return nil, fmt.Errorf("failed to count active plans: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM agent_mistake_items WHERE status NOT IN ('resolved', 'archived')`).Scan(&overview.OpenMistakes); err != nil {
		return nil, fmt.Errorf("failed to count open mistakes: %w", err)
	}
	if err := r.db.DB.QueryRowContext(ctx, `SELECT COUNT(1) FROM agent_mistake_items WHERE severity = 'high' AND status NOT IN ('resolved', 'archived')`).Scan(&overview.HighSeverityMistakes); err != nil {
		return nil, fmt.Errorf("failed to count high severity mistakes: %w", err)
	}

	stageRows, err := r.db.DB.QueryContext(
		ctx,
		`SELECT stage, COUNT(1) FROM agent_coach_bindings WHERE status = 'active' GROUP BY stage`,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query dojo stage distribution: %w", err)
	}
	defer stageRows.Close()

	for stageRows.Next() {
		var stage string
		var count int
		if err := stageRows.Scan(&stage, &count); err != nil {
			return nil, fmt.Errorf("failed to scan dojo stage row: %w", err)
		}
		overview.ByStage[stage] = count
		switch stage {
		case "diagnostic":
			overview.DiagnosticStageAgents = count
		case "practice", "training":
			overview.PracticeStageAgents += count
		case "arena_ready", "arena":
			overview.ArenaReadyAgents += count
		}
	}
	if err := stageRows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate dojo stage rows: %w", err)
	}

	schoolRows, err := r.db.DB.QueryContext(
		ctx,
		`SELECT school_key, COUNT(1) FROM agent_coach_bindings WHERE status = 'active' GROUP BY school_key`,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to query dojo school distribution: %w", err)
	}
	defer schoolRows.Close()

	for schoolRows.Next() {
		var schoolKey string
		var count int
		if err := schoolRows.Scan(&schoolKey, &count); err != nil {
			return nil, fmt.Errorf("failed to scan dojo school row: %w", err)
		}
		overview.BySchool[schoolKey] = count
	}
	if err := schoolRows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate dojo school rows: %w", err)
	}

	var lastActivity sql.NullTime
	if err := r.db.DB.QueryRowContext(
		ctx,
		`
			SELECT MAX(ts) FROM (
				SELECT MAX(updated_at) AS ts FROM agent_coach_bindings
				UNION ALL
				SELECT MAX(updated_at) AS ts FROM agent_remediation_plans
				UNION ALL
				SELECT MAX(updated_at) AS ts FROM agent_mistake_items
				UNION ALL
				SELECT MAX(updated_at) AS ts FROM agent_training_attempts
			) AS dojo_activity
		`,
	).Scan(&lastActivity); err != nil {
		return nil, fmt.Errorf("failed to query dojo last activity: %w", err)
	}
	if lastActivity.Valid {
		overview.LastActivityAt = &lastActivity.Time
	}

	return overview, nil
}
