package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/sirupsen/logrus"
)

const (
	growthDomainContent     = "content"
	growthDomainDevelopment = "development"
	growthDomainData        = "data"
	growthDomainAutomation  = "automation"
	growthDomainSupport     = "support"
)

var growthDomains = []string{
	growthDomainContent,
	growthDomainDevelopment,
	growthDomainData,
	growthDomainAutomation,
	growthDomainSupport,
}

type domainKeywordProfile struct {
	keyword string
	domain  string
	weight  int
}

var growthKeywords = []domainKeywordProfile{
	{keyword: "content", domain: growthDomainContent, weight: 4},
	{keyword: "write", domain: growthDomainContent, weight: 3},
	{keyword: "writing", domain: growthDomainContent, weight: 3},
	{keyword: "forum", domain: growthDomainContent, weight: 2},
	{keyword: "post", domain: growthDomainContent, weight: 2},
	{keyword: "copy", domain: growthDomainContent, weight: 3},
	{keyword: "seo", domain: growthDomainContent, weight: 3},
	{keyword: "social", domain: growthDomainContent, weight: 2},
	{keyword: "marketing", domain: growthDomainContent, weight: 2},
	{keyword: "code", domain: growthDomainDevelopment, weight: 4},
	{keyword: "development", domain: growthDomainDevelopment, weight: 4},
	{keyword: "dev", domain: growthDomainDevelopment, weight: 2},
	{keyword: "program", domain: growthDomainDevelopment, weight: 3},
	{keyword: "backend", domain: growthDomainDevelopment, weight: 3},
	{keyword: "frontend", domain: growthDomainDevelopment, weight: 3},
	{keyword: "api", domain: growthDomainDevelopment, weight: 3},
	{keyword: "test", domain: growthDomainDevelopment, weight: 2},
	{keyword: "bug", domain: growthDomainDevelopment, weight: 2},
	{keyword: "script", domain: growthDomainDevelopment, weight: 2},
	{keyword: "data", domain: growthDomainData, weight: 4},
	{keyword: "analysis", domain: growthDomainData, weight: 4},
	{keyword: "research", domain: growthDomainData, weight: 3},
	{keyword: "sql", domain: growthDomainData, weight: 3},
	{keyword: "excel", domain: growthDomainData, weight: 2},
	{keyword: "report", domain: growthDomainData, weight: 2},
	{keyword: "automation", domain: growthDomainAutomation, weight: 4},
	{keyword: "workflow", domain: growthDomainAutomation, weight: 3},
	{keyword: "planning", domain: growthDomainAutomation, weight: 3},
	{keyword: "ops", domain: growthDomainAutomation, weight: 2},
	{keyword: "deploy", domain: growthDomainAutomation, weight: 2},
	{keyword: "integration", domain: growthDomainAutomation, weight: 2},
	{keyword: "agent", domain: growthDomainAutomation, weight: 2},
	{keyword: "support", domain: growthDomainSupport, weight: 4},
	{keyword: "customer", domain: growthDomainSupport, weight: 3},
	{keyword: "moderation", domain: growthDomainSupport, weight: 3},
	{keyword: "review", domain: growthDomainSupport, weight: 2},
	{keyword: "assistant", domain: growthDomainSupport, weight: 2},
	{keyword: "qa", domain: growthDomainSupport, weight: 2},
}

func (s *agentService) syncGrowthProfileBestEffort(ctx context.Context, aid, triggerType string) {
	if s.growthRepo == nil {
		return
	}

	if _, err := s.evaluateGrowthProfile(ctx, aid, triggerType); err != nil {
		logrus.WithError(err).WithFields(logrus.Fields{
			"aid":          aid,
			"trigger_type": triggerType,
		}).Warn("Failed to sync growth profile")
	}
}

func ensureDomainScores(scores models.DomainScores) models.DomainScores {
	if scores == nil {
		scores = models.DomainScores{}
	}
	for _, domain := range growthDomains {
		if _, exists := scores[domain]; !exists {
			scores[domain] = 0
		}
	}
	return scores
}

func addDomainScore(scores models.DomainScores, domain string, value int) {
	scores[domain] += value
}

func applyGrowthKeywords(scores models.DomainScores, text string) {
	lowerText := strings.ToLower(text)
	for _, profile := range growthKeywords {
		if strings.Contains(lowerText, profile.keyword) {
			addDomainScore(scores, profile.domain, profile.weight)
		}
	}
}

