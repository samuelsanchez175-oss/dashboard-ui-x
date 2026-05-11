/** Mock farm status — replace with API later. */
export const farmStatus = {
  activeAgents: 8,
  queuedJobs: 14,
  healthy: true,
  lastIncident: null as string | null,
}

export const usageStats = {
  periodLabel: 'Last 7 days',
  totalRuns: 1842,
  totalTokens: 2_840_000,
  estimatedCostUsd: 127.4,
  topAgents: [
    { name: 'Beat Analysis', runs: 412, tokens: 620000 },
    { name: 'Customer Support', runs: 598, tokens: 890000 },
    { name: 'SEO Agent', runs: 231, tokens: 340000 },
    { name: 'Market Research', runs: 187, tokens: 510000 },
    { name: 'Social Manager', runs: 414, tokens: 480000 },
  ],
}

export const revenueMock = {
  mrr: 12800,
  growthPct: 12.4,
  series: [
    { label: 'Jan', value: 8200 },
    { label: 'Feb', value: 9100 },
    { label: 'Mar', value: 9800 },
    { label: 'Apr', value: 10500 },
    { label: 'May', value: 11200 },
    { label: 'Jun', value: 12800 },
  ],
}

export const supportQueueMock = [
  { id: 'T-1042', priority: 'high' as const, subject: 'Refund policy question', channel: 'email', slaMins: 18 },
  { id: 'T-1043', priority: 'medium' as const, subject: 'Shipping delay — order #8821', channel: 'chat', slaMins: 45 },
  { id: 'T-1044', priority: 'low' as const, subject: 'Feature request: dark mode', channel: 'form', slaMins: 240 },
]

export const marketResearchMock = {
  keywords: [
    { term: 'lo-fi beats studio', volume: '22k/mo', trend: '+8%', intent: 'Commercial' },
    { term: 'artist dashboard analytics', volume: '5.4k/mo', trend: '+3%', intent: 'Informational' },
    { term: 'sync licensing workflow', volume: '12k/mo', trend: '+14%', intent: 'Commercial' },
  ],
}

export const seoRecommendationsMock = [
  { title: 'Add FAQ schema to pricing page', impact: 'High', effort: 'Low' },
  { title: 'Consolidate duplicate H1s on blog tags', impact: 'Medium', effort: 'Low' },
  { title: 'Improve Core Web Vitals on /agents landing', impact: 'High', effort: 'Medium' },
]

export const socialCalendarMock = [
  { day: 'Mon', slots: ['Studio recap reel', 'Behind-the-scenes clip'] },
  { day: 'Tue', slots: ['Poll: next drop?', 'Playlist spotlight'] },
  { day: 'Wed', slots: ['Tips thread', 'Beat breakdown carousel'] },
]

export const alertsMock = [
  { id: 'a1', message: 'Support SLA breaches up 12% vs last week', severity: 'warn' as const },
  { id: 'a2', message: 'SEO crawl errors detected on 3 URLs', severity: 'warn' as const },
]

export const beatAnalysisMock = {
  key: 'D minor',
  bpm: 87,
  chords: ['Dm9', 'Gm7', 'CΔ7', 'Fmaj7'],
  harmonicRhythm: '2 bars / chord',
  suggestions: [
    'Try layering a fifth above the root on the ii chord for air.',
    'Subdominant area opens space for vocal doubles before the hook.',
  ],
}
