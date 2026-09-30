# Safe release and operating checklist

## Important status

This implementation started against upstream main `31f3d9ec3c2994a303881bdfae82f76e91e25092`. An initial GitHub branch creation attempt was denied (`403 Resource not accessible by integration`); the owner subsequently configured the official GitHub App and the feature branch `dot/verified-daily-content` was created successfully. The Vercel connection still could not read the existing project scope. A feature branch or draft PR does not establish a successful production deployment. Resolve existing-account access through official setup rather than sharing passwords or keys in chat.

## Required checks before release

1. Reconfirm the upstream commit and reconcile any newer changes. Review the tested changes on `dot/verified-daily-content` in a draft PR before proceeding to production.
2. Review and explicitly approve activation of security-sensitive changes: secret-only automation authentication, removal of query-string secrets/spoofed cron headers, rejection of an unconfigured auto-post key, and retirement of the public source-image copying/writing endpoint. These are prepared code changes; production security controls have not been changed.
3. In the existing Vercel project, inspect **names/presence only** for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET`. `AUTO_POST_KEY` remains accepted for existing manual automation. Actual Vercel cron requires `CRON_SECRET` to supply its Bearer token. Do not put values in browser JavaScript, repository files, logs or chat. Creating or changing credentials requires the account owner's secure action.
4. Confirm the existing Supabase schema. The baseline `supabase-automation.sql` must already have been applied. This patch does **not** run it, change RLS, add public write policies or create new tables. Required tables: `news`, `jobs_posts`, `events`, `auto_posts`, `auto_run_logs`; required columns include those in the checked-in automation migration. Confirm `auto_posts` enforces UNIQUE(type, source_hash). This uniqueness is essential, not an optional index optimization.
5. Check the live `events` table has the baseline columns. The frontend no longer selects the nonexistent `url` column. Metadata uses existing `content`/`description` fields, so no new metadata columns are required.
6. Run tests and syntax checks using Node22 or newer (the locked Supabase SDK requires it; local checks used Node24). Confirm the existing Vercel runtime supports this before deployment. Inspect a preview deployment against an approved test database if available. Never point a test publisher at production by accident. Browser visual QA and real authenticated database writes are not established by the local mock tests.
7. Use the repaired endpoint's authenticated `dryRun=true` only after the reviewed code is deployed. The old production code does not implement this option and may publish if called with it. A dry run fetches public sources and reads dedup state but does not acquire locks, insert posts or write logs.
8. After approved production release, verify one small real update per category and the corresponding public page. Repeat the same update and verify no duplicates; verify active jobs/events refresh. Check `auto_run_logs` and the next real Vercel scheduled invocations before claiming daily automation is running.

## Runtime behavior

- News source date: at most3days old; no ingestion-time relabeling. Job source date: at most30days old; a matching active listing and detail response from the employer is required.
- Automatic job/event evidence expires after36hours without a refresh. Event source end times must be future; cancellation/postponement and unavailable evidence are skipped. Legacy community posts remain distinct from automated source verification.
- Source requests use exact host/path allowlists, GET-only fetches, safe redirects, size caps, bounded concurrency and deadlines. Current source coverage is intentionally finite. `partial`, `failed` and `empty` are different outcomes.
- Each plain Node API route declares a60second maximum duration; source collection has a45second budget. Confirm the effective duration/runtime in the deployment and measure real database latency. The exported `config` form follows [Vercel's Node /api duration documentation](https://vercel.com/docs/functions/configuring-functions/duration). Interrupted writes retain source reservations for safe reconciliation rather than automatic duplicate inserts.
- No OpenAI request is made by the three repaired schedulers. Optional translation is a separate future feature with budget approval.
- Auth rejects missing configuration and spoofable user-agent/cron headers. Secrets are accepted only in Bearer authorization or the existing `x-auto-post-key` header, never query strings.
- A unique `auto_posts` source reservation precedes a target insert. This prevents exact-source duplicates on concurrent/retried calls without needing new target-table constraints. Same-story headline matching also suppresses close news duplicates in a7day history window; it is conservative and is not perfect semantic matching.
- Per-category lock rows use `type=lock:news`, `lock:jobs`, or `lock:events`. A lock owner alone may release its row. After20minutes a stale lease can be reclaimed with compare-and-swap. No parallel publisher may ignore these locks.
- An insert or tracking-finalization timeout can happen after a database commit. The pending reservation is deliberately retained instead of blindly inserting again. The next update reports `pending` reconciliation, and logs it as partial.

## Reconciling a pending reservation

An authorized operator should inspect the `auto_posts` record with `target_id` beginning `pending:` and search the declared target table by `source_hash`.

- Exactly one matching target: confirm it is the intended record, then finalize `target_id` to that ID using a compare-and-swap condition on the original pending value
- No matching target: check the failed invocation has actually ended and the source still qualifies before explicitly retrying/releasing the reservation
- Multiple matching targets: do not auto-delete. Review the history and restore idempotency deliberately

This reconciliation changes database records and is not performed by the local verification scripts. Keep normal site records and policies intact.

## Remaining limits

- No production environment values, RLS state, cron invocations, or writes were verified by this patch preparation
- The local headless browser was unavailable due execution socket restrictions, and cloud browser localhost navigation was blocked; visual QA needs a supported preview deployment
- Vercel automatically created successful branch previews for both `darwin-portal` and `darwin-price-finder`. The target preview redirects to Vercel SSO, preventing visual verification without an authorized session. Before a main merge, confirm or obtain approval for the existing two-project production fan-out; do not silently publish an unrelated project
- News/event live smoke checks encountered individual source timeouts; valid items were retained and the source groups reported partial coverage
- Broader NT employers, regional councils, popular-event ranking, Chinese translation, moderation/reporting and community identity flows need separate tested follow-on work
- Existing public news administrator and comment policies require a dedicated RLS/auth review; displaying a login-free editor does not itself establish anonymous write permission
