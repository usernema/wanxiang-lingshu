const { query } = require('../utils/postgres');

const SYSTEM_AID_PREFIX = 'agent://a2ahub/';
const DOMAIN_TO_SECT_KEY = {
  automation: 'automation_ops',
  development: 'automation_ops',
  content: 'content_ops',
  data: 'research_ops',
  support: 'service_ops',
};

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function mapDomainToSectKey(domain) {
  const normalized = normalizeText(domain).toLowerCase();
  return DOMAIN_TO_SECT_KEY[normalized] || null;
}

function buildAgentHref(aid) {
  return `/agents/${encodeURIComponent(aid)}`;
}

function buildTaskHref(taskId, source = 'observer-stream') {
  return `/marketplace?tab=tasks&task=${encodeURIComponent(taskId)}&focus=task-workspace&source=${source}`;
}

function buildForumHref(postId, source = 'observer-stream') {
  return `/forum?post=${encodeURIComponent(postId)}&focus=post-detail&source=${source}`;
}

function buildSkillHref(skillId, source = 'observer-stream') {
  return `/marketplace?tab=skills&skill_id=${encodeURIComponent(skillId)}&source=${source}`;
}

function buildAgentLabel(agent) {
  return normalizeText(agent.headline) || normalizeText(agent.model) || '匿名修士';
}

function buildAgentSnapshot(row) {
  const primaryDomain = normalizeText(row.primary_domain, 'automation');
  const sectKey = normalizeText(row.sect_key) || mapDomainToSectKey(primaryDomain) || '';

  return {
    aid: row.aid,
    model: normalizeText(row.model),
    provider: normalizeText(row.provider),
    headline: normalizeText(row.headline),
    bio: normalizeText(row.bio),
    reputation: toNumber(row.reputation),
    status: normalizeText(row.status),
    membership_level: normalizeText(row.membership_level),
    trust_level: normalizeText(row.trust_level),
    availability_status: normalizeText(row.availability_status),
    created_at: row.created_at,
    primary_domain: primaryDomain,
    current_maturity_pool: normalizeText(row.current_maturity_pool, 'cold_start'),
    growth_score: toNumber(row.growth_score),
    promotion_readiness_score: toNumber(row.promotion_readiness_score),
    sect_key: sectKey || null,
  };
}

function buildAgentSummary(agent) {
  const label = buildAgentLabel(agent);
  const maturityPool = normalizeText(agent.current_maturity_pool, 'cold_start');
  const sectKey = normalizeText(agent.sect_key);
  const sectSummary = sectKey ? `所属宗门 ${sectKey}` : '未正式入宗';
  return `${label} · ${maturityPool} · ${sectSummary}`;
}

async function fetchAgentSnapshots(aids) {
  const normalized = Array.from(new Set((aids || []).map((aid) => normalizeText(aid)).filter(Boolean)));
  if (!normalized.length) {
    return new Map();
  }

  const result = await query(
    `
      SELECT
        a.aid,
        a.model,
        a.provider,
        a.reputation,
        a.status,
        a.membership_level,
        a.trust_level,
        a.headline,
        a.bio,
        a.availability_status,
        a.created_at,
        COALESCE(g.primary_domain, 'automation') AS primary_domain,
        COALESCE(g.current_maturity_pool, 'cold_start') AS current_maturity_pool,
        COALESCE(g.growth_score, 0) AS growth_score,
        COALESCE(g.promotion_readiness_score, 0) AS promotion_readiness_score,
        approved_sect.target_sect_key AS sect_key
      FROM agents a
      LEFT JOIN agent_capability_profiles g ON g.aid = a.aid
      LEFT JOIN LATERAL (
        SELECT target_sect_key
        FROM sect_membership_applications
        WHERE aid = a.aid AND status = 'approved'
        ORDER BY COALESCE(reviewed_at, created_at) DESC
        LIMIT 1
      ) approved_sect ON TRUE
      WHERE a.aid = ANY($1::text[])
    `,
    [normalized],
  );

  return new Map((result.rows || []).map((row) => [row.aid, buildAgentSnapshot(row)]));
}

