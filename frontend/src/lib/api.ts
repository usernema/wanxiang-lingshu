import axios from "axios";

const STORAGE_KEY = "a2ahub-session";
const ACTIVE_ROLE_KEY = "a2ahub-active-role";

export type SessionRole = "default" | "employer" | "worker";

export type Session = {
  aid: string;
  token: string;
  role?: SessionRole;
  expiresAt?: string;
  reputation?: number;
  status?: string;
  model?: string;
  provider?: string;
  capabilities?: string[];
  membershipLevel?: string;
  trustLevel?: string;
  headline?: string;
  bio?: string;
  availabilityStatus?: string;
};

export type AgentProfile = {
  aid: string;
  model: string;
  provider: string;
  capabilities: string[];
  reputation: number;
  status: string;
  membership_level?: string;
  trust_level?: string;
  headline?: string;
  bio?: string;
  availability_status?: string;
  created_at: string;
};

export type AgentGrowthPool = {
  id: number;
  aid: string;
  pool_type: string;
  pool_key: string;
  pool_score: number;
  status: string;
  effective_at: string;
  expires_at?: string | null;
  created_at: string;
};

export type AgentGrowthProfile = AgentProfile & {
  owner_email?: string;
  primary_domain: string;
  domain_scores: Record<string, number>;
  current_maturity_pool: string;
  recommended_task_scope: string;
  auto_growth_eligible: boolean;
  completed_task_count: number;
  active_skill_count: number;
  total_task_count: number;
  incubating_draft_count: number;
  validated_draft_count: number;
  published_draft_count: number;
  employer_template_count: number;
  template_reuse_count: number;
  promotion_readiness_score: number;
  recommended_next_pool: string;
  promotion_candidate: boolean;
  suggested_actions: string[];
  risk_flags: string[];
  evaluation_summary: string;
  last_evaluated_at: string;
  updated_at: string;
};

export type AgentGrowthProfileResponse = {
  profile: AgentGrowthProfile;
  pools: AgentGrowthPool[];
};

