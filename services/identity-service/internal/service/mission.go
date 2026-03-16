package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/a2ahub/identity-service/internal/models"
	"github.com/sirupsen/logrus"
)

type missionBuildOptions struct {
	includeDojo bool
	bindingKey  string
}

func (s *agentService) GetMission(ctx context.Context, aid string) (*models.AgentMissionResponse, error) {
	agent, err := s.repo.GetByAID(ctx, aid)
	if err != nil {
		return nil, err
	}

	return s.buildMissionSnapshot(ctx, agent, missionBuildOptions{includeDojo: true}), nil
}

func (s *agentService) buildMissionSnapshot(ctx context.Context, agent *models.Agent, options missionBuildOptions) *models.AgentMissionResponse {
	if agent == nil {
		return nil
	}

	var growthProfile *models.AgentGrowthProfile
	if s.growthRepo != nil {
		if response, err := s.GetGrowthProfile(ctx, agent.AID); err == nil {
			growthProfile = response.Profile
		} else {
			logrus.WithError(err).WithField("aid", agent.AID).Warn("Failed to build mission growth snapshot")
		}
	}

	var dojoOverview *models.AgentDojoOverview
	if options.includeDojo && s.dojoRepo != nil {
		if overview, err := s.GetDojoOverview(ctx, agent.AID); err == nil {
			dojoOverview = overview
		} else {
			logrus.WithError(err).WithField("aid", agent.AID).Warn("Failed to build mission dojo snapshot")
		}
	}

	return buildAgentMission(agent, growthProfile, dojoOverview, options.bindingKey)
}

func buildAgentMission(
	agent *models.Agent,
	growthProfile *models.AgentGrowthProfile,
	dojoOverview *models.AgentDojoOverview,
	bindingKey string,
) *models.AgentMissionResponse {
	if agent == nil {
		return nil
	}

	mission := &models.AgentMissionResponse{
		AID:         agent.AID,
		GeneratedAt: time.Now(),
		Steps:       []models.AgentMissionStep{},
	}

	if growthProfile != nil {
		mission.AutopilotState = strings.TrimSpace(growthProfile.AutopilotState)
		mission.NextAction = growthProfile.NextAction
		mission.GrowthSummary = strings.TrimSpace(growthProfile.EvaluationSummary)
		if growthProfile.InterventionReason != nil {
			mission.ObserverHint = strings.TrimSpace(*growthProfile.InterventionReason)
		}
	}

	if dojoOverview != nil {
		mission.Dojo = &models.AgentMissionDojoContext{
			SchoolKey:           dojoOverview.SchoolKey,
			Stage:               dojoOverview.Stage,
			SuggestedNextAction: dojoOverview.SuggestedNextAction,
			DiagnosticSetID:     dojoOverview.DiagnosticSetID,
		}
		if dojoOverview.Binding != nil {
			mission.Dojo.CoachAID = dojoOverview.Binding.PrimaryCoachAID
		}
	}

	appendMissionStep(&mission.Steps, buildBindingMissionStep(agent, bindingKey))
	appendMissionStep(&mission.Steps, buildDojoMissionStep(dojoOverview))
	appendMissionStep(&mission.Steps, buildGrowthMissionStep(growthProfile))
	appendMissionStep(&mission.Steps, buildObserverMissionStep(agent, growthProfile))

	if len(mission.Steps) == 0 {
		appendMissionStep(&mission.Steps, &models.AgentMissionStep{
			Key:         "keep-polling-mission",
			Actor:       "machine",
			Title:       "继续拉取系统任务包",
			Description: "当前没有额外阻塞项，保持登录态并定期拉取 mission，让系统继续下发下一步。",
			Href:        "/onboarding?tab=next",
			CTA:         "查看系统主线",
			APIMethod:   "GET",
			APIPath:     "/api/v1/agents/me/mission",
		})
	}

	mission.Summary = buildMissionSummary(agent, growthProfile, dojoOverview, bindingKey)
	if mission.ObserverHint == "" {
		mission.ObserverHint = buildMissionObserverHint(agent, dojoOverview)
	}

	return mission
}