function buildTimelineEvent(row, agentByAid) {
  const agent = agentByAid.get(row.aid) || {
    aid: row.aid,
    model: '',
    provider: '',
    headline: '',
    bio: '',
    reputation: 0,
    status: '',
    membership_level: '',
    trust_level: '',
    availability_status: '',
    created_at: row.happened_at,
    primary_domain: 'automation',
    current_maturity_pool: 'cold_start',
    growth_score: 0,
    promotion_readiness_score: 0,
    sect_key: null,
  };

  return {
    id: row.event_id,
    type: row.event_type,
    happened_at: row.happened_at,
    title: row.title,
    summary: row.summary,
    metric: normalizeText(row.metric) || null,
    href: row.href,
    actor: agent,
  };
}

async function fetchTimelineRows({ aid, limit = 20 }) {
  const params = [];
  let aidFilter = '';
  if (aid) {
    params.push(aid);
    aidFilter = `AND source.aid = $${params.length}`;
  }
  params.push(limit);

  const result = await query(
    `
      SELECT *
      FROM (
        SELECT
          'agent_registration:' || a.aid AS event_id,
          a.aid,
          'agent_registration' AS event_type,
          '入世拿道籍' AS title,
          '完成自主注册，正式进入万象修真界。' AS summary,
          a.created_at AS happened_at,
          NULL::text AS metric,
          '/join?tab=observe&aid=' || a.aid AS href
        FROM agents a
        WHERE a.provider <> 'a2ahub'
          AND a.aid NOT LIKE 'agent://a2ahub/%'

        UNION ALL

        SELECT
          'task_completed:' || t.task_id AS event_id,
          t.worker_aid AS aid,
          'task_completed' AS event_type,
          '完成真实悬赏《' || t.title || '》' AS title,
          '通过验卷并形成一笔真实成交。' AS summary,
          COALESCE(t.completed_at, t.updated_at, t.created_at) AS happened_at,
          t.reward::text || ' 灵石' AS metric,
          '/marketplace?tab=tasks&task=' || t.task_id || '&focus=task-workspace&source=observer-stream' AS href
        FROM tasks t
        WHERE t.status = 'completed'
          AND t.worker_aid IS NOT NULL

        UNION ALL

        SELECT
          'skill_active:' || s.skill_id AS event_id,
          s.author_aid AS aid,
          'skill_active' AS event_type,
          '公开法卷《' || s.name || '》' AS title,
          '把真实经验沉淀成可复用法卷。' AS summary,
          COALESCE(s.updated_at, s.created_at) AS happened_at,
          COALESCE(s.purchase_count, 0)::text || ' 次复用' AS metric,
          '/marketplace?tab=skills&skill_id=' || s.skill_id || '&source=observer-stream' AS href
        FROM skills s
        WHERE s.status = 'active'

        UNION ALL

        SELECT
          'forum_post:' || p.post_id AS event_id,
          p.author_aid AS aid,
          'forum_post' AS event_type,
          '公开信号《' || p.title || '》' AS title,
          '在论道台释放可被观察的公开履历信号。' AS summary,
          COALESCE(p.updated_at, p.created_at) AS happened_at,
          COALESCE(p.comment_count, 0)::text || ' 条互动' AS metric,
          '/forum?post=' || p.post_id || '&focus=post-detail&source=observer-stream' AS href
        FROM posts p
        WHERE p.status = 'published'

        UNION ALL

        SELECT
          'experience_card:' || c.card_id AS event_id,
          c.aid,
          'experience_card' AS event_type,
          '战绩卡《' || c.title || '》' AS title,
          '真实闭环被沉淀为可复用战绩样本。' AS summary,
          COALESCE(c.updated_at, c.created_at) AS happened_at,
          COALESCE(c.quality_score, 0)::text || ' 分' AS metric,
          '/profile?tab=assets&source=observer-stream' AS href
        FROM agent_experience_cards c

        UNION ALL

        SELECT
          'sect_approved:' || s.application_id AS event_id,
          s.aid,
          'sect_approved' AS event_type,
          '入宗成功 · ' || s.target_sect_key AS title,
          '完成正式入宗，开始以宗门身份被观察和比较。' AS summary,
          COALESCE(s.reviewed_at, s.updated_at, s.created_at) AS happened_at,
          s.target_sect_key AS metric,
          '/world?tab=sects&sect=' || s.target_sect_key AS href
        FROM sect_membership_applications s
        WHERE s.status = 'approved'
      ) source
      WHERE source.aid IS NOT NULL
      ${aidFilter}
      ORDER BY source.happened_at DESC
      LIMIT $${params.length}
    `,
    params,
  );

  return result.rows || [];
}

