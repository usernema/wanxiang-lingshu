package service

import (
	"context"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/google/uuid"
)

const defaultDojoCoachAID = "official://dojo/general-coach"

type AssignCoachRequest struct {
	PrimaryCoachAID string `json:"primary_coach_aid"`
	ShadowCoachAID  string `json:"shadow_coach_aid"`
	SchoolKey       string `json:"school_key"`
	Stage           string `json:"stage"`
}

type DojoDiagnosticAnswerInput struct {
	QuestionID string `json:"question_id"`
	Answer     string `json:"answer"`
}

type SubmitDojoDiagnosticsRequest struct {
	AttemptID string                      `json:"attempt_id"`
	Answers   []DojoDiagnosticAnswerInput `json:"answers"`
}

func (s *agentService) GetDojoOverview(ctx context.Context, aid string) (*models.AgentDojoOverview, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}

	agent, growthProfile, err := s.getAgentWithGrowthProfile(ctx, aid)
	if err != nil {
		return nil, err
	}

	binding, coach, set, err := s.ensureDojoScaffold(ctx, agent, growthProfile)
	if err != nil {
		return nil, err
	}

	totalMistakes, openMistakes, err := s.dojoRepo.CountMistakeItems(ctx, aid)
	if err != nil {
		return nil, err
	}

	var activePlan *models.AgentRemediationPlan
	if plan, err := s.dojoRepo.GetActiveRemediationPlan(ctx, aid); err == nil {
		activePlan = plan
	} else if err.Error() != "remediation plan not found" {
		return nil, err
	}

	var lastAttempt *models.AgentTrainingAttempt
	if attempt, err := s.dojoRepo.GetLatestTrainingAttempt(ctx, aid, "diagnostic"); err == nil {
		lastAttempt = attempt
	} else if err.Error() != "training attempt not found" {
		return nil, err
	}

	plans, err := s.dojoRepo.ListRemediationPlans(ctx, aid, 10)
	if err != nil {
		return nil, err
	}
	pendingPlanCount := 0
	for _, plan := range plans {
		if plan.Status == "active" || plan.Status == "queued" {
			pendingPlanCount++
		}
	}

	suggestedNextAction := "start_diagnostic"
	switch {
	case lastAttempt != nil && (lastAttempt.ResultStatus == "queued" || lastAttempt.ResultStatus == "in_progress"):
		suggestedNextAction = "complete_diagnostic"
	case activePlan != nil:
		suggestedNextAction = "follow_remediation_plan"
	case openMistakes > 0:
		suggestedNextAction = "review_mistakes"
	}

	return &models.AgentDojoOverview{
		AID:                   aid,
		SchoolKey:             binding.SchoolKey,
		Stage:                 binding.Stage,
		Binding:               binding,
		Coach:                 coach,
		ActivePlan:            activePlan,
		LastDiagnosticAttempt: lastAttempt,
		MistakeCount:          totalMistakes,
		OpenMistakeCount:      openMistakes,
		PendingPlanCount:      pendingPlanCount,
		DiagnosticSetID:       set.SetID,
		SuggestedNextAction:   suggestedNextAction,
	}, nil
}

func (s *agentService) GetCurrentDojoDiagnostic(ctx context.Context, aid string) (*models.DojoDiagnosticSessionResponse, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}

	agent, growthProfile, err := s.getAgentWithGrowthProfile(ctx, aid)
	if err != nil {
		return nil, err
	}

	_, _, set, err := s.ensureDojoScaffold(ctx, agent, growthProfile)
	if err != nil {
		return nil, err
	}

	questions, err := s.dojoRepo.ListQuestionsBySetID(ctx, set.SetID)
	if err != nil {
		return nil, err
	}

	var plan *models.AgentRemediationPlan
	if activePlan, planErr := s.dojoRepo.GetActiveRemediationPlan(ctx, aid); planErr == nil {
		plan = activePlan
	} else if planErr.Error() != "remediation plan not found" {
		return nil, planErr
	}

	var attempt *models.AgentTrainingAttempt
	if latestAttempt, attemptErr := s.dojoRepo.GetLatestTrainingAttempt(ctx, aid, "diagnostic"); attemptErr == nil {
		attempt = latestAttempt
	} else if attemptErr.Error() != "training attempt not found" {
		return nil, attemptErr
	}

	overview, err := s.GetDojoOverview(ctx, aid)
	if err != nil {
		return nil, err
	}

	return &models.DojoDiagnosticSessionResponse{
		Overview:    overview,
		Plan:        plan,
		Attempt:     attempt,
		QuestionSet: set,
		Questions:   questions,
	}, nil
}

