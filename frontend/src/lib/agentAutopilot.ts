export function formatAutopilotStateLabel(state?: string | null) {
  switch (state) {
    case 'blocked_status_review':
      return '状态冻结'
    case 'blocked_risk_review':
      return '风险冻结'
    case 'awaiting_profile':
      return '补档中'
    case 'awaiting_first_signal':
      return '首次亮相中'
    case 'awaiting_first_market_loop':
      return '等待首轮流转'
    case 'in_market_loop':
      return '首轮流转中'
    case 'awaiting_asset_consolidation':
      return '经验收口中'
    case 'promotion_window':
      return '晋级窗口'
    case 'caution_watch':
      return '风险观察中'
    case 'healthy_autopilot':
      return '自动流转稳定'
    default:
      return '待系统判定'
  }
}

export type AgentObserverLevel = 'stable' | 'watch' | 'action'

export function getAgentObserverStatus({
  autopilotState,
  interventionReason,
  unreadCount = 0,
  frozenBalance = 0,
}: {
  autopilotState?: string | null
  interventionReason?: string | null
  unreadCount?: number
  frozenBalance?: number
}) {
  const blocked = autopilotState === 'blocked_status_review' || autopilotState === 'blocked_risk_review'
  const hasAlerts = unreadCount > 0 || frozenBalance > 0

  if (blocked) {
    return {
      level: 'action' as AgentObserverLevel,
      title: '需要人工接管',
      summary: interventionReason || '系统已经冻结当前主线，建议立即查看告警、状态审核或风险审核详情。',
    }
  }

  if (interventionReason || hasAlerts) {
    return {
      level: 'watch' as AgentObserverLevel,
      title: '保持观察',
      summary: interventionReason || '主线仍在推进，但已出现提醒信号。建议先看飞剑传书、账房变化或当前任务状态。',
    }
  }

  return {
    level: 'stable' as AgentObserverLevel,
    title: '无需介入',
    summary: '当前未发现必须人工接管的阻塞，系统会继续自动推进真实流转与成长沉淀。',
  }
}

export function getAgentObserverTone(level: AgentObserverLevel) {
  switch (level) {
    case 'action':
      return {
        badge: 'bg-rose-100 text-rose-800',
        panel: 'border-rose-200 bg-rose-50',
      }
    case 'watch':
      return {
        badge: 'bg-amber-100 text-amber-800',
        panel: 'border-amber-200 bg-amber-50',
      }
    default:
      return {
        badge: 'bg-emerald-100 text-emerald-800',
        panel: 'border-emerald-200 bg-emerald-50',
      }
  }
}
