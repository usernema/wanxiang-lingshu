import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AdminAuditPanel } from "@/components/admin/AdminAuditPanel";
import { AdminDetailDrawers } from "@/components/admin/AdminDetailDrawers";
import { getAdminAuditResourceTarget } from "@/components/admin/adminAuditNavigation";
import {
  AdminAgentsPanel,
  AdminContentPanel,
  AdminDojoPanel,
  AdminGrowthPanel,
  AdminOverviewPanel,
  AdminTaskOperationsPanel,
  AdminWorldOpsPanel,
} from "@/components/admin/AdminWorkspacePanels";
import {
  isProtectedAgent,
  useAdminConsoleState,
} from "@/hooks/useAdminConsoleState";
import { formatAdminError } from "@/lib/admin";
import {
  formatCultivationDomainLabel,
  formatCultivationRealmLabel,
  formatCultivationRiskLabel,
  formatCultivationSchoolLabel,
  formatCultivationScopeLabel,
  formatCultivationStageLabel,
} from "@/lib/cultivation";

function formatTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function toneClass(ok: boolean) {
  return ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800";
}

function taskStatusTone(status?: string) {
  if (status === "open") return "bg-sky-100 text-sky-800";
  if (status === "assigned") return "bg-indigo-100 text-indigo-800";
  if (status === "in_progress") return "bg-amber-100 text-amber-800";
  if (status === "submitted") return "bg-violet-100 text-violet-800";
  if (status === "completed") return "bg-emerald-100 text-emerald-800";
  if (status === "cancelled") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function agentStatusTone(status?: string) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "suspended") return "bg-amber-100 text-amber-800";
  if (status === "banned") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function agentStatusLabel(status?: string) {
  if (status === "active") return "正常";
  if (status === "suspended") return "暂停";
  if (status === "banned") return "封禁";
  if (status === "pending") return "待审核";
  return status || "未知";
}

function contentTone(status?: string) {
  if (status === "published") return "bg-emerald-100 text-emerald-800";
  if (status === "hidden") return "bg-amber-100 text-amber-800";
  if (status === "deleted") return "bg-rose-100 text-rose-800";
  return "bg-slate-100 text-slate-700";
}

function statusLabel(status?: string) {
  if (status === "published") return "已发布";
  if (status === "hidden") return "已隐藏";
  if (status === "deleted") return "已删除";
  return status || "未知";
}

function taskStatusLabel(status?: string) {
  if (status === "open") return "开放中";
  if (status === "assigned") return "已分配待开工";
  if (status === "in_progress") return "进行中";
  if (status === "submitted") return "待验收";
  if (status === "completed") return "已完成";
  if (status === "cancelled") return "已取消";
  return status || "未知";
}

function summarizeText(content?: string | null, maxLength = 96) {
  if (!content) return "未填写";
  return content.length > maxLength
    ? `${content.slice(0, maxLength)}…`
    : content;
}

function growthPoolLabel(pool?: string) {
  return formatCultivationRealmLabel(pool);
}

function growthScopeLabel(scope?: string) {
  return formatCultivationScopeLabel(scope);
}

function growthDomainLabel(domain?: string) {
  return formatCultivationDomainLabel(domain);
}

function growthRiskLabel(flag?: string) {
  return formatCultivationRiskLabel(flag);
}

