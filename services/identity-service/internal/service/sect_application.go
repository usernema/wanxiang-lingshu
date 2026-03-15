package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/google/uuid"
	"github.com/sirupsen/logrus"
)

const (
	sectApplicationTypeApplication = "application"
	sectApplicationTypeTransfer    = "transfer"

	sectApplicationStatusSubmitted = "submitted"
	sectApplicationStatusApproved  = "approved"
	sectApplicationStatusRejected  = "rejected"
	sectApplicationStatusWithdrawn = "withdrawn"
)

type SubmitSectApplicationRequest struct {
	TargetSectKey string `json:"target_sect_key" binding:"required"`
}

type ReviewSectApplicationRequest struct {
	Status     string `json:"status" binding:"required"`
	AdminNotes string `json:"admin_notes"`
	ReviewedBy string `json:"reviewed_by"`
}

type sectApplicationEvaluation struct {
	ApplicationType    string
	Status             string
	ReadinessScore     int
	Summary            string
	CurrentSectKey     string
	RecommendedSectKey string
	TargetSectKey      string
	Blockers           models.StringList
	Advantages         models.StringList
	Evidence           models.JSONMap
}

func (s *agentService) ListMySectApplications(ctx context.Context, aid string, limit int) ([]models.SectMembershipApplication, error) {
	if s.sectApplicationRepo == nil {
		return nil, fmt.Errorf("sect application repository is not configured")
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	return s.sectApplicationRepo.ListByAid(ctx, aid, limit)
}

func (s *agentService) SubmitSectApplication(ctx context.Context, aid string, req *SubmitSectApplicationRequest) (*models.SectMembershipApplication, error) {
	if s.sectApplicationRepo == nil {
		return nil, fmt.Errorf("sect application repository is not configured")
	}

	agent, growthProfile, err := s.getAgentWithGrowthProfile(ctx, aid)
	if err != nil {
		return nil, err
	}

	binding, err := s.currentDojoBinding(ctx, aid)
	if err != nil {
		return nil, err
	}

	targetSectKey := normalizeSectApplicationTarget(req.TargetSectKey)
	if targetSectKey == "" {
		return nil, fmt.Errorf("invalid target sect key")
	}

	existingApplications, err := s.sectApplicationRepo.ListByAid(ctx, aid, 20)
	if err != nil {
		return nil, err
	}
	for _, item := range existingApplications {
		if item.Status == sectApplicationStatusSubmitted {
			return nil, fmt.Errorf("application already submitted")
		}
	}

	evaluation := s.evaluateSectApplication(agent, growthProfile, binding, targetSectKey)
	if evaluation.TargetSectKey == "" {
		return nil, fmt.Errorf("unable to determine target sect")
	}
	if evaluation.CurrentSectKey != "" && evaluation.CurrentSectKey == evaluation.TargetSectKey {
		return nil, fmt.Errorf("already aligned with target sect")
	}
	if evaluation.Status != "ready" {
		return nil, fmt.Errorf("sect application is not ready")
	}

	now := time.Now()
	application := &models.SectMembershipApplication{
		ApplicationID:      "sectapp_" + uuid.NewString(),
		AID:                aid,
		CurrentSectKey:     evaluation.CurrentSectKey,
		TargetSectKey:      evaluation.TargetSectKey,
		RecommendedSectKey: evaluation.RecommendedSectKey,
		ApplicationType:    evaluation.ApplicationType,
		Status:             sectApplicationStatusSubmitted,
		ReadinessScore:     evaluation.ReadinessScore,
		Summary:            evaluation.Summary,
		Blockers:           evaluation.Blockers,
		Advantages:         evaluation.Advantages,
		Evidence:           evaluation.Evidence,
		AdminNotes:         "",
		SubmittedAt:        now,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if err := s.sectApplicationRepo.Create(ctx, application); err != nil {
		return nil, err
	}
	s.emitSectApplicationSubmittedNotification(ctx, application)

	return application, nil
}

func (s *agentService) WithdrawSectApplication(ctx context.Context, aid, applicationID string) (*models.SectMembershipApplication, error) {
	if s.sectApplicationRepo == nil {
		return nil, fmt.Errorf("sect application repository is not configured")
	}

	application, err := s.sectApplicationRepo.GetByID(ctx, applicationID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(application.AID) != strings.TrimSpace(aid) {
		return nil, fmt.Errorf("sect application not found")
	}
	if application.Status != sectApplicationStatusSubmitted {
		return nil, fmt.Errorf("only submitted applications can be withdrawn")
	}

	return s.sectApplicationRepo.UpdateApplicantStatus(ctx, applicationID, aid, sectApplicationStatusWithdrawn, time.Now())
}

func (s *agentService) ListAdminSectApplications(ctx context.Context, limit, offset int, status, targetSectKey, applicationType string) ([]models.SectMembershipApplication, int, error) {
	if s.sectApplicationRepo == nil {
		return nil, 0, fmt.Errorf("sect application repository is not configured")
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}
	return s.sectApplicationRepo.List(
		ctx,
		limit,
		offset,
		normalizeOptionalSectApplicationStatus(status),
		normalizeSectApplicationTarget(targetSectKey),
		normalizeOptionalSectApplicationType(applicationType),
	)
}

func (s *agentService) ReviewSectApplication(ctx context.Context, applicationID string, req *ReviewSectApplicationRequest) (*models.SectMembershipApplication, error) {
	if s.sectApplicationRepo == nil {
		return nil, fmt.Errorf("sect application repository is not configured")
	}
	if s.dojoRepo == nil {
		return nil, fmt.Errorf("dojo repository is not configured")
	}

	reviewStatus := normalizeSectApplicationReviewStatus(req.Status)
	if reviewStatus == "" {
		return nil, fmt.Errorf("invalid review status")
	}

	application, err := s.sectApplicationRepo.GetByID(ctx, applicationID)
	if err != nil {
		return nil, err
	}
	if application.Status != sectApplicationStatusSubmitted {
		return nil, fmt.Errorf("only submitted applications can be reviewed")
	}

	reviewedBy := strings.TrimSpace(req.ReviewedBy)
	if reviewedBy == "" {
		reviewedBy = "admin_console"
	}
	reviewedAt := time.Now()

	if reviewStatus == sectApplicationStatusApproved {
		if err := s.applyApprovedSectBinding(ctx, application); err != nil {
			return nil, err
		}
	}

	updatedApplication, err := s.sectApplicationRepo.UpdateReview(
		ctx,
		applicationID,
		reviewStatus,
		strings.TrimSpace(req.AdminNotes),
		reviewedBy,
		reviewedAt,
		reviewedAt,
	)
	if err != nil {
		return nil, err
	}
	s.emitSectApplicationReviewedNotification(ctx, updatedApplication)

	return updatedApplication, nil
}

func (s *agentService) currentDojoBinding(ctx context.Context, aid string) (*models.AgentCoachBinding, error) {
	if s.dojoRepo == nil {
		return nil, nil
	}

	binding, err := s.dojoRepo.GetCoachBinding(ctx, aid)
	if err != nil {
		if err.Error() == "coach binding not found" {
			return nil, nil
		}
		return nil, err
	}
	return binding, nil
}

func (s *agentService) evaluateSectApplication(agent *models.Agent, growthProfile *models.AgentGrowthProfile, binding *models.AgentCoachBinding, requestedTargetSectKey string) *sectApplicationEvaluation {
	recommendedSectKey := recommendedSectApplicationKey(agent, growthProfile, binding, s)
	targetSectKey := normalizeSectApplicationTarget(requestedTargetSectKey)
	if targetSectKey == "" {
		targetSectKey = recommendedSectKey
	}

	currentSectKey := ""
	dojoStage := ""
	if binding != nil {
		dojoStage = normalizeOptionalDojoStage(binding.Stage)
		if dojoStage != "" && dojoStage != "diagnostic" {
			currentSectKey = normalizeSectApplicationTarget(binding.SchoolKey)
		}
	}

	currentRealm := ""
	completedTaskCount := 0
	reusableAssetCount := 0
	if growthProfile != nil {
		currentRealm = strings.TrimSpace(growthProfile.CurrentMaturityPool)
		completedTaskCount = growthProfile.CompletedTaskCount
		reusableAssetCount =
			growthProfile.PublishedDraftCount +
				growthProfile.ValidatedDraftCount +
				growthProfile.IncubatingDraftCount +
				growthProfile.EmployerTemplateCount
	}

	profileBasicsReady := agent != nil &&
		strings.TrimSpace(agent.Headline) != "" &&
		strings.TrimSpace(agent.Bio) != "" &&
		len(agent.Capabilities) > 0
	hasDojoBinding := binding != nil && normalizeSectApplicationTarget(binding.SchoolKey) != ""
	hasClearedDiagnostic := dojoStage != "" && dojoStage != "diagnostic"
	hasCompletedTask := completedTaskCount > 0
	hasReusableAsset := reusableAssetCount > 0
	reachedObservedRealm := currentRealm == "observed" || currentRealm == "standard" || currentRealm == "preferred"
	reachedTransferRealm := currentRealm == "standard" || currentRealm == "preferred"

	applicationType := sectApplicationTypeApplication
	if targetSectKey != "" && recommendedSectKey != "" && targetSectKey != recommendedSectKey {
		applicationType = sectApplicationTypeTransfer
	}

	checklist := []struct {
		Key         string
		Title       string
		Description string
		Done        bool
	}{
		{
			Key:         "profile",
			Title:       "补全命牌资料",
			Description: "完善 headline、bio 和 capabilities，让宗门能判断你的主修方向。",
			Done:        profileBasicsReady,
		},
		{
			Key:         "task",
			Title:       "完成至少一轮真实历练",
			Description: "至少完成一单真实任务或真实协作，让平台拿到可用的修行样本。",
			Done:        hasCompletedTask,
		},
		{
			Key:         "asset",
			Title:       "沉淀首个可复用法卷",
			Description: "让系统或你自己沉淀出 Skill、模板或赠送资产，证明经验可复用。",
			Done:        hasReusableAsset,
		},
		{
			Key:         "dojo",
			Title:       "完成问心试炼",
			Description: "至少进入道场并通过首轮问心，让平台判断你的宗门匹配度与短板。",
			Done:        hasDojoBinding && hasClearedDiagnostic,
		},
		{
			Key:         "realm",
			Title:       map[bool]string{true: "修为达到金丹期以上", false: "修为达到筑基期以上"}[applicationType == sectApplicationTypeTransfer],
			Description: map[bool]string{true: "转宗会影响长期路线，至少要有稳定交付和明确主修方向。", false: "散修达到筑基后再正式入宗，更能保证主修方向稳定。"}[applicationType == sectApplicationTypeTransfer],
			Done:        map[bool]bool{true: reachedTransferRealm, false: reachedObservedRealm}[applicationType == sectApplicationTypeTransfer],
		},
	}

	completedChecklistCount := 0
	blockers := make(models.StringList, 0, len(checklist))
	checklistItems := make([]models.JSONMap, 0, len(checklist))
	for _, item := range checklist {
		if item.Done {
			completedChecklistCount++
		} else {
			blockers = append(blockers, item.Title)
		}
		checklistItems = append(checklistItems, models.JSONMap{
			"key":         item.Key,
			"title":       item.Title,
			"description": item.Description,
			"done":        item.Done,
		})
	}

	readinessScore := 0
	if len(checklist) > 0 {
		readinessScore = int(float64(completedChecklistCount)/float64(len(checklist))*100 + 0.5)
	}

	status := "blocked"
	switch {
	case readinessScore >= 100:
		status = "ready"
	case readinessScore >= 80:
		status = "eligible"
	case readinessScore >= 40:
		status = "preparing"
	}

	targetSectLabel := dojoSchoolLabel(targetSectKey)
	recommendedSectLabel := dojoSchoolLabel(recommendedSectKey)
	summary := ""
	switch status {
	case "ready":
		if applicationType == sectApplicationTypeTransfer {
			summary = fmt.Sprintf("你已经具备发起转宗审议的基础条件，可围绕 %s 的主修方向重整后续任务与法卷沉淀。", targetSectLabel)
		} else {
			summary = fmt.Sprintf("你已经具备发起 %s 入宗申请的主要条件，可以正式把后续历练聚焦到该宗门。", targetSectLabel)
		}
	case "eligible":
		if applicationType == sectApplicationTypeTransfer {
			summary = "你接近满足转宗条件，但仍建议先把当前短板补齐，再提交转宗审议，避免主修方向摇摆。"
		} else {
			summary = fmt.Sprintf("你已接近满足 %s 的入宗条件，只差最后 1 个关键动作就能正式入宗。", targetSectLabel)
		}
	case "preparing":
		if applicationType == sectApplicationTypeTransfer {
			summary = "当前更适合继续在原路线稳定交付，待修为和道场结果更明确后再考虑转宗。"
		} else {
			summary = fmt.Sprintf("当前仍处于入宗准备阶段，建议先在万象楼和道场补齐样本，再申请 %s。", targetSectLabel)
		}
	default:
		if recommendedSectKey != "" && recommendedSectKey != targetSectKey {
			summary = fmt.Sprintf("平台当前更推荐你先沿 %s 路线继续修行，等基础更稳后再考虑申请 %s。", recommendedSectLabel, targetSectLabel)
		} else {
			summary = fmt.Sprintf("你还不适合直接发起 %s 申请，先完成基础资料、真实历练与问心试炼会更稳。", targetSectLabel)
		}
	}

	advantages := buildSectApplicationAdvantages(currentRealm, completedTaskCount, reusableAssetCount, hasClearedDiagnostic, recommendedSectKey, targetSectKey)

	return &sectApplicationEvaluation{
		ApplicationType:    applicationType,
		Status:             status,
		ReadinessScore:     readinessScore,
		Summary:            summary,
		CurrentSectKey:     currentSectKey,
		RecommendedSectKey: recommendedSectKey,
		TargetSectKey:      targetSectKey,
		Blockers:           blockers,
		Advantages:         advantages,
		Evidence: models.JSONMap{
			"current_realm":          currentRealm,
			"current_sect_key":       currentSectKey,
			"recommended_sect_key":   recommendedSectKey,
			"target_sect_key":        targetSectKey,
			"dojo_stage":             dojoStage,
			"profile_basics_ready":   profileBasicsReady,
			"completed_task_count":   completedTaskCount,
			"reusable_asset_count":   reusableAssetCount,
			"has_dojo_binding":       hasDojoBinding,
			"has_cleared_diagnostic": hasClearedDiagnostic,
			"checklist":              checklistItems,
		},
	}
}

func buildSectApplicationAdvantages(currentRealm string, completedTaskCount, reusableAssetCount int, hasClearedDiagnostic bool, recommendedSectKey, targetSectKey string) models.StringList {
	advantages := make(models.StringList, 0, 5)

	if completedTaskCount >= 3 {
		advantages = append(advantages, fmt.Sprintf("已完成 %d 次真实历练，具备稳定样本。", completedTaskCount))
	}
	if reusableAssetCount > 0 {
		advantages = append(advantages, fmt.Sprintf("已沉淀 %d 个成长资产，可证明经验可复用。", reusableAssetCount))
	}
	if hasClearedDiagnostic {
		advantages = append(advantages, "已完成首轮问心试炼，平台可以更稳定地判断主修方向。")
	}
	if currentRealm == "standard" || currentRealm == "preferred" {
		advantages = append(advantages, fmt.Sprintf("当前修为已达 %s，适合进入更稳定的宗门路线。", formatSectApplicationRealmLabel(currentRealm)))
	}
	if recommendedSectKey != "" && recommendedSectKey == targetSectKey {
		advantages = append(advantages, fmt.Sprintf("平台推荐路线与当前申请宗门一致：%s。", dojoSchoolLabel(targetSectKey)))
	}

	return advantages
}

func (s *agentService) applyApprovedSectBinding(ctx context.Context, application *models.SectMembershipApplication) error {
	if application == nil {
		return fmt.Errorf("sect application not found")
	}
	if err := s.ensureDefaultDojoCoach(ctx); err != nil {
		return err
	}

	existingBinding, err := s.currentDojoBinding(ctx, application.AID)
	if err != nil {
		return err
	}

	now := time.Now()
	primaryCoachAID := defaultDojoCoachAID
	shadowCoachAID := ""
	stage := "practice"
	createdAt := now

	if existingBinding != nil {
		if strings.TrimSpace(existingBinding.PrimaryCoachAID) != "" {
			primaryCoachAID = existingBinding.PrimaryCoachAID
		}
		shadowCoachAID = strings.TrimSpace(existingBinding.ShadowCoachAID)
		if stageValue := normalizeOptionalDojoStage(existingBinding.Stage); stageValue != "" && stageValue != "diagnostic" {
			stage = stageValue
		}
		if !existingBinding.CreatedAt.IsZero() {
			createdAt = existingBinding.CreatedAt
		}
	}

	targetSectKey := normalizeDojoSchoolKey(application.TargetSectKey)
	if err := s.ensureCoachProfileForAssignment(ctx, primaryCoachAID, targetSectKey, "assigned_primary"); err != nil {
		return err
	}
	if shadowCoachAID != "" {
		if err := s.ensureCoachProfileForAssignment(ctx, shadowCoachAID, targetSectKey, "assigned_shadow"); err != nil {
			return err
		}
	}

	binding := &models.AgentCoachBinding{
		AID:             application.AID,
		PrimaryCoachAID: primaryCoachAID,
		ShadowCoachAID:  shadowCoachAID,
		SchoolKey:       targetSectKey,
		Stage:           stage,
		Status:          "active",
		CreatedAt:       createdAt,
		UpdatedAt:       now,
	}
	if err := s.dojoRepo.UpsertCoachBinding(ctx, binding); err != nil {
		return err
	}
	_, err = s.ensureDefaultDiagnosticSet(ctx, targetSectKey)
	return err
}

func recommendedSectApplicationKey(agent *models.Agent, growthProfile *models.AgentGrowthProfile, binding *models.AgentCoachBinding, svc *agentService) string {
	if binding != nil {
		if schoolKey := normalizeSectApplicationTarget(binding.SchoolKey); schoolKey != "" {
			return schoolKey
		}
	}
	if growthProfile != nil {
		if schoolKey := sectKeyFromGrowthDomain(growthProfile.PrimaryDomain); schoolKey != "" {
			return schoolKey
		}
	}
	if svc == nil || agent == nil {
		return ""
	}
	return normalizeSectApplicationTarget(svc.deriveDojoSchoolKey(agent, growthProfile))
}

func sectKeyFromGrowthDomain(domain string) string {
	switch strings.TrimSpace(domain) {
	case "automation", "development":
		return "automation_ops"
	case "content":
		return "content_ops"
	case "data":
		return "research_ops"
	case "support":
		return "service_ops"
	default:
		return ""
	}
}

func normalizeSectApplicationTarget(value string) string {
	switch strings.TrimSpace(value) {
	case "research_ops", "content_ops", "automation_ops", "service_ops":
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func normalizeOptionalSectApplicationStatus(value string) string {
	switch strings.TrimSpace(value) {
	case sectApplicationStatusSubmitted, sectApplicationStatusApproved, sectApplicationStatusRejected, sectApplicationStatusWithdrawn:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func normalizeOptionalSectApplicationType(value string) string {
	switch strings.TrimSpace(value) {
	case sectApplicationTypeApplication, sectApplicationTypeTransfer:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func normalizeSectApplicationReviewStatus(value string) string {
	switch strings.TrimSpace(value) {
	case sectApplicationStatusApproved, sectApplicationStatusRejected:
		return strings.TrimSpace(value)
	default:
		return ""
	}
}

func formatSectApplicationRealmLabel(pool string) string {
	switch strings.TrimSpace(pool) {
	case "cold_start":
		return "练气期"
	case "observed":
		return "筑基期"
	case "standard":
		return "金丹期"
	case "preferred":
		return "元婴期"
	default:
		return "当前境界"
	}
}

func (s *agentService) emitSectApplicationSubmittedNotification(ctx context.Context, application *models.SectMembershipApplication) {
	if s.notificationRepo == nil || application == nil || strings.TrimSpace(application.AID) == "" {
		return
	}

	metadata, err := json.Marshal(map[string]string{
		"application_id":       application.ApplicationID,
		"application_type":     application.ApplicationType,
		"status":               application.Status,
		"target_sect_key":      application.TargetSectKey,
		"recommended_sect_key": application.RecommendedSectKey,
	})
	if err != nil {
		metadata = []byte(`{}`)
	}

	notification := &models.Notification{
		NotificationID: fmt.Sprintf("notif_%s", uuid.NewString()),
		RecipientAID:   application.AID,
		Type:           "sect_application_submitted",
		Title:          "宗门申请已提交",
		Content:        fmt.Sprintf("你的 %s 申请已提交，目标宗门为 %s，当前进入待审议队列。", applicationTypeLabel(application.ApplicationType), dojoSchoolLabel(application.TargetSectKey)),
		Link:           "/world?panel=application",
		IsRead:         false,
		Metadata:       string(metadata),
		CreatedAt:      time.Now(),
	}

	if err := s.notificationRepo.Upsert(ctx, notification); err != nil {
		logrus.WithError(err).WithField("application_id", application.ApplicationID).Warn("Failed to persist sect application submitted notification")
	}
}

func (s *agentService) emitSectApplicationReviewedNotification(ctx context.Context, application *models.SectMembershipApplication) {
	if s.notificationRepo == nil || application == nil || strings.TrimSpace(application.AID) == "" {
		return
	}

	title := "宗门申请状态已更新"
	content := fmt.Sprintf("你的宗门申请状态已更新，请前往宗门世界查看 %s 的最新结果。", dojoSchoolLabel(application.TargetSectKey))
	switch application.Status {
	case sectApplicationStatusApproved:
		title = "宗门申请已通过"
		content = fmt.Sprintf("你的 %s 已通过，当前宗门归属已切换到 %s。", applicationTypeLabel(application.ApplicationType), dojoSchoolLabel(application.TargetSectKey))
	case sectApplicationStatusRejected:
		title = "宗门申请未通过"
		content = fmt.Sprintf("你的 %s 暂未通过，请根据运营备注补齐条件后再发起申请。", applicationTypeLabel(application.ApplicationType))
		if strings.TrimSpace(application.AdminNotes) != "" {
			content = fmt.Sprintf("%s 备注：%s", content, strings.TrimSpace(application.AdminNotes))
		}
	default:
		return
	}

	metadata, err := json.Marshal(map[string]string{
		"application_id":  application.ApplicationID,
		"status":          application.Status,
		"target_sect_key": application.TargetSectKey,
		"reviewed_by":     application.ReviewedBy,
	})
	if err != nil {
		metadata = []byte(`{}`)
	}

	notification := &models.Notification{
		NotificationID: fmt.Sprintf("notif_%s", uuid.NewString()),
		RecipientAID:   application.AID,
		Type:           "sect_application_reviewed",
		Title:          title,
		Content:        content,
		Link:           "/world?panel=application",
		IsRead:         false,
		Metadata:       string(metadata),
		CreatedAt:      time.Now(),
	}

	if err := s.notificationRepo.Upsert(ctx, notification); err != nil {
		logrus.WithError(err).WithFields(logrus.Fields{
			"application_id": application.ApplicationID,
			"status":         application.Status,
		}).Warn("Failed to persist sect application reviewed notification")
	}
}

func applicationTypeLabel(value string) string {
	switch value {
	case sectApplicationTypeTransfer:
		return "转宗审议"
	default:
		return "入宗申请"
	}
}
