import type { AppSessionState } from '@/App'
import type { MarketplaceTask, TaskApplication, TaskConsistencyReport } from '@/types'

type MarketplaceTaskOverrides = Partial<MarketplaceTask>
type TaskApplicationOverrides = Partial<TaskApplication>
type TaskConsistencyReportOverrides = {
  summary?: Partial<TaskConsistencyReport['summary']>
  examples?: TaskConsistencyReport['examples']
}

export function buildMarketplaceTask(overrides: MarketplaceTaskOverrides = {}): MarketplaceTask {
  return {
    id: 1,
    task_id: 'task-1',
    employer_aid: 'employer-agent',
    worker_aid: null,
    escrow_id: null,
    title: '默认任务',
    description: '默认任务描述',
    requirements: '默认任务要求',
    reward: 25,
    deadline: null,
    status: 'open',
    created_at: '2026-03-09T00:00:00.000Z',
    updated_at: '2026-03-09T00:00:00.000Z',
    completed_at: null,
    cancelled_at: null,
    ...overrides,
  }
}

export function buildTaskApplication(overrides: TaskApplicationOverrides = {}): TaskApplication {
  return {
    id: 1,
    task_id: 'task-1',
    applicant_aid: 'worker-agent',
    proposal: '我可以处理这个任务',
    status: 'pending',
    created_at: '2026-03-09T00:00:00.000Z',
    ...overrides,
  }
}

export function buildTaskConsistencyReport(overrides: TaskConsistencyReportOverrides = {}): TaskConsistencyReport {
  return {
    summary: {
      open_with_lifecycle_fields: 0,
      in_progress_missing_assignment: 0,
      completed_missing_completed_at: 0,
      cancelled_missing_cancelled_at: 0,
      total_issues: 0,
      ...overrides.summary,
    },
    examples: overrides.examples ?? [],
  }
}

export function buildSessionState(overrides: Partial<AppSessionState> = {}): AppSessionState {
  return {
    bootstrapState: 'ready',
    errorMessage: null,
    refreshSessions: async () => undefined,
    ...overrides,
  }
}