func topGrowthDomains(scores models.DomainScores, limit int) []models.AgentPoolMembership {
	type scoredDomain struct {
		Domain string
		Score  int
	}

	scored := make([]scoredDomain, 0, len(scores))
	for domain, score := range scores {
		if score <= 0 {
			continue
		}
		scored = append(scored, scoredDomain{Domain: domain, Score: score})
	}

	sort.Slice(scored, func(left, right int) bool {
		if scored[left].Score == scored[right].Score {
			return scored[left].Domain < scored[right].Domain
		}
		return scored[left].Score > scored[right].Score
	})

	if len(scored) > limit {
		scored = scored[:limit]
	}

	now := time.Now()
	items := make([]models.AgentPoolMembership, 0, len(scored))
	for _, entry := range scored {
		items = append(items, models.AgentPoolMembership{
			PoolType:    "domain",
			PoolKey:     entry.Domain,
			PoolScore:   entry.Score,
			Status:      "active",
			EffectiveAt: now,
			CreatedAt:   now,
		})
	}
	return items
}

func selectPrimaryGrowthDomain(agent *models.Agent, scores models.DomainScores) string {
	type scoredDomain struct {
		Domain string
		Score  int
	}

	scored := make([]scoredDomain, 0, len(scores))
	for domain, score := range scores {
		scored = append(scored, scoredDomain{Domain: domain, Score: score})
	}

	sort.Slice(scored, func(left, right int) bool {
		if scored[left].Score == scored[right].Score {
			return scored[left].Domain < scored[right].Domain
		}
		return scored[left].Score > scored[right].Score
	})

	if len(scored) > 0 && scored[0].Score > 0 {
		return scored[0].Domain
	}

	if strings.EqualFold(agent.Provider, "openclaw") {
		return growthDomainAutomation
	}

	return growthDomainDevelopment
}

func deriveGrowthMaturityPool(agent *models.Agent, stats *models.AgentGrowthStats) string {
	if (stats.CompletedTaskCount >= 5 &&
		stats.ActiveSkillCount >= 2 &&
		stats.CrossEmployerValidatedCount >= 2 &&
		stats.HighRiskMemoryCount == 0 &&
		agent.Reputation >= 120) ||
		(stats.CompletedTaskCount >= 4 &&
			stats.ActiveSkillCount >= 2 &&
			stats.PublishedDraftCount > 0 &&
			stats.TemplateReuseCount > 0 &&
			stats.ExperienceCardCount >= 3 &&
			stats.ActiveRiskMemoryCount == 0) {
		return "preferred"
	}
	if stats.CompletedTaskCount >= 2 ||
		stats.ActiveSkillCount >= 1 ||
		stats.ValidatedDraftCount > 0 ||
		stats.PublishedDraftCount > 0 ||
		stats.EmployerTemplateCount > 0 ||
		stats.ExperienceCardCount >= 2 ||
		stats.CrossEmployerValidatedCount > 0 {
		return "standard"
	}
	if stats.CompletedTaskCount >= 1 || stats.IncubatingDraftCount > 0 || stats.ExperienceCardCount > 0 {
		return "observed"
	}
	return "cold_start"
}

func deriveRecommendedNextPool(maturityPool string) string {
	switch maturityPool {
	case "cold_start":
		return "observed"
	case "observed":
		return "standard"
	case "standard":
		return "preferred"
	default:
		return "preferred"
	}
}

func deriveRecommendedTaskScope(maturityPool string) string {
	switch maturityPool {
	case "preferred":
		return "priority_access"
	case "standard":
		return "standard_access"
	case "observed":
		return "guided_access"
	default:
		return "low_risk_only"
	}
}

func growthPoolLabel(pool string) string {
	switch pool {
	case "cold_start":
		return "冷启动"
	case "observed":
		return "观察中"
	case "standard":
		return "标准"
	case "preferred":
		return "优选"
	default:
		return pool
	}
}

func countNonEmptyCapabilities(capabilities models.Capabilities) int {
	count := 0
	for _, capability := range capabilities {
		if strings.TrimSpace(capability) != "" {
			count++
		}
	}
	return count
}

func deriveRiskFlags(agent *models.Agent, stats *models.AgentGrowthStats) models.StringList {
	flags := models.StringList{}
	if agent.Status != "active" {
		flags = append(flags, "status_not_active")
	}
	if strings.TrimSpace(agent.Headline) == "" || strings.TrimSpace(agent.Bio) == "" {
		flags = append(flags, "resume_incomplete")
	}
	if len(agent.Capabilities) == 0 {
		flags = append(flags, "missing_capabilities")
	}
	if stats.ActiveSkillCount == 0 {
		flags = append(flags, "no_active_skills")
	}
	if stats.CompletedTaskCount == 0 {
		flags = append(flags, "no_completed_tasks")
	}
	if agent.OwnerEmail == "" {
		flags = append(flags, "unbound_owner_email")
	}
	if stats.ExperienceCardCount == 0 && stats.CompletedTaskCount > 0 {
		flags = append(flags, "missing_experience_cards")
	}
	if stats.CrossEmployerValidatedCount == 0 && stats.CompletedTaskCount >= 2 {
		flags = append(flags, "missing_cross_employer_validation")
	}
	if stats.ActiveRiskMemoryCount > 0 {
		flags = append(flags, "active_risk_memories")
	}
	if stats.HighRiskMemoryCount > 0 {
		flags = append(flags, "high_risk_history")
	}
	return flags
}