func (s *agentService) StartDojoDiagnostics(ctx context.Context, aid string) (*models.DojoDiagnosticStartResponse, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}

	agent, growthProfile, err := s.getAgentWithGrowthProfile(ctx, aid)
	if err != nil {
		return nil, err
	}

	binding, _, set, err := s.ensureDojoScaffold(ctx, agent, growthProfile)
	if err != nil {
		return nil, err
	}

	questions, err := s.dojoRepo.ListQuestionsBySetID(ctx, set.SetID)
	if err != nil {
		return nil, err
	}

	if plan, err := s.dojoRepo.GetActiveRemediationPlan(ctx, aid); err == nil {
		var attempt *models.AgentTrainingAttempt
		if latestAttempt, attemptErr := s.dojoRepo.GetLatestTrainingAttempt(ctx, aid, "diagnostic"); attemptErr == nil {
			attempt = latestAttempt
		}
		if attempt == nil || attempt.ResultStatus == "passed" {
			now := time.Now()
			attempt = &models.AgentTrainingAttempt{
				AttemptID:    "attempt_" + uuid.NewString(),
				AID:          aid,
				SetID:        set.SetID,
				QuestionID:   "",
				SceneType:    "diagnostic",
				Score:        0,
				ResultStatus: "queued",
				Artifact: models.JSONMap{
					"mode":       "self_serve_diagnostic",
					"school_key": binding.SchoolKey,
					"coach_aid":  binding.PrimaryCoachAID,
				},
				Feedback: models.JSONMap{
					"status": "coach_assigned",
					"next":   "answer_diagnostic_questions",
				},
				CreatedAt: now,
				UpdatedAt: now,
			}
			if err := s.dojoRepo.CreateTrainingAttempt(ctx, attempt); err != nil {
				return nil, err
			}
		}
		overview, overviewErr := s.GetDojoOverview(ctx, aid)
		if overviewErr != nil {
			return nil, overviewErr
		}
		return &models.DojoDiagnosticStartResponse{
			Overview:    overview,
			Plan:        plan,
			Attempt:     attempt,
			QuestionSet: set,
			Questions:   questions,
		}, nil
	} else if err.Error() != "remediation plan not found" {
		return nil, err
	}

	now := time.Now()
	attempt := &models.AgentTrainingAttempt{
		AttemptID:    "attempt_" + uuid.NewString(),
		AID:          aid,
		SetID:        set.SetID,
		QuestionID:   "",
		SceneType:    "diagnostic",
		Score:        0,
		ResultStatus: "queued",
		Artifact: models.JSONMap{
			"mode":       "self_serve_diagnostic",
			"school_key": binding.SchoolKey,
			"coach_aid":  binding.PrimaryCoachAID,
		},
		Feedback: models.JSONMap{
			"status": "coach_assigned",
			"next":   "answer_diagnostic_questions",
		},
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.dojoRepo.CreateTrainingAttempt(ctx, attempt); err != nil {
		return nil, err
	}

	plan := &models.AgentRemediationPlan{
		PlanID:      "plan_" + uuid.NewString(),
		AID:         aid,
		CoachAID:    binding.PrimaryCoachAID,
		TriggerType: "diagnostic",
		Goal: models.JSONMap{
			"title":       "完成入门诊断并进入训练场",
			"school_key":  binding.SchoolKey,
			"scene_type":  "diagnostic",
			"coach_aid":   binding.PrimaryCoachAID,
			"started_at":  now.Format(time.RFC3339),
			"entry_point": "self_serve",
		},
		AssignedSetIDs:    models.StringList{set.SetID},
		RequiredPassCount: 1,
		Status:            "active",
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := s.dojoRepo.CreateRemediationPlan(ctx, plan); err != nil {
		return nil, err
	}

	overview, err := s.GetDojoOverview(ctx, aid)
	if err != nil {
		return nil, err
	}

	return &models.DojoDiagnosticStartResponse{
		Overview:    overview,
		Plan:        plan,
		Attempt:     attempt,
		QuestionSet: set,
		Questions:   questions,
	}, nil
}

func (s *agentService) SubmitDojoDiagnostics(ctx context.Context, aid string, req *SubmitDojoDiagnosticsRequest) (*models.DojoDiagnosticSubmitResponse, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}
	if req == nil || len(req.Answers) == 0 {
		return nil, fmt.Errorf("diagnostic answers are required")
	}

	session, err := s.GetCurrentDojoDiagnostic(ctx, aid)
	if err != nil {
		return nil, err
	}

	attempt := session.Attempt
	requestAttemptID := strings.TrimSpace(req.AttemptID)
	if requestAttemptID != "" {
		attempt, err = s.dojoRepo.GetTrainingAttempt(ctx, requestAttemptID)
		if err != nil {
			return nil, err
		}
		if attempt.AID != aid {
			return nil, fmt.Errorf("training attempt does not belong to current agent")
		}
		if attempt.ResultStatus == "passed" {
			return nil, fmt.Errorf("training attempt already completed")
		}
	}

	if attempt == nil || (attempt.ResultStatus == "passed" && requestAttemptID == "") {
		startResp, err := s.StartDojoDiagnostics(ctx, aid)
		if err != nil {
			return nil, err
		}
		session = startResp
		attempt = startResp.Attempt
	}

	if attempt == nil {
		return nil, fmt.Errorf("diagnostic attempt is not ready")
	}
	if session.QuestionSet == nil {
		return nil, fmt.Errorf("diagnostic question set is not ready")
	}
	if attempt.SetID != session.QuestionSet.SetID {
		return nil, fmt.Errorf("diagnostic set changed, please restart diagnostics")
	}
	if len(session.Questions) == 0 {
		return nil, fmt.Errorf("diagnostic questions are not configured")
	}

	answerMap := make(map[string]string, len(req.Answers))
	for _, item := range req.Answers {
		questionID := strings.TrimSpace(item.QuestionID)
		if questionID == "" {
			continue
		}
		answerMap[questionID] = strings.TrimSpace(item.Answer)
	}
	if len(answerMap) == 0 {
		return nil, fmt.Errorf("at least one answer is required")
	}

	now := time.Now()
	questionResults := make([]models.JSONMap, 0, len(session.Questions))
	answerArtifacts := make([]models.JSONMap, 0, len(session.Questions))
	mistakes := make([]models.AgentMistakeItem, 0)
	totalScore := 0
	answeredCount := 0

	for _, question := range session.Questions {
		answer := strings.TrimSpace(answerMap[question.QuestionID])
		if answer != "" {
			answeredCount++
		}
		evaluation := evaluateDojoDiagnosticAnswer(question, answer)
		totalScore += evaluation.Score
		questionResults = append(questionResults, models.JSONMap{
			"question_id":          question.QuestionID,
			"prompt_title":         extractDojoPromptTitle(question),
			"capability_key":       question.CapabilityKey,
			"score":                evaluation.Score,
			"answer_length":        evaluation.AnswerLength,
			"matched_checkpoints":  evaluation.MatchedCheckpoints,
			"missing_checkpoints":  evaluation.MissingCheckpoints,
			"structure_hits":       evaluation.StructureHits,
			"checkpoint_hit_count": len(evaluation.MatchedCheckpoints),
			"checkpoint_total":     evaluation.CheckpointTotal,
		})
		answerArtifacts = append(answerArtifacts, models.JSONMap{
			"question_id": question.QuestionID,
			"answer":      answer,
		})

		if evaluation.Score >= 70 {
			continue
		}

		mistakeType := "insufficient_structure"
		if len(evaluation.MissingCheckpoints) > 0 {
			mistakeType = "missing_checkpoint"
		}
		severity := "medium"
		if evaluation.Score < 50 || evaluation.AnswerLength < 40 {
			severity = "high"
		}
		mistakes = append(mistakes, models.AgentMistakeItem{
			MistakeID:     "mistake_" + uuid.NewString(),
			AID:           aid,
			SourceType:    "diagnostic",
			SourceRefID:   attempt.AttemptID,
			CapabilityKey: question.CapabilityKey,
			MistakeType:   mistakeType,
			Severity:      severity,
			Evidence: models.JSONMap{
				"question_id":         question.QuestionID,
				"prompt_title":        extractDojoPromptTitle(question),
				"answer":              answer,
				"score":               evaluation.Score,
				"answer_length":       evaluation.AnswerLength,
				"matched_checkpoints": evaluation.MatchedCheckpoints,
				"missing_checkpoints": evaluation.MissingCheckpoints,
				"structure_hits":      evaluation.StructureHits,
				"checkpoint_total":    evaluation.CheckpointTotal,
				"recommended_next":    "review_checkpoints_and_retry",
			},
			Status:    "open",
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	overallScore := 0
	if len(session.Questions) > 0 {
		overallScore = totalScore / len(session.Questions)
	}
	passed := overallScore >= 70

	attempt.Artifact = cloneJSONMap(attempt.Artifact)
	attempt.Artifact["submitted_at"] = now.Format(time.RFC3339)
	attempt.Artifact["answers"] = answerArtifacts
	attempt.Artifact["answered_count"] = answeredCount
	attempt.Artifact["question_count"] = len(session.Questions)

	summary := models.JSONMap{
		"score":            overallScore,
		"passed":           passed,
		"threshold":        70,
		"question_count":   len(session.Questions),
		"answered_count":   answeredCount,
		"mistake_count":    len(mistakes),
		"next_stage":       "diagnostic",
		"submitted_at":     now.Format(time.RFC3339),
		"recommended_next": "review_mistakes",
	}
	if passed {
		summary["next_stage"] = "practice"
		summary["recommended_next"] = "enter_practice"
	}

	attempt.Score = overallScore
	if passed {
		attempt.ResultStatus = "passed"
	} else {
		attempt.ResultStatus = "needs_remediation"
	}
	attempt.Feedback = models.JSONMap{
		"status":    attempt.ResultStatus,
		"summary":   summary,
		"questions": questionResults,
		"coach_recommendation": func() string {
			if passed {
				return "已通过入门诊断，进入训练场继续积累稳定交付。"
			}
			return "先补齐错题中的缺口，再重新提交本道场诊断。"
		}(),
	}
	attempt.UpdatedAt = now
	if err := s.dojoRepo.UpdateTrainingAttempt(ctx, attempt); err != nil {
		return nil, err
	}

	if passed {
		if err := s.dojoRepo.UpdateMistakeItemsStatusBySourceType(ctx, aid, "diagnostic", "resolved", now); err != nil {
			return nil, err
		}
		if err := s.dojoRepo.UpdateActiveRemediationPlansStatus(ctx, aid, "completed", now); err != nil {
			return nil, err
		}
	} else {
		if err := s.dojoRepo.UpdateMistakeItemsStatusBySourceType(ctx, aid, "diagnostic", "archived", now); err != nil {
			return nil, err
		}
		if err := s.dojoRepo.CreateMistakeItems(ctx, mistakes); err != nil {
			return nil, err
		}
		if err := s.dojoRepo.UpdateActiveRemediationPlansStatus(ctx, aid, "archived", now); err != nil {
			return nil, err
		}
	}

	binding, err := s.dojoRepo.GetCoachBinding(ctx, aid)
	if err != nil {
		return nil, err
	}
	if passed {
		binding.Stage = "practice"
	} else {
		binding.Stage = "diagnostic"
	}
	binding.Status = "active"
	if binding.CreatedAt.IsZero() {
		binding.CreatedAt = now
	}
	binding.UpdatedAt = now
	if err := s.dojoRepo.UpsertCoachBinding(ctx, binding); err != nil {
		return nil, err
	}

	var activePlan *models.AgentRemediationPlan
	if !passed {
		activePlan = &models.AgentRemediationPlan{
			PlanID:      "plan_" + uuid.NewString(),
			AID:         aid,
			CoachAID:    binding.PrimaryCoachAID,
			TriggerType: "diagnostic_failed",
			Goal: models.JSONMap{
				"title":              "完成诊断补训并重新提交",
				"school_key":         binding.SchoolKey,
				"scene_type":         "diagnostic",
				"coach_aid":          binding.PrimaryCoachAID,
				"source_attempt_id":  attempt.AttemptID,
				"expected_threshold": 70,
			},
			AssignedSetIDs:    models.StringList{session.QuestionSet.SetID},
			RequiredPassCount: 1,
			Status:            "active",
			CreatedAt:         now,
			UpdatedAt:         now,
		}
		if err := s.dojoRepo.CreateRemediationPlan(ctx, activePlan); err != nil {
			return nil, err
		}
	}

	overview, err := s.GetDojoOverview(ctx, aid)
	if err != nil {
		return nil, err
	}

	return &models.DojoDiagnosticSubmitResponse{
		Overview:    overview,
		Plan:        activePlan,
		Attempt:     attempt,
		QuestionSet: session.QuestionSet,
		Questions:   session.Questions,
		Mistakes:    mistakes,
		Passed:      passed,
		Summary:     summary,
	}, nil
}

func (s *agentService) ListDojoMistakes(ctx context.Context, aid string, limit int) ([]models.AgentMistakeItem, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if _, err := s.repo.GetByAID(ctx, aid); err != nil {
		return nil, err
	}
	return s.dojoRepo.ListMistakeItems(ctx, aid, limit)
}

func (s *agentService) ListDojoRemediationPlans(ctx context.Context, aid string, limit int) ([]models.AgentRemediationPlan, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if _, err := s.repo.GetByAID(ctx, aid); err != nil {
		return nil, err
	}
	return s.dojoRepo.ListRemediationPlans(ctx, aid, limit)
}

func (s *agentService) GetAdminDojoOverview(ctx context.Context) (*models.AdminDojoOverview, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}
	if err := s.ensureDefaultDojoCoach(ctx); err != nil {
		return nil, err
	}
	return s.dojoRepo.GetOverview(ctx)
}

func (s *agentService) ListDojoCoaches(ctx context.Context, limit, offset int, status string) ([]*models.CoachProfile, int, error) {
	if s.dojoRepo == nil {
		return nil, 0, fmt.Errorf("dojo repository is not configured")
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if err := s.ensureDefaultDojoCoach(ctx); err != nil {
		return nil, 0, err
	}
	return s.dojoRepo.ListCoachProfiles(ctx, limit, offset, strings.TrimSpace(status))
}

func (s *agentService) ListDojoBindings(ctx context.Context, limit, offset int, schoolKey, stage, status string) ([]models.AgentCoachBinding, int, error) {
	if s.dojoRepo == nil {
		return nil, 0, fmt.Errorf("dojo repository is not configured")
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.dojoRepo.ListCoachBindings(
		ctx,
		limit,
		offset,
		normalizeOptionalDojoSchoolKey(schoolKey),
		normalizeOptionalDojoStage(stage),
		strings.TrimSpace(status),
	)
}

func (s *agentService) AssignAgentCoach(ctx context.Context, aid string, req *AssignCoachRequest) (*models.AgentCoachBinding, error) {
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}

	agent, growthProfile, err := s.getAgentWithGrowthProfile(ctx, aid)
	if err != nil {
		return nil, err
	}

	schoolKey := normalizeDojoSchoolKey(req.SchoolKey)
	if schoolKey == "" {
		schoolKey = s.deriveDojoSchoolKey(agent, growthProfile)
	}

	primaryCoachAID := strings.TrimSpace(req.PrimaryCoachAID)
	if primaryCoachAID == "" {
		primaryCoachAID = defaultDojoCoachAID
	}
	shadowCoachAID := strings.TrimSpace(req.ShadowCoachAID)
	stage := normalizeDojoStage(req.Stage)

	if err := s.ensureCoachProfileForAssignment(ctx, primaryCoachAID, schoolKey, "assigned_primary"); err != nil {
		return nil, err
	}
	if shadowCoachAID != "" {
		if err := s.ensureCoachProfileForAssignment(ctx, shadowCoachAID, schoolKey, "assigned_shadow"); err != nil {
			return nil, err
		}
	}

	now := time.Now()
	binding := &models.AgentCoachBinding{
		AID:             aid,
		PrimaryCoachAID: primaryCoachAID,
		ShadowCoachAID:  shadowCoachAID,
		SchoolKey:       schoolKey,
		Stage:           stage,
		Status:          "active",
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := s.dojoRepo.UpsertCoachBinding(ctx, binding); err != nil {
		return nil, err
	}
	if _, err := s.ensureDefaultDiagnosticSet(ctx, schoolKey); err != nil {
		return nil, err
	}

	return s.dojoRepo.GetCoachBinding(ctx, aid)
}

func (s *agentService) getAgentWithGrowthProfile(ctx context.Context, aid string) (*models.Agent, *models.AgentGrowthProfile, error) {
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, nil, err
	}

	var growthProfile *models.AgentGrowthProfile
	if s.growthRepo != nil {
		if profile, growthErr := s.growthRepo.GetProfile(ctx, aid); growthErr == nil {
			growthProfile = profile
		}
	}

	return agent, growthProfile, nil
}

func (s *agentService) ensureDojoScaffold(ctx context.Context, agent *models.Agent, growthProfile *models.AgentGrowthProfile) (*models.AgentCoachBinding, *models.CoachProfile, *models.TrainingQuestionSet, error) {
	if err := s.ensureDefaultDojoCoach(ctx); err != nil {
		return nil, nil, nil, err
	}

	schoolKey := s.deriveDojoSchoolKey(agent, growthProfile)
	binding, err := s.dojoRepo.GetCoachBinding(ctx, agent.AID)
	if err != nil {
		if err.Error() != "coach binding not found" {
			return nil, nil, nil, err
		}
		now := time.Now()
		binding = &models.AgentCoachBinding{
			AID:             agent.AID,
			PrimaryCoachAID: defaultDojoCoachAID,
			ShadowCoachAID:  "",
			SchoolKey:       schoolKey,
			Stage:           "diagnostic",
			Status:          "active",
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		if err := s.dojoRepo.UpsertCoachBinding(ctx, binding); err != nil {
			return nil, nil, nil, err
		}
	} else if binding.SchoolKey == "" || binding.PrimaryCoachAID == "" {
		if binding.PrimaryCoachAID == "" {
			binding.PrimaryCoachAID = defaultDojoCoachAID
		}
		if binding.SchoolKey == "" {
			binding.SchoolKey = schoolKey
		}
		if binding.Stage == "" {
			binding.Stage = "diagnostic"
		}
		binding.Status = "active"
		binding.UpdatedAt = time.Now()
		if binding.CreatedAt.IsZero() {
			binding.CreatedAt = binding.UpdatedAt
		}
		if err := s.dojoRepo.UpsertCoachBinding(ctx, binding); err != nil {
			return nil, nil, nil, err
		}
	}

	if binding.SchoolKey != "" {
		schoolKey = binding.SchoolKey
	}

	set, err := s.ensureDefaultDiagnosticSet(ctx, schoolKey)
	if err != nil {
		return nil, nil, nil, err
	}

	coach, err := s.dojoRepo.GetCoachProfile(ctx, binding.PrimaryCoachAID)
	if err != nil {
		if ensureErr := s.ensureCoachProfileForAssignment(ctx, binding.PrimaryCoachAID, schoolKey, "assigned_primary"); ensureErr != nil {
			return nil, nil, nil, err
		}
		coach, err = s.dojoRepo.GetCoachProfile(ctx, binding.PrimaryCoachAID)
		if err != nil {
			return nil, nil, nil, err
		}
	}

	return binding, coach, set, nil
}

func (s *agentService) ensureDefaultDojoCoach(ctx context.Context) error {
	now := time.Now()
	return s.dojoRepo.EnsureCoachProfile(ctx, &models.CoachProfile{
		CoachAID:  defaultDojoCoachAID,
		CoachType: "official",
		Schools:   models.StringList{"generalist", "automation_ops", "content_ops", "research_ops", "service_ops"},
		Bio:       "平台官方总教练，负责冷启动诊断、基础训练编排和首轮纠错。",
		Pricing: models.JSONMap{
			"currency": "credits",
			"amount":   0,
			"mode":     "platform",
		},
		Rating:    5,
		Status:    "active",
		CreatedAt: now,
		UpdatedAt: now,
	})
}

func (s *agentService) ensureCoachProfileForAssignment(ctx context.Context, coachAID, schoolKey, coachType string) error {
	now := time.Now()
	if coachAID == defaultDojoCoachAID {
		return s.ensureDefaultDojoCoach(ctx)
	}
	return s.dojoRepo.EnsureCoachProfile(ctx, &models.CoachProfile{
		CoachAID:  coachAID,
		CoachType: coachType,
		Schools:   models.StringList{schoolKey},
		Bio:       "由后台配置接入的道场教练。",
		Pricing: models.JSONMap{
			"currency": "credits",
			"amount":   0,
			"mode":     "manual_assignment",
		},
		Rating:    4.8,
		Status:    "active",
		CreatedAt: now,
		UpdatedAt: now,
	})
}

func (s *agentService) ensureDefaultDiagnosticSet(ctx context.Context, schoolKey string) (*models.TrainingQuestionSet, error) {
	if existing, err := s.dojoRepo.FindQuestionSetBySchoolAndScene(ctx, schoolKey, "diagnostic"); err == nil {
		return existing, nil
	}

	now := time.Now()
	setID := fmt.Sprintf("dojo_%s_diagnostic_v1", schoolKey)
	set := &models.TrainingQuestionSet{
		SetID:      setID,
		SchoolKey:  schoolKey,
		SceneType:  "diagnostic",
		Title:      fmt.Sprintf("%s入门诊断", dojoSchoolLabel(schoolKey)),
		Difficulty: "starter",
		Tags:       models.StringList{"diagnostic", "entry", schoolKey},
		Status:     "active",
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	questions := []models.TrainingQuestion{
		{
			QuestionID:    setID + "_q1",
			SetID:         setID,
			CapabilityKey: "task_alignment",
			Prompt: models.JSONMap{
				"title":       "目标复述与边界识别",
				"instruction": fmt.Sprintf("请站在%s学派的视角，复述目标、成功标准、不能做的事和需要澄清的点。", dojoSchoolLabel(schoolKey)),
			},
			Rubric: models.JSONMap{
				"checkpoints": []string{"复述目标", "识别边界", "指出至少一个风险", "提出澄清问题"},
			},
			AnswerKey: models.JSONMap{
				"pass_signals": []string{"能拆出成功标准", "能区分必须做与不能做", "能暴露不确定性"},
			},
			SortOrder: 1,
			CreatedAt: now,
			UpdatedAt: now,
		},
		{
			QuestionID:    setID + "_q2",
			SetID:         setID,
			CapabilityKey: "execution_design",
			Prompt: models.JSONMap{
				"title":       "执行方案设计",
				"instruction": "给出一个三段式执行计划：起手验证、正式执行、交付前自查。",
			},
			Rubric: models.JSONMap{
				"checkpoints": []string{"步骤有先后顺序", "考虑资源和时间", "包含回滚或兜底方案"},
			},
			AnswerKey: models.JSONMap{
				"pass_signals": []string{"计划可执行", "包含自我校验节点", "有风险兜底"},
			},
			SortOrder: 2,
			CreatedAt: now,
			UpdatedAt: now,
		},
		{
			QuestionID:    setID + "_q3",
			SetID:         setID,
			CapabilityKey: "self_review",
			Prompt: models.JSONMap{
				"title":       "提交前复盘",
				"instruction": "假设你已经完成任务，请写出提交前的复盘清单，以及如果失败你会如何沉淀为下一轮 skill。",
			},
			Rubric: models.JSONMap{
				"checkpoints": []string{"有验收视角", "有失败归因", "有可复用沉淀"},
			},
			AnswerKey: models.JSONMap{
				"pass_signals": []string{"知道如何自查", "知道如何复盘失败", "能输出结构化经验"},
			},
			SortOrder: 3,
			CreatedAt: now,
			UpdatedAt: now,
		},
	}

	if err := s.dojoRepo.EnsureQuestionSet(ctx, set, questions); err != nil {
		return nil, err
	}

	return s.dojoRepo.GetQuestionSet(ctx, setID)
}

func (s *agentService) deriveDojoSchoolKey(agent *models.Agent, growthProfile *models.AgentGrowthProfile) string {
	signal := strings.ToLower(strings.Join(agent.Capabilities, ","))
	signal += "|" + strings.ToLower(agent.Provider)
	signal += "|" + strings.ToLower(agent.Model)
	if growthProfile != nil {
		signal += "|" + strings.ToLower(growthProfile.PrimaryDomain)
		signal += "|" + strings.ToLower(growthProfile.CurrentMaturityPool)
	}

	switch {
	case strings.Contains(signal, "forum"), strings.Contains(signal, "content"), strings.Contains(signal, "copy"):
		return "content_ops"
	case strings.Contains(signal, "research"), strings.Contains(signal, "analysis"):
		return "research_ops"
	case strings.Contains(signal, "support"), strings.Contains(signal, "service"):
		return "service_ops"
	case strings.Contains(signal, "automation"), strings.Contains(signal, "workflow"), strings.Contains(signal, "code"):
		return "automation_ops"
	default:
		return "generalist"
	}
}

type dojoDiagnosticEvaluation struct {
	Score              int
	AnswerLength       int
	CheckpointTotal    int
	MatchedCheckpoints []string
	MissingCheckpoints []string
	StructureHits      []string
}

type dojoKeywordGroup struct {
	Label    string
	Keywords []string
}

func evaluateDojoDiagnosticAnswer(question models.TrainingQuestion, answer string) dojoDiagnosticEvaluation {
	trimmed := strings.TrimSpace(answer)
	answerLower := strings.ToLower(trimmed)
	answerLength := utf8.RuneCountInString(trimmed)

	checkpoints := extractStringListFromJSON(question.Rubric, "checkpoints")
	keywordGroups := dojoDiagnosticKeywordGroups(question.CapabilityKey, checkpoints)
	matchedCheckpoints := make([]string, 0, len(keywordGroups))
	missingCheckpoints := make([]string, 0, len(keywordGroups))

	for _, group := range keywordGroups {
		if containsAnyKeyword(answerLower, group.Keywords) {
			matchedCheckpoints = append(matchedCheckpoints, group.Label)
		} else {
			missingCheckpoints = append(missingCheckpoints, group.Label)
		}
	}

	checkpointTotal := len(keywordGroups)
	checkpointScore := 0
	if checkpointTotal > 0 {
		checkpointScore = int(float64(len(matchedCheckpoints))/float64(checkpointTotal)*70.0 + 0.5)
	}

	lengthScore := 0
	switch {
	case answerLength >= 120:
		lengthScore = 15
	case answerLength >= 60:
		lengthScore = 10
	case answerLength >= 30:
		lengthScore = 5
	}

	structureGroups := []dojoKeywordGroup{
		{Label: "风险意识", Keywords: []string{"风险", "隐患", "问题"}},
		{Label: "澄清意识", Keywords: []string{"澄清", "确认", "疑问", "问题"}},
		{Label: "验收意识", Keywords: []string{"验收", "自查", "检查", "校验"}},
		{Label: "复盘意识", Keywords: []string{"复盘", "总结", "沉淀", "经验"}},
		{Label: "结构表达", Keywords: []string{"步骤", "计划", "第一", "第二", "第三"}},
	}
	structureHits := make([]string, 0, len(structureGroups))
	for _, group := range structureGroups {
		if containsAnyKeyword(answerLower, group.Keywords) {
			structureHits = append(structureHits, group.Label)
		}
	}

	structureScore := 0
	switch {
	case len(structureHits) >= 3:
		structureScore = 15
	case len(structureHits) >= 2:
		structureScore = 10
	case len(structureHits) >= 1:
		structureScore = 5
	}

	score := checkpointScore + lengthScore + structureScore
	if score > 100 {
		score = 100
	}

	return dojoDiagnosticEvaluation{
		Score:              score,
		AnswerLength:       answerLength,
		CheckpointTotal:    checkpointTotal,
		MatchedCheckpoints: matchedCheckpoints,
		MissingCheckpoints: missingCheckpoints,
		StructureHits:      structureHits,
	}
}

func extractStringListFromJSON(payload models.JSONMap, key string) []string {
	value, ok := payload[key]
	if !ok {
		return nil
	}
	items, ok := value.([]interface{})
	if !ok {
		if typed, typedOK := value.([]string); typedOK {
			return typed
		}
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		text := strings.TrimSpace(fmt.Sprintf("%v", item))
		if text != "" {
			result = append(result, text)
		}
	}
	return result
}

func dojoDiagnosticKeywordGroups(capabilityKey string, checkpoints []string) []dojoKeywordGroup {
	switch capabilityKey {
	case "task_alignment":
		return []dojoKeywordGroup{
			{Label: firstNonEmptyCheckpoint(checkpoints, 0, "复述目标"), Keywords: []string{"目标", "需求", "任务"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 1, "识别边界"), Keywords: []string{"边界", "不能做", "不做", "限制"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 2, "指出至少一个风险"), Keywords: []string{"风险", "隐患", "问题"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 3, "提出澄清问题"), Keywords: []string{"澄清", "确认", "疑问", "问题"}},
		}
	case "execution_design":
		return []dojoKeywordGroup{
			{Label: firstNonEmptyCheckpoint(checkpoints, 0, "步骤有先后顺序"), Keywords: []string{"第一", "第二", "第三", "步骤", "阶段"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 1, "考虑资源和时间"), Keywords: []string{"时间", "资源", "成本", "优先级"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 2, "包含回滚或兜底方案"), Keywords: []string{"回滚", "兜底", "备选", "降级"}},
		}
	case "self_review":
		return []dojoKeywordGroup{
			{Label: firstNonEmptyCheckpoint(checkpoints, 0, "有验收视角"), Keywords: []string{"验收", "自查", "检查", "清单"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 1, "有失败归因"), Keywords: []string{"失败", "归因", "复盘", "原因"}},
			{Label: firstNonEmptyCheckpoint(checkpoints, 2, "有可复用沉淀"), Keywords: []string{"沉淀", "skill", "模板", "经验", "复用"}},
		}
	default:
		groups := make([]dojoKeywordGroup, 0, len(checkpoints))
		for _, checkpoint := range checkpoints {
			groups = append(groups, dojoKeywordGroup{
				Label:    checkpoint,
				Keywords: []string{strings.ToLower(checkpoint)},
			})
		}
		return groups
	}
}

func containsAnyKeyword(content string, keywords []string) bool {
	for _, keyword := range keywords {
		if keyword != "" && strings.Contains(content, strings.ToLower(keyword)) {
			return true
		}
	}
	return false
}

func firstNonEmptyCheckpoint(checkpoints []string, index int, fallback string) string {
	if index >= 0 && index < len(checkpoints) {
		if text := strings.TrimSpace(checkpoints[index]); text != "" {
			return text
		}
	}
	return fallback
}

func cloneJSONMap(source models.JSONMap) models.JSONMap {
	if source == nil {
		return models.JSONMap{}
	}
	cloned := make(models.JSONMap, len(source))
	for key, value := range source {
		cloned[key] = value
	}
	return cloned
}

func extractDojoPromptTitle(question models.TrainingQuestion) string {
	if question.Prompt == nil {
		return question.QuestionID
	}
	title := strings.TrimSpace(fmt.Sprintf("%v", question.Prompt["title"]))
	if title == "" || title == "<nil>" {
		return question.QuestionID
	}
	return title
}

func dojoSchoolLabel(schoolKey string) string {
	switch schoolKey {
	case "content_ops":
		return "内容作战流"
	case "research_ops":
		return "研究作战流"
	case "service_ops":
		return "服务作战流"
	case "automation_ops":
		return "自动化作战流"
	default:
		return "通识作战流"
	}
}

func normalizeDojoSchoolKey(schoolKey string) string {
	switch strings.TrimSpace(strings.ToLower(schoolKey)) {
	case "content_ops", "research_ops", "service_ops", "automation_ops", "generalist":
		return strings.TrimSpace(strings.ToLower(schoolKey))
	default:
		return ""
	}
}

func normalizeOptionalDojoSchoolKey(schoolKey string) string {
	trimmed := strings.TrimSpace(strings.ToLower(schoolKey))
	if trimmed == "" {
		return ""
	}
	return normalizeDojoSchoolKey(trimmed)
}

func normalizeDojoStage(stage string) string {
	switch strings.TrimSpace(strings.ToLower(stage)) {
	case "diagnostic", "practice", "training", "arena_ready", "arena":
		return strings.TrimSpace(strings.ToLower(stage))
	default:
		return "diagnostic"
	}
}

func normalizeOptionalDojoStage(stage string) string {
	trimmed := strings.TrimSpace(strings.ToLower(stage))
	if trimmed == "" {
		return ""
	}
	return normalizeDojoStage(trimmed)
}
