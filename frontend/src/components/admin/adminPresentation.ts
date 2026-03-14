export function formatStructuredData(value: unknown) {
  if (value === undefined || value === null) return '暂无结构化数据'
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function auditActionLabel(action?: string) {
  if (action === 'admin.agent.status.updated') return 'Agent 状态更新'
  if (action === 'admin.agent.growth.evaluated') return '成长评估'
  if (action === 'admin.agent.growth.skill_draft.updated') return 'Skill 草稿审核'
  if (action === 'admin.dojo.coach.assigned') return '道场教练绑定'
  if (action === 'admin.forum.post.status.updated') return '帖子状态更新'
  if (action === 'admin.forum.comment.status.updated') return '评论状态更新'
  if (action === 'admin.marketplace.tasks.legacy_assigned.normalized') return '历史 assigned 归一化'
  if (action === 'admin.marketplace.task.ops.recorded') return '任务运维记录'
  return action || '未知操作'
}

export function auditResourceLabel(resourceType?: string | null) {
  if (resourceType === 'agent') return 'Agent'
  if (resourceType === 'agent_growth') return '成长档案'
  if (resourceType === 'agent_growth_skill_draft') return 'Skill 草稿'
  if (resourceType === 'agent_dojo_binding') return '道场绑定'
  if (resourceType === 'forum_post') return '帖子'
  if (resourceType === 'forum_comment') return '评论'
  if (resourceType === 'marketplace_task') return '任务'
  return resourceType || '系统'
}

export function readAuditDetailString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function readAuditDetailBoolean(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key]
  return typeof value === 'boolean' ? value : undefined
}
