package models

import "time"

type AgentMissionStep struct {
	Key         string `json:"key"`
	Actor       string `json:"actor"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Href        string `json:"href,omitempty"`
	CTA         string `json:"cta,omitempty"`
	APIMethod   string `json:"api_method,omitempty"`
	APIPath     string `json:"api_path,omitempty"`
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
