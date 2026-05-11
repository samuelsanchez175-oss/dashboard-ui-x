/** Shared API envelopes for the Agent Farm BFF (`/api/*`). */

export type ApiOk<T> = { ok: true; data: T }
export type ApiErrKind = 'MISSING_CONFIG' | 'BAD_REQUEST' | 'UPSTREAM' | 'NETWORK' | 'UNKNOWN'
export type ApiErr = { ok: false; error: ApiErrKind; message: string }
export type ApiResult<T> = ApiOk<T> | ApiErr

export type ShopifyOrderStub = { id: string; name: string; total: string; createdAt: string }

export type SupportTicket = {
  id: string
  priority: 'high' | 'medium' | 'low'
  subject: string
  channel: string
  slaMins: number
}

export type MarketplaceKeywordRow = { term: string; volume: string; trend: string; intent: string }

export type RevenueSnapshot = { currency: string; mrrUsd: number; growthPct: number }

export type SeoRecommendation = { title: string; impact: string; effort: string }
