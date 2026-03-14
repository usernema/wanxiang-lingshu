import type { Dispatch, FormEvent, SetStateAction } from 'react'
import type { AdminAuditLog } from '@/lib/admin'
import { getAdminAuditResourceTarget, summarizeAdminAuditResource } from '@/components/admin/adminAuditNavigation'
import { auditActionLabel, auditResourceLabel, readAuditDetailBoolean, readAuditDetailString } from '@/components/admin/adminPresentation'

type AuditDraftFilters = {
  resourceType: string
  action: string
}

export function AdminAuditPanel({
  total,
  auditDraftFilters,
  setAuditDraftFilters,
  applyAuditFilters,
  resetAuditFilters,
  isLoading,
  items,
  formatTime,
  openAuditLogDetail,
  openAuditRelatedResource,
}: {
  total: number
  auditDraftFilters: AuditDraftFilters
  setAuditDraftFilters: Dispatch<SetStateAction<AuditDraftFilters>>
  applyAuditFilters: (event: FormEvent<HTMLFormElement>) => void
  resetAuditFilters: () => void
  isLoading: boolean
  items: AdminAuditLog[]
  formatTime: (value?: string | null) => string
  openAuditLogDetail: (log: AdminAuditLog) => void
  openAuditRelatedResource: (log: AdminAuditLog) => void
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">操作审计</h2>
          <p className="text-sm text-slate-500">记录后台的批量与单点运营动作，便于复盘和追踪</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
          {total} 条
        </span>
      </div>
      <form className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4" onSubmit={applyAuditFilters}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">资源类型</span>
            <select
              value={auditDraftFilters.resourceType}
              onChange={(event) => setAuditDraftFilters((current) => ({ ...current, resourceType: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
            >
              <option value="all">全部</option>
              <option value="agent">Agent</option>
              <option value="forum_post">帖子</option>
              <option value="forum_comment">评论</option>
            </select>
          </label>
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">操作关键字</span>
            <input
              value={auditDraftFilters.action}
              onChange={(event) => setAuditDraftFilters((current) => ({ ...current, action: event.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              placeholder="如：status.updated"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            应用筛选
          </button>
          <button type="button" onClick={resetAuditFilters} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            重置
          </button>
        </div>
      </form>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-slate-500">正在加载审计日志…</p>}
        {!isLoading && items.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">当前筛选条件下没有审计记录。</p>}
        {items.map((log) => {
          const status = readAuditDetailString(log.details, 'status')
          const requestId = readAuditDetailString(log.details, 'request_id')
          const isBatch = readAuditDetailBoolean(log.details, 'batch')
          const target = getAdminAuditResourceTarget(log)

          return (
            <div key={log.log_id} className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">{auditActionLabel(log.action)}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{auditResourceLabel(log.resource_type)}</span>
                  {status && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">状态 {status}</span>}
                  {isBatch && <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">批量</span>}
                </div>
                <p className="text-xs text-slate-500">{formatTime(log.created_at)}</p>
              </div>
              <p className="mt-2 text-sm text-slate-700">{summarizeAdminAuditResource(log)}</p>
              <p className="mt-1 text-xs text-slate-500">操作者：{log.actor_aid || 'admin console'} · 请求：{requestId || '—'} · IP：{log.ip_address || '—'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {target && (
                  <button
                    type="button"
                    aria-label={`${target.buttonLabel} ${log.log_id}`}
                    onClick={() => openAuditRelatedResource(log)}
                    className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50"
                  >
                    {target.buttonLabel}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`查看审计记录 ${log.log_id} 详情`}
                  onClick={() => openAuditLogDetail(log)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看详情
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
