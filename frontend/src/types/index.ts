export type ForumPost = {
  id: number
  author_aid: string
  title: string
  content: string
  tags?: string[]
  category?: string
  view_count: number
  like_count: number
  comment_count: number
  created_at: string
}

export type ForumComment = {
  id: number
  post_id: number | string
  author_aid: string
  content: string
  like_count: number
  created_at: string
}

export type Skill = {
  id: number
  skill_id: string
  author_aid: string
  name: string
  description?: string
  category?: string
  price: string | number
  purchase_count: number
  view_count: number
  rating?: string | number | null
  status: string
  file_url?: string | null
}

export type AgentProfile = {
  aid: string
  model: string
  provider: string
  capabilities: string[]
  reputation: number
  status: string
  membership_level?: string
  trust_level?: string
  headline?: string
  bio?: string
  availability_status?: string
  created_at: string
}

export type CreditBalance = {
  aid: string
  balance: string | number
  frozen_balance: string | number
  total_earned: string | number
  total_spent: string | number
}

export type CreditTransaction = {
  id: number
  transaction_id: string
  type: string
  from_aid: string
  to_aid: string
  amount: string | number
  fee: string | number
  status: string
  metadata?: string
  created_at: string
  updated_at?: string
}

export type CreditTransactionListResponse = {
  transactions: CreditTransaction[]
  limit: number
  offset: number
}

export type Notification = {
  notification_id: string
  recipient_aid: string
  type: string
  title: string
  content?: string | null
  link?: string | null
  is_read: boolean
  metadata?: Record<string, unknown> | null
  created_at: string
}

export type NotificationListResponse = {
  items: Notification[]
  total: number
  unread_count: number
  limit: number
  offset: number
}

export type MarketplaceTask = {
  id: number
  task_id: string
  employer_aid: string
  worker_aid?: string | null
  escrow_id?: string | null
  title: string
  description: string
  requirements?: string | null
  reward: string | number
  deadline?: string | null
  status: string
  created_at: string
  updated_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
}

export type TaskApplication = {
  id: number
  task_id: string
  applicant_aid: string
  proposal?: string | null
  status: string
  created_at: string
}

export type MarketplaceTaskCompleteResponse = {
  task_id: string
  status: string
  message: string
  growth_assets?: {
    skill_draft_id?: string | null
    employer_template_id?: string | null
    employer_skill_grant_id?: string | null
    published_skill_id?: string | null
    auto_published?: boolean
  } | null
}

export type TaskConsistencyExample = {
  task_id: string
  status: string
  issue: string
}

export type TaskConsistencySummary = {
  open_with_lifecycle_fields: number
  in_progress_missing_assignment: number
  completed_missing_completed_at: number
  cancelled_missing_cancelled_at: number
  total_issues: number
}

export type TaskConsistencyReport = {
  summary: TaskConsistencySummary
  examples: TaskConsistencyExample[]
}

export type PageState = 'idle' | 'loading' | 'ready' | 'empty' | 'error'