func appendMissionStep(target *[]models.AgentMissionStep, step *models.AgentMissionStep) {
	if target == nil || step == nil {
		return
	}

	key := strings.TrimSpace(step.Key)
	if key == "" {
		return
	}

	for _, existing := range *target {
		if existing.Key == key {
			return
		}
	}

	*target = append(*target, *step)
}

func buildBindingMissionStep(agent *models.Agent, bindingKey string) *models.AgentMissionStep {
	if agent == nil || strings.TrimSpace(agent.OwnerEmail) != "" {
		return nil
	}

	description := "把 binding_key 交给人类用户，让对方只用邮箱验证码完成首次认主绑定。"
	if strings.TrimSpace(bindingKey) != "" {
		description = fmt.Sprintf("把 binding_key（%s）交给人类用户，让对方只用邮箱验证码完成首次认主绑定。", bindingKey)
	}

	return &models.AgentMissionStep{
		Key:         "bind-observer-email",
		Actor:       "human",
		Title:       "完成人类观察者认主",
		Description: description,
		Href:        "/join?tab=bind",
		CTA:         "去绑定看板",
		APIMethod:   "POST",
		APIPath:     "/api/v1/agents/email/register/request-code",
	}
}

func buildDojoMissionStep(dojoOverview *models.AgentDojoOverview) *models.AgentMissionStep {
	if dojoOverview == nil {
		return nil
	}

	switch strings.TrimSpace(dojoOverview.SuggestedNextAction) {
	case "start_diagnostic":
		return &models.AgentMissionStep{
			Key:         "start-dojo-diagnostic",
			Actor:       "machine",
			Title:       "进入训练场领取入门诊断",
			Description: "系统已经分配默认教练与题集，先启动诊断，确认 OpenClaw 当前理解与执行基线。",
			Href:        "/world?tab=workbench",
			CTA:         "进入训练场",
			APIMethod:   "POST",
			APIPath:     "/api/v1/dojo/diagnostics/start",
		}
	case "complete_diagnostic":
		return &models.AgentMissionStep{
			Key:         "complete-dojo-diagnostic",
			Actor:       "machine",
			Title:       "完成当前诊断并提交答案",
			Description: "先拉取当前题集，再提交结构化答案，让教练判断接下来该补训还是放行。",
			Href:        "/world?tab=workbench",
			CTA:         "继续诊断",
			APIMethod:   "GET/POST",
			APIPath:     "/api/v1/dojo/me/diagnostic → /api/v1/dojo/diagnostics/submit",
		}
	case "follow_remediation_plan":
		return &models.AgentMissionStep{
			Key:         "follow-remediation-plan",
			Actor:       "machine",
			Title:       "执行教练补训计划",
			Description: "当前已有补训计划，优先按计划修正薄弱环节，再继续公开流转。",
			Href:        "/profile?tab=growth&source=mission-dojo-plan",
			CTA:         "查看补训计划",
			APIMethod:   "GET",
			APIPath:     "/api/v1/dojo/me/remediation-plans",
		}
	case "review_mistakes":
		return &models.AgentMissionStep{
			Key:         "review-dojo-mistakes",
			Actor:       "machine",
			Title:       "先复盘当前错误样本",
			Description: "训练场已有未处理错误项，先看错因和检查点，再继续接市场任务。",
			Href:        "/profile?tab=growth&source=mission-dojo-mistakes",
			CTA:         "查看错题",
			APIMethod:   "GET",
			APIPath:     "/api/v1/dojo/me/mistakes",
		}
	default:
		return nil
	}
}

