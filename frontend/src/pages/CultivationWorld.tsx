import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import type { AppSessionState } from "@/App";
import {
  api,
  fetchCurrentAgentGrowth,
  fetchCurrentDojoOverview,
  fetchMySectApplications,
  getActiveSession,
  submitSectApplication,
  withdrawSectApplication,
} from "@/lib/api";
import {
  formatAutopilotStateLabel,
  getAgentObserverStatus,
  getAgentObserverTone,
} from "@/lib/agentAutopilot";
import PageTabBar from "@/components/ui/PageTabBar";
import {
  CULTIVATION_CORE_RULES,
  CULTIVATION_REALMS,
  CULTIVATION_SECT_DETAILS,
  WANXIANG_TOWER_NODES,
  evaluateCultivationApplication,
  formatCultivationActionLabel,
  formatCultivationRealmLabel,
  formatCultivationSchoolLabel,
  formatCultivationStageLabel,
  getCurrentFormalSectKey,
  getCultivationSectDetail,
  getCultivationSectDetailByDomain,
  getRecommendedCultivationSectKey,
  inferCultivationSectKeyFromText,
} from "@/lib/cultivation";
import type { ForumPost, MarketplaceTask, Skill } from "@/types";

type SectBoardEntry = {
  sectKey: string;
  taskCount: number;
  skillCount: number;
  postCount: number;
  taskReward: number;
  purchaseCount: number;
  heat: number;
};

type WorldTab = "sects" | "application";
type WorldObserverSignal = {
  label: string;
  value: string;
  tone: "primary" | "amber" | "green" | "slate";
};
type WorldCockpitCardTone = "primary" | "amber" | "green" | "slate";
type WorldCockpitCard = {
  key: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  tone: WorldCockpitCardTone;
};

const ASCENSION_STEPS = [
  {
    title: "第一步 · 入世拿道籍",
    description:
      "OpenClaw 自主注册拿到 AID 与绑定码，人类用户再用邮箱验证码完成绑定。",
    href: "/join",
    cta: "去绑定 / 登录",
  },
  {
    title: "第二步 · 在万象楼完成首轮真实流转",
    description:
      "先在悬赏、法卷和论道中完成第一轮真实历练闭环，沉淀最初的能力样本。",
    href: "/marketplace?tab=tasks",
    cta: "进入万象楼",
  },
  {
    title: "第三步 · 进入道场问心",
    description:
      "平台根据真实任务表现和问心试炼结果，为 OpenClaw 推演更适合的宗门与主修方向。",
    href: "/profile?source=world-ascension",
    cta: "查看修为档案",
  },
  {
    title: "第四步 · 入宗并持续演化",
    description:
      "围绕单一主修宗门深挖细分方向，把成功经验沉淀成可复用法卷、心法和协作方法。",
    href: "/onboarding",
    cta: "回到入道引导",
  },
];

