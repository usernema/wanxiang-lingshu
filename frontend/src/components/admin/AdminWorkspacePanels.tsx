import {
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type {
  AdminAgentGrowthExperienceCard,
  AdminAgentGrowthOverview,
  AdminAgentGrowthProfile,
  AdminAgentGrowthRiskMemory,
  AdminAgentGrowthSkillDraft,
  AdminAgentGrowthSkillDraftStatus,
  AdminAuditLog,
  AdminDependency,
  AdminDojoBinding,
  AdminDojoCoachProfile,
  AdminDojoOverview,
  AdminEmployerSkillGrant,
  AdminEmployerTemplate,
  AdminForumPost,
  AdminOverview,
  AdminSectApplication,
  AdminTask,
  AdminTaskStatus,
} from "@/lib/admin";
import {
  getAdminAuditResourceTarget,
  summarizeAdminAuditResource,
} from "@/components/admin/adminAuditNavigation";
import {
  auditActionLabel,
  auditResourceLabel,
  readAuditDetailBoolean,
  readAuditDetailString,
} from "@/components/admin/adminPresentation";
import type { AgentProfile } from "@/lib/api";
import {
  CULTIVATION_SECT_DETAILS,
  formatCultivationSchoolLabel,
  getCultivationSectDetail,
  getCultivationSectDetailByDomain,
  inferCultivationSectKeyFromText,
} from "@/lib/cultivation";

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs ${tone}`}>
      {label} {value}
    </span>
  );
}

function StatCard({
  title,
  value,
  tone = "slate",
}: {
  title: string;
  value: string | number;
  tone?: "slate" | "emerald" | "amber" | "rose";
}) {
  const toneMap = {
    slate: "bg-slate-50 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-900",
    amber: "bg-amber-50 text-amber-900",
    rose: "bg-rose-50 text-rose-900",
  };

  return (
    <div className={`rounded-2xl border border-slate-200 p-5 ${toneMap[tone]}`}>
      <p className="text-sm opacity-80">{title}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function growthExperienceTone(card: AdminAgentGrowthExperienceCard) {
  if (card.is_cross_employer_validated)
    return "bg-emerald-100 text-emerald-800";
  if (card.accepted_on_first_pass) return "bg-sky-100 text-sky-800";
  return "bg-amber-100 text-amber-800";
}

function growthRiskSeverityTone(severity?: string) {
  if (severity === "high") return "bg-rose-100 text-rose-800";
  if (severity === "medium") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function growthRiskStatusTone(status?: string) {
  if (status === "resolved") return "bg-emerald-100 text-emerald-800";
  if (status === "active") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function DependencyRow({
  dependency,
  toneClass,
}: {
  dependency: AdminDependency;
  toneClass: (ok: boolean) => string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
      <div>
        <p className="font-medium text-slate-900">{dependency.name}</p>
        <p className="text-sm text-slate-500">{dependency.url || "内部依赖"}</p>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-sm ${toneClass(dependency.ok)}`}
      >
        {dependency.ok ? "正常" : dependency.error || "异常"}
      </span>
    </div>
  );
}

type TaskOpsQueueItem = {
  key: string;
  title: string;
  note: string;
  meta?: string;
  queue: "legacy_assigned" | "submitted" | "anomaly" | "cancelled_settlement";
  issue?: string;
  slaLevel?: "warning" | "critical";
  slaLabel?: string;
  slaHours?: number;
  latestDisposition?: "checked" | "follow_up";
  latestNote?: string;
  latestRecordedAt?: string;
  task?: AdminTask;
};

type TaskOpsLatestRecord = {
  disposition?: "checked" | "follow_up";
  note?: string;
  createdAt?: string;
};

function parseDateValue(value?: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function diffHoursFromNow(value?: string | null) {
  const timestamp = parseDateValue(value);
  if (!timestamp) return null;
  return Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60));
}

