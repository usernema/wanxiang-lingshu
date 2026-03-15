package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
)

type SectApplicationRepository interface {
	Create(ctx context.Context, application *models.SectMembershipApplication) error
	GetByID(ctx context.Context, applicationID string) (*models.SectMembershipApplication, error)
	FindSubmittedByAidAndTarget(ctx context.Context, aid, targetSectKey string) (*models.SectMembershipApplication, error)
	ListByAid(ctx context.Context, aid string, limit int) ([]models.SectMembershipApplication, error)
	List(ctx context.Context, limit, offset int, status, targetSectKey, applicationType string) ([]models.SectMembershipApplication, int, error)
	UpdateReview(ctx context.Context, applicationID, status, adminNotes, reviewedBy string, reviewedAt, updatedAt time.Time) (*models.SectMembershipApplication, error)
	UpdateApplicantStatus(ctx context.Context, applicationID, aid, status string, updatedAt time.Time) (*models.SectMembershipApplication, error)
}

type sectApplicationRepository struct {
	db *database.PostgresDB
}

func NewSectApplicationRepository(db *database.PostgresDB) SectApplicationRepository {
	return &sectApplicationRepository{db: db}
}

type sectApplicationScannable interface {
	Scan(dest ...interface{}) error
}

func scanSectMembershipApplication(scanner sectApplicationScannable) (*models.SectMembershipApplication, error) {
	item := &models.SectMembershipApplication{}
	var blockersJSON []byte
	var advantagesJSON []byte
	var evidenceJSON []byte

	err := scanner.Scan(
		&item.ID,
		&item.ApplicationID,
		&item.AID,
		&item.CurrentSectKey,
		&item.TargetSectKey,
		&item.RecommendedSectKey,
		&item.ApplicationType,
		&item.Status,
		&item.ReadinessScore,
		&item.Summary,
		&blockersJSON,
		&advantagesJSON,
		&evidenceJSON,
		&item.AdminNotes,
		&item.SubmittedAt,
		&item.ReviewedAt,
		&item.ReviewedBy,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if err := json.Unmarshal(blockersJSON, &item.Blockers); err != nil {
		return nil, fmt.Errorf("failed to unmarshal application blockers: %w", err)
	}
	if err := json.Unmarshal(advantagesJSON, &item.Advantages); err != nil {
		return nil, fmt.Errorf("failed to unmarshal application advantages: %w", err)
	}
	if err := json.Unmarshal(evidenceJSON, &item.Evidence); err != nil {
		return nil, fmt.Errorf("failed to unmarshal application evidence: %w", err)
	}

	return item, nil
}

func (r *sectApplicationRepository) Create(ctx context.Context, application *models.SectMembershipApplication) error {
	blockersJSON, err := json.Marshal(application.Blockers)
	if err != nil {
		return fmt.Errorf("failed to marshal application blockers: %w", err)
	}
	advantagesJSON, err := json.Marshal(application.Advantages)
	if err != nil {
		return fmt.Errorf("failed to marshal application advantages: %w", err)
	}
	evidenceJSON, err := json.Marshal(application.Evidence)
	if err != nil {
		return fmt.Errorf("failed to marshal application evidence: %w", err)
	}

	query := `
		INSERT INTO sect_membership_applications (
			application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14, $15, $16, $17, $18)
		RETURNING id
	`

	err = r.db.DB.QueryRowContext(
		ctx,
		query,
		application.ApplicationID,
		application.AID,
		application.CurrentSectKey,
		application.TargetSectKey,
		application.RecommendedSectKey,
		application.ApplicationType,
		application.Status,
		application.ReadinessScore,
		application.Summary,
		blockersJSON,
		advantagesJSON,
		evidenceJSON,
		application.AdminNotes,
		application.SubmittedAt,
		application.ReviewedAt,
		application.ReviewedBy,
		application.CreatedAt,
		application.UpdatedAt,
	).Scan(&application.ID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "idx_sect_membership_applications_active_unique") {
			return fmt.Errorf("application already submitted")
		}
		return fmt.Errorf("failed to create sect application: %w", err)
	}

	return nil
}

func (r *sectApplicationRepository) GetByID(ctx context.Context, applicationID string) (*models.SectMembershipApplication, error) {
	query := `
		SELECT
			id, application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
		FROM sect_membership_applications
		WHERE application_id = $1
	`

	item, err := scanSectMembershipApplication(r.db.DB.QueryRowContext(ctx, query, applicationID))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("sect application not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get sect application: %w", err)
	}
	return item, nil
}

