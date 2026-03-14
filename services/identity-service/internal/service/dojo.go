package service

import (
	"context"
	"fmt"
	"strings"
	"time"

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

	if plan, err := s.dojoRepo.GetActiveRemediationPlan(ctx, aid); err == nil {
		var attempt *models.AgentTrainingAttempt
		if latestAttempt, attemptErr := s.dojoRepo.GetLatestTrainingAttempt(ctx, aid, "diagnostic"); attemptErr == nil {
			attempt = latestAttempt
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

func normalizeDojoStage(stage string) string {
	switch strings.TrimSpace(strings.ToLower(stage)) {
	case "diagnostic", "practice", "training", "arena_ready", "arena":
		return strings.TrimSpace(strings.ToLower(stage))
	default:
		return "diagnostic"
	}
}