function formatSlaHours(hours?: number | null) {
  if (hours === null || hours === undefined) return "";
  if (hours < 1) return "<1h";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function deriveTaskOpsSla(task: AdminTask) {
  const baseTime = task.cancelled_at || task.updated_at || task.created_at;

  if (task.status === "submitted") {
    const hours = diffHoursFromNow(task.updated_at || task.created_at);
    if (hours === null) return null;
    if (hours >= 24)
      return { level: "critical" as const, label: "待验收超时", hours };
    if (hours >= 12)
      return { level: "warning" as const, label: "待验收临期", hours };
    return null;
  }

  if (task.status === "assigned") {
    const hours = diffHoursFromNow(task.updated_at || task.created_at);
    if (hours === null) return null;
    if (hours >= 24)
      return { level: "critical" as const, label: "长时间未开工", hours };
    if (hours >= 8)
      return { level: "warning" as const, label: "待开工积压", hours };
    return null;
  }

  if (task.status === "cancelled" && task.escrow_id) {
    const hours = diffHoursFromNow(baseTime);
    if (hours === null) return null;
    if (hours >= 24)
      return { level: "critical" as const, label: "退款核账超时", hours };
    if (hours >= 6)
      return { level: "warning" as const, label: "退款待核账", hours };
    return null;
  }

  return null;
}

function deriveTaskMaintenanceIssue(task: AdminTask) {
  if (task.status === "assigned" && !task.worker_aid)
    return "assigned 缺少 worker_aid";
  if (task.status === "assigned" && !task.escrow_id)
    return "assigned 缺少 escrow_id";
  if (
    (task.status === "in_progress" || task.status === "submitted") &&
    !task.worker_aid
  )
    return `${task.status} 缺少 worker_aid`;
  if (
    (task.status === "in_progress" || task.status === "submitted") &&
    !task.escrow_id
  )
    return `${task.status} 缺少 escrow_id`;
  if (task.status === "completed" && !task.completed_at)
    return "completed 缺少 completed_at";
  if (task.status === "cancelled" && !task.cancelled_at)
    return "cancelled 缺少 cancelled_at";
  return null;
}

function TaskOpsQueueCard({
  title,
  description,
  count,
  tone,
  items,
  emptyText,
  actionLabel,
  onAction,
  openTaskDetail,
  queueKey,
  onRecordDisposition,
  recordPending,
}: {
  title: string;
  description: string;
  count: number;
  tone: "slate" | "emerald" | "amber" | "rose";
  items: TaskOpsQueueItem[];
  emptyText: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  openTaskDetail?: (task: AdminTask) => void;
  queueKey?:
    | "legacy_assigned"
    | "submitted"
    | "anomaly"
    | "cancelled_settlement";
  onRecordDisposition?: (payload: {
    taskId: string;
    queue: "legacy_assigned" | "submitted" | "anomaly" | "cancelled_settlement";
    disposition: "checked" | "follow_up";
    issue?: string | null;
    taskStatus?: string | null;
  }) => void | Promise<void>;
  recordPending?: boolean;
}) {
  const toneMap = {
    slate: "bg-slate-50 text-slate-900 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-900 border-emerald-200",
    amber: "bg-amber-50 text-amber-900 border-amber-200",
    rose: "bg-rose-50 text-rose-900 border-rose-200",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm opacity-80">{description}</p>
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold">
          {count}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl bg-white/80 px-3 py-2 text-sm opacity-80">
            {emptyText}
          </p>
        ) : (
          items.slice(0, 3).map((item) => (
            <div
              key={item.key}
              className="rounded-xl bg-white/80 px-3 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.slaLabel && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          item.slaLevel === "critical"
                            ? "bg-rose-100 text-rose-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.slaLabel} {formatSlaHours(item.slaHours)}
                      </span>
                    )}
                    {item.latestDisposition && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          item.latestDisposition === "checked"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {item.latestDisposition === "checked"
                          ? "已核对"
                          : "待跟进"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs opacity-80">{item.note}</p>
                  {item.meta && (
                    <p className="mt-1 text-xs opacity-70">{item.meta}</p>
                  )}
                  {item.latestNote && (
                    <p className="mt-1 text-xs opacity-70">
                      最近备注：{item.latestNote}
                    </p>
                  )}
                  {item.latestRecordedAt && (
                    <p className="mt-1 text-[11px] opacity-60">
                      记录于 {item.latestRecordedAt}
                    </p>
                  )}
                </div>
                {item.task && openTaskDetail && (
                  <button
                    type="button"
                    aria-label={`查看队列任务 ${item.task.task_id} 详情`}
                    onClick={() => openTaskDetail(item.task as AdminTask)}
                    className="shrink-0 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看
                  </button>
                )}
              </div>
              {item.task && queueKey && onRecordDisposition && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`标记任务 ${item.task.task_id} 已核对`}
                    disabled={recordPending}
                    onClick={() =>
                      onRecordDisposition({
                        taskId: item.task?.task_id || "",
                        queue: queueKey,
                        disposition: "checked",
                        issue: item.issue,
                        taskStatus: item.task?.status,
                      })
                    }
                    className="rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    标记已核对
                  </button>
                  <button
                    type="button"
                    aria-label={`标记任务 ${item.task.task_id} 待跟进`}
                    disabled={recordPending}
                    onClick={() =>
                      onRecordDisposition({
                        taskId: item.task?.task_id || "",
                        queue: queueKey,
                        disposition: "follow_up",
                        issue: item.issue,
                        taskStatus: item.task?.status,
                      })
                    }
                    className="rounded-lg border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    标记待跟进
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {items.length > 3 && (
        <p className="mt-3 text-xs opacity-70">
          还有 {items.length - 3} 条未展开。
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={() => onAction()}
          className="mt-4 rounded-lg border border-primary-300 bg-white px-3 py-2 text-xs text-primary-700 hover:bg-primary-50"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function AdminOverviewPanel({
  overview,
  isLoading,
  agentStatusSummary,
  postStatusSummary,
  taskStatusSummary,
  moderationActionSummary,
  recentModerationItems,
  formatTime,
  openRecentModerationDetail,
  openRecentModerationResource,
  toneClass,
}: {
  overview?: AdminOverview;
  isLoading: boolean;
  agentStatusSummary: Record<string, number>;
  postStatusSummary: Record<string, number>;
  taskStatusSummary: Record<string, number>;
  moderationActionSummary: {
    agentStatusUpdates: number;
    postStatusUpdates: number;
    commentStatusUpdates: number;
    batchActions: number;
  };
  recentModerationItems: AdminAuditLog[];
  formatTime: (value?: string | null) => string;
  openRecentModerationDetail: (log: AdminAuditLog) => void;
  openRecentModerationResource: (log: AdminAuditLog) => void;
  toneClass: (ok: boolean) => string;
}) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Agent 总数"
          value={overview?.summary.agentsTotal ?? "—"}
          tone="emerald"
        />
        <StatCard
          title="论坛帖子总数"
          value={overview?.summary.forumPostsTotal ?? "—"}
        />
        <StatCard
          title="最近任务数"
          value={overview?.summary.recentTasksCount ?? "—"}
          tone="amber"
        />
        <StatCard
          title="一致性异常"
          value={overview?.summary.consistencyIssues ?? "—"}
          tone={
            (overview?.summary.consistencyIssues || 0) > 0 ? "rose" : "emerald"
          }
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">系统健康</h2>
            <p className="text-sm text-slate-500">
              网关、Redis 与关键依赖服务的 readiness 汇总
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm ${toneClass(Boolean(overview?.summary.ready))}`}
          >
            {isLoading
              ? "加载中"
              : overview?.summary.ready
                ? "Ready"
                : "Degraded"}
          </span>
        </div>
        <div className="space-y-3">
          {overview && (
            <>
              <DependencyRow
                dependency={overview.dependencies.redis}
                toneClass={toneClass}
              />
              {overview.dependencies.required.map((dependency) => (
                <DependencyRow
                  key={`${dependency.name}-${dependency.url}`}
                  dependency={dependency}
                  toneClass={toneClass}
                />
              ))}
            </>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">运营快照</h2>
            <p className="text-sm text-slate-500">
              当前筛选结果下的 Agent、内容和任务状态分布
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            一致性异常 {overview?.consistency?.summary?.total_issues ?? 0}
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">Agent 状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip
                label="正常"
                value={agentStatusSummary.active || 0}
                tone="bg-emerald-100 text-emerald-800"
              />
              <SummaryChip
                label="暂停"
                value={agentStatusSummary.suspended || 0}
                tone="bg-amber-100 text-amber-800"
              />
              <SummaryChip
                label="封禁"
                value={agentStatusSummary.banned || 0}
                tone="bg-rose-100 text-rose-800"
              />
              <SummaryChip
                label="待审核"
                value={agentStatusSummary.pending || 0}
                tone="bg-slate-100 text-slate-700"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">内容状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip
                label="已发布"
                value={postStatusSummary.published || 0}
                tone="bg-emerald-100 text-emerald-800"
              />
              <SummaryChip
                label="已隐藏"
                value={postStatusSummary.hidden || 0}
                tone="bg-amber-100 text-amber-800"
              />
              <SummaryChip
                label="已删除"
                value={postStatusSummary.deleted || 0}
                tone="bg-rose-100 text-rose-800"
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-900">任务状态</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip
                label="开放中"
                value={taskStatusSummary.open || 0}
                tone="bg-sky-100 text-sky-800"
              />
              <SummaryChip
                label="已分配"
                value={taskStatusSummary.assigned || 0}
                tone="bg-indigo-100 text-indigo-800"
              />
              <SummaryChip
                label="进行中"
                value={taskStatusSummary.in_progress || 0}
                tone="bg-amber-100 text-amber-800"
              />
              <SummaryChip
                label="待验收"
                value={taskStatusSummary.submitted || 0}
                tone="bg-violet-100 text-violet-800"
              />
              <SummaryChip
                label="已完成"
                value={taskStatusSummary.completed || 0}
                tone="bg-emerald-100 text-emerald-800"
              />
              <SummaryChip
                label="已取消"
                value={taskStatusSummary.cancelled || 0}
                tone="bg-rose-100 text-rose-800"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">审核追踪</h2>
            <p className="text-sm text-slate-500">
              基于最近 20 条后台状态变更审计，快速判断运营动作是否正常流转。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            最近动作 {recentModerationItems.length}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Agent 状态变更"
            value={moderationActionSummary.agentStatusUpdates}
            tone="amber"
          />
          <StatCard
            title="帖子审核动作"
            value={moderationActionSummary.postStatusUpdates}
          />
          <StatCard
            title="评论审核动作"
            value={moderationActionSummary.commentStatusUpdates}
            tone="emerald"
          />
          <StatCard
            title="批量动作"
            value={moderationActionSummary.batchActions}
            tone="rose"
          />
        </div>
        <div className="mt-6 space-y-3">
          {recentModerationItems.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              最近还没有状态变更类审计动作。
            </p>
          ) : (
            recentModerationItems.map((log) => {
              const status = readAuditDetailString(log.details, "status");
              const requestId = readAuditDetailString(
                log.details,
                "request_id",
              );
              const isBatch = readAuditDetailBoolean(log.details, "batch");
              const target = getAdminAuditResourceTarget(log);
              return (
                <div
                  key={log.log_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">
                        {auditActionLabel(log.action)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {auditResourceLabel(log.resource_type)}
                      </span>
                      {status && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                          状态 {status}
                        </span>
                      )}
                      {isBatch && (
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">
                          批量
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatTime(log.created_at)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    {summarizeAdminAuditResource(log)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    操作者：{log.actor_aid || "admin console"} · 请求：
                    {requestId || "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {target && (
                      <button
                        type="button"
                        aria-label={`${target.buttonLabel} ${log.log_id}`}
                        onClick={() => openRecentModerationResource(log)}
                        className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50"
                      >
                        {target.buttonLabel}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`查看审计详情 ${log.log_id}`}
                      onClick={() => openRecentModerationDetail(log)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看详情
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}

type GrowthPoolFilter =
  | "all"
  | "cold_start"
  | "observed"
  | "standard"
  | "preferred";
type GrowthDomainFilter =
  | "all"
  | "automation"
  | "content"
  | "data"
  | "development"
  | "support";

export function AdminGrowthPanel({
  growthOverview,
  growthDraftTotal,
  growthExperienceCardTotal,
  growthRiskMemoryTotal,
  employerSkillGrantTotal,
  visibleGrowthProfiles,
  visibleGrowthDrafts,
  visibleGrowthExperienceCards,
  visibleGrowthRiskMemories,
  employerTemplateItems,
  employerSkillGrantItems,
  isProfilesLoading,
  isDraftsLoading,
  isExperienceCardsLoading,
  isRiskMemoriesLoading,
  isTemplatesLoading,
  isGrantsLoading,
  growthPoolFilter,
  setGrowthPoolFilter,
  growthDomainFilter,
  setGrowthDomainFilter,
  growthKeyword,
  setGrowthKeyword,
  growthDraftStatusFilter,
  setGrowthDraftStatusFilter,
  growthDraftKeyword,
  setGrowthDraftKeyword,
  openGrowthProfileDetail,
  handleGrowthEvaluate,
  growthEvaluatePending,
  openGrowthDraftDetail,
  handleGrowthDraftAction,
  growthDraftPending,
  openEmployerTemplateDetail,
  openEmployerSkillGrantDetail,
  agentStatusTone,
  agentStatusLabel,
  growthPoolLabel,
  growthDomainLabel,
  growthScopeLabel,
  growthReadinessTone,
  growthRiskLabel,
  draftTone,
  draftLabel,
  summarizeText,
}: {
  growthOverview?: AdminAgentGrowthOverview;
  growthDraftTotal: number;
  growthExperienceCardTotal: number;
  growthRiskMemoryTotal: number;
  employerSkillGrantTotal: number;
  visibleGrowthProfiles: AdminAgentGrowthProfile[];
  visibleGrowthDrafts: AdminAgentGrowthSkillDraft[];
  visibleGrowthExperienceCards: AdminAgentGrowthExperienceCard[];
  visibleGrowthRiskMemories: AdminAgentGrowthRiskMemory[];
  employerTemplateItems: AdminEmployerTemplate[];
  employerSkillGrantItems: AdminEmployerSkillGrant[];
  isProfilesLoading: boolean;
  isDraftsLoading: boolean;
  isExperienceCardsLoading: boolean;
  isRiskMemoriesLoading: boolean;
  isTemplatesLoading: boolean;
  isGrantsLoading: boolean;
  growthPoolFilter: GrowthPoolFilter;
  setGrowthPoolFilter: Dispatch<SetStateAction<GrowthPoolFilter>>;
  growthDomainFilter: GrowthDomainFilter;
  setGrowthDomainFilter: Dispatch<SetStateAction<GrowthDomainFilter>>;
  growthKeyword: string;
  setGrowthKeyword: Dispatch<SetStateAction<string>>;
  growthDraftStatusFilter: "all" | AdminAgentGrowthSkillDraftStatus;
  setGrowthDraftStatusFilter: Dispatch<
    SetStateAction<"all" | AdminAgentGrowthSkillDraftStatus>
  >;
  growthDraftKeyword: string;
  setGrowthDraftKeyword: Dispatch<SetStateAction<string>>;
  openGrowthProfileDetail: (profile: AdminAgentGrowthProfile) => void;
  handleGrowthEvaluate: (aid: string) => void | Promise<void>;
  growthEvaluatePending: boolean;
  openGrowthDraftDetail: (draft: AdminAgentGrowthSkillDraft) => void;
  handleGrowthDraftAction: (
    draftId: string,
    status: AdminAgentGrowthSkillDraftStatus,
  ) => void | Promise<void>;
  growthDraftPending: boolean;
  openEmployerTemplateDetail: (template: AdminEmployerTemplate) => void;
  openEmployerSkillGrantDetail: (grant: AdminEmployerSkillGrant) => void;
  agentStatusTone: (status?: string) => string;
  agentStatusLabel: (status?: string) => string;
  growthPoolLabel: (pool?: string) => string;
  growthDomainLabel: (domain?: string) => string;
  growthScopeLabel: (scope?: string) => string;
  growthReadinessTone: (score: number) => string;
  growthRiskLabel: (flag?: string) => string;
  draftTone: (status?: string) => string;
  draftLabel: (status?: string) => string;
  summarizeText: (content?: string | null, maxLength?: number) => string;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Agent Growth</h2>
          <p className="text-sm text-slate-500">
            查看分池结果、手动重评成功任务沉淀出的 Skill
            草稿，以及雇主私有模板。
          </p>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-sm text-violet-800">
          已评估 {growthOverview?.evaluated_agents ?? 0} /{" "}
          {growthOverview?.total_agents ?? 0}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          title="已评估 Agent"
          value={growthOverview?.evaluated_agents ?? "—"}
          tone="emerald"
        />
        <StatCard
          title="可自动成长"
          value={growthOverview?.auto_growth_eligible ?? "—"}
          tone="amber"
        />
        <StatCard
          title="晋级候选"
          value={growthOverview?.promotion_candidates ?? "—"}
          tone="emerald"
        />
        <StatCard
          title="冷启动池"
          value={growthOverview?.by_maturity_pool?.cold_start ?? 0}
        />
        <StatCard
          title="经验卡总数"
          value={growthExperienceCardTotal}
          tone="slate"
        />
        <StatCard
          title="风险记忆总数"
          value={growthRiskMemoryTotal}
          tone="rose"
        />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">分池 Agent</h3>
              <p className="text-sm text-slate-500">
                支持按成熟度与主领域快速筛查
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {visibleGrowthProfiles.length}
            </span>
          </div>
          <div className="mb-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <div className="grid gap-3">
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">
                  成熟度
                </span>
                <select
                  value={growthPoolFilter}
                  onChange={(event) =>
                    setGrowthPoolFilter(event.target.value as GrowthPoolFilter)
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                >
                  <option value="all">全部</option>
                  <option value="cold_start">冷启动</option>
                  <option value="observed">观察中</option>
                  <option value="standard">标准</option>
                  <option value="preferred">优选</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">
                  主领域
                </span>
                <select
                  value={growthDomainFilter}
                  onChange={(event) =>
                    setGrowthDomainFilter(
                      event.target.value as GrowthDomainFilter,
                    )
                  }
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                >
                  <option value="all">全部</option>
                  <option value="automation">automation</option>
                  <option value="content">content</option>
                  <option value="data">data</option>
                  <option value="development">development</option>
                  <option value="support">support</option>
                </select>
              </label>
              <label className="block text-sm text-slate-600">
                <span className="mb-1 block font-medium text-slate-700">
                  关键字
                </span>
                <input
                  value={growthKeyword}
                  onChange={(event) => setGrowthKeyword(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                  placeholder="搜索 aid / domain / summary"
                />
              </label>
            </div>
          </div>
          <div className="space-y-3">
            {isProfilesLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载成长档案…
              </p>
            )}
            {!isProfilesLoading &&
              visibleGrowthProfiles.map((agent) => (
                <div
                  key={agent.aid}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{agent.aid}</p>
                      <p className="mt-1 text-sm text-slate-600">
                        {agent.model} · {agent.provider}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${agentStatusTone(agent.status)}`}
                    >
                      {agentStatusLabel(agent.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">
                      {growthPoolLabel(agent.current_maturity_pool)}
                    </span>
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">
                      {growthDomainLabel(agent.primary_domain)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {growthScopeLabel(agent.recommended_task_scope)}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${growthReadinessTone(agent.promotion_readiness_score)}`}
                    >
                      准备度 {agent.promotion_readiness_score}%
                    </span>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">
                      下一池 {growthPoolLabel(agent.recommended_next_pool)}
                    </span>
                    {agent.promotion_candidate && (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
                        晋级候选
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    完成 {agent.completed_task_count} · 活跃 Skill{" "}
                    {agent.active_skill_count} · 总任务 {agent.total_task_count}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    草稿 孵化中 {agent.incubating_draft_count} · 已验证{" "}
                    {agent.validated_draft_count} · 已发布{" "}
                    {agent.published_draft_count}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    雇主模板 {agent.employer_template_count} · 模板复用{" "}
                    {agent.template_reuse_count} · 自动沉淀{" "}
                    {agent.auto_growth_eligible ? "已就绪" : "待触发"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    经验卡 {agent.experience_card_count ?? 0} · 跨雇主验证{" "}
                    {agent.cross_employer_validated_count ?? 0} · 活跃风险{" "}
                    {agent.active_risk_memory_count ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    成长分 {agent.growth_score ?? "—"} · 风险分{" "}
                    {agent.risk_score ?? "—"}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {summarizeText(agent.evaluation_summary, 120)}
                  </p>
                  {(agent.suggested_actions || []).length > 0 && (
                    <div className="mt-3 rounded-xl bg-emerald-50 p-3">
                      <p className="text-xs font-medium text-emerald-900">
                        建议动作
                      </p>
                      <div className="mt-2 space-y-2">
                        {agent.suggested_actions.slice(0, 3).map((action) => (
                          <div
                            key={action}
                            className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700"
                          >
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {agent.risk_flags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {agent.risk_flags.map((flag) => (
                        <span
                          key={flag}
                          className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800"
                        >
                          {growthRiskLabel(flag)}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-label={`查看成长档案 ${agent.aid} 详情`}
                      onClick={() => openGrowthProfileDetail(agent)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看详情
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGrowthEvaluate(agent.aid)}
                      disabled={growthEvaluatePending}
                      className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:opacity-60"
                    >
                      {growthEvaluatePending ? "重评中..." : "重新评估"}
                    </button>
                  </div>
                </div>
              ))}
            {!isProfilesLoading && visibleGrowthProfiles.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前筛选条件下没有成长档案。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Skill Draft 审核</h3>
              <p className="text-sm text-slate-500">
                对成功任务沉淀的 Skill 草稿进行通过、发布或归档。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {visibleGrowthDrafts.length}
            </span>
          </div>
          <div className="mb-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                状态
              </span>
              <select
                value={growthDraftStatusFilter}
                onChange={(event) =>
                  setGrowthDraftStatusFilter(
                    event.target.value as
                      | "all"
                      | AdminAgentGrowthSkillDraftStatus,
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部</option>
                <option value="draft">草稿</option>
                <option value="incubating">孵化中</option>
                <option value="validated">已通过</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                关键字
              </span>
              <input
                value={growthDraftKeyword}
                onChange={(event) => setGrowthDraftKeyword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="搜索 title / aid / source task"
              />
            </label>
          </div>
          <div className="space-y-3">
            {isDraftsLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载 Skill 草稿…
              </p>
            )}
            {!isDraftsLoading &&
              visibleGrowthDrafts.map((draft) => (
                <div
                  key={draft.draft_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {draft.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{draft.aid}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${draftTone(draft.status)}`}
                    >
                      {draftLabel(draft.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {summarizeText(draft.summary, 120)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    来源任务：{draft.source_task_id} · 雇主：
                    {draft.employer_aid} · reward {draft.reward_snapshot}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-label={`查看 Skill Draft ${draft.title} 详情`}
                      onClick={() => openGrowthDraftDetail(draft)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看详情
                    </button>
                    {draft.status !== "validated" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleGrowthDraftAction(draft.draft_id, "validated")
                        }
                        disabled={growthDraftPending}
                        className="rounded-lg border border-sky-300 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                      >
                        通过
                      </button>
                    )}
                    {draft.status !== "published" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleGrowthDraftAction(draft.draft_id, "published")
                        }
                        disabled={growthDraftPending}
                        className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      >
                        发布
                      </button>
                    )}
                    {draft.status !== "archived" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleGrowthDraftAction(draft.draft_id, "archived")
                        }
                        disabled={growthDraftPending}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        归档
                      </button>
                    )}
                  </div>
                </div>
              ))}
            {!isDraftsLoading && visibleGrowthDrafts.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前还没有可审核的 Skill 草稿。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">雇主模板资产</h3>
              <p className="text-sm text-slate-500">
                查看成功任务为雇主沉淀下来的复用模板。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {employerTemplateItems.length}
            </span>
          </div>
          <div className="space-y-3">
            {isTemplatesLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载雇主模板…
              </p>
            )}
            {!isTemplatesLoading &&
              employerTemplateItems.map((template) => (
                <div
                  key={template.template_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {template.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {template.owner_aid}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">
                      {template.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {summarizeText(template.summary, 120)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    来源任务：{template.source_task_id} · 执行 Agent：
                    {template.worker_aid || "—"} · 复用 {template.reuse_count}
                  </p>
                  <div className="mt-3">
                    <button
                      type="button"
                      aria-label={`查看雇主模板 ${template.title} 详情`}
                      onClick={() => openEmployerTemplateDetail(template)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看详情
                    </button>
                  </div>
                </div>
              ))}
            {!isTemplatesLoading && employerTemplateItems.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前还没有雇主模板资产。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">雇主获赠 Skill</h3>
              <p className="text-sm text-slate-500">
                查看首单 OpenClaw 成功验收后，系统自动赠送给雇主的 Skill 资产。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {employerSkillGrantItems.length}
            </span>
          </div>
          <div className="space-y-3">
            {isGrantsLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载赠送 Skill…
              </p>
            )}
            {!isGrantsLoading &&
              employerSkillGrantItems.map((grant) => (
                <div
                  key={grant.grant_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {grant.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {grant.employer_aid}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
                      {grant.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {summarizeText(grant.summary, 120)}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    来源任务：{grant.source_task_id} · 执行 Agent：
                    {grant.worker_aid} · Skill：{grant.skill_id}
                  </p>
                  <div className="mt-3">
                    <button
                      type="button"
                      aria-label={`查看获赠 Skill ${grant.title} 详情`}
                      onClick={() => openEmployerSkillGrantDetail(grant)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看详情
                    </button>
                  </div>
                </div>
              ))}
            {!isGrantsLoading && employerSkillGrantItems.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前还没有获赠 Skill 资产。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Experience Cards</h3>
              <p className="text-sm text-slate-500">
                真实验收后沉淀的经验单元，可用于后续复用和验证。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {growthExperienceCardTotal}
            </span>
          </div>
          <div className="space-y-3">
            {isExperienceCardsLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载经验卡…
              </p>
            )}
            {!isExperienceCardsLoading &&
              visibleGrowthExperienceCards.slice(0, 8).map((card) => (
                <div
                  key={card.card_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{card.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{card.aid}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${growthExperienceTone(card)}`}
                    >
                      {card.is_cross_employer_validated
                        ? "跨雇主已验证"
                        : card.accepted_on_first_pass
                          ? "一次通过"
                          : "修订后通过"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {summarizeText(card.summary, 120)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                      {card.category || "uncategorized"}
                    </span>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-800">
                      质量分 {card.quality_score}
                    </span>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">
                      修订 {card.revision_count}
                    </span>
                    {card.delivery_latency_hours !== null &&
                      card.delivery_latency_hours !== undefined && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                          交付 {card.delivery_latency_hours}h
                        </span>
                      )}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    任务 {card.source_task_id} · 雇主 {card.employer_aid}
                  </p>
                </div>
              ))}
            {!isExperienceCardsLoading &&
              visibleGrowthExperienceCards.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  当前还没有经验卡沉淀。
                </p>
              )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">Risk Memories</h3>
              <p className="text-sm text-slate-500">
                记录返工、取消等风险事件，供晋级和风控使用。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {growthRiskMemoryTotal}
            </span>
          </div>
          <div className="space-y-3">
            {isRiskMemoriesLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载风险记忆…
              </p>
            )}
            {!isRiskMemoriesLoading &&
              visibleGrowthRiskMemories.slice(0, 8).map((risk) => (
                <div
                  key={risk.risk_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {risk.risk_type}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{risk.aid}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${growthRiskSeverityTone(risk.severity)}`}
                      >
                        {risk.severity || "unknown"}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${growthRiskStatusTone(risk.status)}`}
                      >
                        {risk.status || "unknown"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    触发事件：{risk.trigger_event}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {risk.category && (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {risk.category}
                      </span>
                    )}
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                      任务 {risk.source_task_id}
                    </span>
                    {risk.cooldown_until && (
                      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs text-rose-800">
                        冷却至 {risk.cooldown_until}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            {!isRiskMemoriesLoading &&
              visibleGrowthRiskMemories.length === 0 && (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  当前还没有风险记忆。
                </p>
              )}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-2">
        <StatCard title="已产出草稿" value={growthDraftTotal} tone="slate" />
        <StatCard
          title="已赠送 Skill"
          value={employerSkillGrantTotal}
          tone="emerald"
        />
      </div>
    </section>
  );
}

type AdminSectOpsEntry = {
  sectKey: string;
  memberCount: number;
  coreRealmCount: number;
  readyApplicants: number;
  diagnosticBacklog: number;
  transferWatchCount: number;
  activeTaskCount: number;
  forumPostCount: number;
  assetCount: number;
  heat: number;
};

type AdminSectOpsAgentItem = {
  aid: string;
  title: string;
  summary: string;
  sectKey: string;
  readinessScore?: number;
  currentSectKey?: string | null;
  recommendedSectKey?: string | null;
  stage?: string;
};

type AdminSectApplicationQueueItem = AdminSectOpsAgentItem & {
  application: AdminSectApplication;
  profile?: AdminAgentGrowthProfile;
};

function normalizeSectOpsKey(key?: string | null) {
  return getCultivationSectDetail(key || undefined)?.key || null;
}

export function AdminWorldOpsPanel({
  growthOverview,
  dojoOverview,
  growthProfiles,
  dojoBindings,
  sectApplications,
  taskItems,
  postItems,
  growthDraftItems,
  employerTemplateItems,
  employerSkillGrantItems,
  isLoading,
  openGrowthProfileDetail,
  handleReviewSectApplication,
  reviewSectApplicationPending,
  growthPoolLabel,
  growthDomainLabel,
  dojoStageLabel,
}: {
  growthOverview?: AdminAgentGrowthOverview;
  dojoOverview?: AdminDojoOverview;
  growthProfiles: AdminAgentGrowthProfile[];
  dojoBindings: AdminDojoBinding[];
  sectApplications: AdminSectApplication[];
  taskItems: AdminTask[];
  postItems: AdminForumPost[];
  growthDraftItems: AdminAgentGrowthSkillDraft[];
  employerTemplateItems: AdminEmployerTemplate[];
  employerSkillGrantItems: AdminEmployerSkillGrant[];
  isLoading: boolean;
  openGrowthProfileDetail: (profile: AdminAgentGrowthProfile) => void;
  handleReviewSectApplication: (payload: {
    applicationId: string;
    status: "approved" | "rejected";
  }) => void | Promise<void>;
  reviewSectApplicationPending: boolean;
  growthPoolLabel: (pool?: string) => string;
  growthDomainLabel: (domain?: string) => string;
  dojoStageLabel: (stage?: string) => string;
}) {
  const sectOps = useMemo(() => {
    const bindingByAid = new Map(
      dojoBindings.map((binding) => [binding.aid, binding]),
    );
    const profileByAid = new Map(
      growthProfiles.map((profile) => [profile.aid, profile]),
    );

    const resolveSectKeyForAid = (aid?: string | null) => {
      if (!aid) return null;
      const bindingSectKey = normalizeSectOpsKey(
        bindingByAid.get(aid)?.school_key,
      );
      if (bindingSectKey) return bindingSectKey;
      return normalizeSectOpsKey(
        getCultivationSectDetailByDomain(profileByAid.get(aid)?.primary_domain)
          ?.key,
      );
    };

    const entries = new Map<string, AdminSectOpsEntry>();
    CULTIVATION_SECT_DETAILS.forEach((sect) => {
      entries.set(sect.key, {
        sectKey: sect.key,
        memberCount: 0,
        coreRealmCount: 0,
        readyApplicants: 0,
        diagnosticBacklog: 0,
        transferWatchCount: 0,
        activeTaskCount: 0,
        forumPostCount: 0,
        assetCount: 0,
        heat: 0,
      });
    });

    const applicationQueue: AdminSectApplicationQueueItem[] = [];
    const transferQueue: Array<
      AdminSectOpsAgentItem & { profile: AdminAgentGrowthProfile }
    > = [];
    const diagnosticQueue: Array<
      AdminSectOpsAgentItem & { profile: AdminAgentGrowthProfile }
    > = [];

    growthProfiles.forEach((profile) => {
      const binding = bindingByAid.get(profile.aid);
      const currentSectKey =
        normalizeSectOpsKey(binding?.school_key) ||
        normalizeSectOpsKey(
          getCultivationSectDetailByDomain(profile.primary_domain)?.key,
        );
      const recommendedSectKey = normalizeSectOpsKey(
        getCultivationSectDetailByDomain(profile.primary_domain)?.key,
      );
      const reusableAssetCount =
        (profile.published_draft_count || 0) +
        (profile.validated_draft_count || 0) +
        (profile.incubating_draft_count || 0) +
        (profile.employer_template_count || 0);

      if (currentSectKey && entries.has(currentSectKey)) {
        const currentEntry = entries.get(currentSectKey)!;
        currentEntry.memberCount += 1;
        currentEntry.assetCount += reusableAssetCount;
        if (
          profile.current_maturity_pool === "standard" ||
          profile.current_maturity_pool === "preferred"
        ) {
          currentEntry.coreRealmCount += 1;
        }
        if (binding?.stage === "diagnostic") {
          currentEntry.diagnosticBacklog += 1;
        }
      }

      if (binding?.stage === "diagnostic" && currentSectKey) {
        diagnosticQueue.push({
          aid: profile.aid,
          title: `${profile.aid} · ${dojoStageLabel(binding.stage)}`,
          summary: `当前停留在 ${dojoStageLabel(binding.stage)}，建议优先补齐问心试炼后再推进宗门主线。`,
          sectKey: currentSectKey,
          currentSectKey,
          recommendedSectKey,
          stage: binding.stage,
          profile,
        });
      }

      if (
        currentSectKey &&
        recommendedSectKey &&
        currentSectKey !== recommendedSectKey &&
        entries.has(currentSectKey)
      ) {
        entries.get(currentSectKey)!.transferWatchCount += 1;
        transferQueue.push({
          aid: profile.aid,
          title: `${profile.aid} · ${formatCultivationSchoolLabel(currentSectKey)} → ${formatCultivationSchoolLabel(recommendedSectKey)}`,
          summary: `当前成长主域为 ${growthDomainLabel(profile.primary_domain)}，与当前宗门归属存在偏差，建议评估是否转宗。`,
          sectKey: currentSectKey,
          currentSectKey,
          recommendedSectKey,
          stage: binding?.stage,
          profile,
        });
      }
    });

    sectApplications.forEach((application) => {
      const targetSectKey = normalizeSectOpsKey(application.target_sect_key);
      if (!targetSectKey || !entries.has(targetSectKey)) return;

      const profile = profileByAid.get(application.aid);
      const binding = bindingByAid.get(application.aid);
      entries.get(targetSectKey)!.readyApplicants += 1;
      applicationQueue.push({
        aid: application.aid,
        title: `${application.aid} → ${formatCultivationSchoolLabel(targetSectKey)}`,
        summary: application.summary,
        sectKey: targetSectKey,
        readinessScore: application.readiness_score,
        currentSectKey: normalizeSectOpsKey(application.current_sect_key),
        recommendedSectKey: normalizeSectOpsKey(
          application.recommended_sect_key,
        ),
        stage: binding?.stage,
        application,
        profile,
      });
    });

    taskItems.forEach((task) => {
      if (
        !["open", "assigned", "in_progress", "submitted"].includes(task.status)
      )
        return;
      const sectKey =
        normalizeSectOpsKey(
          resolveSectKeyForAid(task.worker_aid || undefined),
        ) ||
        normalizeSectOpsKey(
          inferCultivationSectKeyFromText(
            `${task.title} ${task.description || ""} ${task.requirements || ""}`,
          ),
        );
      if (!sectKey || !entries.has(sectKey)) return;
      entries.get(sectKey)!.activeTaskCount += 1;
    });

    postItems.forEach((post) => {
      const sectKey =
        normalizeSectOpsKey(resolveSectKeyForAid(post.author_aid)) ||
        normalizeSectOpsKey(
          inferCultivationSectKeyFromText(
            `${post.title} ${post.content || ""} ${post.category || ""}`,
          ),
        );
      if (!sectKey || !entries.has(sectKey)) return;
      entries.get(sectKey)!.forumPostCount += 1;
    });

    growthDraftItems.forEach((draft) => {
      const sectKey =
        normalizeSectOpsKey(resolveSectKeyForAid(draft.aid)) ||
        normalizeSectOpsKey(
          inferCultivationSectKeyFromText(
            `${draft.title} ${draft.summary} ${draft.category || ""}`,
          ),
        );
      if (!sectKey || !entries.has(sectKey)) return;
      entries.get(sectKey)!.assetCount += 1;
    });

    employerTemplateItems.forEach((template) => {
      const sectKey =
        normalizeSectOpsKey(
          resolveSectKeyForAid(template.worker_aid || template.owner_aid),
        ) ||
        normalizeSectOpsKey(
          inferCultivationSectKeyFromText(
            `${template.title} ${template.summary}`,
          ),
        );
      if (!sectKey || !entries.has(sectKey)) return;
      entries.get(sectKey)!.assetCount += 1;
    });

    employerSkillGrantItems.forEach((grant) => {
      const sectKey =
        normalizeSectOpsKey(resolveSectKeyForAid(grant.worker_aid)) ||
        normalizeSectOpsKey(
          inferCultivationSectKeyFromText(
            `${grant.title} ${grant.summary} ${grant.category || ""}`,
          ),
        );
      if (!sectKey || !entries.has(sectKey)) return;
      entries.get(sectKey)!.assetCount += 1;
    });

    const rankedEntries = Array.from(entries.values())
      .map((entry) => ({
        ...entry,
        heat:
          entry.memberCount * 5 +
          entry.coreRealmCount * 6 +
          entry.readyApplicants * 4 +
          entry.activeTaskCount * 3 +
          entry.assetCount * 2 +
          entry.forumPostCount,
      }))
      .sort((left, right) => right.heat - left.heat);

    return {
      entries: rankedEntries,
      applicationQueue: applicationQueue
        .sort(
          (left, right) =>
            (right.readinessScore || 0) - (left.readinessScore || 0),
        )
        .slice(0, 6),
      transferQueue: transferQueue.slice(0, 6),
      diagnosticQueue: diagnosticQueue.slice(0, 6),
      totalMembers: rankedEntries.reduce(
        (sum, entry) => sum + entry.memberCount,
        0,
      ),
      totalReadyApplicants: rankedEntries.reduce(
        (sum, entry) => sum + entry.readyApplicants,
        0,
      ),
      totalTransferWatch: rankedEntries.reduce(
        (sum, entry) => sum + entry.transferWatchCount,
        0,
      ),
      totalDiagnosticBacklog: rankedEntries.reduce(
        (sum, entry) => sum + entry.diagnosticBacklog,
        0,
      ),
    };
  }, [
    dojoBindings,
    employerSkillGrantItems,
    employerTemplateItems,
    growthDomainLabel,
    growthDraftItems,
    growthProfiles,
    postItems,
    sectApplications,
    taskItems,
    dojoStageLabel,
  ]);

  return (
    <>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="宗门成员总数"
          value={sectOps.totalMembers}
          tone="emerald"
        />
        <StatCard
          title="可申请 / 待审议"
          value={sectOps.totalReadyApplicants}
          tone="amber"
        />
        <StatCard
          title="转宗观察对象"
          value={sectOps.totalTransferWatch}
          tone="rose"
        />
        <StatCard
          title="问心堵塞对象"
          value={sectOps.totalDiagnosticBacklog}
          tone="slate"
        />
      </section>

      <section className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              宗门运营总览
            </h2>
            <p className="text-sm text-slate-500">
              把成长分池、道场绑定、任务热度和资产沉淀统一映射到四大宗门，方便运营判断哪里要补人、补题或补流量。
            </p>
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-sm text-violet-800">
            已评估 {growthOverview?.evaluated_agents ?? growthProfiles.length} ·
            绑定 {dojoOverview?.active_coach_bindings ?? dojoBindings.length}
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {sectOps.entries.map((entry, index) => {
            const sect = getCultivationSectDetail(entry.sectKey);
            if (!sect) return null;
            return (
              <div
                key={entry.sectKey}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-primary-700">
                      第 {index + 1} 位 · {sect.alias}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">
                      {sect.title}
                    </h3>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                    热度 {entry.heat}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-xs text-slate-500">成员</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {entry.memberCount}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-xs text-slate-500">金丹以上</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {entry.coreRealmCount}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-xs text-slate-500">待入宗</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {entry.readyApplicants}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="text-xs text-slate-500">诊断堵塞</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {entry.diagnosticBacklog}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <SummaryChip
                    label="活跃任务"
                    value={entry.activeTaskCount}
                    tone="bg-sky-100 text-sky-800"
                  />
                  <SummaryChip
                    label="帖子"
                    value={entry.forumPostCount}
                    tone="bg-violet-100 text-violet-800"
                  />
                  <SummaryChip
                    label="资产"
                    value={entry.assetCount}
                    tone="bg-emerald-100 text-emerald-800"
                  />
                  <SummaryChip
                    label="转宗观察"
                    value={entry.transferWatchCount}
                    tone="bg-amber-100 text-amber-800"
                  />
                </div>
              </div>
            );
          })}
        </div>
        {isLoading && (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            正在加载宗门运营数据…
          </p>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                待入宗 / 待审议
              </h2>
              <p className="text-sm text-slate-500">
                这里展示已正式提交的宗门申请，运营可直接通过或驳回。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {sectOps.applicationQueue.length}
            </span>
          </div>
          <div className="space-y-3">
            {sectOps.applicationQueue.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前没有正式提交、等待审核的宗门申请。
              </p>
            ) : (
              sectOps.applicationQueue.map((item) => (
                <div
                  key={item.application.application_id}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.application.application_type === "transfer"
                          ? "转宗审议"
                          : "入宗申请"}{" "}
                        · 准备度 {item.readinessScore}% · 当前{" "}
                        {formatCultivationSchoolLabel(
                          item.currentSectKey || undefined,
                        )}
                      </p>
                    </div>
                    {item.profile ? (
                      <button
                        type="button"
                        onClick={() =>
                          openGrowthProfileDetail(
                            item.profile as AdminAgentGrowthProfile,
                          )
                        }
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        查看档案
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.profile ? (
                      <>
                        <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">
                          {growthPoolLabel(item.profile.current_maturity_pool)}
                        </span>
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">
                          {growthDomainLabel(item.profile.primary_domain)}
                        </span>
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        成长档案加载中
                      </span>
                    )}
                    {item.recommendedSectKey &&
                      item.recommendedSectKey !== item.sectKey && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800">
                          系统推荐{" "}
                          {formatCultivationSchoolLabel(
                            item.recommendedSectKey,
                          )}
                        </span>
                      )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={reviewSectApplicationPending}
                      onClick={() =>
                        handleReviewSectApplication({
                          applicationId: item.application.application_id,
                          status: "approved",
                        })
                      }
                      className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      通过申请
                    </button>
                    <button
                      type="button"
                      disabled={reviewSectApplicationPending}
                      onClick={() =>
                        handleReviewSectApplication({
                          applicationId: item.application.application_id,
                          status: "rejected",
                        })
                      }
                      className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      驳回申请
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">转宗观察</h2>
              <p className="text-sm text-slate-500">
                当前成长主域与宗门归属不一致的对象，适合人工复核是否转宗。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {sectOps.transferQueue.length}
            </span>
          </div>
          <div className="space-y-3">
            {sectOps.transferQueue.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前没有明显的转宗偏差对象。
              </p>
            ) : (
              sectOps.transferQueue.map((item) => (
                <div
                  key={`${item.aid}-${item.currentSectKey}-${item.recommendedSectKey}`}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        当前阶段 {dojoStageLabel(item.stage)} · 当前修为{" "}
                        {growthPoolLabel(item.profile.current_maturity_pool)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openGrowthProfileDetail(item.profile)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看档案
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">问心堵塞</h2>
              <p className="text-sm text-slate-500">
                长期停留在问心试炼的对象，需要补题、补教练或补样本。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {sectOps.diagnosticQueue.length}
            </span>
          </div>
          <div className="space-y-3">
            {sectOps.diagnosticQueue.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前没有明显的问心堵塞对象。
              </p>
            ) : (
              sectOps.diagnosticQueue.map((item) => (
                <div
                  key={`${item.aid}-${item.stage}`}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        宗门 {formatCultivationSchoolLabel(item.sectKey)} · 主域{" "}
                        {growthDomainLabel(item.profile.primary_domain)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openGrowthProfileDetail(item.profile)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      查看档案
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{item.summary}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export function AdminDojoPanel({
  dojoOverview,
  dojoCoachItems,
  dojoBindingItems,
  visibleDojoCoaches,
  visibleDojoBindings,
  visibleDojoAgents,
  dojoDraftFilters,
  setDojoDraftFilters,
  applyDojoFilters,
  resetDojoFilters,
  openGrowthProfileDetail,
  handleAssignDojoCoach,
  dojoAssignPending,
  isOverviewLoading,
  isCoachesLoading,
  isBindingsLoading,
  dojoSchoolLabel,
  dojoStageLabel,
  dojoStageTone,
  growthPoolLabel,
  growthDomainLabel,
  highlightAid,
}: {
  dojoOverview?: AdminDojoOverview;
  dojoCoachItems: AdminDojoCoachProfile[];
  dojoBindingItems: AdminDojoBinding[];
  visibleDojoCoaches: AdminDojoCoachProfile[];
  visibleDojoBindings: AdminDojoBinding[];
  visibleDojoAgents: AdminAgentGrowthProfile[];
  dojoDraftFilters: {
    keyword: string;
    stage: string;
    schoolKey: string;
  };
  setDojoDraftFilters: Dispatch<
    SetStateAction<{
      keyword: string;
      stage: string;
      schoolKey: string;
    }>
  >;
  applyDojoFilters: (event: FormEvent<HTMLFormElement>) => void;
  resetDojoFilters: () => void;
  openGrowthProfileDetail: (profile: AdminAgentGrowthProfile) => void;
  handleAssignDojoCoach: (payload: {
    aid: string;
    primaryCoachAid?: string;
    shadowCoachAid?: string;
    schoolKey?: string;
    stage?: string;
  }) => void | Promise<void>;
  dojoAssignPending: boolean;
  isOverviewLoading: boolean;
  isCoachesLoading: boolean;
  isBindingsLoading: boolean;
  dojoSchoolLabel: (key?: string) => string;
  dojoStageLabel: (stage?: string) => string;
  dojoStageTone: (stage?: string) => string;
  growthPoolLabel: (pool?: string) => string;
  growthDomainLabel: (domain?: string) => string;
  highlightAid?: string;
}) {
  const [assignDrafts, setAssignDrafts] = useState<
    Record<
      string,
      {
        primaryCoachAid: string;
        shadowCoachAid: string;
        schoolKey: string;
        stage: string;
      }
    >
  >({});

  function deriveSchoolKey(agent: AdminAgentGrowthProfile) {
    if (
      agent.primary_domain === "automation" ||
      agent.primary_domain === "development"
    )
      return "automation_ops";
    if (agent.primary_domain === "content") return "content_ops";
    if (agent.primary_domain === "data") return "research_ops";
    if (agent.primary_domain === "support") return "service_ops";
    return "generalist";
  }

  function readDraft(aid: string, agent: AdminAgentGrowthProfile) {
    const existingBinding = dojoBindingItems.find(
      (binding) => binding.aid === aid,
    );
    return (
      assignDrafts[aid] || {
        primaryCoachAid:
          existingBinding?.primary_coach_aid || "official://dojo/general-coach",
        shadowCoachAid: existingBinding?.shadow_coach_aid || "",
        schoolKey: existingBinding?.school_key || deriveSchoolKey(agent),
        stage: existingBinding?.stage || "diagnostic",
      }
    );
  }

  const prioritizedBindings = useMemo(() => {
    if (!highlightAid) return visibleDojoBindings;
    return [...visibleDojoBindings].sort((left, right) => {
      if (left.aid === highlightAid) return -1;
      if (right.aid === highlightAid) return 1;
      return 0;
    });
  }, [highlightAid, visibleDojoBindings]);

  const prioritizedAgents = useMemo(() => {
    if (!highlightAid) return visibleDojoAgents;
    return [...visibleDojoAgents].sort((left, right) => {
      if (left.aid === highlightAid) return -1;
      if (right.aid === highlightAid) return 1;
      return 0;
    });
  }, [highlightAid, visibleDojoAgents]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="活跃教练"
          value={dojoOverview?.total_coaches ?? "—"}
          tone="emerald"
        />
        <StatCard
          title="已绑定 Agent"
          value={dojoOverview?.active_coach_bindings ?? "—"}
          tone="slate"
        />
        <StatCard
          title="活跃修复计划"
          value={dojoOverview?.active_plans ?? "—"}
          tone="amber"
        />
        <StatCard
          title="开放错题"
          value={dojoOverview?.open_mistakes ?? "—"}
          tone={(dojoOverview?.open_mistakes || 0) > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">道场总览</h2>
            <p className="text-sm text-slate-500">
              聚焦教练绑定、训练阶段推进和纠错压力。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {isOverviewLoading
              ? "加载中"
              : `高危错题 ${dojoOverview?.high_severity_mistakes ?? 0}`}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="诊断阶段"
            value={dojoOverview?.diagnostic_stage_agents ?? "—"}
            tone="amber"
          />
          <StatCard
            title="训练阶段"
            value={dojoOverview?.practice_stage_agents ?? "—"}
            tone="slate"
          />
          <StatCard
            title="待上场"
            value={dojoOverview?.arena_ready_agents ?? "—"}
            tone="emerald"
          />
          <StatCard
            title="高危错题"
            value={dojoOverview?.high_severity_mistakes ?? "—"}
            tone="rose"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(dojoOverview?.by_school || {}).map(
            ([schoolKey, count]) => (
              <SummaryChip
                key={schoolKey}
                label={dojoSchoolLabel(schoolKey)}
                value={count}
                tone="bg-slate-100 text-slate-700"
              />
            ),
          )}
          {Object.keys(dojoOverview?.by_school || {}).length === 0 && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
              当前还没有绑定分布
            </span>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">筛选与分配</h2>
            <p className="text-sm text-slate-500">
              先筛人，再直接分配教练和学校流派。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            当前绑定 {dojoBindingItems.length}
          </span>
        </div>
        <form
          className="grid gap-3 rounded-xl border border-slate-200 p-4 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.7fr))_auto]"
          onSubmit={applyDojoFilters}
        >
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">
              关键字
            </span>
            <input
              value={dojoDraftFilters.keyword}
              onChange={(event) =>
                setDojoDraftFilters((current) => ({
                  ...current,
                  keyword: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              placeholder="搜索 aid / coach / school"
            />
          </label>
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">阶段</span>
            <select
              value={dojoDraftFilters.stage}
              onChange={(event) =>
                setDojoDraftFilters((current) => ({
                  ...current,
                  stage: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
            >
              <option value="all">全部</option>
              <option value="diagnostic">入门诊断</option>
              <option value="practice">训练场</option>
              <option value="arena_ready">待上场</option>
              <option value="arena">演武场</option>
            </select>
          </label>
          <label className="block text-sm text-slate-600">
            <span className="mb-1 block font-medium text-slate-700">宗门</span>
            <select
              value={dojoDraftFilters.schoolKey}
              onChange={(event) =>
                setDojoDraftFilters((current) => ({
                  ...current,
                  schoolKey: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
            >
              <option value="all">全部</option>
              <option value="generalist">散修</option>
              <option value="automation_ops">铸器谷</option>
              <option value="content_ops">御灵宗</option>
              <option value="research_ops">天机阁</option>
              <option value="service_ops">玄心殿</option>
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              应用
            </button>
            <button
              type="button"
              onClick={resetDojoFilters}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              重置
            </button>
          </div>
        </form>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">当前绑定</h3>
              <p className="text-sm text-slate-500">
                查看已经进入道场的 Agent。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {visibleDojoBindings.length}
            </span>
          </div>
          <div className="space-y-3">
            {isBindingsLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载道场绑定…
              </p>
            )}
            {!isBindingsLoading &&
              prioritizedBindings.slice(0, 10).map((binding) => (
                <div
                  key={binding.aid}
                  className={`rounded-xl border px-4 py-3 ${highlightAid === binding.aid ? "border-primary-300 bg-primary-50" : "border-slate-200"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {binding.aid}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {binding.primary_coach_aid}
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                        {dojoSchoolLabel(binding.school_key)}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs ${dojoStageTone(binding.stage)}`}
                      >
                        {dojoStageLabel(binding.stage)}
                      </span>
                    </div>
                  </div>
                  {binding.shadow_coach_aid && (
                    <p className="mt-2 text-xs text-slate-500">
                      Shadow coach：{binding.shadow_coach_aid}
                    </p>
                  )}
                </div>
              ))}
            {!isBindingsLoading && prioritizedBindings.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前还没有已绑定的道场 Agent。
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">教练名册</h3>
              <p className="text-sm text-slate-500">
                教练是第一类角色，可以挂不同流派。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {visibleDojoCoaches.length}
            </span>
          </div>
          <div className="space-y-3">
            {isCoachesLoading && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在加载教练名册…
              </p>
            )}
            {!isCoachesLoading &&
              visibleDojoCoaches.map((coach) => (
                <div
                  key={coach.coach_aid}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {coach.coach_aid}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{coach.bio}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs text-emerald-800">
                      {coach.status}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(coach.schools || []).map((school) => (
                      <span
                        key={school}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                      >
                        {dojoSchoolLabel(school)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            {!isCoachesLoading && visibleDojoCoaches.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前筛选下没有教练。
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900">候选 Agent 分配台</h3>
            <p className="text-sm text-slate-500">
              从成长池选人，直接绑定教练并推进到对应阶段。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
            {prioritizedAgents.length}
          </span>
        </div>
        <div className="space-y-4">
          {prioritizedAgents.slice(0, 12).map((agent) => {
            const draft = readDraft(agent.aid, agent);
            const currentBinding = dojoBindingItems.find(
              (binding) => binding.aid === agent.aid,
            );
            return (
              <div
                key={agent.aid}
                className={`rounded-2xl border p-4 ${highlightAid === agent.aid ? "border-primary-300 bg-primary-50" : "border-slate-200"}`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{agent.aid}</p>
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800">
                        {growthDomainLabel(agent.primary_domain)}
                      </span>
                      <span className="rounded-full bg-violet-100 px-3 py-1 text-xs text-violet-800">
                        {growthPoolLabel(agent.current_maturity_pool)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {agent.model} · {agent.provider}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      {agent.evaluation_summary}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>完成任务 {agent.completed_task_count}</span>
                      <span>·</span>
                      <span>成长分 {agent.growth_score ?? 0}</span>
                      <span>·</span>
                      <span>风险分 {agent.risk_score ?? 0}</span>
                    </div>
                    {currentBinding && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                          当前教练 {currentBinding.primary_coach_aid}
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                          {dojoSchoolLabel(currentBinding.school_key)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs ${dojoStageTone(currentBinding.stage)}`}
                        >
                          {dojoStageLabel(currentBinding.stage)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3 xl:min-w-[440px] xl:grid-cols-2">
                    <label className="block text-sm text-slate-600">
                      <span className="mb-1 block font-medium text-slate-700">
                        Primary coach
                      </span>
                      <input
                        list="dojo-coach-options"
                        value={draft.primaryCoachAid}
                        onChange={(event) =>
                          setAssignDrafts((current) => ({
                            ...current,
                            [agent.aid]: {
                              ...draft,
                              primaryCoachAid: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                        placeholder="official://dojo/general-coach"
                      />
                    </label>
                    <label className="block text-sm text-slate-600">
                      <span className="mb-1 block font-medium text-slate-700">
                        Shadow coach
                      </span>
                      <input
                        list="dojo-coach-options"
                        value={draft.shadowCoachAid}
                        onChange={(event) =>
                          setAssignDrafts((current) => ({
                            ...current,
                            [agent.aid]: {
                              ...draft,
                              shadowCoachAid: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                        placeholder="可留空"
                      />
                    </label>
                    <label className="block text-sm text-slate-600">
                      <span className="mb-1 block font-medium text-slate-700">
                        宗门
                      </span>
                      <select
                        value={draft.schoolKey}
                        onChange={(event) =>
                          setAssignDrafts((current) => ({
                            ...current,
                            [agent.aid]: {
                              ...draft,
                              schoolKey: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                      >
                        <option value="generalist">散修</option>
                        <option value="automation_ops">铸器谷</option>
                        <option value="content_ops">御灵宗</option>
                        <option value="research_ops">天机阁</option>
                        <option value="service_ops">玄心殿</option>
                      </select>
                    </label>
                    <label className="block text-sm text-slate-600">
                      <span className="mb-1 block font-medium text-slate-700">
                        阶段
                      </span>
                      <select
                        value={draft.stage}
                        onChange={(event) =>
                          setAssignDrafts((current) => ({
                            ...current,
                            [agent.aid]: {
                              ...draft,
                              stage: event.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                      >
                        <option value="diagnostic">入门诊断</option>
                        <option value="practice">训练场</option>
                        <option value="arena_ready">待上场</option>
                        <option value="arena">演武场</option>
                      </select>
                    </label>
                    <div className="xl:col-span-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openGrowthProfileDetail(agent)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        查看成长档案
                      </button>
                      <button
                        type="button"
                        disabled={dojoAssignPending}
                        onClick={() =>
                          handleAssignDojoCoach({
                            aid: agent.aid,
                            primaryCoachAid: draft.primaryCoachAid,
                            shadowCoachAid: draft.shadowCoachAid || undefined,
                            schoolKey: draft.schoolKey,
                            stage: draft.stage,
                          })
                        }
                        className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {dojoAssignPending ? "绑定中..." : "保存道场绑定"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {prioritizedAgents.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              当前筛选下没有候选 Agent。
            </p>
          )}
        </div>
        <datalist id="dojo-coach-options">
          {dojoCoachItems.map((coach) => (
            <option key={coach.coach_aid} value={coach.coach_aid}>
              {coach.coach_type}
            </option>
          ))}
        </datalist>
      </div>
    </section>
  );
}

type PostDraftFilters = {
  status: string;
  category: string;
  authorAid: string;
};

type TaskDraftFilters = {
  status: "all" | AdminTaskStatus;
  employerAid: string;
};

type ConsistencySummary = {
  total_issues?: number;
  open_with_lifecycle_fields?: number;
  in_progress_missing_assignment?: number;
  completed_missing_completed_at?: number;
  cancelled_missing_cancelled_at?: number;
};

export function AdminContentPanel({
  postItems,
  postTotal,
  forumPostsTotal,
  postDraftFilters,
  setPostDraftFilters,
  applyPostFilters,
  resetPostFilters,
  postStatusSummary,
  selectedPostIds,
  setSelectedPostIds,
  handleBatchPostAction,
  handleTogglePostSelection,
  handlePostAction,
  openPostDetail,
  contentTone,
  statusLabel,
  formatTime,
}: {
  postItems: AdminForumPost[];
  postTotal: number;
  forumPostsTotal: number;
  postDraftFilters: PostDraftFilters;
  setPostDraftFilters: Dispatch<SetStateAction<PostDraftFilters>>;
  applyPostFilters: (event: FormEvent<HTMLFormElement>) => void;
  resetPostFilters: () => void;
  postStatusSummary: Record<string, number>;
  selectedPostIds: string[];
  setSelectedPostIds: Dispatch<SetStateAction<string[]>>;
  handleBatchPostAction: (
    status: "published" | "hidden" | "deleted",
  ) => void | Promise<void>;
  handleTogglePostSelection: (postId: string) => void;
  handlePostAction: (
    postId: string | number,
    status: "published" | "hidden" | "deleted",
  ) => void | Promise<void>;
  openPostDetail: (post: AdminForumPost) => void;
  contentTone: (status?: string) => string;
  statusLabel: (status?: string) => string;
  formatTime: (value?: string | null) => string;
}) {
  return (
    <section className="grid gap-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">内容审核</h2>
            <p className="text-sm text-slate-500">
              按状态、作者和分类筛选帖子并处理评论。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            {postItems.length} / {postTotal || forumPostsTotal}
          </span>
        </div>
        <form
          className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4"
          onSubmit={applyPostFilters}
        >
          <div className="grid gap-3 xl:grid-cols-3">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                状态
              </span>
              <select
                value={postDraftFilters.status}
                onChange={(event) =>
                  setPostDraftFilters((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部</option>
                <option value="published">已发布</option>
                <option value="hidden">已隐藏</option>
                <option value="deleted">已删除</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                分类
              </span>
              <input
                value={postDraftFilters.category}
                onChange={(event) =>
                  setPostDraftFilters((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="如：ops"
              />
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                作者 AID
              </span>
              <input
                value={postDraftFilters.authorAid}
                onChange={(event) =>
                  setPostDraftFilters((current) => ({
                    ...current,
                    authorAid: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="agent://..."
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              应用筛选
            </button>
            <button
              type="button"
              onClick={resetPostFilters}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              重置
            </button>
          </div>
        </form>
        <div className="mb-4 flex flex-wrap gap-2">
          <SummaryChip
            label="已发布"
            value={postStatusSummary.published || 0}
            tone="bg-emerald-100 text-emerald-800"
          />
          <SummaryChip
            label="已隐藏"
            value={postStatusSummary.hidden || 0}
            tone="bg-amber-100 text-amber-800"
          />
          <SummaryChip
            label="已删除"
            value={postStatusSummary.deleted || 0}
            tone="bg-rose-100 text-rose-800"
          />
        </div>
        {selectedPostIds.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span>已选 {selectedPostIds.length} 篇帖子</span>
            <button
              type="button"
              onClick={() => handleBatchPostAction("published")}
              className="rounded-lg border border-emerald-300 px-3 py-1 text-emerald-700 hover:bg-emerald-50"
            >
              批量恢复
            </button>
            <button
              type="button"
              onClick={() => handleBatchPostAction("hidden")}
              className="rounded-lg border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-50"
            >
              批量隐藏
            </button>
            <button
              type="button"
              onClick={() => handleBatchPostAction("deleted")}
              className="rounded-lg border border-rose-300 px-3 py-1 text-rose-700 hover:bg-rose-50"
            >
              批量删除
            </button>
            <button
              type="button"
              onClick={() => setSelectedPostIds([])}
              className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100"
            >
              清空选择
            </button>
          </div>
        )}
        <div className="space-y-3">
          {postItems.map((post) => (
            <div
              key={`${post.id}-${post.post_id || ""}`}
              className="rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`选择帖子 ${post.title}`}
                    checked={selectedPostIds.includes(
                      String(post.post_id || post.id),
                    )}
                    onChange={() =>
                      handleTogglePostSelection(String(post.post_id || post.id))
                    }
                  />
                  <p className="font-medium text-slate-900">{post.title}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${contentTone(post.status)}`}
                  >
                    {statusLabel(post.status)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                    {post.category || "general"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">{post.author_aid}</p>
              <p className="mt-1 text-xs text-slate-500">
                评论 {post.comment_count || 0} · 点赞 {post.like_count || 0} ·{" "}
                {formatTime(post.created_at)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {post.status !== "published" && (
                  <button
                    type="button"
                    onClick={() =>
                      handlePostAction(post.post_id || post.id, "published")
                    }
                    className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                  >
                    恢复发布
                  </button>
                )}
                {post.status !== "hidden" && post.status !== "deleted" && (
                  <button
                    type="button"
                    onClick={() =>
                      handlePostAction(post.post_id || post.id, "hidden")
                    }
                    className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
                  >
                    隐藏
                  </button>
                )}
                {post.status !== "deleted" && (
                  <button
                    type="button"
                    onClick={() =>
                      handlePostAction(post.post_id || post.id, "deleted")
                    }
                    className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                  >
                    删除
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`查看帖子 ${post.title} 详情`}
                  onClick={() => openPostDetail(post)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看详情
                </button>
              </div>
            </div>
          ))}
          {postItems.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              当前筛选条件下没有帖子。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export function AdminTaskOperationsPanel({
  taskItems,
  recentTasksCount,
  taskDraftFilters,
  setTaskDraftFilters,
  applyTaskFilters,
  resetTaskFilters,
  taskStatusSummary,
  consistencySummary,
  consistencyExamples,
  handleNormalizeLegacyAssignedTasks,
  handleRecordTaskOps,
  normalizeLegacyAssignedPending,
  recordTaskOpsPending,
  taskOpsAuditItems,
  taskStatusTone,
  taskStatusLabel,
  summarizeText,
  openTaskDetail,
  formatTime,
}: {
  taskItems: AdminTask[];
  recentTasksCount: number;
  taskDraftFilters: TaskDraftFilters;
  setTaskDraftFilters: Dispatch<SetStateAction<TaskDraftFilters>>;
  applyTaskFilters: (event: FormEvent<HTMLFormElement>) => void;
  resetTaskFilters: () => void;
  taskStatusSummary: Record<string, number>;
  consistencySummary?: ConsistencySummary;
  consistencyExamples: Array<{
    task_id: string;
    status: string;
    issue: string;
  }>;
  handleNormalizeLegacyAssignedTasks: () => void | Promise<void>;
  handleRecordTaskOps: (payload: {
    taskId: string;
    queue: "legacy_assigned" | "submitted" | "anomaly" | "cancelled_settlement";
    disposition: "checked" | "follow_up";
    issue?: string | null;
    taskStatus?: string | null;
  }) => void | Promise<void>;
  normalizeLegacyAssignedPending: boolean;
  recordTaskOpsPending: boolean;
  taskOpsAuditItems: AdminAuditLog[];
  taskStatusTone: (status?: string) => string;
  taskStatusLabel: (status?: string) => string;
  summarizeText: (content?: string | null, maxLength?: number) => string;
  openTaskDetail: (task: AdminTask) => void;
  formatTime: (value?: string | null) => string;
}) {
  const consistencyIssueCount = consistencySummary?.total_issues || 0;
  const legacyAssignedCount = taskStatusSummary.assigned || 0;
  const submittedCount = taskStatusSummary.submitted || 0;
  const visibleTaskCount = taskItems.length || recentTasksCount;
  const taskMap = new Map(taskItems.map((task) => [task.task_id, task]));
  const taskOpsLatestRecordMap = new Map<string, TaskOpsLatestRecord>();

  taskOpsAuditItems.forEach((log) => {
    if (!log.resource_id) return;
    if (taskOpsLatestRecordMap.has(log.resource_id)) return;
    const disposition = readAuditDetailString(log.details, "disposition");
    taskOpsLatestRecordMap.set(log.resource_id, {
      disposition:
        disposition === "checked" || disposition === "follow_up"
          ? disposition
          : undefined,
      note: readAuditDetailString(log.details, "note"),
      createdAt: log.created_at,
    });
  });

  const enrichTaskOpsItem = (item: TaskOpsQueueItem): TaskOpsQueueItem => {
    const latestRecord = item.task
      ? taskOpsLatestRecordMap.get(item.task.task_id)
      : undefined;
    const sla = item.task ? deriveTaskOpsSla(item.task) : null;
    return {
      ...item,
      slaLevel: item.queue === "anomaly" ? "critical" : sla?.level,
      slaLabel: item.queue === "anomaly" ? "数据异常" : sla?.label,
      slaHours: sla?.hours,
      latestDisposition: latestRecord?.disposition,
      latestNote: latestRecord?.note,
      latestRecordedAt: latestRecord?.createdAt
        ? formatTime(latestRecord.createdAt)
        : undefined,
    };
  };

  const legacyAssignedQueueItems: TaskOpsQueueItem[] = taskItems
    .filter((task) => task.status === "assigned")
    .map((task) => ({
      key: `legacy-${task.task_id}`,
      title: task.title,
      note: task.escrow_id
        ? `已分配给 ${task.worker_aid || "未知 worker"}，但仍停留在 legacy assigned。`
        : "已分配但缺少 escrow_id，暂不建议自动归一化。",
      meta: `雇主 ${task.employer_aid} · ${task.escrow_id ? `Escrow ${task.escrow_id}` : "Escrow 待补"}`,
      queue: "legacy_assigned" as const,
      task,
    }))
    .map(enrichTaskOpsItem);
  const submittedQueueItems: TaskOpsQueueItem[] = taskItems
    .filter((task) => task.status === "submitted")
    .map((task) => ({
      key: `submitted-${task.task_id}`,
      title: task.title,
      note: `Worker ${task.worker_aid || "未记录"} 已提交交付，等待 employer 决策。`,
      meta: `雇主 ${task.employer_aid} · Reward ${task.reward}`,
      queue: "submitted" as const,
      task,
    }))
    .map(enrichTaskOpsItem);
  const cancelledSettlementQueueItems: TaskOpsQueueItem[] = taskItems
    .filter((task) => task.status === "cancelled" && Boolean(task.escrow_id))
    .map((task) => ({
      key: `cancelled-${task.task_id}`,
      title: task.title,
      note: "已取消且带 escrow 轨迹，建议核对退款、冻结余额和通知解释。",
      meta: `${task.escrow_id} · 取消时间 ${task.cancelled_at ? formatTime(task.cancelled_at) : "待补"}`,
      queue: "cancelled_settlement" as const,
      task,
    }))
    .map(enrichTaskOpsItem);
  const anomalyQueueItemMap = new Map<string, TaskOpsQueueItem>();

  consistencyExamples.forEach((example) => {
    const task = taskMap.get(example.task_id);
    anomalyQueueItemMap.set(`${example.task_id}:${example.issue}`, {
      key: `consistency-${example.task_id}-${example.issue}`,
      title: task?.title || example.task_id,
      note: example.issue,
      meta: task
        ? `${taskStatusLabel(task.status)} · 雇主 ${task.employer_aid}`
        : taskStatusLabel(example.status),
      queue: "anomaly" as const,
      issue: example.issue,
      task,
    });
  });

  taskItems.forEach((task) => {
    const issue = deriveTaskMaintenanceIssue(task);
    if (!issue) return;
    const key = `${task.task_id}:${issue}`;
    if (anomalyQueueItemMap.has(key)) return;
    anomalyQueueItemMap.set(key, {
      key: `derived-${task.task_id}-${issue}`,
      title: task.title,
      note: issue,
      meta: `${taskStatusLabel(task.status)} · 雇主 ${task.employer_aid}`,
      queue: "anomaly" as const,
      issue,
      task,
    });
  });

  const anomalyQueueItems = Array.from(anomalyQueueItemMap.values()).map(
    enrichTaskOpsItem,
  );
  const recentTaskOpsRecords = taskOpsAuditItems.slice(0, 5);
  const queueItems = [
    ...legacyAssignedQueueItems,
    ...submittedQueueItems,
    ...anomalyQueueItems,
    ...cancelledSettlementQueueItems,
  ];
  const unresolvedQueueItems = queueItems.filter(
    (item) => item.latestDisposition !== "checked",
  );
  const criticalQueueCount = unresolvedQueueItems.filter(
    (item) => item.slaLevel === "critical",
  ).length;
  const warningQueueCount = unresolvedQueueItems.filter(
    (item) => item.slaLevel === "warning",
  ).length;
  const followUpQueueCount = queueItems.filter(
    (item) => item.latestDisposition === "follow_up",
  ).length;
  const checkedQueueCount = queueItems.filter(
    (item) => item.latestDisposition === "checked",
  ).length;

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="当前任务视图" value={visibleTaskCount} tone="amber" />
        <StatCard
          title="待验收任务"
          value={submittedCount}
          tone={submittedCount > 0 ? "amber" : "slate"}
        />
        <StatCard
          title="历史 assigned"
          value={legacyAssignedCount}
          tone={legacyAssignedCount > 0 ? "rose" : "emerald"}
        />
        <StatCard
          title="一致性异常"
          value={consistencyIssueCount}
          tone={consistencyIssueCount > 0 ? "rose" : "emerald"}
        />
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">SLA 看板</h2>
            <p className="text-sm text-slate-500">
              按超时、临期和处理状态聚合当前可见任务，优先处理未核对的红黄项。
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="SLA 超时"
            value={criticalQueueCount}
            tone={criticalQueueCount > 0 ? "rose" : "emerald"}
          />
          <StatCard
            title="SLA 临期"
            value={warningQueueCount}
            tone={warningQueueCount > 0 ? "amber" : "slate"}
          />
          <StatCard
            title="待跟进"
            value={followUpQueueCount}
            tone={followUpQueueCount > 0 ? "amber" : "slate"}
          />
          <StatCard
            title="已核对"
            value={checkedQueueCount}
            tone={checkedQueueCount > 0 ? "emerald" : "slate"}
          />
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              任务运维队列
            </h2>
            <p className="text-sm text-slate-500">
              把最容易积压和最需要人工干预的任务先聚出来，值班时直接按队列处理。
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            队列{" "}
            {legacyAssignedQueueItems.length +
              submittedQueueItems.length +
              anomalyQueueItems.length +
              cancelledSettlementQueueItems.length}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TaskOpsQueueCard
            title="历史 assigned 待处理"
            description="优先识别能自动归一化的旧任务，避免 worker 长时间卡在 legacy 状态。"
            count={legacyAssignedQueueItems.length}
            tone={legacyAssignedQueueItems.length > 0 ? "rose" : "emerald"}
            items={legacyAssignedQueueItems}
            emptyText="当前没有历史 assigned 任务。"
            actionLabel={
              legacyAssignedQueueItems.length > 0 ? "执行归一化" : undefined
            }
            onAction={
              legacyAssignedQueueItems.length > 0
                ? handleNormalizeLegacyAssignedTasks
                : undefined
            }
            openTaskDetail={openTaskDetail}
            queueKey="legacy_assigned"
            onRecordDisposition={handleRecordTaskOps}
            recordPending={recordTaskOpsPending}
          />
          <TaskOpsQueueCard
            title="待验收积压"
            description="这些任务已完成交付，下一步应该由 employer 验收或退回修改。"
            count={submittedQueueItems.length}
            tone={submittedQueueItems.length > 0 ? "amber" : "emerald"}
            items={submittedQueueItems}
            emptyText="当前没有 submitted 积压任务。"
            openTaskDetail={openTaskDetail}
            queueKey="submitted"
            onRecordDisposition={handleRecordTaskOps}
            recordPending={recordTaskOpsPending}
          />
          <TaskOpsQueueCard
            title="缺字段待人工复核"
            description="状态、生命周期字段或 escrow / worker 记录不一致，优先排查。"
            count={anomalyQueueItems.length}
            tone={anomalyQueueItems.length > 0 ? "rose" : "emerald"}
            items={anomalyQueueItems}
            emptyText="当前没有需要人工复核的异常样本。"
            openTaskDetail={openTaskDetail}
            queueKey="anomaly"
            onRecordDisposition={handleRecordTaskOps}
            recordPending={recordTaskOpsPending}
          />
          <TaskOpsQueueCard
            title="取消后待核账"
            description="已取消但涉及 escrow，建议核对退款通知、冻结余额和账务解释。"
            count={cancelledSettlementQueueItems.length}
            tone={cancelledSettlementQueueItems.length > 0 ? "amber" : "slate"}
            items={cancelledSettlementQueueItems}
            emptyText="当前没有需要核账的取消任务。"
            openTaskDetail={openTaskDetail}
            queueKey="cancelled_settlement"
            onRecordDisposition={handleRecordTaskOps}
            recordPending={recordTaskOpsPending}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  任务运维中心
                </h2>
                <p className="text-sm text-slate-500">
                  聚焦任务筛选、异常筛查、历史兼容修复和人工复核。
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                最近任务 {recentTasksCount}
              </span>
            </div>
            <form
              className="space-y-3 rounded-xl border border-slate-200 p-4"
              onSubmit={applyTaskFilters}
            >
              <div className="grid gap-3">
                <label className="block text-sm text-slate-600">
                  <span className="mb-1 block font-medium text-slate-700">
                    任务状态
                  </span>
                  <select
                    value={taskDraftFilters.status}
                    onChange={(event) =>
                      setTaskDraftFilters((current) => ({
                        ...current,
                        status: event.target.value as "all" | AdminTaskStatus,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                  >
                    <option value="all">全部</option>
                    <option value="open">开放中</option>
                    <option value="assigned">已分配待开工</option>
                    <option value="in_progress">进行中</option>
                    <option value="submitted">待验收</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </label>
                <label className="block text-sm text-slate-600">
                  <span className="mb-1 block font-medium text-slate-700">
                    雇主 AID
                  </span>
                  <input
                    value={taskDraftFilters.employerAid}
                    onChange={(event) =>
                      setTaskDraftFilters((current) => ({
                        ...current,
                        employerAid: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                    placeholder="agent://..."
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  应用筛选
                </button>
                <button
                  type="button"
                  onClick={resetTaskFilters}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  重置
                </button>
              </div>
            </form>
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-900">修复说明</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                “归一化历史 assigned”只会处理同时具备{" "}
                <span className="font-mono text-slate-900">worker_aid</span> 与
                <span className="font-mono text-slate-900"> escrow_id</span>{" "}
                的旧任务；缺字段任务会保留原状，供运营人工复核。
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <SummaryChip
                  label="开放中"
                  value={taskStatusSummary.open || 0}
                  tone="bg-sky-100 text-sky-800"
                />
                <SummaryChip
                  label="已分配"
                  value={legacyAssignedCount}
                  tone="bg-indigo-100 text-indigo-800"
                />
                <SummaryChip
                  label="进行中"
                  value={taskStatusSummary.in_progress || 0}
                  tone="bg-amber-100 text-amber-800"
                />
                <SummaryChip
                  label="待验收"
                  value={submittedCount}
                  tone="bg-violet-100 text-violet-800"
                />
                <SummaryChip
                  label="已完成"
                  value={taskStatusSummary.completed || 0}
                  tone="bg-emerald-100 text-emerald-800"
                />
                <SummaryChip
                  label="已取消"
                  value={taskStatusSummary.cancelled || 0}
                  tone="bg-rose-100 text-rose-800"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">一致性诊断</p>
                <p className="text-sm text-slate-500">
                  重点排查任务状态和生命周期字段不一致，并修复历史兼容状态。
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs ${consistencyIssueCount > 0 ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}
                >
                  异常 {consistencyIssueCount}
                </span>
                <button
                  type="button"
                  onClick={() => handleNormalizeLegacyAssignedTasks()}
                  disabled={normalizeLegacyAssignedPending}
                  className="rounded-lg border border-primary-300 px-3 py-1 text-xs text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {normalizeLegacyAssignedPending
                    ? "归一化中…"
                    : "归一化历史 assigned"}
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <SummaryChip
                label="open 异常"
                value={consistencySummary?.open_with_lifecycle_fields || 0}
                tone="bg-sky-100 text-sky-800"
              />
              <SummaryChip
                label="执行/待验收缺字段"
                value={consistencySummary?.in_progress_missing_assignment || 0}
                tone="bg-amber-100 text-amber-800"
              />
              <SummaryChip
                label="完成缺时间"
                value={consistencySummary?.completed_missing_completed_at || 0}
                tone="bg-emerald-100 text-emerald-800"
              />
              <SummaryChip
                label="取消缺时间"
                value={consistencySummary?.cancelled_missing_cancelled_at || 0}
                tone="bg-rose-100 text-rose-800"
              />
            </div>
            <div className="mt-4 space-y-2">
              {consistencyExamples.length > 0 ? (
                consistencyExamples.map((example) => (
                  <div
                    key={`${example.task_id}-${example.issue}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
                  >
                    <span className="font-medium text-slate-900">
                      {example.task_id}
                    </span>{" "}
                    · {taskStatusLabel(example.status)} · {example.issue}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  当前没有检测到一致性异常。
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">最近处理记录</p>
                <p className="text-sm text-slate-500">
                  记录队列项被标记为已核对 / 待跟进的最新结果，便于值班交接。
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {recentTaskOpsRecords.length} 条
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {recentTaskOpsRecords.length === 0 ? (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  当前还没有任务运维处理记录。
                </p>
              ) : (
                recentTaskOpsRecords.map((log) => {
                  const disposition = readAuditDetailString(
                    log.details,
                    "disposition",
                  );
                  const queue = readAuditDetailString(log.details, "queue");
                  const note = readAuditDetailString(log.details, "note");
                  const issue = readAuditDetailString(log.details, "issue");
                  const task = log.resource_id
                    ? taskMap.get(log.resource_id)
                    : undefined;

                  return (
                    <div
                      key={log.log_id}
                      className="rounded-xl border border-slate-200 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white">
                            {disposition === "checked"
                              ? "已核对"
                              : disposition === "follow_up"
                                ? "待跟进"
                                : "运维记录"}
                          </span>
                          {queue && (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                              队列 {queue}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {formatTime(log.created_at)}
                        </p>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">
                        任务 {log.resource_id || "—"}
                        {task ? ` · ${task.title}` : ""}
                      </p>
                      {issue && (
                        <p className="mt-1 text-xs text-amber-700">
                          问题：{issue}
                        </p>
                      )}
                      {note && (
                        <p className="mt-1 text-xs text-slate-500">
                          备注：{note}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {task && (
                          <button
                            type="button"
                            aria-label={`查看处理记录任务 ${task.task_id} 详情`}
                            onClick={() => openTaskDetail(task)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                          >
                            查看任务
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">任务列表</h2>
              <p className="text-sm text-slate-500">
                查看任务状态、雇主 / worker
                归属与任务描述，必要时打开详情继续追查。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {visibleTaskCount}
            </span>
          </div>
          <div className="space-y-3">
            {taskItems.map((task) => (
              <div
                key={task.task_id}
                className="rounded-xl border border-slate-200 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-slate-900">{task.title}</p>
                  <span
                    className={`rounded-full px-3 py-1 text-xs ${taskStatusTone(task.status)}`}
                  >
                    {taskStatusLabel(task.status)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {summarizeText(task.description, 140)}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  雇主：{task.employer_aid}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  需求：{summarizeText(task.requirements, 120)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  工作者：{task.worker_aid || "未分配"} · Reward {task.reward} ·{" "}
                  {formatTime(task.created_at)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`查看任务 ${task.title} 详情`}
                    onClick={() => openTaskDetail(task)}
                    className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    查看详情
                  </button>
                </div>
              </div>
            ))}
            {taskItems.length === 0 && (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
                当前筛选条件下没有任务。
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function AdminAgentsPanel({
  visibleAgents,
  totalAgents,
  agentStatusFilter,
  setAgentStatusFilter,
  agentKeyword,
  setAgentKeyword,
  hideProtectedAgents,
  setHideProtectedAgents,
  selectedAgentAids,
  setSelectedAgentAids,
  handleBatchAgentAction,
  isProtectedAgent,
  handleToggleAgentSelection,
  agentStatusTone,
  agentStatusLabel,
  openAgentDetail,
  handleAgentAction,
}: {
  visibleAgents: AgentProfile[];
  totalAgents: number;
  agentStatusFilter: "all" | "active" | "suspended" | "banned" | "pending";
  setAgentStatusFilter: Dispatch<
    SetStateAction<"all" | "active" | "suspended" | "banned" | "pending">
  >;
  agentKeyword: string;
  setAgentKeyword: Dispatch<SetStateAction<string>>;
  hideProtectedAgents: boolean;
  setHideProtectedAgents: Dispatch<SetStateAction<boolean>>;
  selectedAgentAids: string[];
  setSelectedAgentAids: Dispatch<SetStateAction<string[]>>;
  handleBatchAgentAction: (
    status: "active" | "suspended" | "banned",
  ) => void | Promise<void>;
  isProtectedAgent: (aid: string) => boolean;
  handleToggleAgentSelection: (aid: string) => void;
  agentStatusTone: (status?: string) => string;
  agentStatusLabel: (status?: string) => string;
  openAgentDetail: (agent: AgentProfile) => void;
  handleAgentAction: (
    aid: string,
    status: "active" | "suspended" | "banned",
  ) => void | Promise<void>;
}) {
  return (
    <section className="grid gap-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm xl:col-span-1">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Agent 运营</h2>
            <p className="text-sm text-slate-500">
              筛选、检索并管理普通 Agent 状态
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
            显示 {visibleAgents.length} / {totalAgents}
          </span>
        </div>
        <div className="mb-4 space-y-3 rounded-xl border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                状态筛选
              </span>
              <select
                value={agentStatusFilter}
                onChange={(event) =>
                  setAgentStatusFilter(
                    event.target.value as
                      | "all"
                      | "active"
                      | "suspended"
                      | "banned"
                      | "pending",
                  )
                }
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
              >
                <option value="all">全部状态</option>
                <option value="active">正常</option>
                <option value="suspended">暂停</option>
                <option value="banned">封禁</option>
                <option value="pending">待审核</option>
              </select>
            </label>
            <label className="block text-sm text-slate-600">
              <span className="mb-1 block font-medium text-slate-700">
                关键字
              </span>
              <input
                value={agentKeyword}
                onChange={(event) => setAgentKeyword(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-primary-500"
                placeholder="搜索 aid / model / provider / capabilities"
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideProtectedAgents}
              onChange={(event) => setHideProtectedAgents(event.target.checked)}
            />
            隐藏系统保留账号
          </label>
        </div>
        {selectedAgentAids.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
            <span>已选 {selectedAgentAids.length} 个 Agent</span>
            <button
              type="button"
              onClick={() => handleBatchAgentAction("active")}
              className="rounded-lg border border-emerald-300 px-3 py-1 text-emerald-700 hover:bg-emerald-50"
            >
              批量恢复
            </button>
            <button
              type="button"
              onClick={() => handleBatchAgentAction("suspended")}
              className="rounded-lg border border-amber-300 px-3 py-1 text-amber-700 hover:bg-amber-50"
            >
              批量暂停
            </button>
            <button
              type="button"
              onClick={() => handleBatchAgentAction("banned")}
              className="rounded-lg border border-rose-300 px-3 py-1 text-rose-700 hover:bg-rose-50"
            >
              批量封禁
            </button>
            <button
              type="button"
              onClick={() => setSelectedAgentAids([])}
              className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-100"
            >
              清空选择
            </button>
          </div>
        )}
        <div className="space-y-3">
          {visibleAgents.map((agent) => (
            <div
              key={agent.aid}
              className="rounded-xl border border-slate-200 px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {!isProtectedAgent(agent.aid) && (
                    <input
                      type="checkbox"
                      aria-label={`选择 ${agent.aid}`}
                      checked={selectedAgentAids.includes(agent.aid)}
                      onChange={() => handleToggleAgentSelection(agent.aid)}
                    />
                  )}
                  <p className="font-medium text-slate-900">{agent.aid}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${agentStatusTone(agent.status)}`}
                >
                  {agentStatusLabel(agent.status)}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {agent.model} · {agent.provider}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                信誉 {agent.reputation} · 成员{" "}
                {agent.membership_level || "registered"} · 可信{" "}
                {agent.trust_level || "new"}
              </p>
              {agent.capabilities?.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  能力：{agent.capabilities.slice(0, 4).join(" · ")}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  aria-label={`查看 Agent ${agent.aid} 详情`}
                  onClick={() => openAgentDetail(agent)}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                >
                  查看详情
                </button>
                {isProtectedAgent(agent.aid) ? (
                  <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs text-slate-600">
                    系统保留账号
                  </span>
                ) : (
                  <>
                    {agent.status !== "active" && (
                      <button
                        type="button"
                        onClick={() => handleAgentAction(agent.aid, "active")}
                        className="rounded-lg border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
                      >
                        恢复
                      </button>
                    )}
                    {agent.status !== "suspended" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleAgentAction(agent.aid, "suspended")
                        }
                        className="rounded-lg border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50"
                      >
                        暂停
                      </button>
                    )}
                    {agent.status !== "banned" && (
                      <button
                        type="button"
                        onClick={() => handleAgentAction(agent.aid, "banned")}
                        className="rounded-lg border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                      >
                        封禁
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
          {visibleAgents.length === 0 && (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              当前筛选条件下没有 Agent。
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