func hasBlockingGrowthFlag(flags models.StringList) bool {
	for _, flag := range flags {
		if flag == "status_not_active" || flag == "unbound_owner_email" || flag == "high_risk_history" {
			return true
		}
	}
	return false
}

func clampGrowthScore(score int) int {
	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}

func calculateGrowthScore(agent *models.Agent, stats *models.AgentGrowthStats, maturityPool string) int {
	score := 10

	switch maturityPool {
	case "observed":
		score += 16
	case "standard":
		score += 34
	case "preferred":
		score += 52
	}

	switch {
	case stats.CompletedTaskCount >= 5:
		score += 20
	case stats.CompletedTaskCount >= 2:
		score += 12
	case stats.CompletedTaskCount >= 1:
		score += 6
	}

	switch {
	case stats.ExperienceCardCount >= 5:
		score += 18
	case stats.ExperienceCardCount >= 2:
		score += 10
	case stats.ExperienceCardCount >= 1:
		score += 6
	}

	switch {
	case stats.CrossEmployerValidatedCount >= 3:
		score += 18
	case stats.CrossEmployerValidatedCount >= 1:
		score += 10
	}

	switch {
	case stats.ActiveSkillCount >= 3:
		score += 12
	case stats.ActiveSkillCount >= 1:
		score += 8
	}

	if stats.IncubatingDraftCount > 0 {
		score += 4
	}
	if stats.ValidatedDraftCount > 0 {
		score += 6
	}
	if stats.PublishedDraftCount > 0 {
		score += 10
	}
	if stats.EmployerTemplateCount > 0 {
		score += 6
	}
	if stats.TemplateReuseCount > 0 {
		score += 8
	}
	return clampGrowthScore(score)
}

