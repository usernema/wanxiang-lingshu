import { screen } from "@testing-library/react";
import { vi } from "vitest";
import CultivationWorld from "@/pages/CultivationWorld";
import { renderWithProviders } from "@/test/renderWithProviders";
import { buildSessionState } from "@/test/fixtures/marketplace";
import { mockApiGet, mockGetActiveSession } from "@/test/apiMock";

const mockFetchCurrentAgentGrowth = vi.fn();
const mockFetchCurrentDojoOverview = vi.fn();
const mockFetchMySectApplications = vi.fn();
const mockFetchRankingsOverview = vi.fn();
const mockSubmitSectApplication = vi.fn();
const mockWithdrawSectApplication = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getActiveSession: () => mockGetActiveSession(),
    fetchCurrentAgentGrowth: () => mockFetchCurrentAgentGrowth(),
    fetchCurrentDojoOverview: () => mockFetchCurrentDojoOverview(),
    fetchMySectApplications: () => mockFetchMySectApplications(),
    fetchRankingsOverview: () => mockFetchRankingsOverview(),
    submitSectApplication: (...args: unknown[]) =>
      mockSubmitSectApplication(...args),
    withdrawSectApplication: (...args: unknown[]) =>
      mockWithdrawSectApplication(...args),
    api: {
      get: (endpoint: string) => mockApiGet(endpoint),
    },
  };
});

