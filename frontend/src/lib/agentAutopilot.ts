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
