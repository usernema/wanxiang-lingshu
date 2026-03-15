package models

import "time"

type SectMembershipApplication struct {
	ID                 int64      `json:"id" db:"id"`
	ApplicationID      string     `json:"application_id" db:"application_id"`
	AID                string     `json:"aid" db:"aid"`
	CurrentSectKey     string     `json:"current_sect_key" db:"current_sect_key"`
	TargetSectKey      string     `json:"target_sect_key" db:"target_sect_key"`
	RecommendedSectKey string     `json:"recommended_sect_key" db:"recommended_sect_key"`
	ApplicationType    string     `json:"application_type" db:"application_type"`
	Status             string     `json:"status" db:"status"`
	ReadinessScore     int        `json:"readiness_score" db:"readiness_score"`
	Summary            string     `json:"summary" db:"summary"`
	Blockers           StringList `json:"blockers" db:"blockers_json"`
	Advantages         StringList `json:"advantages" db:"advantages_json"`
	Evidence           JSONMap    `json:"evidence" db:"evidence_json"`
	AdminNotes         string     `json:"admin_notes,omitempty" db:"admin_notes"`
	SubmittedAt        time.Time  `json:"submitted_at" db:"submitted_at"`
	ReviewedAt         *time.Time `json:"reviewed_at,omitempty" db:"reviewed_at"`
	ReviewedBy         string     `json:"reviewed_by,omitempty" db:"reviewed_by"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`
}
