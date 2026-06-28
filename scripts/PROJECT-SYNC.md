# Projects: audit + check-off sync

How the Projects overview stays true to the vault, and how check-offs flow back.

## Pieces

| Piece | What it does | Status |
|---|---|---|
| `scripts/build-projects.mjs` | Raw checkbox extractor. **Bails out** if `projects.json` is already an Opus audit, so it can't clobber it. | ✅ works |
| `scripts/build-projects-ai.mjs` | **Repeatable Opus re-audit** — reads each project's vault docs, reconciles true done/pending, agent-vs-human, paste-ready commands → `public/data/projects.json`. | ✅ code; needs `ANTHROPIC_API_KEY` |
| BFF `POST /api/local/projects/build` | The **Refresh** button. Runs the AI re-audit when `ANTHROPIC_API_KEY` is set, else the (guarded) raw builder. | ✅ works |
| BFF `POST /api/local/projects/checkoff` | On **localhost**, ticking a task writes `📊 dashboard-ui/Project Tasks.md` in the vault directly. | ✅ works |
| `scripts/sync-checkoffs.mjs` + launchd | The **cron** that pulls check-offs made on **Vercel** from a cloud store and rewrites the same vault note periodically. | ⚙️ needs a cloud store |

## Enable the repeatable Opus Refresh (item 3)

```bash
cp .env.example .env.local        # then set ANTHROPIC_API_KEY=sk-ant-...
# restart the dev server; the Refresh button now re-runs the Opus audit.
```

## Enable cross-environment check-off sync (item 2)

**✅ Provisioned (2026-06-28):** Supabase project `ui-dashboard-checkoffs` (`suyjphvmurihtpriovnv`) with a `checkoffs` table. The dashboard reads it on load and upserts on every toggle (`src/lib/checkoffStore.ts`) — so ticking on the **Vercel** site lands in the store, and any device picks it up. The cron plist is pre-filled with the store URL + publishable key.

**Only step left — install the cron** so the vault note updates periodically without opening localhost:

```bash
cp scripts/com.user.projects-checkoff-sync.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.projects-checkoff-sync.plist
# logs: tail -f /tmp/projects-checkoff-sync.log
```

`taskId = "<project.id>-<taskIndex>"` (e.g. `ap-connect-5`), matching the dashboard's `projects:done-overrides-v1`.

> **Why a store is required:** Vercel (production) has no access to your local vault, so a remote check-off must land in a store the Mac polls. That store + its credentials are the one piece that needs your choice/authorization — everything else is wired.
