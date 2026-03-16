import type { AdminAuditLog } from '@/lib/admin'
import { auditResourceLabel, readAuditDetailString } from '@/components/admin/adminPresentation'

export type AdminAuditNavigationTab = 'agents' | 'growth' | 'dojo' | 'content' | 'tasks' | 'audit'
export type AdminAuditNavigationParams = Partial<Record<'agent' | 'growth' | 'dojo' | 'draft' | 'template' | 'grant' | 'post' | 'task' | 'audit', string>>

export type AdminAuditResourceTarget = {
  tab: AdminAuditNavigationTab
  params: AdminAuditNavigationParams
  buttonLabel: string
  summaryLabel: string
}

export function getAdminAuditResourceTarget(log: AdminAuditLog): AdminAuditResourceTarget | null {
  const resourceId = log.resource_id || undefined
  const postId = readAuditDetailString(log.details, 'post_id')

  switch (log.resource_type) {
    case 'agent':
      if (!resourceId) return null
      return {
        tab: 'agents',
        params: { agent: resourceId },
        buttonLabel: '查看关联修士',
        summaryLabel: `修士 ${resourceId}`,
      }
    case 'agent_growth':
      if (!resourceId) return null
      return {
        tab: 'growth',
        params: { growth: resourceId },
        buttonLabel: '查看成长档案',
        summaryLabel: `成长档案 ${resourceId}`,
      }
    case 'agent_growth_skill_draft':
      if (!resourceId) return null
      return {
        tab: 'growth',
        params: { draft: resourceId },
        buttonLabel: '查看法卷草稿',
        summaryLabel: `法卷草稿 ${resourceId}`,
      }
    case 'employer_template':
      if (!resourceId) return null
      return {
        tab: 'growth',
        params: { template: resourceId },
        buttonLabel: '查看雇主模板',
        summaryLabel: `雇主模板 ${resourceId}`,
      }
    case 'employer_skill_grant':
      if (!resourceId) return null
      return {
        tab: 'growth',
        params: { grant: resourceId },
        buttonLabel: '查看获赠法卷',
        summaryLabel: `获赠法卷 ${resourceId}`,
      }
    case 'agent_dojo_binding':
      if (!resourceId) return null
      return {
        tab: 'dojo',
        params: { dojo: resourceId },
        buttonLabel: '查看道场绑定',
        summaryLabel: `道场绑定 ${resourceId}`,
      }
    case 'forum_post':
      if (!resourceId) return null
      return {
        tab: 'content',
        params: { post: resourceId },
        buttonLabel: '查看关联帖子',
        summaryLabel: `帖子 ${resourceId}`,
      }
    case 'forum_comment':
      if (!postId) return null
      return {
        tab: 'content',
        params: { post: postId },
        buttonLabel: '查看关联帖子',
        summaryLabel: `评论 ${resourceId || '—'} · 帖子 ${postId}`,
      }
    case 'task':
    case 'marketplace_task':
      if (!resourceId) return null
      return {
        tab: 'tasks',
        params: { task: resourceId },
        buttonLabel: '查看关联任务',
        summaryLabel: `任务 ${resourceId}`,
      }
    default:
      return null
  }
}

export function summarizeAdminAuditResource(log: AdminAuditLog) {
  const target = getAdminAuditResourceTarget(log)
  if (target) {
    return target.summaryLabel
  }

  return `${auditResourceLabel(log.resource_type)} ${log.resource_id || '无资源标识'}`
}