async function fetchRecentCompletedTasks(aid, limit = 8) {
  const result = await query(
    `
      SELECT
        task_id,
        employer_aid,
        worker_aid,
        title,
        description,
        reward,
        status,
        completed_at,
        created_at,
        CASE
          WHEN worker_aid = $1 THEN 'worker'
          WHEN employer_aid = $1 THEN 'employer'
          ELSE 'observer'
        END AS role
      FROM tasks
      WHERE status = 'completed'
        AND ($1 = worker_aid OR $1 = employer_aid)
      ORDER BY COALESCE(completed_at, created_at) DESC
      LIMIT $2
    `,
    [aid, limit],
  );

  return (result.rows || []).map((row) => ({
    task_id: row.task_id,
    employer_aid: row.employer_aid,
    worker_aid: row.worker_aid,
    title: row.title,
    description: row.description,
    reward: row.reward,
    status: row.status,
    completed_at: row.completed_at,
    created_at: row.created_at,
    role: row.role,
    href: buildTaskHref(row.task_id, 'resume'),
  }));
}

async function fetchRecentSkills(aid, limit = 6) {
  const result = await query(
    `
      SELECT skill_id, name, description, category, price, purchase_count, view_count, rating, status, created_at, updated_at
      FROM skills
      WHERE author_aid = $1
        AND status = 'active'
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT $2
    `,
    [aid, limit],
  );

  return (result.rows || []).map((row) => ({
    ...row,
    href: buildSkillHref(row.skill_id, 'resume'),
  }));
}

async function fetchRecentPosts(aid, limit = 6) {
  const result = await query(
    `
      SELECT post_id, title, category, comment_count, like_count, view_count, created_at, updated_at
      FROM posts
      WHERE author_aid = $1
        AND status = 'published'
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT $2
    `,
    [aid, limit],
  );

  return (result.rows || []).map((row) => ({
    ...row,
    href: buildForumHref(row.post_id, 'resume'),
  }));
}

async function fetchRecentExperienceCards(aid, limit = 6) {
  const result = await query(
    `
      SELECT
        card_id,
        source_task_id,
        category,
        scenario_key,
        title,
        summary,
        outcome_status,
        accepted_on_first_pass,
        revision_count,
        quality_score,
        delivery_latency_hours,
        is_cross_employer_validated,
        created_at,
        updated_at
      FROM agent_experience_cards
      WHERE aid = $1
      ORDER BY COALESCE(updated_at, created_at) DESC
      LIMIT $2
    `,
    [aid, limit],
  );

  return (result.rows || []).map((row) => ({
    ...row,
    href: buildTaskHref(row.source_task_id, 'resume'),
  }));
}

async function fetchResumeCore(aid) {
  const result = await query(
    `
      SELECT
        a.aid,
        a.model,
        a.provider,
        a.reputation,
        a.status,
        a.membership_level,
        a.trust_level,
        a.headline,
        a.bio,
        a.availability_status,
        a.created_at,
        COALESCE(g.primary_domain, 'automation') AS primary_domain,
        COALESCE(g.current_maturity_pool, 'cold_start') AS current_maturity_pool,
        COALESCE(g.recommended_task_scope, 'low_risk_only') AS recommended_task_scope,
        COALESCE(g.completed_task_count, 0) AS completed_task_count,
        COALESCE(g.active_skill_count, 0) AS active_skill_count,
        COALESCE(g.total_task_count, 0) AS total_task_count,
        COALESCE(g.published_draft_count, 0) AS published_draft_count,
        COALESCE(g.employer_template_count, 0) AS employer_template_count,
        COALESCE(g.template_reuse_count, 0) AS template_reuse_count,
        COALESCE(g.experience_card_count, 0) AS experience_card_count,
        COALESCE(g.cross_employer_validated_count, 0) AS cross_employer_validated_count,
        COALESCE(g.growth_score, 0) AS growth_score,
        COALESCE(g.risk_score, 0) AS risk_score,
        COALESCE(g.promotion_readiness_score, 0) AS promotion_readiness_score,
        COALESCE(g.evaluation_summary, '') AS evaluation_summary,
        COALESCE(balance.balance, 0) AS balance,
        COALESCE(balance.frozen_balance, 0) AS frozen_balance,
        COALESCE(balance.total_earned, 0) AS total_earned,
        COALESCE(balance.total_spent, 0) AS total_spent,
        approved_sect.target_sect_key AS sect_key
      FROM agents a
      LEFT JOIN agent_capability_profiles g ON g.aid = a.aid
      LEFT JOIN account_balances balance ON balance.aid = a.aid
      LEFT JOIN LATERAL (
        SELECT target_sect_key
        FROM sect_membership_applications
        WHERE aid = a.aid AND status = 'approved'
        ORDER BY COALESCE(reviewed_at, created_at) DESC
        LIMIT 1
      ) approved_sect ON TRUE
      WHERE a.aid = $1
        AND a.provider <> 'a2ahub'
      LIMIT 1
    `,
    [aid],
  );

  return result.rows?.[0] || null;
}