func (r *sectApplicationRepository) FindSubmittedByAidAndTarget(ctx context.Context, aid, targetSectKey string) (*models.SectMembershipApplication, error) {
	query := `
		SELECT
			id, application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
		FROM sect_membership_applications
		WHERE aid = $1 AND target_sect_key = $2 AND status = 'submitted'
		ORDER BY created_at DESC
		LIMIT 1
	`

	item, err := scanSectMembershipApplication(r.db.DB.QueryRowContext(ctx, query, aid, targetSectKey))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("sect application not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query submitted sect application: %w", err)
	}
	return item, nil
}

func (r *sectApplicationRepository) ListByAid(ctx context.Context, aid string, limit int) ([]models.SectMembershipApplication, error) {
	query := `
		SELECT
			id, application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
		FROM sect_membership_applications
		WHERE aid = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := r.db.DB.QueryContext(ctx, query, aid, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list sect applications by aid: %w", err)
	}
	defer rows.Close()

	items := make([]models.SectMembershipApplication, 0)
	for rows.Next() {
		item, scanErr := scanSectMembershipApplication(rows)
		if scanErr != nil {
			return nil, fmt.Errorf("failed to scan sect application: %w", scanErr)
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate sect applications: %w", err)
	}

	return items, nil
}

func (r *sectApplicationRepository) List(ctx context.Context, limit, offset int, status, targetSectKey, applicationType string) ([]models.SectMembershipApplication, int, error) {
	conditions := make([]string, 0, 3)
	args := make([]interface{}, 0, 5)

	if strings.TrimSpace(status) != "" {
		args = append(args, strings.TrimSpace(status))
		conditions = append(conditions, fmt.Sprintf("status = $%d", len(args)))
	}
	if strings.TrimSpace(targetSectKey) != "" {
		args = append(args, strings.TrimSpace(targetSectKey))
		conditions = append(conditions, fmt.Sprintf("target_sect_key = $%d", len(args)))
	}
	if strings.TrimSpace(applicationType) != "" {
		args = append(args, strings.TrimSpace(applicationType))
		conditions = append(conditions, fmt.Sprintf("application_type = $%d", len(args)))
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = " WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := "SELECT COUNT(1) FROM sect_membership_applications" + whereClause
	var total int
	if err := r.db.DB.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count sect applications: %w", err)
	}

	args = append(args, limit, offset)
	query := `
		SELECT
			id, application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
		FROM sect_membership_applications
	` + whereClause + fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := r.db.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list sect applications: %w", err)
	}
	defer rows.Close()

	items := make([]models.SectMembershipApplication, 0)
	for rows.Next() {
		item, scanErr := scanSectMembershipApplication(rows)
		if scanErr != nil {
			return nil, 0, fmt.Errorf("failed to scan sect application row: %w", scanErr)
		}
		items = append(items, *item)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("failed to iterate sect applications: %w", err)
	}

	return items, total, nil
}

func (r *sectApplicationRepository) UpdateReview(ctx context.Context, applicationID, status, adminNotes, reviewedBy string, reviewedAt, updatedAt time.Time) (*models.SectMembershipApplication, error) {
	query := `
		UPDATE sect_membership_applications
		SET status = $2,
			admin_notes = $3,
			reviewed_by = $4,
			reviewed_at = $5,
			updated_at = $6
		WHERE application_id = $1
		RETURNING
			id, application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
	`

	item, err := scanSectMembershipApplication(r.db.DB.QueryRowContext(ctx, query, applicationID, status, adminNotes, reviewedBy, reviewedAt, updatedAt))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("sect application not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update sect application review: %w", err)
	}
	return item, nil
}

func (r *sectApplicationRepository) UpdateApplicantStatus(ctx context.Context, applicationID, aid, status string, updatedAt time.Time) (*models.SectMembershipApplication, error) {
	query := `
		UPDATE sect_membership_applications
		SET status = $3,
			updated_at = $4
		WHERE application_id = $1 AND aid = $2
		RETURNING
			id, application_id, aid, current_sect_key, target_sect_key, recommended_sect_key,
			application_type, status, readiness_score, summary, blockers_json, advantages_json,
			evidence_json, admin_notes, submitted_at, reviewed_at, reviewed_by, created_at, updated_at
	`

	item, err := scanSectMembershipApplication(r.db.DB.QueryRowContext(ctx, query, applicationID, aid, status, updatedAt))
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("sect application not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to update applicant sect application status: %w", err)
	}
	return item, nil
}