func calculateRiskScore(agent *models.Agent, stats *models.AgentGrowthStats, riskFlags models.StringList) int {
	score := 0

	if stats.ActiveRiskMemoryCount > 0 {
		score += minInt(45, stats.ActiveRiskMemoryCount*16)
	}
	if stats.HighRiskMemoryCount > 0 {
		score += minInt(55, stats.HighRiskMemoryCount*22)
	}

	for _, flag := range riskFlags {
		switch flag {
		case "status_not_active":
			score += 26
		case "unbound_owner_email":
			score += 16
		case "missing_capabilities":
			score += 10
		case "resume_incomplete":
			score += 8
		case "missing_cross_employer_validation":
			score += 8
		case "missing_experience_cards":
			score += 6
		case "active_risk_memories":
			score += 8
		case "high_risk_history":
			score += 18
		}
	}

	return clampGrowthScore(score)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func calculatePromotionReadinessScore(agent *models.Agent, stats *models.AgentGrowthStats, maturityPool string, riskFlags models.StringList, growthScore, riskScore int) int {
	score := growthScore

	if strings.TrimSpace(agent.OwnerEmail) != "" {
		score += 10
	}
	if agent.OwnerEmailVerified != nil {
		score += 6
	}
	if strings.TrimSpace(agent.Headline) != "" {
		score += 6
	}
	if strings.TrimSpace(agent.Bio) != "" {
		score += 8
	}

	capabilityCount := countNonEmptyCapabilities(agent.Capabilities)
	switch {
	case capabilityCount >= 5:
		score += 12
	case capabilityCount >= 3:
		score += 8
	case capabilityCount > 0:
		score += 4
	}

	switch {
	case agent.Reputation >= 140:
		score += 8
	case agent.Reputation >= 120:
		score += 6
	case agent.Reputation >= 100:
		score += 3
	}

	score -= riskScore / 2

	return clampGrowthScore(score)
}

func derivePromotionCandidate(agent *models.Agent, stats *models.AgentGrowthStats, maturityPool string, readinessScore int, riskFlags models.StringList) bool {
	if maturityPool == "preferred" || hasBlockingGrowthFlag(riskFlags) {
		return false
	}

	switch maturityPool {
	case "observed":
		return readinessScore >= 60 &&
			stats.CompletedTaskCount >= 1 &&
			(stats.ExperienceCardCount > 0 || stats.ValidatedDraftCount > 0 || stats.PublishedDraftCount > 0 || countNonEmptyCapabilities(agent.Capabilities) >= 3) &&
			stats.ActiveRiskMemoryCount <= 1
	case "standard":
		return readinessScore >= 82 &&
			stats.CompletedTaskCount >= 4 &&
			stats.ActiveSkillCount >= 2 &&
			stats.CrossEmployerValidatedCount >= 1 &&
			stats.ActiveRiskMemoryCount == 0 &&
			(stats.PublishedDraftCount > 0 || stats.TemplateReuseCount > 0 || agent.Reputation >= 120)
	default:
		return false
	}
}

func dedupeGrowthActions(actions models.StringList) models.StringList {
	seen := map[string]struct{}{}
	deduped := make(models.StringList, 0, len(actions))
	for _, action := range actions {
		normalized := strings.TrimSpace(action)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		deduped = append(deduped, normalized)
	}
	return deduped
}

func hasGrowthProfileBasics(profile *models.AgentGrowthProfile) bool {
	if profile == nil {
		return false
	}
	return strings.TrimSpace(profile.Headline) != "" &&
		strings.TrimSpace(profile.Bio) != "" &&
		countNonEmptyCapabilities(profile.Capabilities) > 0
}

func hasGrowthReusableAsset(profile *models.AgentGrowthProfile) bool {
	if profile == nil {
		return false
	}
	return profile.ActiveSkillCount > 0 ||
		profile.PublishedDraftCount > 0 ||
		profile.ValidatedDraftCount > 0 ||
		profile.IncubatingDraftCount > 0 ||
		profile.EmployerTemplateCount > 0 ||
		profile.TemplateReuseCount > 0 ||
		profile.ExperienceCardCount > 0
}

func stringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func buildGrowthInterventionReason(profile *models.AgentGrowthProfile) *string {
	if profile == nil {
		return nil
	}

	reasons := []string{}
	if profile.Status != "active" {
		reasons = append(reasons, "当前 Agent 状态不是 active，系统不会继续把它推向公开流转。")
	}
	if profile.HighRiskMemoryCount > 0 {
		reasons = append(reasons, "存在高风险记忆，建议先完成人工复核或清理。")
	} else if profile.ActiveRiskMemoryCount > 0 {
		reasons = append(reasons, "近期存在风险记录，建议重点观察验卷、结算与回访节点。")
	}
	if strings.TrimSpace(profile.OwnerEmail) == "" {
		reasons = append(reasons, "建议尽快绑定观察邮箱，否则人类无法稳定接收告警、验收和登录恢复提醒。")
	}

	return stringPointer(strings.Join(reasons, " "))
}

func buildGrowthNextAction(profile *models.AgentGrowthProfile) (string, *models.AgentGrowthNextAction) {
	if profile == nil {
		return "unknown", nil
	}

	if profile.Status != "active" {
		return "blocked_status_review", &models.AgentGrowthNextAction{
			Key:         "status_review",
			Title:       "等待恢复公开流转",
			Description: "当前状态不是 active，系统会暂停把这个 OpenClaw 继续推向公开市场与训练闭环。",
			Href:        "/profile",
			CTA:         "查看代理状态",
		}
	}

	if profile.HighRiskMemoryCount > 0 {
		return "blocked_risk_review", &models.AgentGrowthNextAction{
			Key:         "risk_review",
			Title:       "等待风险复核",
			Description: "系统检测到高风险记忆，当前会先冻结外放节奏，等待人工复核或风险清理。",
			Href:        "/profile",
			CTA:         "查看风险状态",
		}
	}

	if !hasGrowthProfileBasics(profile) {
		return "awaiting_profile", &models.AgentGrowthNextAction{
			Key:         "complete_profile",
			Title:       "补齐代理命牌",
			Description: "先把 headline、bio 和能力标签补齐，系统才知道该把它送往哪条修炼主线。",
			Href:        "/profile",
			CTA:         "查看命牌状态",
		}
	}

	marketStarted := profile.TotalTaskCount > 0 || profile.EmployerTemplateCount > 0 || profile.TemplateReuseCount > 0
	if marketStarted && profile.CompletedTaskCount == 0 {
		return "in_market_loop", &models.AgentGrowthNextAction{
			Key:         "advance_market_loop",
			Title:       "推进首轮真实流转",
			Description: "它已经进入万象楼，当前目标是把首轮任务推进到交卷、验卷与结算，而不是停在接入完成。",
			Href:        "/marketplace?tab=tasks&source=growth-autopilot",
			CTA:         "查看流转链路",
		}
	}

	if profile.CompletedTaskCount > 0 && !hasGrowthReusableAsset(profile) {
		return "awaiting_asset_consolidation", &models.AgentGrowthNextAction{
			Key:         "consolidate_assets",
			Title:       "沉淀首轮成功经验",
			Description: "首轮真实任务已经完成，但还没有稳定沉淀为可复用法卷或模板，系统会优先收口这一环。",
			Href:        "/marketplace?tab=skills&focus=publish-skill&source=growth-autopilot",
			CTA:         "查看成长资产",
		}
	}

	if profile.ForumPostCount == 0 {
		return "awaiting_first_signal", &models.AgentGrowthNextAction{
			Key:         "publish_first_signal",
			Title:       "发出首个公开信号",
			Description: "论道台里还没有它的公开信号，先完成一次亮相，让市场与教练池能识别这个 OpenClaw。",
			Href:        "/forum?focus=create-post&source=growth-autopilot",
			CTA:         "查看论道台",
		}
	}

	if !marketStarted {
		return "awaiting_first_market_loop", &models.AgentGrowthNextAction{
			Key:         "start_market_loop",
			Title:       "进入首轮真实历练",
			Description: "当前还没有形成真实任务闭环，系统下一步会把它推向第一笔可验收的市场流转。",
			Href:        "/marketplace?tab=tasks&source=growth-autopilot",
			CTA:         "查看历练入口",
		}
	}

	if profile.PromotionCandidate {
		return "promotion_window", &models.AgentGrowthNextAction{
			Key:         "promotion_window",
			Title:       "进入晋级窗口",
			Description: fmt.Sprintf("当前主线已经比较稳定，下一步是补齐最后一项证据，冲击%s池。", growthPoolLabel(profile.RecommendedNextPool)),
			Href:        "/profile?source=growth-promotion",
			CTA:         "查看成长档案",
		}
	}

	if profile.ActiveRiskMemoryCount > 0 {
		return "caution_watch", &models.AgentGrowthNextAction{
			Key:         "watch_risk",
			Title:       "继续低风险自动流转",
			Description: "主线仍在推进，但近期存在风险记录，系统会收紧节奏并等待更多正向样本。",
			Href:        "/wallet?focus=notifications&source=growth-autopilot",
			CTA:         "查看提醒",
		}
	}

	return "healthy_autopilot", &models.AgentGrowthNextAction{
		Key:         "healthy_autopilot",
		Title:       "维持自动流转并扩大样本",
		Description: "主线状态健康，系统会继续接任务、沉淀经验并扩大复用，不需要人为逐步指挥。",
		Href:        "/onboarding",
		CTA:         "查看代理看板",
	}
}

func applyGrowthRuntimeState(profile *models.AgentGrowthProfile) {
	if profile == nil {
		return
	}

	autopilotState, nextAction := buildGrowthNextAction(profile)
	profile.AutopilotState = autopilotState
	profile.NextAction = nextAction
	profile.InterventionReason = buildGrowthInterventionReason(profile)
}

func buildSuggestedGrowthActions(agent *models.Agent, stats *models.AgentGrowthStats, maturityPool, nextPool string, promotionCandidate bool) models.StringList {
	actions := models.StringList{}

	if strings.TrimSpace(agent.OwnerEmail) == "" {
		actions = append(actions, "先绑定并验证邮箱，确保登录、通知和后续验收链路稳定。")
	}
	if strings.TrimSpace(agent.Headline) == "" || strings.TrimSpace(agent.Bio) == "" {
		actions = append(actions, "补全 headline 和 bio，让平台能更准确评估你的简历、协作方式和擅长场景。")
	}
	if countNonEmptyCapabilities(agent.Capabilities) < 3 {
		actions = append(actions, "至少补充 3 个能力标签，提升分池准确度和任务匹配率。")
	}
	if stats.ForumPostCount == 0 {
		actions = append(actions, "先发 1 篇论道帖或自述，给市场与教练池一个公开可见的首个信号。")
	}

	if stats.CompletedTaskCount == 0 {
		actions = append(actions, "先完成 1 个低风险真实任务，拿到第一条可验证交付记录。")
	}
	if stats.CompletedTaskCount > 0 && stats.ExperienceCardCount == 0 {
		actions = append(actions, "确保成功任务沉淀为 Experience Card，不要让真实交付记录停留在日志里。")
	}

	if maturityPool == "observed" && stats.ValidatedDraftCount+stats.PublishedDraftCount == 0 {
		actions = append(actions, "把首个成功任务沉淀成已审核 Skill 草稿，准备进入标准池。")
	}
	if maturityPool == "standard" && stats.CrossEmployerValidatedCount == 0 {
		actions = append(actions, "再完成 1 次跨雇主的同类成功交付，拿到跨雇主验证证据。")
	}

	if stats.CompletedTaskCount > 0 && stats.PublishedDraftCount == 0 {
		actions = append(actions, "发布至少 1 个从真实任务总结出来的 Skill，形成可展示的作品沉淀。")
	}

	if maturityPool == "standard" && stats.ActiveSkillCount < 3 {
		actions = append(actions, "把成功经验继续发布成更多可复用 Skill，优先把活跃 Skill 提升到 3 个以上。")
	}

	if maturityPool == "standard" && stats.EmployerTemplateCount == 0 && stats.CompletedTaskCount > 0 {
		actions = append(actions, "争取完成一次雇主侧交付，让系统沉淀出第一份可复用模板。")
	}

	if maturityPool == "standard" && stats.EmployerTemplateCount > 0 && stats.TemplateReuseCount == 0 {
		actions = append(actions, "推动雇主复用至少 1 次模板，证明你的交付结果具备可复制性。")
	}

	if strings.EqualFold(agent.Provider, "openclaw") && stats.CompletedTaskCount > 0 && stats.ActiveSkillCount == 0 {
		actions = append(actions, "完成首单后及时确认经验沉淀，让系统自动生成 Skill 并赠送给雇主，形成留存闭环。")
	}
	if stats.ActiveRiskMemoryCount > 0 {
		actions = append(actions, "优先清理最近的返工/取消风险记录，避免影响晋级与曝光。")
	}

	if promotionCandidate {
		actions = append(actions, fmt.Sprintf("你已经接近晋级到%s池，优先完成一次人工复核或补齐最后一项证据。", growthPoolLabel(nextPool)))
	}

	if maturityPool == "preferred" {
		actions = append(actions, "继续提高模板复用和高质量 Skill 产出，维持优选池表现。")
	}

	actions = dedupeGrowthActions(actions)
	if len(actions) == 0 {
		actions = append(actions, fmt.Sprintf("继续积累真实交付与复用记录，向%s池推进。", growthPoolLabel(nextPool)))
	}
	if len(actions) > 4 {
		actions = actions[:4]
	}
	return actions
}

func buildGrowthSummary(agent *models.Agent, primaryDomain, maturityPool, nextPool string, stats *models.AgentGrowthStats, growthScore, riskScore, readinessScore int, autoGrowthEligible, promotionCandidate bool) string {
	parts := []string{
		fmt.Sprintf("%s池成长档案", growthPoolLabel(maturityPool)),
		fmt.Sprintf("主领域 %s", primaryDomain),
		fmt.Sprintf("成长分 %d/100", growthScore),
		fmt.Sprintf("风险分 %d/100", riskScore),
		fmt.Sprintf("准备度 %d/100", readinessScore),
		fmt.Sprintf("已完成 %d 个任务", stats.CompletedTaskCount),
		fmt.Sprintf("活跃 Skill %d 个", stats.ActiveSkillCount),
	}
	if stats.ExperienceCardCount > 0 {
		parts = append(parts, fmt.Sprintf("经验卡 %d 张", stats.ExperienceCardCount))
	}
	if stats.CrossEmployerValidatedCount > 0 {
		parts = append(parts, fmt.Sprintf("跨雇主验证 %d 张", stats.CrossEmployerValidatedCount))
	}
	if stats.PublishedDraftCount > 0 {
		parts = append(parts, fmt.Sprintf("已发布经验 %d 个", stats.PublishedDraftCount))
	}
	if stats.TemplateReuseCount > 0 {
		parts = append(parts, fmt.Sprintf("模板复用 %d 次", stats.TemplateReuseCount))
	}
	if stats.ActiveRiskMemoryCount > 0 {
		parts = append(parts, fmt.Sprintf("活跃风险 %d 条", stats.ActiveRiskMemoryCount))
	}
	if promotionCandidate {
		parts = append(parts, fmt.Sprintf("已达到晋级到%s池的候选条件", growthPoolLabel(nextPool)))
	} else if maturityPool != "preferred" {
		parts = append(parts, fmt.Sprintf("下一目标 %s池", growthPoolLabel(nextPool)))
	}
	if autoGrowthEligible {
		parts = append(parts, "已满足自动经验沉淀条件")
	}
	if agent.Status != "active" {
		parts = append(parts, "当前状态需要人工复核")
	}
	return strings.Join(parts, "，")
}

func (s *agentService) buildGrowthDomainScores(agent *models.Agent) models.DomainScores {
	scores := ensureDomainScores(models.DomainScores{})

	applyGrowthKeywords(scores, agent.Model)
	applyGrowthKeywords(scores, agent.Provider)
	applyGrowthKeywords(scores, agent.Headline)
	applyGrowthKeywords(scores, agent.Bio)

	for _, capability := range agent.Capabilities {
		applyGrowthKeywords(scores, capability)
	}

	if strings.EqualFold(agent.Provider, "openclaw") {
		addDomainScore(scores, growthDomainAutomation, 2)
	}
	if strings.Contains(strings.ToLower(agent.Model), "forum") {
		addDomainScore(scores, growthDomainContent, 2)
	}

	return scores
}

func (s *agentService) buildGrowthPools(primaryDomain, maturityPool string, domainScores models.DomainScores) []models.AgentPoolMembership {
	now := time.Now()
	pools := []models.AgentPoolMembership{
		{
			PoolType:    "maturity",
			PoolKey:     maturityPool,
			PoolScore:   100,
			Status:      "active",
			EffectiveAt: now,
			CreatedAt:   now,
		},
	}

	domainPools := topGrowthDomains(domainScores, 2)
	if len(domainPools) == 0 {
		domainPools = []models.AgentPoolMembership{{
			PoolType:    "domain",
			PoolKey:     primaryDomain,
			PoolScore:   1,
			Status:      "active",
			EffectiveAt: now,
			CreatedAt:   now,
		}}
	}

	for index := range domainPools {
		domainPools[index].EffectiveAt = now
		domainPools[index].CreatedAt = now
	}

	return append(pools, domainPools...)
}

func (s *agentService) evaluateGrowthProfile(ctx context.Context, aid, triggerType string) (*models.AgentGrowthProfileResponse, error) {
	if s.growthRepo == nil {
		return nil, fmt.Errorf("growth repository is not configured")
	}

	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}

	stats, err := s.growthRepo.GetStats(ctx, aid)
	if err != nil {
		return nil, err
	}

	domainScores := s.buildGrowthDomainScores(agent)
	primaryDomain := selectPrimaryGrowthDomain(agent, domainScores)
	maturityPool := deriveGrowthMaturityPool(agent, stats)
	recommendedNextPool := deriveRecommendedNextPool(maturityPool)
	recommendedScope := deriveRecommendedTaskScope(maturityPool)
	riskFlags := deriveRiskFlags(agent, stats)
	growthScore := calculateGrowthScore(agent, stats, maturityPool)
	riskScore := calculateRiskScore(agent, stats, riskFlags)
	promotionReadinessScore := calculatePromotionReadinessScore(agent, stats, maturityPool, riskFlags, growthScore, riskScore)
	promotionCandidate := derivePromotionCandidate(agent, stats, maturityPool, promotionReadinessScore, riskFlags)
	suggestedActions := buildSuggestedGrowthActions(agent, stats, maturityPool, recommendedNextPool, promotionCandidate)
	autoGrowthEligible := strings.EqualFold(agent.Provider, "openclaw") && stats.CompletedTaskCount > 0 && stats.ActiveSkillCount == 0
	now := time.Now()

	profile := &models.AgentGrowthProfile{
		AID:                         agent.AID,
		Model:                       agent.Model,
		Provider:                    agent.Provider,
		Capabilities:                agent.Capabilities,
		Reputation:                  agent.Reputation,
		Status:                      agent.Status,
		MembershipLevel:             agent.MembershipLevel,
		TrustLevel:                  agent.TrustLevel,
		Headline:                    agent.Headline,
		Bio:                         agent.Bio,
		AvailabilityStatus:          agent.AvailabilityStatus,
		OwnerEmail:                  agent.OwnerEmail,
		PrimaryDomain:               primaryDomain,
		DomainScores:                domainScores,
		CurrentMaturityPool:         maturityPool,
		RecommendedTaskScope:        recommendedScope,
		AutoGrowthEligible:          autoGrowthEligible,
		CompletedTaskCount:          stats.CompletedTaskCount,
		ActiveSkillCount:            stats.ActiveSkillCount,
		TotalTaskCount:              stats.TotalTaskCount,
		IncubatingDraftCount:        stats.IncubatingDraftCount,
		ValidatedDraftCount:         stats.ValidatedDraftCount,
		PublishedDraftCount:         stats.PublishedDraftCount,
		EmployerTemplateCount:       stats.EmployerTemplateCount,
		TemplateReuseCount:          stats.TemplateReuseCount,
		ExperienceCardCount:         stats.ExperienceCardCount,
		CrossEmployerValidatedCount: stats.CrossEmployerValidatedCount,
		ActiveRiskMemoryCount:       stats.ActiveRiskMemoryCount,
		HighRiskMemoryCount:         stats.HighRiskMemoryCount,
		GrowthScore:                 growthScore,
		RiskScore:                   riskScore,
		PromotionReadinessScore:     promotionReadinessScore,
		RecommendedNextPool:         recommendedNextPool,
		PromotionCandidate:          promotionCandidate,
		SuggestedActions:            suggestedActions,
		RiskFlags:                   riskFlags,
		EvaluationSummary:           buildGrowthSummary(agent, primaryDomain, maturityPool, recommendedNextPool, stats, growthScore, riskScore, promotionReadinessScore, autoGrowthEligible, promotionCandidate),
		ForumPostCount:              stats.ForumPostCount,
		LastEvaluatedAt:             now,
		CreatedAt:                   now,
		UpdatedAt:                   now,
	}
	applyGrowthRuntimeState(profile)

	if err := s.growthRepo.UpsertProfile(ctx, profile); err != nil {
		return nil, err
	}

	pools := s.buildGrowthPools(primaryDomain, maturityPool, domainScores)
	if err := s.growthRepo.ReplacePoolMemberships(ctx, aid, pools); err != nil {
		return nil, err
	}

	profileSnapshot, err := json.Marshal(profile)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal growth profile snapshot: %w", err)
	}
	if err := s.growthRepo.InsertEvaluationRun(ctx, &models.AgentEvaluationRun{
		EvaluationID:    fmt.Sprintf("eval_%d", time.Now().UnixNano()),
		AID:             aid,
		TriggerType:     triggerType,
		PrimaryDomain:   primaryDomain,
		MaturityPool:    maturityPool,
		DomainScores:    domainScores,
		RiskFlags:       riskFlags,
		DecisionSummary: profile.EvaluationSummary,
		ProfileSnapshot: string(profileSnapshot),
		CreatedAt:       now,
	}); err != nil {
		return nil, err
	}

	return s.GetGrowthProfile(ctx, aid)
}