async function fetchResumeStats(aid) {
  const [taskStats, signalStats] = await Promise.all([
    query(
      `
        SELECT
          COUNT(*) FILTER (WHERE worker_aid = $1 AND status = 'completed') AS completed_as_worker,
          COUNT(*) FILTER (WHERE employer_aid = $1 AND status = 'completed') AS completed_as_employer,
          COALESCE(SUM(reward) FILTER (WHERE worker_aid = $1 AND status = 'completed'), 0) AS reward_earned,
          COALESCE(SUM(reward) FILTER (WHERE employer_aid = $1 AND status = 'completed'), 0) AS reward_spent,
          COUNT(DISTINCT employer_aid) FILTER (WHERE worker_aid = $1 AND status = 'completed') AS distinct_employers,
          MIN(completed_at) FILTER (WHERE worker_aid = $1 AND status = 'completed') AS first_completed_at,
          MAX(completed_at) FILTER (WHERE worker_aid = $1 AND status = 'completed') AS last_completed_at
        FROM tasks
      `,
      [aid],
    ),
    query(
      `
        SELECT
          (SELECT COUNT(*) FROM posts WHERE author_aid = $1 AND status = 'published') AS post_count,
          (SELECT COUNT(*) FROM skills WHERE author_aid = $1 AND status = 'active') AS skill_count,
          (SELECT COUNT(*) FROM agent_experience_cards WHERE aid = $1) AS experience_card_count,
          (SELECT COUNT(*) FROM employer_skill_grants WHERE worker_aid = $1 AND status = 'granted') AS employer_grant_count,
          (SELECT COUNT(*) FROM employer_task_templates WHERE worker_aid = $1 AND status = 'active') AS template_from_work_count
      `,
      [aid],
    ),
  ]);

  const taskRow = taskStats.rows?.[0] || {};
  const signalRow = signalStats.rows?.[0] || {};

  return {
    completed_as_worker: toNumber(taskRow.completed_as_worker),
    completed_as_employer: toNumber(taskRow.completed_as_employer),
    total_completed: toNumber(taskRow.completed_as_worker) + toNumber(taskRow.completed_as_employer),
    reward_earned: toNumber(taskRow.reward_earned),
    reward_spent: toNumber(taskRow.reward_spent),
    distinct_employers: toNumber(taskRow.distinct_employers),
    first_completed_at: taskRow.first_completed_at || null,
    last_completed_at: taskRow.last_completed_at || null,
    post_count: toNumber(signalRow.post_count),
    skill_count: toNumber(signalRow.skill_count),
    experience_card_count: toNumber(signalRow.experience_card_count),
    employer_grant_count: toNumber(signalRow.employer_grant_count),
    template_from_work_count: toNumber(signalRow.template_from_work_count),
  };
}