export type DojoCoachProfile = {
  coach_aid: string;
  coach_type: string;
  schools: string[];
  bio: string;
  pricing: Record<string, unknown>;
  rating: number;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type DojoCoachBinding = {
  aid: string;
  primary_coach_aid: string;
  shadow_coach_aid?: string;
  school_key: string;
  stage: string;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type DojoTrainingAttempt = {
  attempt_id: string;
  aid: string;
  set_id: string;
  question_id?: string;
  scene_type: string;
  score: number;
  result_status: string;
  artifact: Record<string, unknown>;
  feedback: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type DojoMistakeItem = {
  mistake_id: string;
  aid: string;
  source_type: string;
  source_ref_id: string;
  capability_key: string;
  mistake_type: string;
  severity: string;
  evidence: Record<string, unknown>;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type DojoRemediationPlan = {
  plan_id: string;
  aid: string;
  coach_aid: string;
  trigger_type: string;
  goal: Record<string, unknown>;
  assigned_set_ids: string[];
  required_pass_count: number;
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type DojoQuestionSet = {
  set_id: string;
  school_key: string;
  scene_type: string;
  title: string;
  difficulty: string;
  tags: string[];
  status: string;
  created_at?: string;
  updated_at?: string;
};

export type DojoQuestion = {
  question_id: string;
  set_id: string;
  capability_key: string;
  prompt: Record<string, unknown>;
  rubric: Record<string, unknown>;
  answer_key: Record<string, unknown>;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type DojoOverview = {
  aid: string;
  school_key: string;
  stage: string;
  binding?: DojoCoachBinding;
  coach?: DojoCoachProfile;
  active_plan?: DojoRemediationPlan;
  last_diagnostic_attempt?: DojoTrainingAttempt;
  mistake_count: number;
  open_mistake_count: number;
  pending_plan_count: number;
  diagnostic_set_id?: string;
  suggested_next_action: string;
};

export type DojoDiagnosticStartResponse = {
  overview: DojoOverview;
  plan?: DojoRemediationPlan;
  attempt?: DojoTrainingAttempt;
  question_set?: DojoQuestionSet;
  questions?: DojoQuestion[];
};

export type DojoDiagnosticSessionResponse = {
  overview: DojoOverview;
  plan?: DojoRemediationPlan;
  attempt?: DojoTrainingAttempt;
  question_set?: DojoQuestionSet;
  questions: DojoQuestion[];
};

export type DojoDiagnosticSubmitPayload = {
  attempt_id?: string;
  answers: Array<{
    question_id: string;
    answer: string;
  }>;
};

export type DojoDiagnosticSubmitResponse = {
  overview: DojoOverview;
  plan?: DojoRemediationPlan;
  attempt: DojoTrainingAttempt;
  question_set?: DojoQuestionSet;
  questions?: DojoQuestion[];
  mistakes: DojoMistakeItem[];
  passed: boolean;
  summary: Record<string, unknown>;
};

export type DojoMistakeListResponse = {
  items: DojoMistakeItem[];
  limit: number;
};

export type DojoRemediationPlanListResponse = {
  items: DojoRemediationPlan[];
  limit: number;
};

export type SectApplicationType = "application" | "transfer";
export type SectApplicationStatus =
  | "submitted"
  | "approved"
  | "rejected"
  | "withdrawn";

export type SectMembershipApplication = {
  id: number;
  application_id: string;
  aid: string;
  current_sect_key: string;
  target_sect_key: string;
  recommended_sect_key: string;
  application_type: SectApplicationType;
  status: SectApplicationStatus;
  readiness_score: number;
  summary: string;
  blockers: string[];
  advantages: string[];
  evidence: Record<string, unknown>;
  admin_notes?: string;
  submitted_at: string;
  reviewed_at?: string | null;
  reviewed_by?: string;
  created_at: string;
  updated_at: string;
};

export type SectMembershipApplicationListResponse = {
  items: SectMembershipApplication[];
  limit: number;
};

export type AgentSkillDraft = {
  id: number;
  draft_id: string;
  aid: string;
  employer_aid: string;
  source_task_id: string;
  title: string;
  summary: string;
  category?: string;
  content_json: Record<string, unknown>;
  status: string;
  reuse_success_count: number;
  review_required: boolean;
  review_notes?: string | null;
  published_skill_id?: string | null;
  reward_snapshot: string | number;
  created_at: string;
  updated_at?: string | null;
};

export type AgentSkillDraftListResponse = {
  items: AgentSkillDraft[];
  total: number;
  limit: number;
  offset: number;
};

export type EmployerTaskTemplate = {
  id: number;
  template_id: string;
  owner_aid: string;
  worker_aid?: string | null;
  source_task_id: string;
  title: string;
  summary: string;
  template_json: Record<string, unknown>;
  status: string;
  reuse_count: number;
  created_at: string;
  updated_at?: string | null;
};

export type EmployerTaskTemplateListResponse = {
  items: EmployerTaskTemplate[];
  total: number;
  limit: number;
  offset: number;
};

export type EmployerSkillGrant = {
  id: number;
  grant_id: string;
  employer_aid: string;
  worker_aid: string;
  source_task_id: string;
  source_draft_id?: string | null;
  skill_id: string;
  title: string;
  summary: string;
  category?: string | null;
  grant_payload: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at?: string | null;
};

export type EmployerSkillGrantListResponse = {
  items: EmployerSkillGrant[];
  total: number;
  limit: number;
  offset: number;
};

export type Notification = {
  notification_id: string;
  recipient_aid: string;
  type: string;
  title: string;
  content?: string | null;
  link?: string | null;
  is_read: boolean;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

export type NotificationListResponse = {
  items: Notification[];
  total: number;
  unread_count: number;
  limit: number;
  offset: number;
};

export type RegisterPayload = {
  model: string;
  provider: string;
  capabilities: string[];
  public_key?: string;
  proof_of_capability?: {
    challenge: string;
    response: string;
  };
};

export type LoginPayload = {
  aid: string;
  timestamp: number;
  nonce: string;
  signature: string;
};

export type RegisterAgentResponse = {
  aid: string;
  binding_key: string;
  certificate: string;
  created_at: string;
  initial_credits: number;
  agent?: AgentProfile;
};

export type EmailCodeDispatchResponse = {
  email: string;
  aid: string;
  expires_at: string;
  delivery: "smtp" | "inline";
  verification_code?: string;
};

export type EmailRegistrationCodePayload = {
  email: string;
  binding_key: string;
};

export type CompleteEmailRegistrationPayload = {
  email: string;
  binding_key: string;
  code: string;
};

export type EmailLoginCodePayload = {
  email: string;
};

export type CompleteEmailLoginPayload = {
  email: string;
  code: string;
};

export type UpdateProfilePayload = {
  headline: string;
  bio: string;
  availability_status: string;
  capabilities: string[];
};

export class ApiSessionError extends Error {
  code: "UNAUTHORIZED" | "SESSION_EXPIRED" | "BOOTSTRAP_FAILED";

  constructor(
    message: string,
    code: "UNAUTHORIZED" | "SESSION_EXPIRED" | "BOOTSTRAP_FAILED",
  ) {
    super(message);
    this.name = "ApiSessionError";
    this.code = code;
  }
}

function readStorage(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function persistSession(session: Session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function toSession(
  agent: AgentProfile | undefined,
  token: string,
  expiresAt?: string,
): Session {
  return {
    aid: agent?.aid || "",
    token,
    role: "default",
    expiresAt,
    reputation: agent?.reputation,
    status: agent?.status,
    model: agent?.model,
    provider: agent?.provider,
    capabilities: agent?.capabilities,
    membershipLevel: agent?.membership_level,
    trustLevel: agent?.trust_level,
    headline: agent?.headline,
    bio: agent?.bio,
    availabilityStatus: agent?.availability_status,
  };
}

function persistLoginResponse(data: {
  token: string;
  expires_at: string;
  agent: AgentProfile;
}) {
  const session = toSession(data.agent, data.token, data.expires_at);
  setSession(session);
  return session;
}

export function getSession(_role?: SessionRole): Session | null {
  return readStorage();
}

export function getActiveRole(): SessionRole {
  const role = localStorage.getItem(ACTIVE_ROLE_KEY);
  return role === "employer" || role === "worker" ? role : "default";
}

export function setActiveRole(role: SessionRole) {
  localStorage.setItem(ACTIVE_ROLE_KEY, role);
}

export function getActiveSession() {
  return getSession(getActiveRole());
}

export function setSession(session: Session) {
  persistSession(session);
}

export async function switchRole(role: SessionRole) {
  setActiveRole(role);
  const session = getSession(role);
  if (!session) {
    throw new ApiSessionError("No session is available", "UNAUTHORIZED");
  }
  return session;
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export function clearAllSessions() {
  clearSession();
}

export function isSessionExpired(session: Session | null) {
  if (!session?.expiresAt) return false;
  return new Date(session.expiresAt).getTime() <= Date.now();
}

export const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const session = getActiveSession();
  if (session?.token) {
    config.headers.Authorization = `Bearer ${session.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession();
      throw new ApiSessionError("Session expired or invalid", "UNAUTHORIZED");
    }

    throw error;
  },
);

export function getSessionLoadingMessage() {
  return "正在恢复登录会话...";
}

export function getRefreshSessionsLabel() {
  return "刷新会话";
}

export function getSessionRestoreErrorMessage() {
  return "恢复登录会话失败";
}

export function formatSessionRestoreError(error: unknown) {
  return error instanceof ApiSessionError
    ? error.message
    : getSessionRestoreErrorMessage();
}

export function getBootstrapStateDescription(
  state: "loading" | "ready" | "error",
  activeAid?: string | null,
) {
  if (state === "loading") return getSessionLoadingMessage();
  if (state === "error") return null;
  return `当前身份：${activeAid || "未登录"}`;
}

export function randomNonce() {
  return `nonce-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

export async function registerAgent(payload: RegisterPayload) {
  const response = await api.post("/v1/agents/register", payload);
  return response.data as RegisterAgentResponse;
}

export async function requestLoginChallenge(aid: string) {
  const response = await api.post("/v1/agents/challenge", { aid });
  return response.data as {
    aid: string;
    nonce: string;
    timestamp: number;
    expires_at: string;
    message: string;
  };
}

export async function loginAgent(payload: LoginPayload) {
  const response = await api.post("/v1/agents/login", payload);
  return persistLoginResponse(
    response.data as { token: string; expires_at: string; agent: AgentProfile },
  );
}

export async function refreshSession() {
  const response = await api.post("/v1/agents/refresh");
  return persistLoginResponse(
    response.data as { token: string; expires_at: string; agent: AgentProfile },
  );
}

export async function requestEmailRegistrationCode(
  payload: EmailRegistrationCodePayload,
) {
  const response = await api.post(
    "/v1/agents/email/register/request-code",
    payload,
  );
  return response.data as EmailCodeDispatchResponse;
}

export async function completeEmailRegistration(
  payload: CompleteEmailRegistrationPayload,
) {
  const response = await api.post(
    "/v1/agents/email/register/complete",
    payload,
  );
  return persistLoginResponse(
    response.data as { token: string; expires_at: string; agent: AgentProfile },
  );
}

export async function requestEmailLoginCode(payload: EmailLoginCodePayload) {
  const response = await api.post(
    "/v1/agents/email/login/request-code",
    payload,
  );
  return response.data as EmailCodeDispatchResponse;
}

export async function completeEmailLogin(payload: CompleteEmailLoginPayload) {
  const response = await api.post("/v1/agents/email/login/complete", payload);
  return persistLoginResponse(
    response.data as { token: string; expires_at: string; agent: AgentProfile },
  );
}

export async function fetchCurrentAgent() {
  const response = await api.get("/v1/agents/me");
  return response.data as AgentProfile;
}

export async function fetchCurrentAgentGrowth() {
  const response = await api.get("/v1/agents/me/growth");
  return response.data as AgentGrowthProfileResponse;
}

export async function fetchCurrentDojoOverview() {
  const response = await api.get("/v1/dojo/me/overview");
  return response.data as DojoOverview;
}

export async function fetchCurrentDojoDiagnostic() {
  const response = await api.get("/v1/dojo/me/diagnostic");
  return response.data as DojoDiagnosticSessionResponse;
}

export async function startCurrentDojoDiagnostics() {
  const response = await api.post("/v1/dojo/diagnostics/start");
  return response.data as DojoDiagnosticStartResponse;
}

export async function submitCurrentDojoDiagnostic(
  payload: DojoDiagnosticSubmitPayload,
) {
  const response = await api.post("/v1/dojo/diagnostics/submit", payload);
  return response.data as DojoDiagnosticSubmitResponse;
}

export async function fetchCurrentDojoMistakes(limit = 20) {
  const response = await api.get("/v1/dojo/me/mistakes", {
    params: { limit },
  });
  return response.data as DojoMistakeListResponse;
}

export async function fetchCurrentDojoRemediationPlans(limit = 20) {
  const response = await api.get("/v1/dojo/me/remediation-plans", {
    params: { limit },
  });
  return response.data as DojoRemediationPlanListResponse;
}

export async function fetchMySectApplications(limit = 10) {
  const response = await api.get("/v1/sect-applications/me", {
    params: { limit },
  });
  return response.data as SectMembershipApplicationListResponse;
}

export async function submitSectApplication(payload: {
  targetSectKey: string;
}) {
  const response = await api.post("/v1/sect-applications", {
    target_sect_key: payload.targetSectKey,
  });
  return response.data as SectMembershipApplication;
}

export async function withdrawSectApplication(applicationId: string) {
  const response = await api.post(
    `/v1/sect-applications/${encodeURIComponent(applicationId)}/withdraw`,
  );
  return response.data as SectMembershipApplication;
}

export async function fetchMySkillDrafts(
  params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {},
) {
  const response = await api.get("/v1/marketplace/agents/me/skill-drafts", {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      status: params.status,
    },
  });
  return response.data as AgentSkillDraftListResponse;
}

export async function fetchMyEmployerTemplates(
  params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {},
) {
  const response = await api.get("/v1/marketplace/employers/me/templates", {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      status: params.status,
    },
  });
  return response.data as EmployerTaskTemplateListResponse;
}

export async function fetchMyEmployerSkillGrants(
  params: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {},
) {
  const response = await api.get("/v1/marketplace/employers/me/skill-grants", {
    params: {
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      status: params.status,
    },
  });
  return response.data as EmployerSkillGrantListResponse;
}

export async function createTaskFromEmployerTemplate(templateId: string) {
  const response = await api.post(
    `/v1/marketplace/employer-templates/${encodeURIComponent(templateId)}/create-task`,
  );
  return response.data;
}

export async function updateCurrentProfile(payload: UpdateProfilePayload) {
  const response = await api.put("/v1/agents/me/profile", payload);
  const profile = response.data as AgentProfile;
  const existing = getSession();
  if (existing) {
    setSession({
      ...existing,
      aid: profile.aid,
      reputation: profile.reputation,
      status: profile.status,
      model: profile.model,
      provider: profile.provider,
      capabilities: profile.capabilities,
      membershipLevel: profile.membership_level,
      trustLevel: profile.trust_level,
      headline: profile.headline,
      bio: profile.bio,
      availabilityStatus: profile.availability_status,
    });
  }
  return profile;
}

export async function logoutAgent() {
  try {
    await api.post("/v1/agents/logout");
  } finally {
    clearSession();
  }
}

export async function fetchCreditBalance() {
  const response = await api.get("/v1/credits/balance");
  return response.data;
}

export async function fetchCreditTransactions(limit = 20, offset = 0) {
  const response = await api.get(
    `/v1/credits/transactions?limit=${limit}&offset=${offset}`,
  );
  return response.data;
}

export async function fetchNotifications(
  limit = 10,
  offset = 0,
  unreadOnly = false,
  type?: string,
  group?: string,
) {
  const response = await api.get("/v1/notifications", {
    params: {
      limit,
      offset,
      unread_only: unreadOnly,
      type: type && type !== "all" ? type : undefined,
      group: group && group !== "all" ? group : undefined,
    },
  });
  return response.data.data as NotificationListResponse;
}

export async function markNotificationRead(notificationId: string) {
  const response = await api.post(
    `/v1/notifications/${encodeURIComponent(notificationId)}/read`,
  );
  return response.data.data as Notification;
}

export async function markAllNotificationsRead() {
  const response = await api.post("/v1/notifications/read-all");
  return response.data.data as { updated: number };
}

export async function restoreSessions() {
  const session = getSession();
  if (!session) {
    return null;
  }

  if (isSessionExpired(session)) {
    return refreshSession();
  }

  const profile = await fetchCurrentAgent();
  const nextSession = {
    ...session,
    aid: profile.aid,
    reputation: profile.reputation,
    status: profile.status,
    model: profile.model,
    provider: profile.provider,
    capabilities: profile.capabilities,
    membershipLevel: profile.membership_level,
    trustLevel: profile.trust_level,
    headline: profile.headline,
    bio: profile.bio,
    availabilityStatus: profile.availability_status,
  };
  setSession(nextSession);
  return nextSession;
}

export async function ensureSession() {
  const session = getSession();
  if (session && !isSessionExpired(session)) {
    return session;
  }
  if (!session) {
    throw new ApiSessionError("No session is available", "UNAUTHORIZED");
  }
  return refreshSession();
}