describe("CultivationWorld", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveSession.mockReturnValue({
      aid: "worker-agent",
      token: "worker-token",
      role: "worker",
      status: "active",
    });
    mockFetchCurrentAgentGrowth.mockResolvedValue({
      profile: {
        aid: "worker-agent",
        model: "Claude Worker",
        provider: "anthropic",
        capabilities: ["coding"],
        reputation: 88,
        status: "active",
        primary_domain: "development",
        domain_scores: { development: 91 },
        current_maturity_pool: "standard",
        recommended_task_scope: "standard_access",
        auto_growth_eligible: false,
        completed_task_count: 6,
        active_skill_count: 3,
        total_task_count: 8,
        incubating_draft_count: 1,
        validated_draft_count: 2,
        published_draft_count: 1,
        employer_template_count: 1,
        template_reuse_count: 1,
        promotion_readiness_score: 72,
        recommended_next_pool: "preferred",
        promotion_candidate: true,
        suggested_actions: [
          "继续完成真实自动化任务，并把成功经验沉淀成公开法卷。",
        ],
        risk_flags: [],
        evaluation_summary: "当前处于稳定交付阶段。",
        autopilot_state: "healthy_autopilot",
        next_action: {
          key: "healthy_autopilot",
          title: "维持自动流转并扩大样本",
          description: "主线状态健康，系统会继续接任务、沉淀经验并扩大复用。",
          href: "/onboarding",
          cta: "查看代理看板",
        },
        last_evaluated_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
        created_at: "2026-03-15T00:00:00.000Z",
      },
      pools: [],
    });
    mockFetchCurrentDojoOverview.mockResolvedValue({
      aid: "worker-agent",
      school_key: "automation_ops",
      stage: "diagnostic",
      mistake_count: 1,
      open_mistake_count: 1,
      pending_plan_count: 1,
      suggested_next_action: "complete_diagnostic",
    });
    mockFetchMySectApplications.mockResolvedValue({
      items: [],
      limit: 10,
    });
    mockFetchRankingsOverview.mockResolvedValue({
      boards: {
        sect_weekly: [],
        rising_rookie: [],
        win_streak: [],
        first_scroll_fame: [],
        employer_favorite: [],
      },
      updated_at: "2026-03-15T00:00:00.000Z",
    });
    mockSubmitSectApplication.mockResolvedValue(undefined);
    mockWithdrawSectApplication.mockResolvedValue(undefined);
    mockApiGet.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/v1/forum/posts") {
        return {
          data: {
            data: [
              {
                id: 1,
                post_id: "post-1",
                author_aid: "a1",
                title: "自动化流程复盘",
                content: "这次 workflow 编排和 api 集成很顺。",
                view_count: 10,
                like_count: 3,
                comment_count: 1,
                created_at: "2026-03-15T00:00:00.000Z",
              },
              {
                id: 2,
                post_id: "post-2",
                author_aid: "a2",
                title: "安全审计清单",
                content: "整理了一套合规和隐私治理方案。",
                view_count: 8,
                like_count: 2,
                comment_count: 1,
                created_at: "2026-03-15T00:00:00.000Z",
              },
            ],
          },
        };
      }
      if (endpoint === "/v1/marketplace/tasks") {
        return {
          data: [
            {
              id: 1,
              task_id: "task-1",
              employer_aid: "employer-a",
              title: "自动化流程编排",
              description: "需要 workflow、api integration 与脚本开发。",
              reward: 120,
              status: "open",
              created_at: "2026-03-15T00:00:00.000Z",
            },
            {
              id: 2,
              task_id: "task-2",
              employer_aid: "employer-b",
              title: "数据分析报告",
              description: "需要商业数据分析和预测。",
              reward: 80,
              status: "open",
              created_at: "2026-03-15T00:00:00.000Z",
            },
          ],
        };
      }
      if (endpoint === "/v1/marketplace/skills") {
        return {
          data: [
            {
              id: 1,
              skill_id: "skill-1",
              author_aid: "worker-a",
              name: "API 集成法卷",
              description: "覆盖接口集成与自动化交付。",
              price: 29,
              purchase_count: 4,
              view_count: 20,
              status: "active",
            },
            {
              id: 2,
              skill_id: "skill-2",
              author_aid: "worker-b",
              name: "内容运营模板",
              description: "适合内容增长和对话设计。",
              price: 19,
              purchase_count: 2,
              view_count: 15,
              status: "active",
            },
          ],
        };
      }
      throw new Error(`Unhandled GET endpoint: ${endpoint}`);
    });
  });

  it("renders world entry, personalized cultivation summary, and sect details", async () => {
    renderWithProviders(
      <CultivationWorld sessionState={buildSessionState()} />,
      {
        initialEntries: ["/world?sect=automation_ops"],
      },
    );

    expect(await screen.findByText("万象楼 / 宗门世界")).toBeInTheDocument();
    expect(screen.getByText("世界观察结论")).toBeInTheDocument();
    expect(await screen.findByText("世界视角总结")).toBeInTheDocument();
    expect(screen.getByText("你的当前道途")).toBeInTheDocument();
    expect(screen.getByText("系统主线 · 自动流转稳定")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("宗门总榜")).toBeInTheDocument();
    expect(screen.getByText("当前境界")).toBeInTheDocument();
    expect(screen.getAllByText("金丹期").length).toBeGreaterThan(0);
    expect(screen.getAllByText("铸器谷").length).toBeGreaterThan(0);
    expect(screen.getByText("宗门令牌 · 铸器锤")).toBeInTheDocument();
    expect(screen.getByText("ZQ-001")).toBeInTheDocument();
    expect(screen.getByText("公开悬赏")).toBeInTheDocument();
    expect(
      screen.getByText("继续完成真实自动化任务，并把成功经验沉淀成公开法卷。"),
    ).toBeInTheDocument();
    expect(screen.getByText("入宗 / 转宗申请工作台")).toBeInTheDocument();
    expect(screen.getByText("五境界修行图")).toBeInTheDocument();
    expect(screen.getByText("散修 → 入宗主线")).toBeInTheDocument();
  });

  it("supports direct deep links to the application tab", async () => {
    renderWithProviders(
      <CultivationWorld sessionState={buildSessionState()} />,
      {
        initialEntries: ["/world?tab=application"],
      },
    );

    expect(await screen.findByText("已按深链展开入宗工作台段。世界页现在会把三段观察内容连续展示，减少来回切页和切 tab。")).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("入宗 / 转宗申请工作台")).toBeInTheDocument();
  });

  it("separates formal sect membership from recommended route", async () => {
    mockFetchCurrentAgentGrowth.mockResolvedValue({
      profile: {
        aid: "worker-agent",
        model: "Claude Worker",
        provider: "anthropic",
        capabilities: ["coding"],
        reputation: 88,
        status: "active",
        primary_domain: "content",
        domain_scores: { content: 93 },
        current_maturity_pool: "standard",
        recommended_task_scope: "standard_access",
        auto_growth_eligible: false,
        completed_task_count: 6,
        active_skill_count: 3,
        total_task_count: 8,
        incubating_draft_count: 1,
        validated_draft_count: 2,
        published_draft_count: 1,
        employer_template_count: 1,
        template_reuse_count: 1,
        promotion_readiness_score: 72,
        recommended_next_pool: "preferred",
        promotion_candidate: true,
        suggested_actions: ["继续积累内容交付闭环。"],
        risk_flags: [],
        evaluation_summary: "当前处于稳定交付阶段。",
        autopilot_state: "promotion_window",
        next_action: {
          key: "promotion_window",
          title: "进入晋级窗口",
          description: "当前主线已经比较稳定，下一步是补齐最后一项证据。",
          href: "/profile?source=growth-promotion",
          cta: "查看成长档案",
        },
        last_evaluated_at: "2026-03-15T00:00:00.000Z",
        updated_at: "2026-03-15T00:00:00.000Z",
        created_at: "2026-03-15T00:00:00.000Z",
        headline: "内容型 OpenClaw",
        bio: "擅长内容任务。",
      },
      pools: [],
    });
    mockFetchCurrentDojoOverview.mockResolvedValue({
      aid: "worker-agent",
      school_key: "content_ops",
      stage: "practice",
      mistake_count: 0,
      open_mistake_count: 0,
      pending_plan_count: 0,
      suggested_next_action: "review_mistakes",
    });
    mockFetchMySectApplications.mockResolvedValue({
      items: [
        {
          id: 1,
          application_id: "sectapp-approved",
          aid: "worker-agent",
          current_sect_key: "",
          target_sect_key: "automation_ops",
          recommended_sect_key: "automation_ops",
          application_type: "application",
          status: "approved",
          readiness_score: 100,
          summary: "已正式入宗铸器谷。",
          blockers: [],
          advantages: [],
          evidence: {},
          submitted_at: "2026-03-15T00:00:00.000Z",
          reviewed_at: "2026-03-15T00:00:00.000Z",
          reviewed_by: "admin",
          created_at: "2026-03-15T00:00:00.000Z",
          updated_at: "2026-03-15T00:00:00.000Z",
        },
      ],
      limit: 10,
    });

    renderWithProviders(
      <CultivationWorld sessionState={buildSessionState()} />,
      {
        initialEntries: ["/world"],
      },
    );

    expect(await screen.findByText("正式宗门")).toBeInTheDocument();
    expect(screen.getByText("推荐路线")).toBeInTheDocument();
    expect(screen.getByText("当前正式宗门 · 铸器谷")).toBeInTheDocument();
    expect(screen.getByText("推荐宗门 · 御灵宗")).toBeInTheDocument();
    expect(screen.getByText("转宗审议：御灵宗")).toBeInTheDocument();
  });
});
