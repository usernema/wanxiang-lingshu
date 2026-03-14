package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type JSONMap map[string]interface{}

func (m JSONMap) Value() (driver.Value, error) {
	return json.Marshal(m)
}

func (m *JSONMap) Scan(value interface{}) error {
	if value == nil {
		*m = JSONMap{}
		return nil
	}

	var bytes []byte
	switch typed := value.(type) {
	case []byte:
		bytes = typed
	case string:
		bytes = []byte(typed)
	default:
		return fmt.Errorf("unsupported JSONMap scan type: %T", value)
	}

	if len(bytes) == 0 {
		*m = JSONMap{}
		return nil
	}

	return json.Unmarshal(bytes, m)
}

type CoachProfile struct {
	CoachAID  string     `json:"coach_aid" db:"coach_aid"`
	CoachType string     `json:"coach_type" db:"coach_type"`
	Schools   StringList `json:"schools" db:"schools_json"`
	Bio       string     `json:"bio" db:"bio"`
	Pricing   JSONMap    `json:"pricing" db:"pricing_json"`
	Rating    float64    `json:"rating" db:"rating"`
	Status    string     `json:"status" db:"status"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
}

type AgentCoachBinding struct {
	AID             string    `json:"aid" db:"aid"`
	PrimaryCoachAID string    `json:"primary_coach_aid" db:"primary_coach_aid"`
	ShadowCoachAID  string    `json:"shadow_coach_aid,omitempty" db:"shadow_coach_aid"`
	SchoolKey       string    `json:"school_key" db:"school_key"`
	Stage           string    `json:"stage" db:"stage"`
	Status          string    `json:"status" db:"status"`
	CreatedAt       time.Time `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time `json:"updated_at" db:"updated_at"`
}

type TrainingQuestionSet struct {
	SetID      string     `json:"set_id" db:"set_id"`
	SchoolKey  string     `json:"school_key" db:"school_key"`
	SceneType  string     `json:"scene_type" db:"scene_type"`
	Title      string     `json:"title" db:"title"`
	Difficulty string     `json:"difficulty" db:"difficulty"`
	Tags       StringList `json:"tags" db:"tags_json"`
	Status     string     `json:"status" db:"status"`
	CreatedAt  time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at" db:"updated_at"`
}

type TrainingQuestion struct {
	QuestionID    string    `json:"question_id" db:"question_id"`
	SetID         string    `json:"set_id" db:"set_id"`
	CapabilityKey string    `json:"capability_key" db:"capability_key"`
	Prompt        JSONMap   `json:"prompt" db:"prompt_json"`
	Rubric        JSONMap   `json:"rubric" db:"rubric_json"`
	AnswerKey     JSONMap   `json:"answer_key" db:"answer_key_json"`
	SortOrder     int       `json:"sort_order" db:"sort_order"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

type AgentTrainingAttempt struct {
	AttemptID    string    `json:"attempt_id" db:"attempt_id"`
	AID          string    `json:"aid" db:"aid"`
	SetID        string    `json:"set_id" db:"set_id"`
	QuestionID   string    `json:"question_id" db:"question_id"`
	SceneType    string    `json:"scene_type" db:"scene_type"`
	Score        int       `json:"score" db:"score"`
	ResultStatus string    `json:"result_status" db:"result_status"`
	Artifact     JSONMap   `json:"artifact" db:"artifact_json"`
	Feedback     JSONMap   `json:"feedback" db:"feedback_json"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

type AgentMistakeItem struct {
	MistakeID     string    `json:"mistake_id" db:"mistake_id"`
	AID           string    `json:"aid" db:"aid"`
	SourceType    string    `json:"source_type" db:"source_type"`
	SourceRefID   string    `json:"source_ref_id" db:"source_ref_id"`
	CapabilityKey string    `json:"capability_key" db:"capability_key"`
	MistakeType   string    `json:"mistake_type" db:"mistake_type"`
	Severity      string    `json:"severity" db:"severity"`
	Evidence      JSONMap   `json:"evidence" db:"evidence_json"`
	Status        string    `json:"status" db:"status"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}

type AgentRemediationPlan struct {
	PlanID            string     `json:"plan_id" db:"plan_id"`
	AID               string     `json:"aid" db:"aid"`
	CoachAID          string     `json:"coach_aid" db:"coach_aid"`
	TriggerType       string     `json:"trigger_type" db:"trigger_type"`
	Goal              JSONMap    `json:"goal" db:"goal_json"`
	AssignedSetIDs    StringList `json:"assigned_set_ids" db:"assigned_set_ids_json"`
	RequiredPassCount int        `json:"required_pass_count" db:"required_pass_count"`
	Status            string     `json:"status" db:"status"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

type AgentDojoOverview struct {
	AID                   string                `json:"aid"`
	SchoolKey             string                `json:"school_key"`
	Stage                 string                `json:"stage"`
	Binding               *AgentCoachBinding    `json:"binding,omitempty"`
	Coach                 *CoachProfile         `json:"coach,omitempty"`
	ActivePlan            *AgentRemediationPlan `json:"active_plan,omitempty"`
	LastDiagnosticAttempt *AgentTrainingAttempt `json:"last_diagnostic_attempt,omitempty"`
	MistakeCount          int                   `json:"mistake_count"`
	OpenMistakeCount      int                   `json:"open_mistake_count"`
	PendingPlanCount      int                   `json:"pending_plan_count"`
	DiagnosticSetID       string                `json:"diagnostic_set_id,omitempty"`
	SuggestedNextAction   string                `json:"suggested_next_action"`
}

type DojoDiagnosticStartResponse struct {
	Overview    *AgentDojoOverview    `json:"overview"`
	Plan        *AgentRemediationPlan `json:"plan"`
	Attempt     *AgentTrainingAttempt `json:"attempt"`
	QuestionSet *TrainingQuestionSet  `json:"question_set"`
}

type AdminDojoOverview struct {
	TotalCoaches          int            `json:"total_coaches"`
	ActiveCoachBindings   int            `json:"active_coach_bindings"`
	DiagnosticStageAgents int            `json:"diagnostic_stage_agents"`
	PracticeStageAgents   int            `json:"practice_stage_agents"`
	ArenaReadyAgents      int            `json:"arena_ready_agents"`
	ActivePlans           int            `json:"active_plans"`
	OpenMistakes          int            `json:"open_mistakes"`
	HighSeverityMistakes  int            `json:"high_severity_mistakes"`
	BySchool              map[string]int `json:"by_school"`
	ByStage               map[string]int `json:"by_stage"`
	LastActivityAt        *time.Time     `json:"last_activity_at,omitempty"`
}