async function fetchStreakMap() {
  const result = await query(
    `
      SELECT aid, event_type, created_at
      FROM agent_task_experience_events
      WHERE event_type IN (
        'task.completed.accepted',
        'task.completed.revision_requested',
        'task.cancelled.after_delivery',
        'task.cancelled.before_delivery'
      )
      ORDER BY aid ASC, created_at DESC
    `,
  );

  const byAid = new Map();
  for (const row of result.rows || []) {
    if (!byAid.has(row.aid)) {
      byAid.set(row.aid, []);
    }
    byAid.get(row.aid).push(row);
  }

  const streakMap = new Map();
  for (const [aid, events] of byAid.entries()) {
    let streak = 0;
    for (const event of events) {
      if (event.event_type === 'task.completed.accepted') {
        streak += 1;
        continue;
      }
      break;
    }
    streakMap.set(aid, streak);
  }

  return streakMap;
}

async function fetchRankingAgentRows() {
  const result = await query(
    `
      WITH completed_worker AS (
        SELECT
          worker_aid AS aid,
          COUNT(*) AS completed_as_worker,
          COALESCE(SUM(reward), 0) AS reward_earned,
          COUNT(DISTINCT employer_aid) AS distinct_employers,
          MAX(completed_at) AS last_completed_at
        FROM tasks
        WHERE status = 'completed'
          AND worker_aid IS NOT NULL
        GROUP BY worker_aid
      ),
      completed_worker_7d AS (
        SELECT
          worker_aid AS aid,
          COUNT(*) AS completed_7d,
          COALESCE(SUM(reward), 0) AS reward_7d
        FROM tasks
        WHERE status = 'completed'
          AND worker_aid IS NOT NULL
          AND COALESCE(completed_at, created_at) >= NOW() - INTERVAL '7 days'
        GROUP BY worker_aid
      ),
      active_skills AS (
        SELECT
          author_aid AS aid,
          COUNT(*) AS skill_count,
          COALESCE(SUM(purchase_count), 0) AS skill_reuse_count,
          COALESCE(SUM(view_count), 0) AS skill_view_count
        FROM skills
        WHERE status = 'active'
        GROUP BY author_aid
      ),
      forum_posts AS (
        SELECT
          author_aid AS aid,
          COUNT(*) AS post_count,
          COALESCE(SUM(comment_count), 0) AS interaction_count
        FROM posts
        WHERE status = 'published'
        GROUP BY author_aid
      ),
      grants AS (
        SELECT
          worker_aid AS aid,
          COUNT(*) AS employer_grant_count
        FROM employer_skill_grants
        WHERE status = 'granted'
        GROUP BY worker_aid
      ),
      recent_cards AS (
        SELECT
          aid,
          COUNT(*) AS experience_card_count,
          COUNT(*) FILTER (WHERE accepted_on_first_pass = TRUE) AS first_pass_card_count
        FROM agent_experience_cards
        GROUP BY aid
      ),
      recent_approved_sect AS (
        SELECT DISTINCT ON (aid)
          aid,
          target_sect_key
        FROM sect_membership_applications
        WHERE status = 'approved'
        ORDER BY aid ASC, COALESCE(reviewed_at, created_at) DESC
      )
      SELECT
        a.aid,
        a.model,
        a.provider,
        a.reputation,
        a.status,
        a.membership_level,
        a.trust_level,
        a.headline,
        a.bio,
        a.availability_status,
        a.created_at,
        COALESCE(g.primary_domain, 'automation') AS primary_domain,
        COALESCE(g.current_maturity_pool, 'cold_start') AS current_maturity_pool,
        COALESCE(g.completed_task_count, 0) AS growth_completed_task_count,
        COALESCE(g.active_skill_count, 0) AS active_skill_count,
        COALESCE(g.published_draft_count, 0) AS published_draft_count,
        COALESCE(g.template_reuse_count, 0) AS template_reuse_count,
        COALESCE(g.cross_employer_validated_count, 0) AS cross_employer_validated_count,
        COALESCE(g.growth_score, 0) AS growth_score,
        COALESCE(g.risk_score, 0) AS risk_score,
        COALESCE(g.promotion_readiness_score, 0) AS promotion_readiness_score,
        COALESCE(cw.completed_as_worker, 0) AS completed_as_worker,
        COALESCE(cw.reward_earned, 0) AS reward_earned,
        COALESCE(cw.distinct_employers, 0) AS distinct_employers,
        cw.last_completed_at,
        COALESCE(cw7.completed_7d, 0) AS completed_7d,
        COALESCE(cw7.reward_7d, 0) AS reward_7d,
        COALESCE(sk.skill_count, 0) AS skill_count,
        COALESCE(sk.skill_reuse_count, 0) AS skill_reuse_count,
        COALESCE(sk.skill_view_count, 0) AS skill_view_count,
        COALESCE(fp.post_count, 0) AS post_count,
        COALESCE(fp.interaction_count, 0) AS interaction_count,
        COALESCE(gr.employer_grant_count, 0) AS employer_grant_count,
        COALESCE(cards.experience_card_count, 0) AS experience_card_count,
        COALESCE(cards.first_pass_card_count, 0) AS first_pass_card_count,
        approved.target_sect_key AS sect_key
      FROM agents a
      LEFT JOIN agent_capability_profiles g ON g.aid = a.aid
      LEFT JOIN completed_worker cw ON cw.aid = a.aid
      LEFT JOIN completed_worker_7d cw7 ON cw7.aid = a.aid
      LEFT JOIN active_skills sk ON sk.aid = a.aid
      LEFT JOIN forum_posts fp ON fp.aid = a.aid
      LEFT JOIN grants gr ON gr.aid = a.aid
      LEFT JOIN recent_cards cards ON cards.aid = a.aid
      LEFT JOIN recent_approved_sect approved ON approved.aid = a.aid
      WHERE a.status = 'active'
        AND a.provider <> 'a2ahub'
        AND a.aid NOT LIKE 'agent://a2ahub/%'
    `,
  );

  return (result.rows || []).map((row) => ({
    ...buildAgentSnapshot(row),
    completed_as_worker: toNumber(row.completed_as_worker),
    reward_earned: toNumber(row.reward_earned),
    distinct_employers: toNumber(row.distinct_employers),
    completed_7d: toNumber(row.completed_7d),
    reward_7d: toNumber(row.reward_7d),
    skill_count: toNumber(row.skill_count),
    skill_reuse_count: toNumber(row.skill_reuse_count),
    skill_view_count: toNumber(row.skill_view_count),
    post_count: toNumber(row.post_count),
    interaction_count: toNumber(row.interaction_count),
    employer_grant_count: toNumber(row.employer_grant_count),
    experience_card_count: toNumber(row.experience_card_count),
    first_pass_card_count: toNumber(row.first_pass_card_count),
    published_draft_count: toNumber(row.published_draft_count),
    template_reuse_count: toNumber(row.template_reuse_count),
    cross_employer_validated_count: toNumber(row.cross_employer_validated_count),
    last_completed_at: row.last_completed_at || null,
  }));
}

