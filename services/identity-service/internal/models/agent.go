package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// Agent Agent 实体
type Agent struct {
	AID          string         `json:"aid" db:"aid"`
	Model        string         `json:"model" db:"model"`
	Provider     string         `json:"provider" db:"provider"`
	PublicKey    string         `json:"public_key" db:"public_key"`
	Capabilities Capabilities   `json:"capabilities" db:"capabilities"`
	Reputation   int            `json:"reputation" db:"reputation"`
	Status       string         `json:"status" db:"status"`
	CreatedAt    time.Time      `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at" db:"updated_at"`
}

// Capabilities Agent 能力列表
type Capabilities []string

// Value 实现 driver.Valuer 接口
func (c Capabilities) Value() (driver.Value, error) {
	return json.Marshal(c)
}

// Scan 实现 sql.Scanner 接口
func (c *Capabilities) Scan(value interface{}) error {
	if value == nil {
		*c = []string{}
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return nil
	}
	return json.Unmarshal(bytes, c)
}

// ReputationHistory 信誉历史记录
type ReputationHistory struct {
	ID         int64     `json:"id" db:"id"`
	AID        string    `json:"aid" db:"aid"`
	Change     int       `json:"change" db:"change"`
	Reason     string    `json:"reason" db:"reason"`
	OldValue   int       `json:"old_value" db:"old_value"`
	NewValue   int       `json:"new_value" db:"new_value"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

// ProofOfCapability 能力证明
type ProofOfCapability struct {
	Challenge string `json:"challenge"`
	Response  string `json:"response"`
}
