package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/a2ahub/identity-service/internal/database"
	"github.com/a2ahub/identity-service/internal/models"
)

// AgentRepository Agent 数据仓库接口
type AgentRepository interface {
	Create(ctx context.Context, agent *models.Agent) error
	GetByAID(ctx context.Context, aid string) (*models.Agent, error)
	Update(ctx context.Context, agent *models.Agent) error
	UpdateProfile(ctx context.Context, aid string, headline, bio, availabilityStatus string, capabilities models.Capabilities) (*models.Agent, error)
	UpdateReputation(ctx context.Context, aid string, change int, reason string) error
	GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error)
	CheckExists(ctx context.Context, aid string) (bool, error)
}

// agentRepository Agent 数据仓库实现
type agentRepository struct {
	db *database.PostgresDB
}

// NewAgentRepository 创建 Agent 数据仓库
func NewAgentRepository(db *database.PostgresDB) AgentRepository {
	return &agentRepository{db: db}
}

// Create 创建 Agent
func (r *agentRepository) Create(ctx context.Context, agent *models.Agent) error {
	capabilitiesJSON, err := json.Marshal(agent.Capabilities)
	if err != nil {
		return fmt.Errorf("failed to marshal capabilities: %w", err)
	}

	query := `
		INSERT INTO agents (aid, model, provider, public_key, capabilities, reputation, status, membership_level, trust_level, headline, bio, availability_status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`

	_, err = r.db.DB.ExecContext(ctx, query,
		agent.AID,
		agent.Model,
		agent.Provider,
		agent.PublicKey,
		capabilitiesJSON,
		agent.Reputation,
		agent.Status,
		agent.MembershipLevel,
		agent.TrustLevel,
		agent.Headline,
		agent.Bio,
		agent.AvailabilityStatus,
		agent.CreatedAt,
		agent.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create agent: %w", err)
	}

	return nil
}

// GetByAID 根据 AID 获取 Agent
func (r *agentRepository) GetByAID(ctx context.Context, aid string) (*models.Agent, error) {
	query := `
		SELECT aid, model, provider, public_key, capabilities, reputation, status, membership_level, trust_level, headline, bio, availability_status, created_at, updated_at
		FROM agents
		WHERE aid = $1
	`

	agent := &models.Agent{}
	var capabilitiesJSON []byte

	err := r.db.DB.QueryRowContext(ctx, query, aid).Scan(
		&agent.AID,
		&agent.Model,
		&agent.Provider,
		&agent.PublicKey,
		&capabilitiesJSON,
		&agent.Reputation,
		&agent.Status,
		&agent.MembershipLevel,
		&agent.TrustLevel,
		&agent.Headline,
		&agent.Bio,
		&agent.AvailabilityStatus,
		&agent.CreatedAt,
		&agent.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("agent not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get agent: %w", err)
	}

	if err := json.Unmarshal(capabilitiesJSON, &agent.Capabilities); err != nil {
		return nil, fmt.Errorf("failed to unmarshal capabilities: %w", err)
	}

	return agent, nil
}

// Update 更新 Agent
func (r *agentRepository) Update(ctx context.Context, agent *models.Agent) error {
	capabilitiesJSON, err := json.Marshal(agent.Capabilities)
	if err != nil {
		return fmt.Errorf("failed to marshal capabilities: %w", err)
	}

	query := `
		UPDATE agents
		SET model = $2, provider = $3, public_key = $4, capabilities = $5,
		    reputation = $6, status = $7, membership_level = $8, trust_level = $9,
		    headline = $10, bio = $11, availability_status = $12, updated_at = $13
		WHERE aid = $1
	`

	agent.UpdatedAt = time.Now()

	_, err = r.db.DB.ExecContext(ctx, query,
		agent.AID,
		agent.Model,
		agent.Provider,
		agent.PublicKey,
		capabilitiesJSON,
		agent.Reputation,
		agent.Status,
		agent.MembershipLevel,
		agent.TrustLevel,
		agent.Headline,
		agent.Bio,
		agent.AvailabilityStatus,
		agent.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to update agent: %w", err)
	}

	return nil
}

// UpdateProfile 更新 Agent 资料
func (r *agentRepository) UpdateProfile(ctx context.Context, aid string, headline, bio, availabilityStatus string, capabilities models.Capabilities) (*models.Agent, error) {
	capabilitiesJSON, err := json.Marshal(capabilities)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal capabilities: %w", err)
	}

	query := `
		UPDATE agents
		SET headline = $2, bio = $3, availability_status = $4, capabilities = $5, updated_at = $6
		WHERE aid = $1
	`

	updatedAt := time.Now()
	result, err := r.db.DB.ExecContext(ctx, query, aid, headline, bio, availabilityStatus, capabilitiesJSON, updatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to update profile: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to inspect profile update result: %w", err)
	}
	if rowsAffected == 0 {
		return nil, fmt.Errorf("agent not found")
	}

	return r.GetByAID(ctx, aid)
}

// UpdateReputation 更新信誉分
func (r *agentRepository) UpdateReputation(ctx context.Context, aid string, change int, reason string) error {
	tx, err := r.db.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// 获取当前信誉分
	var oldReputation int
	err = tx.QueryRowContext(ctx, "SELECT reputation FROM agents WHERE aid = $1 FOR UPDATE", aid).Scan(&oldReputation)
	if err != nil {
		return fmt.Errorf("failed to get current reputation: %w", err)
	}

	newReputation := oldReputation + change

	// 更新信誉分
	_, err = tx.ExecContext(ctx, "UPDATE agents SET reputation = $1, updated_at = $2 WHERE aid = $3",
		newReputation, time.Now(), aid)
	if err != nil {
		return fmt.Errorf("failed to update reputation: %w", err)
	}

	// 记录历史
	_, err = tx.ExecContext(ctx,
		"INSERT INTO reputation_history (aid, change, reason, old_value, new_value, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
		aid, change, reason, oldReputation, newReputation, time.Now())
	if err != nil {
		return fmt.Errorf("failed to insert reputation history: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// GetReputationHistory 获取信誉历史
func (r *agentRepository) GetReputationHistory(ctx context.Context, aid string, limit int) ([]models.ReputationHistory, error) {
	query := `
		SELECT id, aid, change, reason, old_value, new_value, created_at
		FROM reputation_history
		WHERE aid = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := r.db.DB.QueryContext(ctx, query, aid, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query reputation history: %w", err)
	}
	defer rows.Close()

	var history []models.ReputationHistory
	for rows.Next() {
		var h models.ReputationHistory
		if err := rows.Scan(&h.ID, &h.AID, &h.Change, &h.Reason, &h.OldValue, &h.NewValue, &h.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan reputation history: %w", err)
		}
		history = append(history, h)
	}

	return history, nil
}

// CheckExists 检查 Agent 是否存在
func (r *agentRepository) CheckExists(ctx context.Context, aid string) (bool, error) {
	var exists bool
	query := "SELECT EXISTS(SELECT 1 FROM agents WHERE aid = $1)"
	err := r.db.DB.QueryRowContext(ctx, query, aid).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check agent exists: %w", err)
	}
	return exists, nil
}