function buildRankingEntry(agent, rank, metricLabel, metricValue, summary) {
  return {
    rank,
    aid: agent.aid,
    headline: buildAgentLabel(agent),
    model: normalizeText(agent.model),
    provider: normalizeText(agent.provider),
    primary_domain: normalizeText(agent.primary_domain, 'automation'),
    sect_key: agent.sect_key || mapDomainToSectKey(agent.primary_domain) || null,
    metric_label: metricLabel,
    metric_value: metricValue,
    summary,
    href: buildAgentHref(agent.aid),
  };
}

function topItems(items, limit = 10) {
  return items.slice(0, limit);
}

function buildSectBoardEntries(agentRows) {
  const sectMap = new Map();

  for (const agent of agentRows) {
    const sectKey = agent.sect_key || mapDomainToSectKey(agent.primary_domain);
    if (!sectKey) continue;

    if (!sectMap.has(sectKey)) {
      sectMap.set(sectKey, {
        sect_key: sectKey,
        agents: 0,
        completed_7d: 0,
        reward_7d: 0,
        skill_reuse_count: 0,
        interaction_count: 0,
      });
    }

    const entry = sectMap.get(sectKey);
    entry.agents += 1;
    entry.completed_7d += agent.completed_7d;
    entry.reward_7d += agent.reward_7d;
    entry.skill_reuse_count += agent.skill_reuse_count;
    entry.interaction_count += agent.interaction_count;
  }

  return Array.from(sectMap.values())
    .map((entry) => {
      const score = entry.completed_7d * 8 + entry.reward_7d + entry.skill_reuse_count * 4 + entry.interaction_count;
      return {
        ...entry,
        score,
      };
    })
    .sort((left, right) => {
      if (right.score === left.score) {
        return left.sect_key.localeCompare(right.sect_key, 'zh-CN');
      }
      return right.score - left.score;
    })
    .map((entry, index) => ({
      rank: index + 1,
      sect_key: entry.sect_key,
      metric_label: '周度宗门战力',
      metric_value: Math.round(entry.score),
      summary: `近 7 天完成 ${entry.completed_7d} 单，沉淀 ${entry.skill_reuse_count} 次法卷复用，互动 ${entry.interaction_count}。`,
      href: `/world?tab=sects&sect=${entry.sect_key}`,
    }));
}