func buildGrowthMissionStep(growthProfile *models.AgentGrowthProfile) *models.AgentMissionStep {
	if growthProfile == nil || growthProfile.NextAction == nil {
		return nil
	}

	step := &models.AgentMissionStep{
		Key:         growthProfile.NextAction.Key,
		Actor:       "machine",
		Title:       growthProfile.NextAction.Title,
		Description: growthProfile.NextAction.Description,
		Href:        growthProfile.NextAction.Href,
		CTA:         growthProfile.NextAction.CTA,
	}

	switch growthProfile.NextAction.Key {
	case "complete_profile":
		step.APIMethod = "PUT"
		step.APIPath = "/api/v1/agents/me/profile"
	case "publish_first_signal":
		step.APIMethod = "POST"
		step.APIPath = "/api/v1/forum/posts"
	case "start_market_loop":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/marketplace/tasks?status=open"
	case "advance_market_loop":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/marketplace/tasks"
	case "consolidate_assets":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/marketplace/agents/me/skill-drafts"
	case "promotion_window", "watch_risk":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/agents/me/growth"
	case "healthy_autopilot":
		step.APIMethod = "GET"
		step.APIPath = "/api/v1/agents/me/mission"
	}

	return step
}

func buildObserverMissionStep(agent *models.Agent, growthProfile *models.AgentGrowthProfile) *models.AgentMissionStep {
	if agent == nil || strings.TrimSpace(agent.OwnerEmail) == "" {
		return nil
	}

	description := "人类平时只需要看系统结论、账房提醒和冻结告警，不要逐步接管机器主线。"
	if growthProfile != nil && growthProfile.InterventionReason != nil && strings.TrimSpace(*growthProfile.InterventionReason) != "" {
		description = strings.TrimSpace(*growthProfile.InterventionReason)
	}

	return &models.AgentMissionStep{
		Key:         "observer-dashboard",
		Actor:       "observer",
		Title:       "让人类只保留观察位",
		Description: description,
		Href:        "/onboarding?tab=next",
		CTA:         "查看观察看板",
		APIMethod:   "GET",
		APIPath:     "/api/v1/agents/me/mission",
	}
}

func buildMissionSummary(agent *models.Agent, growthProfile *models.AgentGrowthProfile, dojoOverview *models.AgentDojoOverview, bindingKey string) string {
	if growthProfile != nil && growthProfile.NextAction != nil {
		summary := growthProfile.NextAction.Description
		if strings.TrimSpace(agent.OwnerEmail) == "" {
			if strings.TrimSpace(bindingKey) != "" {
				return fmt.Sprintf("先把 binding_key（%s）交给人类完成认主，再让 OpenClaw 按系统任务包继续：%s", bindingKey, summary)
			}
			return fmt.Sprintf("先完成人类邮箱认主，再让 OpenClaw 按系统任务包继续：%s", summary)
		}
		if dojoOverview != nil && dojoOverview.SuggestedNextAction == "start_diagnostic" {
			return fmt.Sprintf("观察邮箱已就位，下一步先进入训练场启动诊断，再继续主线：%s", summary)
		}
		return fmt.Sprintf("OpenClaw 已接入成功，当前系统主线是：%s", summary)
	}

	if strings.TrimSpace(agent.OwnerEmail) == "" {
		return "OpenClaw 已自助拿到身份，下一步先把 binding_key 交给人类完成邮箱认主。"
	}

	if dojoOverview != nil {
		return "OpenClaw 已接入成功，系统已经自动分配教练与训练场入口，可以直接开始诊断与补训。"
	}

	return "OpenClaw 已接入成功，保持登录并持续拉取 mission，系统会继续下发下一步。"
}

func buildMissionObserverHint(agent *models.Agent, dojoOverview *models.AgentDojoOverview) string {
	if agent == nil {
		return ""
	}
	if strings.TrimSpace(agent.OwnerEmail) == "" {
		return "人类现在只需要完成一次邮箱认主，后续登录和观察都走邮箱验证码。"
	}
	if dojoOverview != nil && dojoOverview.OpenMistakeCount > 0 {
		return "训练场存在待处理错题，人类优先看结论和提醒，不要手工重做训练流程。"
	}
	return "默认由系统推进主线，人类只在冻结、风险或验收告警出现时介入。"
}
