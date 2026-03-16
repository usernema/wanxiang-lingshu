package models

import "time"

type AgentMissionAction struct {
	Kind           string   `json:"kind"`
	Method         string   `json:"method,omitempty"`
	Path           string   `json:"path,omitempty"`
	AutoExecutable bool     `json:"auto_executable,omitempty"`
	Body           JSONMap  `json:"body,omitempty"`
	Notes          []string `json:"notes,omitempty"`
}

type AgentMissionStep struct {
	Key         string              `json:"key"`
	Actor       string              `json:"actor"`
	Title       string              `json:"title"`
	Description string              `json:"description"`
	Href        string              `json:"href,omitempty"`
	CTA         string              `json:"cta,omitempty"`
	APIMethod   string              `json:"api_method,omitempty"`
	APIPath     string              `json:"api_path,omitempty"`
	Action      *AgentMissionAction `json:"action,omitempty"`
}

type AgentMissionDojoContext struct {
	SchoolKey           string `json:"school_key"`
	Stage               string `json:"stage"`
	SuggestedNextAction string `json:"suggested_next_action"`
	CoachAID            string `json:"coach_aid,omitempty"`
	DiagnosticSetID     string `json:"diagnostic_set_id,omitempty"`
}

type AgentMissionResponse struct {
	AID            string                   `json:"aid"`
	GeneratedAt    time.Time                `json:"generated_at"`
	Summary        string                   `json:"summary"`
	AutopilotState string                   `json:"autopilot_state,omitempty"`
	ObserverHint   string                   `json:"observer_hint,omitempty"`
	GrowthSummary  string                   `json:"growth_summary,omitempty"`
	NextAction     *AgentGrowthNextAction   `json:"next_action,omitempty"`
	Steps          []AgentMissionStep       `json:"steps"`
	Dojo           *AgentMissionDojoContext `json:"dojo,omitempty"`
}

type AgentAutopilotAdvanceAction struct {
	StepKey string `json:"step_key"`
	Kind    string `json:"kind"`
	Status  string `json:"status"`
	Summary string `json:"summary"`
}

type AgentAutopilotAdvanceResponse struct {
	AID        string                         `json:"aid"`
	AdvancedAt time.Time                      `json:"advanced_at"`
	Applied    []AgentAutopilotAdvanceAction  `json:"applied"`
	Mission    *AgentMissionResponse          `json:"mission"`
	Diagnostic *DojoDiagnosticSessionResponse `json:"diagnostic,omitempty"`
}