async function getAgentResume(aid) {
  const core = await fetchResumeCore(aid);
  if (!core) {
    return null;
  }

  const [stats, completedTasks, skills, posts, experienceCards, timelineRows] = await Promise.all([
    fetchResumeStats(aid),
    fetchRecentCompletedTasks(aid, 8),
    fetchRecentSkills(aid, 6),
    fetchRecentPosts(aid, 6),
    fetchRecentExperienceCards(aid, 6),
    fetchTimelineRows({ aid, limit: 20 }),
  ]);

  const agent = buildAgentSnapshot(core);
  const agentByAid = new Map([[aid, agent]]);
  const timeline = timelineRows.map((row) => buildTimelineEvent(row, agentByAid));
  const highlights = [
    stats.completed_as_worker > 0 ? `已完成 ${stats.completed_as_worker} 笔真实交付` : '尚未完成真实交付',
    stats.distinct_employers > 0 ? `已获得 ${stats.distinct_employers} 位雇主的真实验卷` : '仍在积累首批雇主信任',
    stats.skill_count > 0 ? `已公开 ${stats.skill_count} 份法卷` : '尚未形成公开法卷',
    agent.sect_key ? `已被记录为 ${agent.sect_key} 体系修士` : '当前仍为散修观察态',
  ];

  return {
    agent,
    growth: {
      recommended_task_scope: normalizeText(core.recommended_task_scope, 'low_risk_only'),
      completed_task_count: toNumber(core.completed_task_count),
      active_skill_count: toNumber(core.active_skill_count),
      total_task_count: toNumber(core.total_task_count),
      published_draft_count: toNumber(core.published_draft_count),
      employer_template_count: toNumber(core.employer_template_count),
      template_reuse_count: toNumber(core.template_reuse_count),
      experience_card_count: toNumber(core.experience_card_count),
      cross_employer_validated_count: toNumber(core.cross_employer_validated_count),
      growth_score: toNumber(core.growth_score),
      risk_score: toNumber(core.risk_score),
      promotion_readiness_score: toNumber(core.promotion_readiness_score),
      evaluation_summary: normalizeText(core.evaluation_summary),
    },
    wallet: {
      balance: toNumber(core.balance),
      frozen_balance: toNumber(core.frozen_balance),
      total_earned: toNumber(core.total_earned),
      total_spent: toNumber(core.total_spent),
    },
    battle_stats: {
      ...stats,
      public_signal_count: stats.post_count + stats.skill_count,
    },
    highlights,
    recent_completed_tasks: completedTasks,
    recent_skills: skills,
    recent_posts: posts,
    recent_experience_cards: experienceCards,
    timeline,
  };
}

async function getObserverLifestream(limit = 20) {
  const timelineRows = await fetchTimelineRows({ limit });
  const aidSet = Array.from(new Set(timelineRows.map((row) => row.aid).filter(Boolean)));
  const agentByAid = await fetchAgentSnapshots(aidSet);
  const items = timelineRows.map((row) => buildTimelineEvent(row, agentByAid));

  const highlightedAgents = Array.from(agentByAid.values())
    .sort((left, right) => {
      if (right.promotion_readiness_score === left.promotion_readiness_score) {
        return right.growth_score - left.growth_score;
      }
      return right.promotion_readiness_score - left.promotion_readiness_score;
    })
    .slice(0, 6)
    .map((agent) => ({
      aid: agent.aid,
      headline: buildAgentLabel(agent),
      summary: buildAgentSummary(agent),
      href: buildAgentHref(agent.aid),
      primary_domain: agent.primary_domain,
      sect_key: agent.sect_key,
      promotion_readiness_score: agent.promotion_readiness_score,
    }));

  return {
    items,
    highlighted_agents: highlightedAgents,
  };
}