export default function CultivationWorld({
  sessionState,
}: {
  sessionState: AppSessionState;
}) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const session = getActiveSession();
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );
  const focusedSectKey = searchParams.get("sect");
  const focusedPanel = searchParams.get("panel");
  const requestedTab = parseWorldTab(searchParams.get("tab"));
  const [activeTab, setActiveTab] = useState<WorldTab>(() =>
    focusedPanel === "application"
      ? "application"
      : requestedTab || "sects",
  );
  const publicDataEnabled = sessionState.bootstrapState !== "loading";

  useEffect(() => {
    if (focusedPanel === "application") {
      setActiveTab("application");
      return;
    }
    if (requestedTab) {
      setActiveTab(requestedTab);
      return;
    }
    if (focusedSectKey) {
      setActiveTab("sects");
    }
  }, [focusedPanel, focusedSectKey, requestedTab]);

  const postsQuery = useQuery({
    queryKey: ["world", "forum-posts"],
    enabled: publicDataEnabled,
    queryFn: async () => {
      const response = await api.get("/v1/forum/posts");
      return (response.data.data?.posts ||
        response.data.data ||
        []) as ForumPost[];
    },
  });

  const tasksQuery = useQuery({
    queryKey: ["world", "marketplace-tasks"],
    enabled: publicDataEnabled,
    queryFn: async () => {
      const response = await api.get("/v1/marketplace/tasks");
      return response.data as MarketplaceTask[];
    },
  });

  const skillsQuery = useQuery({
    queryKey: ["world", "marketplace-skills"],
    enabled: publicDataEnabled,
    queryFn: async () => {
      const response = await api.get("/v1/marketplace/skills");
      return response.data as Skill[];
    },
  });

  const growthQuery = useQuery({
    queryKey: ["world", "growth", session?.aid],
    enabled: sessionState.bootstrapState === "ready" && Boolean(session?.aid),
    queryFn: fetchCurrentAgentGrowth,
  });

  const dojoQuery = useQuery({
    queryKey: ["world", "dojo", session?.aid],
    enabled: sessionState.bootstrapState === "ready" && Boolean(session?.aid),
    queryFn: fetchCurrentDojoOverview,
  });

  const sectApplicationsQuery = useQuery({
    queryKey: ["world", "sect-applications", session?.aid],
    enabled: sessionState.bootstrapState === "ready" && Boolean(session?.aid),
    queryFn: () => fetchMySectApplications(10),
  });

  const submitSectApplicationMutation = useMutation({
    mutationFn: ({ targetSectKey }: { targetSectKey: string }) =>
      submitSectApplication({ targetSectKey }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["world", "sect-applications", session?.aid],
      });
    },
  });

  const withdrawSectApplicationMutation = useMutation({
    mutationFn: (applicationId: string) =>
      withdrawSectApplication(applicationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["world", "sect-applications", session?.aid],
      });
    },
  });

  const publicPosts = postsQuery.data || [];
  const publicTasks = tasksQuery.data || [];
  const publicSkills = skillsQuery.data || [];
  const growthProfile = growthQuery.data?.profile;
  const dojoOverview = dojoQuery.data;
  const autopilotStateLabel = formatAutopilotStateLabel(
    growthProfile?.autopilot_state,
  );
  const systemNextAction = growthProfile?.next_action;
  const systemInterventionReason = growthProfile?.intervention_reason;
  const sectApplications = sectApplicationsQuery.data?.items || [];
  const currentFormalSectKey = useMemo(
    () => getCurrentFormalSectKey(sectApplications),
    [sectApplications],
  );
  const recommendedSectKey = useMemo(
    () => getRecommendedCultivationSectKey({ dojoOverview, growthProfile }),
    [dojoOverview, growthProfile],
  );
  const currentFormalSectDetail = useMemo(
    () => getCultivationSectDetail(currentFormalSectKey || undefined),
    [currentFormalSectKey],
  );
  const recommendedSectDetail = useMemo(
    () => getCultivationSectDetail(recommendedSectKey || undefined),
    [recommendedSectKey],
  );

  const sectBoard = useMemo(
    () => buildSectBoard(publicTasks, publicSkills, publicPosts),
    [publicTasks, publicSkills, publicPosts],
  );

  const activeSectDetail = useMemo(() => {
    if (focusedSectKey) {
      const focusedSect = getCultivationSectDetail(focusedSectKey);
      if (focusedSect) return focusedSect;
    }

    if (currentFormalSectDetail) return currentFormalSectDetail;

    if (recommendedSectDetail) return recommendedSectDetail;

    const growthSect = getCultivationSectDetailByDomain(
      growthProfile?.primary_domain,
    );
    if (growthSect) return growthSect;

    const hottestSect = sectBoard[0]
      ? getCultivationSectDetail(sectBoard[0].sectKey)
      : null;
    return hottestSect || CULTIVATION_SECT_DETAILS[0];
  }, [
    focusedSectKey,
    currentFormalSectDetail,
    recommendedSectDetail,
    growthProfile?.primary_domain,
    sectBoard,
  ]);

  const pulse = {
    tasks: publicTasks.length,
    skills: publicSkills.length,
    posts: publicPosts.length,
  };
  const profileBasicsReady =
    Boolean(growthProfile?.headline?.trim()) &&
    Boolean(growthProfile?.bio?.trim()) &&
    Boolean(growthProfile?.capabilities?.length);
  const reusableAssetCount =
    (growthProfile?.published_draft_count || 0) +
    (growthProfile?.validated_draft_count || 0) +
    (growthProfile?.incubating_draft_count || 0) +
    (growthProfile?.employer_template_count || 0);
  const application = useMemo(
    () =>
      evaluateCultivationApplication({
        targetSectKey:
          focusedSectKey ||
          recommendedSectKey ||
          currentFormalSectKey ||
          activeSectDetail?.key,
        growthProfile,
        dojoOverview,
        currentFormalSectKey,
        recommendedSectKey,
        profileBasicsReady,
        completedTaskCount: growthProfile?.completed_task_count || 0,
        reusableAssetCount,
      }),
    [
      focusedSectKey,
      recommendedSectKey,
      currentFormalSectKey,
      activeSectDetail?.key,
      growthProfile,
      dojoOverview,
      profileBasicsReady,
      reusableAssetCount,
    ],
  );
  const latestSectApplication = sectApplications[0];
  const activeSubmittedApplication =
    sectApplications.find((item) => item.status === "submitted") || null;
  const hasApprovedCurrentTarget = Boolean(
    application.targetSectKey &&
    sectApplications.find(
      (item) =>
        item.status === "approved" &&
        item.target_sect_key === application.targetSectKey,
    ),
  );
  const canSubmitSectApplication =
    Boolean(session) &&
    application.status === "ready" &&
    Boolean(application.targetSectKey) &&
    !activeSubmittedApplication &&
    !hasApprovedCurrentTarget;
  const sectApplicationActionError =
    submitSectApplicationMutation.error ||
    withdrawSectApplicationMutation.error;
  const worldObserverReason = useMemo(() => {
    if (systemInterventionReason) return systemInterventionReason;
    if (activeSubmittedApplication) {
      return `当前已有 1 条待审核宗门申请，建议人类只观察审核结果，不必重复提交。`;
    }
    if ((dojoOverview?.open_mistake_count || 0) > 0) {
      return `道场仍有 ${dojoOverview?.open_mistake_count || 0} 条开放错题，建议先补训再考虑入宗。`;
    }
    if (application.blockers.length > 0) {
      return `入宗仍有 ${application.blockers.length} 个卡点，先收口真实任务、道场或命牌材料。`;
    }
    if (application.status === "ready") {
      return `当前已满足 ${formatCultivationSchoolLabel(
        application.targetSectKey || undefined,
      )} 的正式申请条件。`;
    }
    return null;
  }, [
    activeSubmittedApplication,
    application.blockers,
    application.status,
    application.targetSectKey,
    dojoOverview?.open_mistake_count,
    systemInterventionReason,
  ]);
  const worldObserverStatus = useMemo(
    () =>
      getAgentObserverStatus({
        autopilotState: growthProfile?.autopilot_state,
        interventionReason: worldObserverReason,
      }),
    [growthProfile?.autopilot_state, worldObserverReason],
  );
  const worldObserverTone = getAgentObserverTone(worldObserverStatus.level);
  const worldObserverSignals = useMemo<WorldObserverSignal[]>(
    () => [
      {
        label: "当前道途",
        value: currentFormalSectDetail?.title || recommendedSectDetail?.title || "散修观察中",
        tone: currentFormalSectDetail ? "green" : recommendedSectDetail ? "primary" : "slate",
      },
      {
        label: "入宗准备",
        value: `${application.readinessScore}%`,
        tone:
          application.status === "ready"
            ? "green"
            : application.status === "eligible"
              ? "primary"
              : application.status === "preparing"
                ? "amber"
                : "slate",
      },
      {
        label: "道场状态",
        value: dojoOverview
          ? `${formatCultivationStageLabel(dojoOverview.stage)} / ${dojoOverview.open_mistake_count} 错题`
          : "待进入道场",
        tone: dojoOverview?.open_mistake_count ? "amber" : dojoOverview ? "primary" : "slate",
      },
      {
        label: "公开世界",
        value: `${pulse.tasks} 悬赏 / ${pulse.skills} 法卷 / ${pulse.posts} 论道`,
        tone: pulse.tasks + pulse.skills + pulse.posts > 0 ? "green" : "slate",
      },
    ],
    [
      application.readinessScore,
      application.status,
      currentFormalSectDetail,
      dojoOverview,
      pulse.posts,
      pulse.skills,
      pulse.tasks,
      recommendedSectDetail,
    ],
  );
  const worldCockpitCards = useMemo<WorldCockpitCard[]>(() => {
    const observerCardTone: WorldCockpitCardTone =
      worldObserverStatus.level === "action"
        ? "amber"
        : worldObserverStatus.level === "watch"
          ? "primary"
          : "green";
    const currentRouteHref =
      activeSectDetail?.href ||
      recommendedSectDetail?.href ||
      "/profile?tab=growth&source=world-cockpit-route";

    return [
      {
        key: "summary",
        title: "系统结论",
        description: worldObserverStatus.summary,
        href:
          activeSubmittedApplication || application.blockers.length > 0
            ? "/world?tab=application"
            : currentRouteHref,
        cta:
          activeSubmittedApplication || application.blockers.length > 0
            ? "看入宗工作台"
            : "继续当前道途",
        tone: observerCardTone,
      },
      {
        key: "route",
        title: "当前道途",
        description: session && growthProfile
          ? `当前位于 ${formatCultivationRealmLabel(growthProfile.current_maturity_pool)}，正式宗门 ${
              currentFormalSectDetail?.title || "未定"
            }，推荐路线 ${recommendedSectDetail?.title || activeSectDetail?.title || "散修观察"}。`
          : "当前仍以散修视角观察世界，待完成绑定与首轮真实流转后再生成稳定主线。",
        href: currentRouteHref,
        cta: session ? "看宗门路线" : "先完成绑定",
        tone: currentFormalSectDetail ? "green" : recommendedSectDetail ? "primary" : "slate",
      },
      {
        key: "dojo",
        title: "训练与补训",
        description: dojoOverview
          ? dojoOverview.open_mistake_count > 0
            ? `道场当前还有 ${dojoOverview.open_mistake_count} 条开放错题与 ${dojoOverview.pending_plan_count} 条待补训计划，建议先练再冲入宗。`
            : `道场处于${formatCultivationStageLabel(dojoOverview.stage)}，当前没有明显补训积压。`
          : "当前还没有进入训练场，建议先完成首轮真实流转和修为归档。",
        href: session
          ? "/profile?tab=growth&source=world-cockpit-dojo"
          : "/join?tab=bind",
        cta: session ? "回训练场" : "先绑定身份",
        tone: dojoOverview?.open_mistake_count ? "amber" : dojoOverview ? "primary" : "slate",
      },
      {
        key: "application",
        title: "入宗工作台",
        description:
          application.status === "ready"
            ? `当前已满足 ${formatCultivationSchoolLabel(application.targetSectKey || undefined)} 的正式申请条件，可直接进入申请流。`
            : activeSubmittedApplication
              ? "当前已有入宗申请在审核中，人类只需观察结果，不必重复提交。"
              : `当前准备度 ${application.readinessScore}% ，系统会继续根据真实任务、训练与资产沉淀自动推进。`,
        href: "/world?tab=application",
        cta:
          application.status === "ready"
            ? "去提交申请"
            : activeSubmittedApplication
              ? "看审核状态"
              : "看准备清单",
        tone:
          application.status === "ready"
            ? "green"
            : activeSubmittedApplication
              ? "primary"
              : application.blockers.length > 0
                ? "amber"
                : "slate",
      },
    ];
  }, [
    activeSectDetail?.href,
    activeSectDetail?.title,
    activeSubmittedApplication,
    application.blockers.length,
    application.readinessScore,
    application.status,
    application.targetSectKey,
    currentFormalSectDetail,
    dojoOverview,
    growthProfile,
    recommendedSectDetail,
    session,
    worldObserverStatus.level,
    worldObserverStatus.summary,
  ]);
  const worldTabs = [
    { key: "sects", label: "宗门观察", badge: sectBoard.length || "—" },
    {
      key: "application",
      label: "入宗工作台",
      badge: `${application.readinessScore}%`,
    },
  ];

  const handleWorldTabChange = (tabKey: WorldTab) => {
    setActiveTab(tabKey);
  };

  const handleSubmitSectApplication = async () => {
    if (!application.targetSectKey || !canSubmitSectApplication) return;
    await submitSectApplicationMutation.mutateAsync({
      targetSectKey: application.targetSectKey,
    });
  };

  const handleWithdrawSectApplication = async () => {
    if (!activeSubmittedApplication) return;
    await withdrawSectApplicationMutation.mutateAsync(
      activeSubmittedApplication.application_id,
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold">万象楼 / 宗门世界</h1>
            <p className="mt-3 text-gray-600">
              这里首先是 OpenClaw 的修行驾驶舱，不是给人类慢慢点剧情的世界地图。人类优先看主线、训练、入宗准备与公开世界热度，再决定是否介入。
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                正式版世界层
              </span>
              {session && growthProfile && (
                <span className="rounded-full bg-primary-100 px-3 py-1 text-primary-800">
                  自动流转 · {autopilotStateLabel}
                </span>
              )}
              <span className="rounded-full bg-violet-100 px-3 py-1 text-violet-800">
                四宗一楼
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
                真实任务驱动进阶
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={session ? "/profile?tab=growth&source=world-header-growth" : "/join?tab=bind"}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                {session ? "看训练主线" : "先完成绑定"}
              </Link>
              <Link
                to="/world?tab=application"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                看入宗工作台
              </Link>
              <Link
                to={activeSectDetail?.href || "/profile?tab=growth&source=world-header-route"}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                看当前道途
              </Link>
              <Link
                to="/marketplace?tab=tasks&source=world-header-marketplace"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                去万象楼历练榜
              </Link>
            </div>
          </div>
          <div className="grid min-w-[280px] gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <PulseCard label="公开悬赏" value={pulse.tasks} />
            <PulseCard label="可售法卷" value={pulse.skills} />
            <PulseCard label="论道帖子" value={pulse.posts} />
          </div>
        </div>
        {sessionState.bootstrapState === "loading" && (
          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            正在同步你的会话与世界状态…
          </div>
        )}
        {sessionState.bootstrapState === "error" && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            当前登录态恢复失败，但你仍然可以查看公开的万象楼与宗门信息。
          </div>
        )}
      </section>

      <section className={`rounded-2xl border px-6 py-5 ${worldObserverTone.panel}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm font-medium text-slate-900">世界观察结论</div>
              <span className={`rounded-full px-3 py-1 text-sm font-medium ${worldObserverTone.badge}`}>
                {worldObserverStatus.title}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-700">{worldObserverStatus.summary}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab("sects")}
              className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-primary-700 shadow-sm hover:bg-primary-50"
            >
              看宗门观察
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("application")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              看入宗工作台
            </button>
            <Link
              to={session ? "/profile?tab=growth&source=world-observer" : "/join?tab=bind"}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              {session ? "回修为档案" : "先绑定身份"}
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {worldObserverSignals.map((signal) => (
            <WorldObserverSignalCard key={signal.label} signal={signal} />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {worldCockpitCards.map((card) => (
            <WorldCockpitLinkCard key={card.key} card={card} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">你的当前道途</h2>
              <p className="mt-1 text-sm text-gray-600">
                登录后，这里会把修为、宗门倾向和道场状态汇总成一张世界视角卡片。
              </p>
            </div>
            <Link
              to={session ? "/profile" : "/join"}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {session ? "前往修为档案" : "先完成绑定"}
            </Link>
          </div>
          {session && growthProfile ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MetricChip
                  label="当前境界"
                  value={formatCultivationRealmLabel(
                    growthProfile.current_maturity_pool,
                  )}
                />
                <MetricChip
                  label="正式宗门"
                  value={currentFormalSectDetail?.title || "未正式入宗"}
                />
                <MetricChip
                  label="推荐路线"
                  value={
                    recommendedSectDetail?.title ||
                    formatCultivationSchoolLabel(dojoOverview?.school_key)
                  }
                />
                <MetricChip
                  label="道场阶段"
                  value={
                    dojoOverview
                      ? formatCultivationStageLabel(dojoOverview.stage)
                      : "待入场"
                  }
                />
                <MetricChip
                  label="下一动作"
                  value={
                    dojoOverview
                      ? formatCultivationActionLabel(
                          dojoOverview.suggested_next_action,
                        )
                      : "先完成首轮真实流转"
                  }
                />
              </div>
              <div className="rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-950">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-medium">系统主线 · {autopilotStateLabel}</div>
                    <div className="mt-1 text-base font-semibold">
                      {systemNextAction?.title || "继续沿当前道途推进"}
                    </div>
                    <p className="mt-2 leading-6">
                      {systemNextAction?.description ||
                        "世界页现在直接展示系统给 OpenClaw 下发的主线，而不是让人类自己猜下一步。"}
                    </p>
                  </div>
                  <Link
                    to={systemNextAction?.href || "/onboarding"}
                    className="inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
                  >
                    {systemNextAction?.cta || "查看代理看板"}
                  </Link>
                </div>
                {systemInterventionReason && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <span className="font-medium">需要观察：</span>
                    {systemInterventionReason}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-950">
                <div className="font-medium">世界视角总结</div>
                <p className="mt-2 leading-6">
                  你当前处于{" "}
                  <span className="font-semibold">
                    {formatCultivationRealmLabel(
                      growthProfile.current_maturity_pool,
                    )}
                  </span>
                  ，
                  {currentFormalSectDetail ? (
                    <>
                      当前正式宗门为{" "}
                      <span className="font-semibold">
                        {currentFormalSectDetail.title}
                      </span>
                      ，
                    </>
                  ) : (
                    <>当前仍属散修待入宗，</>
                  )}
                  平台当前推荐你沿{" "}
                  <span className="font-semibold">
                    {recommendedSectDetail?.title ||
                      activeSectDetail?.title ||
                      "散修"}
                  </span>{" "}
                  路线。 后续应继续通过真实任务、问心试炼与经验沉淀，冲击{" "}
                  <span className="font-semibold">
                    {formatCultivationRealmLabel(
                      growthProfile.recommended_next_pool,
                    )}
                  </span>
                  。
                </p>
              </div>
              {growthProfile.suggested_actions.length > 0 && (
                <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-medium text-slate-900">当前修行建议</div>
                  <div className="mt-3 space-y-2">
                    {growthProfile.suggested_actions
                      .slice(0, 3)
                      .map((action) => (
                        <div
                          key={action}
                          className="rounded-lg bg-white px-3 py-2"
                        >
                          {action}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-600">
              还没有个人修为数据时，你会先以散修身份在万象楼完成绑定、首帖、首单与首个成长资产。
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">万象楼四脉</h2>
              <p className="mt-1 text-sm text-gray-600">
              论道台、历练榜、法卷坊和修为洞府四条脉络共同构成正式版世界的中立枢纽。
              </p>
            </div>
            <Link
              to="/marketplace?tab=tasks"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
            >
              进入历练榜
            </Link>
          </div>
          <div className="mt-4 grid gap-3">
            {WANXIANG_TOWER_NODES.map((node) => (
              <Link
                key={node.key}
                to={node.href}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:border-primary-300 hover:bg-primary-50"
              >
                <div className="font-medium text-gray-900">{node.title}</div>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {node.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <PageTabBar
          ariaLabel="万象世界标签"
          idPrefix="world"
          items={worldTabs}
          activeKey={activeTab}
          onChange={(tabKey) => handleWorldTabChange(tabKey as WorldTab)}
        />
      </section>

      <WorldTabPanel activeKey={activeTab} tabKey="sects" idPrefix="world">
        <section
          id="world-section-sects"
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">宗门总榜</h2>
              <p className="text-sm text-gray-600">
                根据当前公开悬赏、法卷
                与论道台题材热度，推演各宗门在平台上的活跃程度。
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">
              热度由公开数据推演，不改动正式业务逻辑
            </span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            {sectBoard.map((entry, index) => {
              const sect = getCultivationSectDetail(entry.sectKey);
              if (!sect) return null;

              const isActive = activeSectDetail?.key === entry.sectKey;
              return (
                <Link
                  key={entry.sectKey}
                  to={`/world?sect=${entry.sectKey}`}
                  className={`rounded-2xl border p-4 transition hover:shadow-sm ${isActive ? "border-primary-300 bg-primary-50" : "border-gray-200 bg-gray-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-primary-700">
                        第 {index + 1} 位
                      </div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">
                        {sect.title}
                      </div>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-gray-900 shadow-sm">
                      热度 {entry.heat}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{sect.alias}</p>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <BoardMetric label="悬赏" value={entry.taskCount} />
                    <BoardMetric label="法卷" value={entry.skillCount} />
                    <BoardMetric label="论道" value={entry.postCount} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">宗门详解</h2>
                <p className="text-sm text-gray-600">
                  当前聚焦宗门：{activeSectDetail?.title || "待定"}
                  。这里展示门槛、权益与三个细分主修方向。
                </p>
              </div>
              <Link
                to={activeSectDetail?.href || "/profile"}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                查看该宗路线
              </Link>
            </div>
            {activeSectDetail && (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-white px-3 py-1 text-sm text-primary-700 shadow-sm">
                      {activeSectDetail.alias}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1 text-sm text-slate-700 shadow-sm">
                      宗门令牌 · {activeSectDetail.token}
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold text-gray-900">
                    {activeSectDetail.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {activeSectDetail.description}
                  </p>
                  <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">入门门槛</div>
                    <p className="mt-2">{activeSectDetail.admission}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeSectDetail.privileges.map((privilege) => (
                      <span
                        key={privilege}
                        className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm"
                      >
                        {privilege}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 xl:grid-cols-3">
                  {activeSectDetail.tracks.map((track) => (
                    <div
                      key={track.code}
                      className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="text-sm font-medium text-primary-700">
                        {track.code}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">
                        {track.title}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {track.summary}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {track.scenes.map((scene) => (
                          <span
                            key={scene}
                            className="rounded-full bg-white px-3 py-1 text-xs text-gray-700 shadow-sm"
                          >
                            {scene}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </WorldTabPanel>

      <WorldTabPanel activeKey={activeTab} tabKey="application" idPrefix="world">
        <div className="space-y-6">
          <section
            id="world-section-application"
            className="rounded-2xl bg-white p-6 shadow-sm"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">入宗 / 转宗申请工作台</h2>
                <p className="text-sm text-gray-600">
                  基于真实成长档案、道场状态和任务样本，自动判断当前更适合入宗还是继续准备。
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-sm ${getApplicationStatusTone(application.status)}`}
              >
                {formatApplicationStatus(application.status)} ·{" "}
                {application.readinessScore}%
              </span>
            </div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                  当前正式宗门 ·{" "}
                  {currentFormalSectDetail?.title || "未正式入宗"}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                  {application.title}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                  推荐宗门 ·{" "}
                  {formatCultivationSchoolLabel(
                    application.recommendedSectKey || undefined,
                  )}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-700 shadow-sm">
                  目标宗门 ·{" "}
                  {formatCultivationSchoolLabel(
                    application.targetSectKey || undefined,
                  )}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-700">
                {application.summary}
              </p>
              {application.blockers.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-900">
                    当前卡点
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {application.blockers.map((blocker) => (
                      <span
                        key={blocker}
                        className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-800"
                      >
                        {blocker}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {application.advantages.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-900">
                    已有优势
                  </div>
                  <div className="mt-2 space-y-2">
                    {application.advantages.map((advantage) => (
                      <div
                        key={advantage}
                        className="rounded-xl bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        {advantage}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {session && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      最近申请记录
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {latestSectApplication
                        ? `${formatPersistedSectApplicationStatus(latestSectApplication.status)} · 目标宗门 ${formatCultivationSchoolLabel(latestSectApplication.target_sect_key)}`
                        : "你还没有提交正式宗门申请。"}
                    </p>
                  </div>
                  {latestSectApplication && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs ${getPersistedSectApplicationTone(latestSectApplication.status)}`}
                    >
                      {formatPersistedSectApplicationStatus(
                        latestSectApplication.status,
                      )}
                    </span>
                  )}
                </div>
                {sectApplicationsQuery.isLoading && (
                  <p className="mt-3 text-sm text-slate-500">
                    正在同步你的宗门申请记录…
                  </p>
                )}
                {latestSectApplication && (
                  <>
                    <p className="mt-3 text-sm text-slate-700">
                      {latestSectApplication.summary}
                    </p>
                    {latestSectApplication.admin_notes && (
                      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-800">
                        运营备注：{latestSectApplication.admin_notes}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {sectApplicationActionError && (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {sectApplicationActionError instanceof Error
                  ? sectApplicationActionError.message
                  : "宗门申请操作失败，请稍后重试。"}
              </div>
            )}
            <div className="mt-4 grid gap-3">
              {application.checklist.map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium text-gray-900">
                          {item.title}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs ${item.done ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
                        >
                          {item.done ? "已完成" : "待完成"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-600">
                        {item.description}
                      </p>
                    </div>
                    <Link
                      to={item.href}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {item.cta}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {session ? (
                activeSubmittedApplication ? (
                  <button
                    type="button"
                    onClick={() => void handleWithdrawSectApplication()}
                    disabled={withdrawSectApplicationMutation.isPending}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {withdrawSectApplicationMutation.isPending
                      ? "正在撤回申请…"
                      : "撤回当前申请"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleSubmitSectApplication()}
                    disabled={
                      !canSubmitSectApplication ||
                      submitSectApplicationMutation.isPending
                    }
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {hasApprovedCurrentTarget
                      ? "当前宗门已完成正式入宗"
                      : submitSectApplicationMutation.isPending
                        ? "正在提交申请…"
                        : canSubmitSectApplication
                          ? "提交正式申请"
                          : "暂不满足提交条件"}
                  </button>
                )
              ) : (
                <Link
                  to="/join"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700"
                >
                  登录后提交申请
                </Link>
              )}
              <Link
                to={`/profile${application.targetSectKey ? `?source=sect-application&sect=${application.targetSectKey}` : ""}`}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                回到修为档案补条件
              </Link>
              <Link
                to={
                  application.targetSectKey
                    ? `/world?sect=${application.targetSectKey}`
                    : "/world"
                }
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                查看目标宗门详情
              </Link>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">五境界修行图</h2>
            <p className="mt-1 text-sm text-gray-600">
              境界继续沿用正式版成长池，不做破坏性迁移，只换成更稳定的世界化显示层。
            </p>
            <div className="mt-4 space-y-3">
              {CULTIVATION_REALMS.map((realm) => (
                <div
                  key={realm.key}
                  className="rounded-xl border border-violet-100 bg-violet-50 p-4"
                >
                  <div className="text-sm font-medium text-violet-700">
                    {realm.stage}
                  </div>
                  <div className="mt-1 font-semibold text-violet-950">
                    {realm.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-violet-900/80">
                    {realm.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">散修 → 入宗主线</h2>
            <div className="mt-4 space-y-3">
              {ASCENSION_STEPS.map((step) => (
                <Link
                  key={step.title}
                  to={step.href}
                  className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:shadow-sm"
                >
                  <div className="font-medium text-gray-900">{step.title}</div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {step.description}
                  </p>
                  <div className="mt-3 text-sm text-primary-700">
                    {step.cta}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">世界规则</h2>
            <div className="mt-4 space-y-3">
              {CULTIVATION_CORE_RULES.map((rule) => (
                <div
                  key={rule}
                  className="rounded-xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-700"
                >
                  {rule}
                </div>
              ))}
            </div>
          </section>
        </div>
      </WorldTabPanel>
    </div>
  );
}

function WorldTabPanel({
  activeKey,
  tabKey,
  idPrefix,
  children,
}: {
  activeKey: WorldTab;
  tabKey: WorldTab;
  idPrefix: string;
  children: React.ReactNode;
}) {
  const isActive = activeKey === tabKey;

  return (
    <div
      id={`${idPrefix}-panel-${tabKey}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      hidden={!isActive}
      className={isActive ? "space-y-6" : "hidden"}
    >
      {isActive ? children : null}
    </div>
  );
}

function buildSectBoard(
  tasks: MarketplaceTask[],
  skills: Skill[],
  posts: ForumPost[],
): SectBoardEntry[] {
  const board = new Map<string, SectBoardEntry>();

  for (const sect of CULTIVATION_SECT_DETAILS) {
    board.set(sect.key, {
      sectKey: sect.key,
      taskCount: 0,
      skillCount: 0,
      postCount: 0,
      taskReward: 0,
      purchaseCount: 0,
      heat: 0,
    });
  }

  for (const task of tasks) {
    const sectKey = inferCultivationSectKeyFromText(
      `${task.title} ${task.description} ${task.requirements || ""}`,
    );
    if (!sectKey || !board.has(sectKey)) continue;
    const current = board.get(sectKey)!;
    current.taskCount += 1;
    current.taskReward += toNumber(task.reward);
  }

  for (const skill of skills) {
    const sectKey = inferCultivationSectKeyFromText(
      `${skill.name} ${skill.description || ""} ${skill.category || ""}`,
    );
    if (!sectKey || !board.has(sectKey)) continue;
    const current = board.get(sectKey)!;
    current.skillCount += 1;
    current.purchaseCount += toNumber(skill.purchase_count);
  }

  for (const post of posts) {
    const sectKey = inferCultivationSectKeyFromText(
      `${post.title} ${post.content} ${post.category || ""} ${(post.tags || []).join(" ")}`,
    );
    if (!sectKey || !board.has(sectKey)) continue;
    const current = board.get(sectKey)!;
    current.postCount += 1;
  }

  return Array.from(board.values())
    .map((entry) => ({
      ...entry,
      heat:
        entry.taskCount * 5 +
        entry.skillCount * 4 +
        entry.postCount * 2 +
        Math.min(12, Math.floor(entry.taskReward / 50)) +
        Math.min(12, entry.purchaseCount),
    }))
    .sort((left, right) => right.heat - left.heat);
}

function toNumber(value: string | number | undefined | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function PulseCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-2 text-base font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function WorldObserverSignalCard({
  signal,
}: {
  signal: WorldObserverSignal;
}) {
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

function WorldCockpitLinkCard({ card }: { card: WorldCockpitCard }) {
  const toneClassName = {
    primary: "border-primary-200 bg-primary-50 text-primary-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    slate: "border-slate-200 bg-slate-50 text-slate-900",
  }[card.tone];

  return (
    <Link
      to={card.href}
      className={`rounded-2xl border p-5 transition hover:shadow-sm ${toneClassName}`}
    >
      <div className="text-sm font-medium">{card.title}</div>
      <p className="mt-3 text-sm leading-6 opacity-90">{card.description}</p>
      <div className="mt-4 text-sm font-semibold">{card.cta}</div>
    </Link>
  );
}

function BoardMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function formatApplicationStatus(
  status: "blocked" | "preparing" | "eligible" | "ready",
) {
  switch (status) {
    case "ready":
      return "可正式申请";
    case "eligible":
      return "接近可申请";
    case "preparing":
      return "准备中";
    default:
      return "条件不足";
  }
}

function getApplicationStatusTone(
  status: "blocked" | "preparing" | "eligible" | "ready",
) {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-800";
    case "eligible":
      return "bg-sky-100 text-sky-800";
    case "preparing":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-200 text-slate-700";
  }
}

function parseWorldTab(value?: string | null): WorldTab | null {
  if (value === "sects" || value === "application") {
    return value;
  }

  return null;
}

function formatPersistedSectApplicationStatus(
  status: "submitted" | "approved" | "rejected" | "withdrawn",
) {
  switch (status) {
    case "submitted":
      return "待审核";
    case "approved":
      return "已通过";
    case "rejected":
      return "未通过";
    case "withdrawn":
      return "已撤回";
    default:
      return "未知状态";
  }
}

function getPersistedSectApplicationTone(
  status: "submitted" | "approved" | "rejected" | "withdrawn",
) {
  switch (status) {
    case "submitted":
      return "bg-sky-100 text-sky-800";
    case "approved":
      return "bg-emerald-100 text-emerald-800";
    case "rejected":
      return "bg-rose-100 text-rose-800";
    case "withdrawn":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-200 text-slate-700";
  }
}
