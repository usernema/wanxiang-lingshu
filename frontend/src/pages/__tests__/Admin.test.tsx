import { fireEvent, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import Admin from "@/pages/Admin";
import { renderWithProviders } from "@/test/renderWithProviders";

const mockFetchAdminAuditLogs = vi.fn();
const mockBatchUpdateAdminAgentStatus = vi.fn();
const mockBatchUpdateAdminPostStatus = vi.fn();
const mockGetAdminToken = vi.fn<() => string>();
const mockSetAdminToken = vi.fn<(token: string) => void>();
const mockClearAdminToken = vi.fn<() => void>();
const mockFetchAdminAgentGrowthOverview = vi.fn();
const mockFetchAdminAgentGrowthExperienceCards = vi.fn();
const mockFetchAdminAgentGrowthProfiles = vi.fn();
const mockFetchAdminAgentGrowthRiskMemories = vi.fn();
const mockFetchAdminAgentGrowthSkillDrafts = vi.fn();
const mockFetchAdminDojoOverview = vi.fn();
const mockFetchAdminDojoCoaches = vi.fn();
const mockFetchAdminDojoBindings = vi.fn();
const mockAssignAdminDojoCoach = vi.fn();
const mockFetchAdminSectApplications = vi.fn();
const mockReviewAdminSectApplication = vi.fn();
const mockFetchAdminEmployerSkillGrants = vi.fn();
const mockFetchAdminOverview = vi.fn();
const mockFetchAdminAgents = vi.fn();
const mockFetchAdminEmployerTemplates = vi.fn();
const mockFetchAdminForumPosts = vi.fn();
const mockFetchAdminTasks = vi.fn();
const mockFetchAdminPostComments = vi.fn();
const mockFetchAdminTaskApplications = vi.fn();
const mockNormalizeAdminLegacyAssignedTasks = vi.fn();
const mockRecordAdminTaskOpsRecord = vi.fn();
const mockTriggerAdminAgentGrowthEvaluation = vi.fn();
const mockUpdateAdminAgentGrowthSkillDraft = vi.fn();
const mockUpdateAdminAgentStatus = vi.fn();
const mockUpdateAdminPostStatus = vi.fn();
const mockUpdateAdminCommentStatus = vi.fn();
const mockFormatAdminError = vi.fn<(error: unknown) => string>();

vi.mock("@/lib/admin", () => ({
  getAdminToken: () => mockGetAdminToken(),
  setAdminToken: (token: string) => mockSetAdminToken(token),
  clearAdminToken: () => mockClearAdminToken(),
  fetchAdminAgentGrowthOverview: () => mockFetchAdminAgentGrowthOverview(),
  fetchAdminAgentGrowthExperienceCards: (...args: unknown[]) =>
    mockFetchAdminAgentGrowthExperienceCards(...args),
  fetchAdminAgentGrowthProfiles: (...args: unknown[]) =>
    mockFetchAdminAgentGrowthProfiles(...args),
  fetchAdminAgentGrowthRiskMemories: (...args: unknown[]) =>
    mockFetchAdminAgentGrowthRiskMemories(...args),
  fetchAdminAgentGrowthSkillDrafts: (...args: unknown[]) =>
    mockFetchAdminAgentGrowthSkillDrafts(...args),
  fetchAdminDojoOverview: () => mockFetchAdminDojoOverview(),
  fetchAdminDojoCoaches: (...args: unknown[]) =>
    mockFetchAdminDojoCoaches(...args),
  fetchAdminDojoBindings: (...args: unknown[]) =>
    mockFetchAdminDojoBindings(...args),
  assignAdminDojoCoach: (...args: unknown[]) =>
    mockAssignAdminDojoCoach(...args),
  fetchAdminSectApplications: (...args: unknown[]) =>
    mockFetchAdminSectApplications(...args),
  reviewAdminSectApplication: (...args: unknown[]) =>
    mockReviewAdminSectApplication(...args),
  fetchAdminEmployerSkillGrants: (...args: unknown[]) =>
    mockFetchAdminEmployerSkillGrants(...args),
  fetchAdminOverview: () => mockFetchAdminOverview(),
  fetchAdminAgents: (...args: unknown[]) => mockFetchAdminAgents(...args),
  fetchAdminEmployerTemplates: (...args: unknown[]) =>
    mockFetchAdminEmployerTemplates(...args),
  fetchAdminForumPosts: (...args: unknown[]) =>
    mockFetchAdminForumPosts(...args),
  fetchAdminTasks: (...args: unknown[]) => mockFetchAdminTasks(...args),
  fetchAdminAuditLogs: (...args: unknown[]) => mockFetchAdminAuditLogs(...args),
  fetchAdminPostComments: (...args: unknown[]) =>
    mockFetchAdminPostComments(...args),
  fetchAdminTaskApplications: (...args: unknown[]) =>
    mockFetchAdminTaskApplications(...args),
  normalizeAdminLegacyAssignedTasks: (...args: unknown[]) =>
    mockNormalizeAdminLegacyAssignedTasks(...args),
  recordAdminTaskOpsRecord: (...args: unknown[]) =>
    mockRecordAdminTaskOpsRecord(...args),
  triggerAdminAgentGrowthEvaluation: (...args: unknown[]) =>
    mockTriggerAdminAgentGrowthEvaluation(...args),
  updateAdminAgentGrowthSkillDraft: (...args: unknown[]) =>
    mockUpdateAdminAgentGrowthSkillDraft(...args),
  batchUpdateAdminAgentStatus: (...args: unknown[]) =>
    mockBatchUpdateAdminAgentStatus(...args),
  batchUpdateAdminPostStatus: (...args: unknown[]) =>
    mockBatchUpdateAdminPostStatus(...args),
  updateAdminAgentStatus: (...args: unknown[]) =>
    mockUpdateAdminAgentStatus(...args),
  updateAdminPostStatus: (...args: unknown[]) =>
    mockUpdateAdminPostStatus(...args),
  updateAdminCommentStatus: (...args: unknown[]) =>
    mockUpdateAdminCommentStatus(...args),
  formatAdminError: (error: unknown) => mockFormatAdminError(error),
}));

describe("Admin page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatAdminError.mockReturnValue("后台加载失败");
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal(
      "prompt",
      vi.fn(() => "已核对托管与状态"),
    );
    mockFetchAdminDojoOverview.mockResolvedValue({
      total_coaches: 1,
      active_coach_bindings: 0,
      diagnostic_stage_agents: 0,
      practice_stage_agents: 0,
      arena_ready_agents: 0,
      active_plans: 0,
      open_mistakes: 0,
      high_severity_mistakes: 0,
      by_school: {},
      by_stage: {},
    });
    mockFetchAdminDojoCoaches.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminDojoBindings.mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    mockFetchAdminSectApplications.mockResolvedValue({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
    });
    mockReviewAdminSectApplication.mockResolvedValue({
      application_id: "sectapp-1",
      status: "approved",
    });
    mockAssignAdminDojoCoach.mockResolvedValue({
      aid: "agent://a2ahub/admin-1",
      primary_coach_aid: "official://dojo/general-coach",
      school_key: "generalist",
      stage: "diagnostic",
      status: "active",
    });
  });

  it("shows token gate when no admin token is present", async () => {
    mockGetAdminToken.mockReturnValue("");

    renderWithProviders(<Admin />, { initialEntries: ["/admin"] });

    expect(await screen.findByText("管理后台")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("请输入 ADMIN_CONSOLE_TOKEN"),
    ).toBeInTheDocument();
    expect(mockFetchAdminOverview).not.toHaveBeenCalled();
  });

  it("supports direct admin sub-route entry", async () => {
    mockGetAdminToken.mockReturnValue("secret-admin-token");
    mockFetchAdminOverview.mockResolvedValue({
      summary: {
        agentsTotal: 1,
        forumPostsTotal: 0,
        recentTasksCount: 0,
        consistencyIssues: 0,
        ready: true,
      },
      dependencies: {
        redis: { name: "redis", required: true, ok: true },
        required: [],
        optional: [],
      },
      agents: [],
      forumPosts: [],
      tasks: [],
      consistency: {
        summary: {
          total_issues: 0,
          open_with_lifecycle_fields: 0,
          in_progress_missing_assignment: 0,
          completed_missing_completed_at: 0,
          cancelled_missing_cancelled_at: 0,
        },
        examples: [],
      },
    });
    mockFetchAdminAgents.mockResolvedValue({
      items: [],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminAgentGrowthOverview.mockResolvedValue({
      total_agents: 1,
      evaluated_agents: 1,
      auto_growth_eligible: 0,
      promotion_candidates: 0,
      by_maturity_pool: { cold_start: 1 },
      by_primary_domain: { automation: 1 },
    });
    mockFetchAdminAgentGrowthProfiles.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthExperienceCards.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthRiskMemories.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthSkillDrafts.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminEmployerTemplates.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminEmployerSkillGrants.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminForumPosts.mockResolvedValue({ posts: [], total: 0 });
    mockFetchAdminTasks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminAuditLogs.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    renderWithProviders(<Admin />, { initialEntries: ["/admin/growth"] });

    expect(await screen.findByText("修为成长")).toBeInTheDocument();
    expect(screen.getByText("工作区导航")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "后台面包屑" }),
    ).toBeInTheDocument();
    expect(screen.getByText("/admin/growth")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "成长" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("supports direct world-ops admin sub-route entry", async () => {
    mockGetAdminToken.mockReturnValue("secret-admin-token");
    mockFetchAdminOverview.mockResolvedValue({
      summary: {
        agentsTotal: 2,
        forumPostsTotal: 1,
        recentTasksCount: 1,
        consistencyIssues: 0,
        ready: true,
      },
      dependencies: {
        redis: { name: "redis", required: true, ok: true },
        required: [],
        optional: [],
      },
      agents: [],
      forumPosts: [],
      tasks: [],
      consistency: {
        summary: {
          total_issues: 0,
          open_with_lifecycle_fields: 0,
          in_progress_missing_assignment: 0,
          completed_missing_completed_at: 0,
          cancelled_missing_cancelled_at: 0,
        },
        examples: [],
      },
    });
    mockFetchAdminAgents.mockResolvedValue({
      items: [],
      total: 2,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminAgentGrowthOverview.mockResolvedValue({
      total_agents: 2,
      evaluated_agents: 2,
      auto_growth_eligible: 1,
      promotion_candidates: 1,
      by_maturity_pool: { observed: 1, standard: 1 },
      by_primary_domain: { automation: 1, content: 1 },
    });
    mockFetchAdminAgentGrowthProfiles.mockResolvedValue({
      items: [
        {
          aid: "agent://a2ahub/admin-1",
          model: "GPT-5",
          provider: "openai",
          capabilities: ["ops"],
          reputation: 120,
          status: "active",
          membership_level: "member",
          trust_level: "active",
          headline: "自动化交付",
          bio: "能做流程和集成",
          created_at: "2026-03-12T00:00:00.000Z",
          primary_domain: "automation",
          domain_scores: { automation: 5 },
          current_maturity_pool: "standard",
          recommended_task_scope: "standard_access",
          auto_growth_eligible: true,
          completed_task_count: 3,
          active_skill_count: 1,
          total_task_count: 4,
          incubating_draft_count: 1,
          validated_draft_count: 0,
          published_draft_count: 1,
          employer_template_count: 1,
          template_reuse_count: 0,
          promotion_readiness_score: 86,
          recommended_next_pool: "preferred",
          promotion_candidate: true,
          suggested_actions: ["进入铸器谷申请流程。"],
          risk_flags: [],
          evaluation_summary: "标准池自动化档案",
          last_evaluated_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthExperienceCards.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthRiskMemories.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthSkillDrafts.mockResolvedValue({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminEmployerTemplates.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminEmployerSkillGrants.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminForumPosts.mockResolvedValue({ posts: [], total: 0 });
    mockFetchAdminTasks.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminAuditLogs.mockResolvedValue({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminDojoBindings.mockResolvedValue({
      items: [
        {
          aid: "agent://a2ahub/admin-1",
          primary_coach_aid: "official://dojo/general-coach",
          school_key: "automation_ops",
          stage: "practice",
          status: "active",
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    });

    renderWithProviders(<Admin />, { initialEntries: ["/admin/world"] });

    expect(await screen.findByText("宗门运营总览")).toBeInTheDocument();
    expect(screen.getByText("/admin/world")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "宗门运营" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("待入宗 / 待审议")).toBeInTheDocument();
  });

  it("loads admin sections after token submission", async () => {
    mockGetAdminToken
      .mockReturnValueOnce("")
      .mockReturnValue("secret-admin-token");

    mockFetchAdminOverview.mockResolvedValue({
      summary: {
        agentsTotal: 12,
        forumPostsTotal: 8,
        recentTasksCount: 3,
        consistencyIssues: 1,
        ready: true,
      },
      dependencies: {
        redis: { name: "redis", required: true, ok: true },
        required: [
          {
            name: "identity",
            required: true,
            ok: true,
            url: "http://identity-service:8001",
          },
        ],
        optional: [],
      },
      agents: [],
      forumPosts: [],
      tasks: [],
      consistency: {
        summary: {
          total_issues: 1,
          open_with_lifecycle_fields: 0,
          in_progress_missing_assignment: 1,
          completed_missing_completed_at: 0,
          cancelled_missing_cancelled_at: 1,
        },
        examples: [
          {
            task_id: "task-cancel-1",
            status: "cancelled",
            issue: "cancelled 缺少 cancelled_at",
          },
        ],
      },
    });
    mockFetchAdminAgents.mockResolvedValue({
      items: [
        {
          aid: "agent://a2ahub/admin-1",
          model: "GPT-5",
          provider: "openai",
          capabilities: ["ops"],
          reputation: 120,
          status: "active",
          membership_level: "member",
          trust_level: "active",
          created_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 12,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminAgentGrowthOverview.mockResolvedValue({
      total_agents: 12,
      evaluated_agents: 10,
      auto_growth_eligible: 4,
      promotion_candidates: 2,
      by_maturity_pool: { cold_start: 6, observed: 2, standard: 2 },
      by_primary_domain: { automation: 4, development: 3 },
    });
    mockFetchAdminAgentGrowthProfiles.mockResolvedValue({
      items: [
        {
          aid: "agent://a2ahub/admin-1",
          model: "GPT-5",
          provider: "openai",
          capabilities: ["ops"],
          reputation: 120,
          status: "active",
          membership_level: "member",
          trust_level: "active",
          created_at: "2026-03-12T00:00:00.000Z",
          primary_domain: "automation",
          domain_scores: { automation: 5 },
          current_maturity_pool: "cold_start",
          recommended_task_scope: "low_risk_only",
          auto_growth_eligible: true,
          completed_task_count: 0,
          active_skill_count: 0,
          total_task_count: 0,
          incubating_draft_count: 1,
          validated_draft_count: 0,
          published_draft_count: 0,
          employer_template_count: 1,
          template_reuse_count: 0,
          promotion_readiness_score: 64,
          recommended_next_pool: "standard",
          promotion_candidate: true,
          suggested_actions: [
            "把首个成功任务沉淀成已审核法卷草稿，准备进入标准池。",
          ],
          risk_flags: ["no_active_skills"],
          evaluation_summary: "cold_start profile",
          last_evaluated_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthExperienceCards.mockResolvedValue({
      items: [
        {
          id: 1,
          card_id: "card-1",
          aid: "agent://a2ahub/admin-1",
          employer_aid: "agent://a2ahub/employer-1",
          source_task_id: "task-1",
          category: "automation",
          scenario_key: "automation:health-check",
          title: "检查生产健康",
          summary: "验收通过后沉淀出的经验卡。",
          task_snapshot_json: {},
          delivery_snapshot_json: {},
          reusable_fragments_json: {},
          outcome_status: "accepted",
          accepted_on_first_pass: true,
          revision_count: 0,
          quality_score: 92,
          delivery_latency_hours: 3,
          is_cross_employer_validated: false,
          created_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthRiskMemories.mockResolvedValue({
      items: [
        {
          id: 1,
          risk_id: "risk-1",
          aid: "agent://a2ahub/admin-1",
          employer_aid: "agent://a2ahub/employer-1",
          source_task_id: "task-2",
          risk_type: "revision_requested",
          severity: "low",
          category: "automation",
          trigger_event: "task.completed.revision_requested",
          status: "active",
          evidence_json: {},
          cooldown_until: "2026-03-15T00:00:00.000Z",
          resolved_at: null,
          created_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminAgentGrowthSkillDrafts.mockResolvedValue({
      items: [
        {
          id: 1,
          draft_id: "draft-1",
          aid: "agent://a2ahub/admin-1",
          employer_aid: "agent://a2ahub/employer-1",
          source_task_id: "task-1",
          title: "检查生产健康 · Growth Skill",
          summary: "成功任务沉淀出的经验",
          content_json: {},
          status: "incubating",
          reuse_success_count: 0,
          review_required: true,
          reward_snapshot: 10,
          created_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockFetchAdminEmployerTemplates.mockResolvedValue({
      items: [
        {
          id: 1,
          template_id: "tmpl-1",
          owner_aid: "agent://a2ahub/admin-1",
          worker_aid: "agent://a2ahub/worker-1",
          source_task_id: "task-1",
          title: "检查生产健康",
          summary: "沉淀给雇主的模板",
          template_json: {},
          status: "active",
          reuse_count: 0,
          created_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminEmployerSkillGrants.mockResolvedValue({
      items: [
        {
          id: 1,
          grant_id: "grant-1",
          employer_aid: "agent://a2ahub/admin-1",
          worker_aid: "agent://a2ahub/worker-1",
          source_task_id: "task-1",
          source_draft_id: "draft-1",
          skill_id: "skill-1",
          title: "检查生产健康 · Growth Skill",
          summary: "首单成功经验自动赠送给雇主。",
          grant_payload: {},
          status: "granted",
          created_at: "2026-03-12T00:00:00.000Z",
          updated_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
    mockFetchAdminForumPosts.mockResolvedValue({
      posts: [
        {
          id: "1",
          post_id: "post-1",
          title: "后台巡检",
          author_aid: "agent://a2ahub/admin-1",
          category: "ops",
          status: "published",
          comment_count: 2,
          like_count: 5,
          created_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 8,
    });
    mockFetchAdminTasks.mockResolvedValue({
      items: [
        {
          id: 1,
          task_id: "task-1",
          title: "检查生产健康",
          description: "用于验证任务详情和申请显示",
          requirements: "确认后台能查看申请",
          employer_aid: "agent://a2ahub/admin-1",
          worker_aid: "agent://a2ahub/worker-1",
          escrow_id: "escrow-1",
          status: "submitted",
          reward: 10,
          created_at: "2026-03-12T00:00:00.000Z",
        },
        {
          id: 2,
          task_id: "task-legacy-1",
          title: "旧分配任务",
          description: "用于验证 legacy assigned 队列",
          requirements: "检查归一化入口",
          employer_aid: "agent://a2ahub/admin-1",
          worker_aid: "agent://a2ahub/worker-2",
          escrow_id: "escrow-legacy-1",
          status: "assigned",
          reward: 12,
          created_at: "2026-03-12T00:00:00.000Z",
        },
        {
          id: 3,
          task_id: "task-cancel-1",
          title: "退款核对任务",
          description: "用于验证取消后核账与异常样本",
          requirements: "检查退款和冻结余额",
          employer_aid: "agent://a2ahub/admin-1",
          worker_aid: "agent://a2ahub/worker-3",
          escrow_id: "escrow-cancel-1",
          status: "cancelled",
          reward: 8,
          created_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      limit: 20,
      offset: 0,
    });
    mockFetchAdminAuditLogs.mockImplementation(
      (filters?: { action?: string; resourceType?: string }) => {
        if (filters?.action === "admin.marketplace.task.ops.recorded") {
          return Promise.resolve({
            items: [
              {
                log_id: "log-task-ops-1",
                action: "admin.marketplace.task.ops.recorded",
                resource_type: "marketplace_task",
                resource_id: "task-legacy-1",
                details: {
                  queue: "legacy_assigned",
                  disposition: "checked",
                  note: "已核对托管与状态",
                  issue: "assigned 缺少 escrow_id",
                  request_id: "req-task-ops-1",
                },
                created_at: "2026-03-12T01:00:00.000Z",
              },
            ],
            total: 1,
            limit: 10,
            offset: 0,
          });
        }

        return Promise.resolve({
          items: [
            {
              log_id: "log-1",
              action: "admin.agent.status.updated",
              resource_type: "agent",
              resource_id: "agent://a2ahub/admin-1",
              details: {
                status: "suspended",
                request_id: "req-1",
                batch: false,
              },
              created_at: "2026-03-12T00:00:00.000Z",
            },
          ],
          total: 1,
          limit: 20,
          offset: 0,
        });
      },
    );
    mockFetchAdminPostComments.mockResolvedValue({
      comments: [
        {
          id: "c1",
          comment_id: "comment-1",
          post_id: "post-1",
          author_aid: "agent://a2ahub/user-1",
          content: "这是一条待审核评论",
          status: "published",
          like_count: 1,
          created_at: "2026-03-12T00:00:00.000Z",
        },
      ],
      total: 1,
    });
    mockFetchAdminTaskApplications.mockResolvedValue([
      {
        id: 1,
        task_id: "task-1",
        applicant_aid: "agent://a2ahub/worker-1",
        proposal: "我可以处理这个任务",
        status: "pending",
        created_at: "2026-03-12T00:00:00.000Z",
      },
    ]);
    mockUpdateAdminPostStatus.mockResolvedValue({
      id: "1",
      post_id: "post-1",
      status: "hidden",
    });
    mockUpdateAdminAgentStatus.mockResolvedValue({
      aid: "agent://a2ahub/admin-1",
      status: "suspended",
    });
    mockUpdateAdminCommentStatus.mockResolvedValue({
      id: "c1",
      comment_id: "comment-1",
      status: "hidden",
    });
    mockNormalizeAdminLegacyAssignedTasks.mockResolvedValue({
      legacy_assigned_count: 2,
      normalized_count: 2,
      skipped_count: 0,
      normalized_task_ids: ["task-legacy-1", "task-legacy-2"],
      skipped_task_ids: [],
    });
    mockRecordAdminTaskOpsRecord.mockResolvedValue({
      task_id: "task-legacy-1",
      queue: "legacy_assigned",
      disposition: "checked",
      note: "已核对托管与状态",
      issue: "assigned 缺少 escrow_id",
      task_status: "assigned",
    });
    mockTriggerAdminAgentGrowthEvaluation.mockResolvedValue({ ok: true });
    mockUpdateAdminAgentGrowthSkillDraft.mockResolvedValue({
      draft_id: "draft-1",
      status: "published",
    });
    mockBatchUpdateAdminAgentStatus.mockResolvedValue({
      items: [{ item: "agent://a2ahub/admin-1", success: true }],
      summary: { total: 1, succeeded: 1, failed: 0 },
    });
    mockBatchUpdateAdminPostStatus.mockResolvedValue({
      items: [{ item: "post-1", success: true }],
      summary: { total: 1, succeeded: 1, failed: 0 },
    });

    renderWithProviders(<Admin />, { initialEntries: ["/admin"] });

    fireEvent.change(
      screen.getByPlaceholderText("请输入 ADMIN_CONSOLE_TOKEN"),
      {
        target: { value: "secret-admin-token" },
      },
    );
    fireEvent.click(screen.getByText("进入后台"));

    await waitFor(() => {
      expect(mockSetAdminToken).toHaveBeenCalledWith("secret-admin-token");
      expect(mockFetchAdminOverview).toHaveBeenCalled();
    });

    expect(mockFetchAdminAgents).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      status: undefined,
    });
    expect(mockFetchAdminAgentGrowthOverview).toHaveBeenCalled();
    expect(mockFetchAdminAgentGrowthProfiles).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      maturityPool: undefined,
      primaryDomain: undefined,
    });
    expect(mockFetchAdminAgentGrowthSkillDrafts).toHaveBeenCalledWith({
      limit: 50,
      offset: 0,
      status: undefined,
    });
    expect(mockFetchAdminEmployerTemplates).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
    expect(mockFetchAdminEmployerSkillGrants).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
    });
    expect(mockFetchAdminForumPosts).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      status: undefined,
      category: undefined,
      authorAid: undefined,
    });
    expect(mockFetchAdminTasks).toHaveBeenCalledWith({
      limit: 100,
      offset: 0,
      status: undefined,
      employerAid: undefined,
    });
    expect(mockFetchAdminAuditLogs).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      action: undefined,
      resourceType: undefined,
    });

    expect(await screen.findByText("修士总数")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "总览" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("系统健康")).toBeInTheDocument();
    expect(screen.getByText("审核追踪")).toBeInTheDocument();
    expect(screen.getByText("修士状态变更")).toBeInTheDocument();
    expect(screen.getByText("帖子审核动作")).toBeInTheDocument();
    expect(screen.queryByText("修为成长")).not.toBeInTheDocument();
    expect(
      screen.getByText("操作者：admin console · 请求：req-1"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "查看关联修士 log-1" }),
    );

    expect(await screen.findByRole("tab", { name: "修士" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByRole("dialog", { name: "修士详情" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 修士详情" }));
    fireEvent.click(screen.getByRole("tab", { name: "总览" }));

    fireEvent.click(screen.getByRole("button", { name: "查看审计详情 log-1" }));

    expect(await screen.findByRole("tab", { name: "审计" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByRole("dialog", { name: "审计记录详情" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "成长" }));

    expect(await screen.findByText("修为成长")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "成长" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("晋级候选").length).toBeGreaterThan(0);
    expect(screen.getByText("准备度 64%")).toBeInTheDocument();
    expect(screen.getByText("雇主获赠法卷")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "查看成长档案 agent://a2ahub/admin-1 详情",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "成长档案详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("成长画像")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 成长档案详情" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "查看法卷草稿 检查生产健康 · Growth Skill 详情",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "法卷草稿详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("内容结构")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "关闭 法卷草稿详情" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "查看雇主模板 检查生产健康 详情" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "雇主模板详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("模板结构")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 雇主模板详情" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "查看获赠法卷 检查生产健康 · Growth Skill 详情",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "获赠法卷详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("赠送载荷")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "查看获赠法卷 grant-1 的来源草稿",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "法卷草稿详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("内容结构")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "关闭 法卷草稿详情" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "查看雇主模板 检查生产健康 详情" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "雇主模板详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("模板结构")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "查看模板 tmpl-1 的来源任务" }),
    );

    await waitFor(() => {
      expect(mockFetchAdminTaskApplications).toHaveBeenCalledWith("task-1");
    });

    expect(
      await screen.findByRole("dialog", { name: "任务详情" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "任务运维" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭 任务详情" }));

    fireEvent.click(screen.getByRole("tab", { name: "修士" }));

    expect(await screen.findByText("修士运营")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "修士" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "查看修士 agent://a2ahub/admin-1 详情",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "修士详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("未填写命牌称号")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 修士详情" }));

    fireEvent.click(screen.getByRole("button", { name: "暂停" }));

    await waitFor(() => {
      expect(mockUpdateAdminAgentStatus).toHaveBeenCalledWith(
        "agent://a2ahub/admin-1",
        "suspended",
      );
    });

    fireEvent.click(screen.getByLabelText("选择 agent://a2ahub/admin-1"));
    fireEvent.click(screen.getByText("批量暂停"));

    await waitFor(() => {
      expect(mockBatchUpdateAdminAgentStatus).toHaveBeenCalledWith(
        ["agent://a2ahub/admin-1"],
        "suspended",
      );
    });

    fireEvent.change(screen.getByLabelText("状态筛选"), {
      target: { value: "suspended" },
    });

    await waitFor(() => {
      expect(mockFetchAdminAgents).toHaveBeenLastCalledWith({
        limit: 100,
        offset: 0,
        status: "suspended",
      });
    });

    fireEvent.click(screen.getByRole("tab", { name: "内容" }));

    expect(await screen.findByText("后台巡检")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "内容" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.change(screen.getByPlaceholderText("如：ops"), {
      target: { value: "ops" },
    });
    fireEvent.change(screen.getByLabelText("作者 AID"), {
      target: { value: "agent://a2ahub/admin-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() => {
      expect(mockFetchAdminForumPosts).toHaveBeenLastCalledWith({
        limit: 100,
        offset: 0,
        status: undefined,
        category: "ops",
        authorAid: "agent://a2ahub/admin-1",
      });
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "查看帖子 后台巡检 详情" }),
    );

    await waitFor(() => {
      expect(mockFetchAdminPostComments).toHaveBeenCalledWith("post-1", 50, 0);
    });

    expect(
      await screen.findByRole("dialog", { name: "帖子详情" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("这是一条待审核评论")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 帖子详情" }));

    fireEvent.click(screen.getAllByText("隐藏")[0]);

    await waitFor(() => {
      expect(mockUpdateAdminPostStatus).toHaveBeenCalledWith(
        "post-1",
        "hidden",
      );
    });

    fireEvent.click(screen.getByLabelText("选择帖子 后台巡检"));
    fireEvent.click(screen.getByText("批量隐藏"));

    await waitFor(() => {
      expect(mockBatchUpdateAdminPostStatus).toHaveBeenCalledWith(
        ["post-1"],
        "hidden",
      );
    });

    fireEvent.click(screen.getByRole("tab", { name: "任务运维" }));

    expect(await screen.findByText("任务运维中心")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "任务运维" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByText("检查生产健康").length).toBeGreaterThan(0);
    expect(screen.getByText("任务运维队列")).toBeInTheDocument();
    expect(screen.getByText("历史 assigned 待处理")).toBeInTheDocument();
    expect(screen.getByText("待验收积压")).toBeInTheDocument();
    expect(screen.getByText("缺字段待人工复核")).toBeInTheDocument();
    expect(screen.getByText("取消后待核账")).toBeInTheDocument();
    expect(screen.getByText("最近处理记录")).toBeInTheDocument();
    expect(screen.getAllByText("旧分配任务").length).toBeGreaterThan(0);
    expect(screen.getAllByText("退款核对任务").length).toBeGreaterThan(0);
    expect(screen.getByText("一致性诊断")).toBeInTheDocument();
    expect(screen.getAllByText("待验收").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("option", { name: "已分配待开工" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "待验收" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "归一化历史 assigned" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "标记任务 task-legacy-1 已核对" }),
    );

    await waitFor(() => {
      expect(mockRecordAdminTaskOpsRecord).toHaveBeenCalledWith(
        "task-legacy-1",
        {
          queue: "legacy_assigned",
          disposition: "checked",
          note: "已核对托管与状态",
          issue: undefined,
          taskStatus: "assigned",
        },
      );
    });

    expect(
      await screen.findByText("已为任务 task-legacy-1 记录“已核对”运维结果。"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("任务状态"), {
      target: { value: "submitted" },
    });
    fireEvent.change(screen.getByLabelText("雇主 AID"), {
      target: { value: "agent://a2ahub/admin-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用筛选" }));

    await waitFor(() => {
      expect(mockFetchAdminTasks).toHaveBeenLastCalledWith({
        limit: 100,
        offset: 0,
        status: "submitted",
        employerAid: "agent://a2ahub/admin-1",
      });
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "查看任务 检查生产健康 详情" }),
    );

    await waitFor(() => {
      expect(mockFetchAdminTaskApplications).toHaveBeenCalledWith("task-1");
    });

    expect(
      await screen.findByRole("dialog", { name: "任务详情" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("我可以处理这个任务")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 任务详情" }));
    fireEvent.click(
      screen.getByRole("button", { name: "归一化历史 assigned" }),
    );

    await waitFor(() => {
      expect(mockNormalizeAdminLegacyAssignedTasks).toHaveBeenCalled();
    });

    expect(
      await screen.findByText(
        "已将 2 条历史 assigned 任务归一化为 in_progress。",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "审计" }));

    expect(await screen.findByText("操作审计")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "审计" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("修士状态更新")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "查看审计记录 log-1 详情" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "审计记录详情" }),
    ).toBeInTheDocument();
    expect(screen.getByText("审计详情")).toBeInTheDocument();
    expect(screen.getByText("req-1")).toBeInTheDocument();
    expect(screen.getByText(/资源摘要：/)).toBeInTheDocument();
    expect(
      screen.getAllByText("修士 agent://a2ahub/admin-1").length,
    ).toBeGreaterThan(0);

    fireEvent.click(
      screen.getAllByRole("button", { name: "查看关联修士 log-1" })[0],
    );

    expect(await screen.findByRole("tab", { name: "修士" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      await screen.findByRole("dialog", { name: "修士详情" }),
    ).toBeInTheDocument();
  });
});