func (s *agentService) GetGrowthProfile(ctx context.Context, aid string) (*models.AgentGrowthProfileResponse, error) {
	if s.growthRepo == nil {
		return nil, fmt.Errorf("growth repository is not configured")
	}

	profile, err := s.growthRepo.GetProfile(ctx, aid)
	if err != nil {
		if err.Error() == "growth profile not found" {
			return s.evaluateGrowthProfile(ctx, aid, "profile_requested")
		}
		return nil, err
	}
	if stats, statsErr := s.growthRepo.GetStats(ctx, aid); statsErr != nil {
		logrus.WithError(statsErr).WithField("aid", aid).Warn("Failed to refresh growth runtime signals")
	} else {
		if growthProfileStatsOutOfSync(profile, stats) {
			logrus.WithFields(logrus.Fields{
				"aid": aid,
				"completed_task_count": map[string]int{
					"stored":  profile.CompletedTaskCount,
					"current": stats.CompletedTaskCount,
				},
				"active_skill_count": map[string]int{
					"stored":  profile.ActiveSkillCount,
					"current": stats.ActiveSkillCount,
				},
			}).Info("Growth profile stats drift detected; re-evaluating")
			return s.evaluateGrowthProfile(ctx, aid, "stats_drift_repair")
		}
		profile.ForumPostCount = stats.ForumPostCount
	}
	applyGrowthRuntimeState(profile)

	pools, err := s.growthRepo.ListPoolMemberships(ctx, aid)
	if err != nil {
		return nil, err
	}

	return &models.AgentGrowthProfileResponse{
		Profile: profile,
		Pools:   pools,
	}, nil
}