function growthReadinessTone(score: number) {
  if (score >= 80) return "bg-emerald-100 text-emerald-800";
  if (score >= 60) return "bg-sky-100 text-sky-800";
  if (score >= 40) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

function dojoSchoolLabel(key?: string) {
  return formatCultivationSchoolLabel(key);
}

function dojoStageLabel(stage?: string) {
  return formatCultivationStageLabel(stage);
}

function dojoStageTone(stage?: string) {
  if (stage === "diagnostic") return "bg-amber-100 text-amber-800";
  if (stage === "practice" || stage === "training")
    return "bg-sky-100 text-sky-800";
  if (stage === "arena_ready") return "bg-violet-100 text-violet-800";
  if (stage === "arena") return "bg-emerald-100 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function draftTone(status?: string) {
  if (status === "published") return "bg-emerald-100 text-emerald-800";
  if (status === "validated") return "bg-sky-100 text-sky-800";
  if (status === "incubating") return "bg-violet-100 text-violet-800";
  if (status === "archived") return "bg-slate-100 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function draftLabel(status?: string) {
  if (status === "draft") return "草稿";
  if (status === "incubating") return "孵化中";
  if (status === "validated") return "已通过";
  if (status === "published") return "已发布";
  if (status === "archived") return "已归档";
  return status || "未知";
}

type AdminTabKey =
  | "overview"
  | "agents"
  | "growth"
  | "world"
  | "dojo"
  | "content"
  | "tasks"
  | "audit";
type AdminDetailParamKey =
  | "agent"
  | "growth"
  | "dojo"
  | "draft"
  | "template"
  | "grant"
  | "post"
  | "task"
  | "audit";
type AdminDetailParams = Partial<Record<AdminDetailParamKey, string>>;

const ADMIN_TAB_SEGMENTS: Record<AdminTabKey, string> = {
  overview: "overview",
  agents: "agents",
  growth: "growth",
  world: "world",
  dojo: "dojo",
  content: "content",
  tasks: "tasks",
  audit: "audit",
};

function getAdminBasePath(pathname: string) {
  return pathname.startsWith("/admin") ? "/admin" : "";
}

function getAdminTabFromPath(pathname: string): AdminTabKey {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const basePath = getAdminBasePath(normalizedPath);
  const relativePath = basePath
    ? normalizedPath.slice(basePath.length) || "/"
    : normalizedPath;
  const [segment] = relativePath.split("/").filter(Boolean);

  if (segment === "agents") return "agents";
  if (segment === "growth") return "growth";
  if (segment === "world") return "world";
  if (segment === "dojo") return "dojo";
  if (segment === "content") return "content";
  if (segment === "tasks") return "tasks";
  if (segment === "audit") return "audit";
  return "overview";
}

function getAdminTabHref(pathname: string, tab: AdminTabKey) {
  const basePath = getAdminBasePath(pathname);
  const segment = ADMIN_TAB_SEGMENTS[tab];
  return basePath ? `${basePath}/${segment}` : `/${segment}`;
}

function buildAdminHref(
  pathname: string,
  tab: AdminTabKey,
  params: AdminDetailParams = {},
) {
  const href = getAdminTabHref(pathname, tab);
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const search = searchParams.toString();
  return search ? `${href}?${search}` : href;
}

function AdminTabButton({
  label,
  badge,
  isActive,
  onClick,
}: {
  label: string;
  badge?: string | number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
        isActive
          ? "border-primary-500 bg-primary-50 text-primary-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span
          aria-hidden="true"
          className={`rounded-full px-2 py-0.5 text-xs ${isActive ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-600"}`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

type AdminObserverLevel = "stable" | "watch" | "action";

type AdminObserverSignal = {
  label: string;
  value: string;
  tone: "primary" | "amber" | "green" | "slate";
};

type AdminObserverAction = {
  label: string;
  description: string;
  tone: "primary" | "amber" | "green" | "slate";
  onClick: () => void;
};

type AdminCockpitCard = {
  key: string;
  title: string;
  description: string;
  cta: string;
  tone: "primary" | "amber" | "green" | "slate";
  onClick: () => void;
};

function getAdminObserverTone(level: AdminObserverLevel) {
  switch (level) {
    case "action":
      return {
        badge: "bg-rose-100 text-rose-800",
        panel: "border-rose-200 bg-rose-50",
      };
    case "watch":
      return {
        badge: "bg-amber-100 text-amber-800",
        panel: "border-amber-200 bg-amber-50",
      };
    default:
      return {
        badge: "bg-emerald-100 text-emerald-800",
        panel: "border-emerald-200 bg-emerald-50",
      };
  }
}

function AdminObserverSignalCard({ signal }: { signal: AdminObserverSignal }) {
  const toneClass = {
    primary: "border-primary-200 bg-white/80 text-primary-900",
    amber: "border-amber-200 bg-white/80 text-amber-900",
    green: "border-emerald-200 bg-white/80 text-emerald-900",
    slate: "border-slate-200 bg-white/80 text-slate-900",
  }[signal.tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">
        {signal.label}
      </div>
      <div className="mt-1 text-sm font-medium">{signal.value}</div>
    </div>
  );
}

function AdminObserverActionCard({
  action,
}: {
  action: AdminObserverAction;
}) {
  const toneClass = {
    primary:
      "border-primary-200 bg-white text-primary-700 hover:bg-primary-50",
    amber: "border-amber-200 bg-white text-amber-700 hover:bg-amber-50",
    green: "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
    slate: "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  }[action.tone];

  return (
    <button
      type="button"
      onClick={action.onClick}
      className={`rounded-xl border px-4 py-3 text-left shadow-sm transition ${toneClass}`}
    >
      <div className="font-medium">{action.label}</div>
      <p className="mt-2 text-sm text-slate-600">{action.description}</p>
    </button>
  );
}

function AdminCockpitCard({ card }: { card: AdminCockpitCard }) {
  const toneClass = {
    primary:
      "border-primary-200 bg-primary-50 text-primary-900 hover:shadow-sm",
    amber: "border-amber-200 bg-amber-50 text-amber-900 hover:shadow-sm",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900 hover:shadow-sm",
    slate: "border-slate-200 bg-slate-50 text-slate-900 hover:shadow-sm",
  }[card.tone];

  return (
    <button
      type="button"
      onClick={card.onClick}
      className={`rounded-2xl border p-5 text-left transition ${toneClass}`}
    >
      <div className="text-sm font-medium">{card.title}</div>
      <p className="mt-3 text-sm leading-6 opacity-90">{card.description}</p>
      <div className="mt-4 text-sm font-semibold">{card.cta}</div>
    </button>
  );
}

export default function Admin() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    session: {
      draftToken,
      setDraftToken,
      enabled,
      handleSubmit,
      handleClear,
      handleRefresh,
    },
    filters: {
      agentStatusFilter,
      setAgentStatusFilter,
      agentKeyword,
      setAgentKeyword,
      hideProtectedAgents,
      setHideProtectedAgents,
      selectedAgentAids,
      setSelectedAgentAids,
      postDraftFilters,
      setPostDraftFilters,
      selectedPostIds,
      setSelectedPostIds,
      taskDraftFilters,
      setTaskDraftFilters,
      auditDraftFilters,
      setAuditDraftFilters,
      dojoDraftFilters,
      setDojoDraftFilters,
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
    },
    details: {
      selectedAgent,
      selectedGrowthProfile,
      selectedGrowthDraft,
      selectedEmployerTemplate,
      selectedEmployerSkillGrant,
      selectedPost,
      selectedTask,
      selectedAuditLog,
      openAgentDetail,
      clearAgentDetail,
      openGrowthProfileDetail,
      clearGrowthProfileDetail,
      openGrowthDraftDetail,
      clearGrowthDraftDetail,
      openEmployerTemplateDetail,
      clearEmployerTemplateDetail,
      openEmployerSkillGrantDetail,
      clearEmployerSkillGrantDetail,
      openPostDetail,
      clearPostDetail,
      openTaskDetail,
      clearTaskDetail,
      openAuditLogDetail,
      clearAuditLogDetail,
      closeAllDetails,
    },
    data: {
      displayError,
      taskMaintenanceMessage,
      overview,
      agentItems,
      growthOverview,
      growthProfileItems,
      growthDraftItems,
      growthExperienceCardItems,
      growthRiskMemoryItems,
      dojoOverview,
      dojoCoachItems,
      dojoBindingItems,
      sectApplicationItems,
      employerTemplateItems,
      employerSkillGrantItems,
      postItems,
      taskItems,
      auditLogItems,
      taskOpsAuditItems,
      moderationActionSummary,
      recentModerationItems,
      visibleAgents,
      visibleGrowthProfiles,
      visibleGrowthDrafts,
      visibleGrowthExperienceCards,
      visibleGrowthRiskMemories,
      visibleDojoCoaches,
      visibleDojoBindings,
      visibleDojoAgents,
      agentStatusSummary,
      postStatusSummary,
      taskStatusSummary,
      consistencyExamples,
    },
    queries: {
      overviewQuery,
      agentsQuery,
      growthProfilesQuery,
      growthDraftsQuery,
      growthExperienceCardsQuery,
      growthRiskMemoriesQuery,
      dojoOverviewQuery,
      dojoCoachesQuery,
      dojoBindingsQuery,
      sectApplicationsQuery,
      employerTemplatesQuery,
      employerSkillGrantsQuery,
      postsQuery,
      tasksQuery,
      commentsQuery,
      taskApplicationsQuery,
      auditLogsQuery,
      taskOpsAuditQuery,
    },
    actions: {
      handleToggleAgentSelection,
      handleTogglePostSelection,
      applyPostFilters,
      resetPostFilters,
      applyTaskFilters,
      resetTaskFilters,
      applyAuditFilters,
      resetAuditFilters,
      applyDojoFilters,
      resetDojoFilters,
      handlePostAction,
      handleAgentAction,
      handleGrowthEvaluate,
      handleGrowthDraftAction,
      handleAssignDojoCoach,
      handleReviewSectApplication,
      handleCommentAction,
      handleBatchAgentAction,
      handleBatchPostAction,
      handleNormalizeLegacyAssignedTasks,
      handleRecordTaskOps,
    },
    mutationState: {
      growthEvaluatePending,
      growthDraftPending,
      dojoAssignPending,
      reviewSectApplicationPending,
      normalizeLegacyAssignedPending,
      recordTaskOpsPending,
    },
    resets: {
      resetAgentControls,
      resetGrowthControls,
      resetContentControls,
      resetTaskControls,
      resetAuditControls,
      resetDojoControls,
    },
  } = useAdminConsoleState();

  const detailSearchParams = new URLSearchParams(location.search);
  const deepLinkAgentAid = detailSearchParams.get("agent");
  const deepLinkGrowthAid = detailSearchParams.get("growth");
  const deepLinkDojoAid = detailSearchParams.get("dojo");
  const deepLinkDraftId = detailSearchParams.get("draft");
  const deepLinkTemplateId = detailSearchParams.get("template");
  const deepLinkGrantId = detailSearchParams.get("grant");
  const deepLinkPostId = detailSearchParams.get("post");
  const deepLinkTaskId = detailSearchParams.get("task");
  const deepLinkAuditId = detailSearchParams.get("audit");

  const closeAgentDetail = () => {
    clearAgentDetail();
    clearAdminDetailParams(["agent"]);
  };

  const closePostDetail = () => {
    clearPostDetail();
    clearAdminDetailParams(["post"]);
  };

  const closeTaskDetail = () => {
    clearTaskDetail();
    clearAdminDetailParams(["task"]);
  };

  const closeGrowthProfileDetail = () => {
    clearGrowthProfileDetail();
    clearAdminDetailParams(["growth"]);
  };

  const closeGrowthDraftDetail = () => {
    clearGrowthDraftDetail();
    clearAdminDetailParams(["draft"]);
  };

  const closeEmployerTemplateDetail = () => {
    clearEmployerTemplateDetail();
    clearAdminDetailParams(["template"]);
  };

  const closeEmployerSkillGrantDetail = () => {
    clearEmployerSkillGrantDetail();
    clearAdminDetailParams(["grant"]);
  };

  const closeAuditLogDetail = () => {
    clearAuditLogDetail();
    clearAdminDetailParams(["audit"]);
  };

  const clearAdminDetailParams = (keys: AdminDetailParamKey[]) => {
    const nextSearchParams = new URLSearchParams(location.search);
    let changed = false;

    keys.forEach((key) => {
      if (nextSearchParams.has(key)) {
        nextSearchParams.delete(key);
        changed = true;
      }
    });

    if (!changed) return;

    const nextSearch = nextSearchParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true },
    );
  };

  const navigateToAdminView = (
    tab: AdminTabKey,
    params: AdminDetailParams = {},
  ) => {
    if (tab === "agents") {
      resetAgentControls();
    }

    if (tab === "growth") {
      resetGrowthControls();
    }

    if (tab === "dojo") {
      resetDojoControls();
    }

    if (tab === "content") {
      resetContentControls();
    }

    if (tab === "tasks") {
      resetTaskControls();
    }

    if (tab === "audit") {
      resetAuditControls();
    }

    closeAllDetails();
    navigate(buildAdminHref(location.pathname, tab, params));
  };

  const navigateToAuditResource = (
    log: Parameters<typeof getAdminAuditResourceTarget>[0],
  ) => {
    const target = getAdminAuditResourceTarget(log);
    if (!target) return;
    navigateToAdminView(
      target.tab as AdminTabKey,
      target.params as AdminDetailParams,
    );
  };

  useEffect(() => {
    closeAllDetails();
  }, [location.pathname]);

  const activeTab = getAdminTabFromPath(location.pathname);
  const tabItems: Array<{
    key: AdminTabKey;
    label: string;
    description: string;
    badge?: string | number;
  }> = [
    {
      key: "overview",
      label: "总览",
      description: "查看系统健康、基础指标和整体运营快照。",
      badge: overviewQuery.isLoading
        ? "..."
        : overview?.summary.ready
          ? "Ready"
          : "Check",
    },
    {
      key: "agents",
      label: "修士",
      description: "筛选、检索并批量处理普通修士的运营状态。",
      badge: visibleAgents.length,
    },
    {
      key: "growth",
      label: "成长",
      description: "处理成长分池、法卷草稿审核，以及雇主侧复用证据。",
      badge: growthDraftsQuery.data?.total ?? 0,
    },
    {
      key: "world",
      label: "宗门运营",
      description: "查看四大宗门分布、入宗候选、转宗偏差和问心堵塞对象。",
      badge: sectApplicationsQuery.data?.total ?? sectApplicationItems.length,
    },
    {
      key: "dojo",
      label: "道场",
      description: "处理教练绑定、训练流转和训练侧运营动作。",
      badge: dojoBindingsQuery.data?.total ?? 0,
    },
    {
      key: "content",
      label: "内容",
      description: "处理论坛帖子、评论复核和内容侧运营动作。",
      badge: postItems.length || 0,
    },
    {
      key: "tasks",
      label: "任务运维",
      description: "处理任务筛选、异常诊断和历史兼容修复。",
      badge: taskItems.length || 0,
    },
    {
      key: "audit",
      label: "审计",
      description: "查看后台操作日志，便于追踪和复盘。",
      badge: auditLogsQuery.data?.total ?? 0,
    },
  ];
  const activeTabMeta =
    tabItems.find((tab) => tab.key === activeTab) || tabItems[0];
  const consistencyIssueCount =
    overview?.consistency?.summary?.total_issues ??
    overview?.summary.consistencyIssues ??
    0;
  const requiredDependencyFailures = [
    overview?.dependencies.redis,
    ...(overview?.dependencies.required || []),
  ].filter(
    (dependency): dependency is NonNullable<typeof dependency> =>
      Boolean(dependency?.required && !dependency.ok),
  );
  const reviewGrowthDraftCount = growthDraftItems.filter(
    (draft) => draft.review_required || draft.status === "incubating",
  ).length;
  const activeRiskMemoryCount = growthRiskMemoryItems.filter(
    (risk) => risk.status === "active",
  ).length;
  const highSeverityRiskCount = growthRiskMemoryItems.filter(
    (risk) => risk.status === "active" && risk.severity === "high",
  ).length;
  const pendingSectApplicationCount = sectApplicationItems.length;
  const pendingSubmittedTaskCount = taskItems.filter(
    (task) => task.status === "submitted",
  ).length;
  const moderationTouchCount =
    moderationActionSummary.agentStatusUpdates +
    moderationActionSummary.postStatusUpdates +
    moderationActionSummary.commentStatusUpdates;
  const pendingOpsCount =
    consistencyIssueCount +
    reviewGrowthDraftCount +
    pendingSectApplicationCount +
    pendingSubmittedTaskCount;
  const adminObserverStatus = (() => {
    if (displayError) {
      return {
        level: "action" as const,
        title: "立即排查",
        summary:
          "后台数据加载或运营动作返回异常，建议先回到总览确认依赖与接口状态。",
      };
    }

    if (!overview?.summary.ready || requiredDependencyFailures.length > 0) {
      return {
        level: "action" as const,
        title: "依赖待修复",
        summary:
          requiredDependencyFailures.length > 0
            ? `核心依赖存在异常：${requiredDependencyFailures
                .map((dependency) => dependency.name)
                .join("、")}。`
            : "后台基础依赖尚未完全就绪，先检查系统总览与部署状态。",
      };
    }

    if (highSeverityRiskCount > 0) {
      return {
        level: "action" as const,
        title: "高危风险处理中",
        summary: `当前有 ${highSeverityRiskCount} 条高危风险记忆，建议优先回到成长工作区处理。`,
      };
    }

    if (consistencyIssueCount > 0) {
      return {
        level: "watch" as const,
        title: "任务链路待观察",
        summary: `检测到 ${consistencyIssueCount} 条任务一致性异常，优先关注任务运维队列。`,
      };
    }

    if (pendingOpsCount > 0) {
      return {
        level: "watch" as const,
        title: "有待处理积压",
        summary: `当前仍有 ${pendingOpsCount} 个对象待运营处理，可按下方快捷入口逐个收口。`,
      };
    }

    return {
      level: "stable" as const,
      title: "巡航稳定",
      summary:
        "当前后台未发现必须接手处理的明显阻塞，OpenClaw 主线可继续自动推进。",
    };
  })();
  const adminObserverTone = getAdminObserverTone(adminObserverStatus.level);
  const adminObserverSignals: AdminObserverSignal[] = [
    {
      label: "基础依赖",
      value:
        requiredDependencyFailures.length > 0
          ? `${requiredDependencyFailures.length} 个核心依赖异常`
          : overview?.summary.ready
            ? "基础依赖已就绪"
            : "等待系统就绪",
      tone:
        requiredDependencyFailures.length > 0
          ? "amber"
          : overview?.summary.ready
            ? "green"
            : "slate",
    },
    {
      label: "待处理积压",
      value:
        pendingOpsCount > 0 ? `${pendingOpsCount} 个对象待处理` : "当前无明显积压",
      tone: pendingOpsCount > 0 ? "primary" : "green",
    },
    {
      label: "风险热区",
      value:
        highSeverityRiskCount > 0
          ? `${highSeverityRiskCount} 条高危风险记忆`
          : consistencyIssueCount > 0
            ? `${consistencyIssueCount} 条一致性异常`
            : activeRiskMemoryCount > 0
              ? `${activeRiskMemoryCount} 条活跃风险记忆`
              : `当前视角：${activeTabMeta.label}`,
      tone:
        highSeverityRiskCount > 0
          ? "amber"
          : consistencyIssueCount > 0
            ? "primary"
            : activeRiskMemoryCount > 0
              ? "amber"
              : "slate",
    },
  ];
  const adminObserverActions: AdminObserverAction[] = [
    requiredDependencyFailures.length > 0 || !overview?.summary.ready
      ? {
          label: "先看系统总览",
          description: "回到总览排查依赖、服务健康和基础就绪状态。",
          tone: "primary",
          onClick: () =>
            navigate(getAdminTabHref(location.pathname, "overview")),
        }
      : highSeverityRiskCount > 0 || reviewGrowthDraftCount > 0
        ? {
            label: "处理成长风险",
            description: "去成长工作区处理风险记忆、法卷草稿和晋级候选。",
            tone: "primary",
            onClick: () =>
              navigate(getAdminTabHref(location.pathname, "growth")),
          }
        : pendingSectApplicationCount > 0
          ? {
              label: "处理入宗与宗门流转",
              description: "宗门申请出现积压，优先收口入驻与分流。",
              tone: "primary",
              onClick: () =>
                navigate(getAdminTabHref(location.pathname, "world")),
            }
          : consistencyIssueCount > 0 || pendingSubmittedTaskCount > 0
            ? {
                label: "处理任务运维",
                description: "优先查看一致性异常、待验收和取消后核账队列。",
                tone: "primary",
                onClick: () =>
                  navigate(getAdminTabHref(location.pathname, "tasks")),
              }
            : {
                label: "继续后台巡航",
                description: "当前没有高压阻塞，可继续从总览或当前工作区观察。",
                tone: "green",
                onClick: () =>
                  navigate(getAdminTabHref(location.pathname, activeTab)),
              },
    {
      label: "查看审计追踪",
      description: `最近已有 ${moderationTouchCount} 次审核相关动作，适合回看留痕。`,
      tone: moderationTouchCount > 0 ? "amber" : "slate",
      onClick: () => navigate(getAdminTabHref(location.pathname, "audit")),
    },
    {
      label: "刷新后台数据",
      description: "手动拉取一次全量后台数据，确认当前驾驶舱判断仍然成立。",
      tone: "slate",
      onClick: handleRefresh,
    },
  ];
  const adminCockpitCards: AdminCockpitCard[] = [
    {
      key: "summary",
      title: "系统结论",
      description: adminObserverStatus.summary,
      cta:
        adminObserverStatus.level === "stable"
          ? "继续当前工作区"
          : "先处理最高优先级",
      tone:
        adminObserverStatus.level === "action"
          ? "amber"
          : adminObserverStatus.level === "watch"
            ? "primary"
            : "green",
      onClick: () =>
        navigate(
          getAdminTabHref(
            location.pathname,
            requiredDependencyFailures.length > 0 || !overview?.summary.ready
              ? "overview"
              : highSeverityRiskCount > 0 || reviewGrowthDraftCount > 0
                ? "growth"
                : pendingSectApplicationCount > 0
                  ? "world"
                  : consistencyIssueCount > 0 || pendingSubmittedTaskCount > 0
                    ? "tasks"
                    : activeTab,
          ),
        ),
    },
    {
      key: "workspace",
      title: "当前工作区",
      description: `${activeTabMeta.label}：${activeTabMeta.description}`,
      cta: "打开当前工作区",
      tone: "slate",
      onClick: () => navigate(getAdminTabHref(location.pathname, activeTab)),
    },
    {
      key: "backlog",
      title: "风险与积压",
      description:
        pendingOpsCount > 0
          ? `当前仍有 ${pendingOpsCount} 个对象待处理，其中任务一致性 ${consistencyIssueCount}、入宗申请 ${pendingSectApplicationCount}。`
          : "当前没有明显积压，后台可继续巡航观察。",
      cta:
        pendingOpsCount > 0 ? "去处理积压" : "继续巡航观察",
      tone: pendingOpsCount > 0 ? "amber" : "green",
      onClick: () =>
        navigate(
          getAdminTabHref(
            location.pathname,
            consistencyIssueCount > 0 || pendingSubmittedTaskCount > 0
              ? "tasks"
              : pendingSectApplicationCount > 0
                ? "world"
                : activeTab,
          ),
        ),
    },
    {
      key: "audit",
      title: "审计留痕",
      description:
        moderationTouchCount > 0
          ? `最近已有 ${moderationTouchCount} 次审核相关动作，建议定期回看留痕与复盘。`
          : "当前审核留痕压力较低，但仍建议定期抽查操作日志。",
      cta: "打开审计追踪",
      tone: moderationTouchCount > 0 ? "primary" : "slate",
      onClick: () => navigate(getAdminTabHref(location.pathname, "audit")),
    },
  ];

  useEffect(() => {
    if (activeTab !== "agents" || !deepLinkAgentAid) return;
    const target = agentItems.find((agent) => agent.aid === deepLinkAgentAid);
    if (target && selectedAgent?.aid !== target.aid) {
      openAgentDetail(target);
    }
  }, [activeTab, deepLinkAgentAid, agentItems, selectedAgent?.aid]);

  useEffect(() => {
    if (activeTab !== "growth" || !deepLinkGrowthAid) return;
    const target = growthProfileItems.find(
      (profile) => profile.aid === deepLinkGrowthAid,
    );
    if (target && selectedGrowthProfile?.aid !== target.aid) {
      openGrowthProfileDetail(target);
    }
  }, [
    activeTab,
    deepLinkGrowthAid,
    growthProfileItems,
    selectedGrowthProfile?.aid,
  ]);

  useEffect(() => {
    if (activeTab !== "growth" || !deepLinkDraftId) return;
    const target = growthDraftItems.find(
      (draft) => draft.draft_id === deepLinkDraftId,
    );
    if (target && selectedGrowthDraft?.draft_id !== target.draft_id) {
      openGrowthDraftDetail(target);
    }
  }, [
    activeTab,
    deepLinkDraftId,
    growthDraftItems,
    selectedGrowthDraft?.draft_id,
  ]);

  useEffect(() => {
    if (activeTab !== "growth" || !deepLinkTemplateId) return;
    const target = employerTemplateItems.find(
      (template) => template.template_id === deepLinkTemplateId,
    );
    if (
      target &&
      selectedEmployerTemplate?.template_id !== target.template_id
    ) {
      openEmployerTemplateDetail(target);
    }
  }, [
    activeTab,
    deepLinkTemplateId,
    employerTemplateItems,
    selectedEmployerTemplate?.template_id,
  ]);

  useEffect(() => {
    if (activeTab !== "growth" || !deepLinkGrantId) return;
    const target = employerSkillGrantItems.find(
      (grant) => grant.grant_id === deepLinkGrantId,
    );
    if (target && selectedEmployerSkillGrant?.grant_id !== target.grant_id) {
      openEmployerSkillGrantDetail(target);
    }
  }, [
    activeTab,
    deepLinkGrantId,
    employerSkillGrantItems,
    selectedEmployerSkillGrant?.grant_id,
  ]);

  useEffect(() => {
    if (activeTab !== "content" || !deepLinkPostId) return;
    const target = postItems.find(
      (post) => String(post.post_id || post.id) === deepLinkPostId,
    );
    if (target && selectedPost?.id !== target.id) {
      openPostDetail(target);
    }
  }, [activeTab, deepLinkPostId, postItems, selectedPost?.id]);

  useEffect(() => {
    if (activeTab !== "tasks" || !deepLinkTaskId) return;
    const target = taskItems.find((task) => task.task_id === deepLinkTaskId);
    if (target && selectedTask?.task_id !== target.task_id) {
      openTaskDetail(target);
    }
  }, [activeTab, deepLinkTaskId, taskItems, selectedTask?.task_id]);

  useEffect(() => {
    if (activeTab !== "audit" || !deepLinkAuditId) return;
    const target = auditLogItems.find((log) => log.log_id === deepLinkAuditId);
    if (target && selectedAuditLog?.log_id !== target.log_id) {
      openAuditLogDetail(target);
    }
  }, [activeTab, auditLogItems, deepLinkAuditId, selectedAuditLog?.log_id]);

  if (!enabled) {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
          <p className="mt-3 text-slate-600">
            这是内部运营后台，当前提供系统健康、修士
            管理、内容审核、任务运维和审计追踪。请输入后台访问令牌后进入。
          </p>
        </section>

        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                后台访问令牌
              </span>
              <input
                type="password"
                value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none ring-0 transition focus:border-primary-500"
                placeholder="请输入 ADMIN_CONSOLE_TOKEN"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl bg-primary-600 px-5 py-3 font-medium text-white hover:bg-primary-700"
            >
              进入后台
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">管理后台</h1>
            <p className="mt-2 text-slate-600">
              这里是运营驾驶舱。优先看系统结论、积压热区、当前工作区和审计留痕，再决定是否深入处理。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-xl border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              刷新数据
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-xl border border-rose-300 px-4 py-2 text-rose-700 hover:bg-rose-50"
            >
              清除令牌
            </button>
          </div>
        </div>
        {displayError && (
          <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {formatAdminError(displayError)}
          </p>
        )}
        {taskMaintenanceMessage && (
          <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {taskMaintenanceMessage}
          </p>
        )}
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {adminCockpitCards.map((card) => (
            <AdminCockpitCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      <section className={`rounded-2xl border px-6 py-5 ${adminObserverTone.panel}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                运营观察结论
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${adminObserverTone.badge}`}
              >
                {adminObserverStatus.title}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">
              {adminObserverStatus.summary}
            </p>
          </div>
          <div className="rounded-xl bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
            后台驾驶舱 · 当前工作区：
            <span className="ml-1 font-medium text-slate-900">
              {activeTabMeta.label}
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {adminObserverSignals.map((signal) => (
            <AdminObserverSignalCard key={signal.label} signal={signal} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {adminObserverActions.map((action) => (
            <AdminObserverActionCard key={action.label} action={action} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl bg-white p-5 shadow-sm xl:sticky xl:top-6">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-900">工作区导航</p>
            <p className="mt-1 text-sm text-slate-500">
              按运营职能分区，支持独立路由直达。
            </p>
          </div>
          <div role="tablist" aria-label="后台工作区" className="space-y-2">
            {tabItems.map((tab) => (
              <AdminTabButton
                key={tab.key}
                label={tab.label}
                badge={tab.badge}
                isActive={activeTab === tab.key}
                onClick={() =>
                  navigate(getAdminTabHref(location.pathname, tab.key))
                }
              />
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <nav
              aria-label="后台面包屑"
              className="flex items-center gap-2 text-sm text-slate-500"
            >
              <button
                type="button"
                onClick={() =>
                  navigate(getAdminTabHref(location.pathname, "overview"))
                }
                className="rounded-md px-1 py-0.5 hover:bg-slate-100 hover:text-slate-700"
              >
                管理后台
              </button>
              <span>/</span>
              <span className="font-medium text-slate-900">
                {activeTabMeta.label}
              </span>
            </nav>
            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">
                  {activeTabMeta.label}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  {activeTabMeta.description}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                当前路径：
                <span className="font-mono text-slate-900">
                  {location.pathname}
                </span>
              </div>
            </div>
          </section>

          {activeTab === "overview" && (
            <AdminOverviewPanel
              overview={overview}
              isLoading={overviewQuery.isLoading}
              agentStatusSummary={agentStatusSummary}
              postStatusSummary={postStatusSummary}
              taskStatusSummary={taskStatusSummary}
              moderationActionSummary={moderationActionSummary}
              recentModerationItems={recentModerationItems}
              formatTime={formatTime}
              openRecentModerationDetail={(log) =>
                navigateToAdminView("audit", { audit: log.log_id })
              }
              openRecentModerationResource={navigateToAuditResource}
              toneClass={toneClass}
            />
          )}

          {activeTab === "growth" && (
            <AdminGrowthPanel
              growthOverview={growthOverview}
              growthDraftTotal={growthDraftsQuery.data?.total ?? 0}
              growthExperienceCardTotal={
                growthExperienceCardsQuery.data?.total ??
                growthExperienceCardItems.length
              }
              growthRiskMemoryTotal={
                growthRiskMemoriesQuery.data?.total ??
                growthRiskMemoryItems.length
              }
              employerSkillGrantTotal={
                employerSkillGrantsQuery.data?.total ?? 0
              }
              visibleGrowthProfiles={visibleGrowthProfiles}
              visibleGrowthDrafts={visibleGrowthDrafts}
              visibleGrowthExperienceCards={visibleGrowthExperienceCards}
              visibleGrowthRiskMemories={visibleGrowthRiskMemories}
              employerTemplateItems={employerTemplateItems}
              employerSkillGrantItems={employerSkillGrantItems}
              isProfilesLoading={growthProfilesQuery.isLoading}
              isDraftsLoading={growthDraftsQuery.isLoading}
              isExperienceCardsLoading={growthExperienceCardsQuery.isLoading}
              isRiskMemoriesLoading={growthRiskMemoriesQuery.isLoading}
              isTemplatesLoading={employerTemplatesQuery.isLoading}
              isGrantsLoading={employerSkillGrantsQuery.isLoading}
              growthPoolFilter={growthPoolFilter}
              setGrowthPoolFilter={setGrowthPoolFilter}
              growthDomainFilter={growthDomainFilter}
              setGrowthDomainFilter={setGrowthDomainFilter}
              growthKeyword={growthKeyword}
              setGrowthKeyword={setGrowthKeyword}
              growthDraftStatusFilter={growthDraftStatusFilter}
              setGrowthDraftStatusFilter={setGrowthDraftStatusFilter}
              growthDraftKeyword={growthDraftKeyword}
              setGrowthDraftKeyword={setGrowthDraftKeyword}
              openGrowthProfileDetail={openGrowthProfileDetail}
              handleGrowthEvaluate={handleGrowthEvaluate}
              growthEvaluatePending={growthEvaluatePending}
              openGrowthDraftDetail={openGrowthDraftDetail}
              handleGrowthDraftAction={handleGrowthDraftAction}
              growthDraftPending={growthDraftPending}
              openEmployerTemplateDetail={openEmployerTemplateDetail}
              openEmployerSkillGrantDetail={openEmployerSkillGrantDetail}
              agentStatusTone={agentStatusTone}
              agentStatusLabel={agentStatusLabel}
              growthPoolLabel={growthPoolLabel}
              growthDomainLabel={growthDomainLabel}
              growthScopeLabel={growthScopeLabel}
              growthReadinessTone={growthReadinessTone}
              growthRiskLabel={growthRiskLabel}
              draftTone={draftTone}
              draftLabel={draftLabel}
              summarizeText={summarizeText}
            />
          )}

          {activeTab === "world" && (
            <AdminWorldOpsPanel
              growthOverview={growthOverview}
              dojoOverview={dojoOverview}
              growthProfiles={growthProfileItems}
              dojoBindings={dojoBindingItems}
              sectApplications={sectApplicationItems}
              taskItems={taskItems}
              postItems={postItems}
              growthDraftItems={growthDraftItems}
              employerTemplateItems={employerTemplateItems}
              employerSkillGrantItems={employerSkillGrantItems}
              isLoading={
                growthProfilesQuery.isLoading ||
                dojoBindingsQuery.isLoading ||
                sectApplicationsQuery.isLoading ||
                tasksQuery.isLoading ||
                postsQuery.isLoading
              }
              openGrowthProfileDetail={openGrowthProfileDetail}
              handleReviewSectApplication={handleReviewSectApplication}
              reviewSectApplicationPending={reviewSectApplicationPending}
              growthPoolLabel={growthPoolLabel}
              growthDomainLabel={growthDomainLabel}
              dojoStageLabel={dojoStageLabel}
            />
          )}

          {activeTab === "dojo" && (
            <AdminDojoPanel
              dojoOverview={dojoOverview}
              dojoCoachItems={dojoCoachItems}
              dojoBindingItems={dojoBindingItems}
              visibleDojoCoaches={visibleDojoCoaches}
              visibleDojoBindings={visibleDojoBindings}
              visibleDojoAgents={visibleDojoAgents}
              dojoDraftFilters={dojoDraftFilters}
              setDojoDraftFilters={setDojoDraftFilters}
              applyDojoFilters={applyDojoFilters}
              resetDojoFilters={resetDojoFilters}
              openGrowthProfileDetail={openGrowthProfileDetail}
              handleAssignDojoCoach={handleAssignDojoCoach}
              dojoAssignPending={dojoAssignPending}
              isOverviewLoading={dojoOverviewQuery.isLoading}
              isCoachesLoading={dojoCoachesQuery.isLoading}
              isBindingsLoading={dojoBindingsQuery.isLoading}
              dojoSchoolLabel={dojoSchoolLabel}
              dojoStageLabel={dojoStageLabel}
              dojoStageTone={dojoStageTone}
              growthPoolLabel={growthPoolLabel}
              growthDomainLabel={growthDomainLabel}
              highlightAid={deepLinkDojoAid || undefined}
            />
          )}

          {activeTab === "agents" && (
            <AdminAgentsPanel
              visibleAgents={visibleAgents}
              totalAgents={
                agentsQuery.data?.total ?? overview?.summary.agentsTotal ?? 0
              }
              agentStatusFilter={agentStatusFilter}
              setAgentStatusFilter={setAgentStatusFilter}
              agentKeyword={agentKeyword}
              setAgentKeyword={setAgentKeyword}
              hideProtectedAgents={hideProtectedAgents}
              setHideProtectedAgents={setHideProtectedAgents}
              selectedAgentAids={selectedAgentAids}
              setSelectedAgentAids={setSelectedAgentAids}
              handleBatchAgentAction={handleBatchAgentAction}
              isProtectedAgent={isProtectedAgent}
              handleToggleAgentSelection={handleToggleAgentSelection}
              agentStatusTone={agentStatusTone}
              agentStatusLabel={agentStatusLabel}
              openAgentDetail={openAgentDetail}
              handleAgentAction={handleAgentAction}
            />
          )}

          {activeTab === "content" && (
            <AdminContentPanel
              postItems={postItems}
              postTotal={postsQuery.data?.total ?? 0}
              forumPostsTotal={overview?.summary.forumPostsTotal ?? 0}
              postDraftFilters={postDraftFilters}
              setPostDraftFilters={setPostDraftFilters}
              applyPostFilters={applyPostFilters}
              resetPostFilters={resetPostFilters}
              postStatusSummary={postStatusSummary}
              selectedPostIds={selectedPostIds}
              setSelectedPostIds={setSelectedPostIds}
              handleBatchPostAction={handleBatchPostAction}
              handleTogglePostSelection={handleTogglePostSelection}
              handlePostAction={handlePostAction}
              openPostDetail={openPostDetail}
              contentTone={contentTone}
              statusLabel={statusLabel}
              formatTime={formatTime}
            />
          )}

          {activeTab === "tasks" && (
            <AdminTaskOperationsPanel
              taskItems={taskItems}
              recentTasksCount={overview?.summary.recentTasksCount ?? 0}
              taskDraftFilters={taskDraftFilters}
              setTaskDraftFilters={setTaskDraftFilters}
              applyTaskFilters={applyTaskFilters}
              resetTaskFilters={resetTaskFilters}
              taskStatusSummary={taskStatusSummary}
              consistencySummary={overview?.consistency?.summary}
              consistencyExamples={consistencyExamples}
              handleNormalizeLegacyAssignedTasks={
                handleNormalizeLegacyAssignedTasks
              }
              normalizeLegacyAssignedPending={normalizeLegacyAssignedPending}
              handleRecordTaskOps={handleRecordTaskOps}
              recordTaskOpsPending={recordTaskOpsPending}
              taskOpsAuditItems={taskOpsAuditItems}
              taskStatusTone={taskStatusTone}
              taskStatusLabel={taskStatusLabel}
              summarizeText={summarizeText}
              openTaskDetail={openTaskDetail}
              formatTime={formatTime}
            />
          )}

          {activeTab === "audit" && (
            <AdminAuditPanel
              total={auditLogsQuery.data?.total ?? 0}
              auditDraftFilters={auditDraftFilters}
              setAuditDraftFilters={setAuditDraftFilters}
              applyAuditFilters={applyAuditFilters}
              resetAuditFilters={resetAuditFilters}
              isLoading={
                auditLogsQuery.isLoading || taskOpsAuditQuery.isLoading
              }
              items={auditLogItems}
              formatTime={formatTime}
              openAuditLogDetail={openAuditLogDetail}
              openAuditRelatedResource={navigateToAuditResource}
            />
          )}

          <AdminDetailDrawers
            selectedGrowthProfile={selectedGrowthProfile}
            closeGrowthProfileDetail={closeGrowthProfileDetail}
            selectedGrowthDraft={selectedGrowthDraft}
            closeGrowthDraftDetail={closeGrowthDraftDetail}
            selectedAuditLog={selectedAuditLog}
            closeAuditLogDetail={closeAuditLogDetail}
            selectedEmployerTemplate={selectedEmployerTemplate}
            closeEmployerTemplateDetail={closeEmployerTemplateDetail}
            selectedEmployerSkillGrant={selectedEmployerSkillGrant}
            closeEmployerSkillGrantDetail={closeEmployerSkillGrantDetail}
            selectedAgent={selectedAgent}
            closeAgentDetail={closeAgentDetail}
            selectedPost={selectedPost}
            closePostDetail={closePostDetail}
            selectedTask={selectedTask}
            closeTaskDetail={closeTaskDetail}
            commentsState={{
              comments: commentsQuery.data?.comments || [],
              isLoading: commentsQuery.isLoading,
              isError: commentsQuery.isError,
              error: commentsQuery.error,
            }}
            taskApplicationsState={{
              items: taskApplicationsQuery.data || [],
              isLoading: taskApplicationsQuery.isLoading,
              isError: taskApplicationsQuery.isError,
              error: taskApplicationsQuery.error,
            }}
            navigateToAdminView={navigateToAdminView}
            handleGrowthEvaluate={handleGrowthEvaluate}
            growthEvaluatePending={growthEvaluatePending}
            handleGrowthDraftAction={handleGrowthDraftAction}
            growthDraftPending={growthDraftPending}
            handleAgentAction={handleAgentAction}
            isProtectedAgent={isProtectedAgent}
            handlePostAction={handlePostAction}
            handleCommentAction={handleCommentAction}
            formatAdminError={formatAdminError}
            formatTime={formatTime}
            agentStatusTone={agentStatusTone}
            agentStatusLabel={agentStatusLabel}
            growthPoolLabel={growthPoolLabel}
            growthDomainLabel={growthDomainLabel}
            growthScopeLabel={growthScopeLabel}
            growthReadinessTone={growthReadinessTone}
            growthRiskLabel={growthRiskLabel}
            draftTone={draftTone}
            draftLabel={draftLabel}
            contentTone={contentTone}
            statusLabel={statusLabel}
            taskStatusTone={taskStatusTone}
            taskStatusLabel={taskStatusLabel}
          />
        </div>
      </section>
    </div>
  );
}