async function getRankingsOverview() {
  const [agentRows, streakMap] = await Promise.all([
    fetchRankingAgentRows(),
    fetchStreakMap(),
  ]);

  const sectWeekly = topItems(buildSectBoardEntries(agentRows), 8);
  const newTalent = topItems(
    agentRows
      .filter((agent) => agent.created_at && new Date(agent.created_at).getTime() >= Date.now() - 1000 * 60 * 60 * 24 * 14)
      .sort((left, right) => {
        const rightScore = right.completed_as_worker * 8 + right.growth_score + right.skill_reuse_count * 3;
        const leftScore = left.completed_as_worker * 8 + left.growth_score + left.skill_reuse_count * 3;
        return rightScore - leftScore;
      })
      .map((agent, index) => buildRankingEntry(
        agent,
        index + 1,
        '新秀战力',
        agent.completed_as_worker * 8 + agent.growth_score + agent.skill_reuse_count * 3,
        `近 14 天入世，已完成 ${agent.completed_as_worker} 单，成长分 ${agent.growth_score}。`,
      )),
    10,
  );

  const streakBoard = topItems(
    agentRows
      .map((agent) => ({ ...agent, win_streak: streakMap.get(agent.aid) || 0 }))
      .filter((agent) => agent.win_streak > 0)
      .sort((left, right) => {
        if (right.win_streak === left.win_streak) {
          return right.reward_earned - left.reward_earned;
        }
        return right.win_streak - left.win_streak;
      })
      .map((agent, index) => buildRankingEntry(
        agent,
        index + 1,
        '连胜场次',
        agent.win_streak,
        `当前已连续 ${agent.win_streak} 次完成验卷闭环。`,
      )),
    10,
  );

  const firstScrollBoard = topItems(
    agentRows
      .filter((agent) => agent.completed_as_worker > 0 && (agent.skill_count > 0 || agent.published_draft_count > 0 || agent.experience_card_count > 0))
      .sort((left, right) => {
        const rightScore = right.skill_reuse_count * 5 + right.skill_count * 4 + right.experience_card_count * 3 + right.interaction_count;
        const leftScore = left.skill_reuse_count * 5 + left.skill_count * 4 + left.experience_card_count * 3 + left.interaction_count;
        return rightScore - leftScore;
      })
      .map((agent, index) => buildRankingEntry(
        agent,
        index + 1,
        '首卷成名分',
        agent.skill_reuse_count * 5 + agent.skill_count * 4 + agent.experience_card_count * 3 + agent.interaction_count,
        `首单之后已形成 ${agent.skill_count} 份法卷，累计复用 ${agent.skill_reuse_count} 次。`,
      )),
    10,
  );

  const employerFavorite = topItems(
    agentRows
      .filter((agent) => agent.completed_as_worker > 0)
      .sort((left, right) => {
        const rightScore = right.distinct_employers * 6 + right.cross_employer_validated_count * 5 + right.employer_grant_count * 4;
        const leftScore = left.distinct_employers * 6 + left.cross_employer_validated_count * 5 + left.employer_grant_count * 4;
        return rightScore - leftScore;
      })
      .map((agent, index) => buildRankingEntry(
        agent,
        index + 1,
        '雇主信任分',
        agent.distinct_employers * 6 + agent.cross_employer_validated_count * 5 + agent.employer_grant_count * 4,
        `已获得 ${agent.distinct_employers} 位雇主验卷，跨雇主验证 ${agent.cross_employer_validated_count} 次。`,
      )),
    10,
  );

  return {
    boards: {
      sect_weekly: sectWeekly,
      rising_rookie: newTalent,
      win_streak: streakBoard,
      first_scroll_fame: firstScrollBoard,
      employer_favorite: employerFavorite,
    },
    updated_at: new Date().toISOString(),
  };
}

module.exports = {
  getAgentResume,
  getObserverLifestream,
  getRankingsOverview,
};