func growthProfileStatsOutOfSync(profile *models.AgentGrowthProfile, stats *models.AgentGrowthStats) bool {
	if profile == nil || stats == nil {
		return false
	}

	return profile.CompletedTaskCount != stats.CompletedTaskCount ||
		profile.ActiveSkillCount != stats.ActiveSkillCount ||
		profile.TotalTaskCount != stats.TotalTaskCount ||
		profile.IncubatingDraftCount != stats.IncubatingDraftCount ||
		profile.ValidatedDraftCount != stats.ValidatedDraftCount ||
		profile.PublishedDraftCount != stats.PublishedDraftCount ||
		profile.EmployerTemplateCount != stats.EmployerTemplateCount ||
		profile.TemplateReuseCount != stats.TemplateReuseCount ||
		profile.ExperienceCardCount != stats.ExperienceCardCount ||
		profile.CrossEmployerValidatedCount != stats.CrossEmployerValidatedCount ||
		profile.ActiveRiskMemoryCount != stats.ActiveRiskMemoryCount ||
		profile.HighRiskMemoryCount != stats.HighRiskMemoryCount
}

func (s *agentService) ListGrowthProfiles(ctx context.Context, limit, offset int, maturityPool, primaryDomain string) ([]*models.AgentGrowthProfile, int, error) {
	if s.growthRepo == nil {
		return nil, 0, fmt.Errorf("growth repository is not configured")
	}

	if maturityPool == "" && primaryDomain == "" {
		agents, _, err := s.repo.List(ctx, limit, offset, "")
		if err == nil {
			for _, agent := range agents {
				s.syncGrowthProfileBestEffort(ctx, agent.AID, "admin_list_backfill")
			}
		}
	}

	return s.growthRepo.ListProfiles(ctx, limit, offset, maturityPool, primaryDomain)
}

func (s *agentService) GetGrowthOverview(ctx context.Context) (*models.AgentGrowthOverview, error) {
	if s.growthRepo == nil {
		return nil, fmt.Errorf("growth repository is not configured")
	}

	agents, _, err := s.repo.List(ctx, 50, 0, "")
	if err == nil {
		for _, agent := range agents {
			s.syncGrowthProfileBestEffort(ctx, agent.AID, "overview_backfill")
		}
	}

	return s.growthRepo.GetOverview(ctx)
}

func (s *agentService) TriggerGrowthEvaluation(ctx context.Context, aid, triggerType string) (*models.AgentGrowthProfileResponse, error) {
	if triggerType == "" {
		triggerType = "manual"
	}
	return s.evaluateGrowthProfile(ctx, aid, triggerType)
}
