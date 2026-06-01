## Goal
Make the hourly "scan FIRMS → push high-confidence fires to Telegram" automation run automatically inside Lovable, with no external scheduler (no cron-job.org, no GitHub Actions, no manual curl).

## Approach
Lovable Cloud (Supabase under the hood) ships with `pg_cron` + `pg_net`. We schedule a database job that POSTs to the existing `/api/public/cron-dispatch` endpoint every hour. The endpoint, dedup cache, and Telegram sending logic already exist — we only add the scheduler.

## Steps

1. **Enable Lovable Cloud** (if not already enabled) so we get a managed Postgres with `pg_cron` and `pg_net`. Required only for the scheduler — no tables, no auth, no app data is added.

2. **Migration** — enable extensions and register the cron job:
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;

   select cron.schedule(
     'firms-telegram-hourly',
     '0 * * * *',  -- top of every hour UTC
     $$
     select net.http_post(
       url := 'https://project--95489fd0-c93e-4275-8154-4296500d92e4.lovable.app/api/public/cron-dispatch',
       headers := jsonb_build_object(
         'content-type','application/json',
         'x-cron-secret', current_setting('app.cron_secret', true)
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```
   The `CRON_SECRET` is stored via `ALTER DATABASE ... SET app.cron_secret = '...'` so it isn't hardcoded in the migration. We use the stable `project--<id>.lovable.app` host so the URL never breaks on rename/republish.

3. **Point the cron at the right deployment** — published URL once the app is published; until then, swap to `project--<id>-dev.lovable.app` so it hits the preview build. I'll default to the published URL and note the one-line swap.

4. **Verify** — after the migration runs, query `cron.job` and `cron.job_run_details` to confirm the schedule is registered and the first POST returned 200, plus tail `server-function-logs` for `/api/public/cron-dispatch`.

5. **UI surfacing (small)** — add a "Last automated scan" line in `SystemConsole` that reads the latest successful run timestamp from the cron endpoint response (cached in module state), so the dispatcher can see automation is alive without leaving the dashboard.

## What I will NOT do
- No external cron services.
- No new secrets beyond what's already configured (`CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `FIRMS_MAP_KEY` are already in place).
- No changes to the dispatch logic, dedup, or Telegram formatting — those already work.

## One confirmation needed
Schedule cadence: **every hour on the hour** (`0 * * * *`) as originally requested, or tighter (e.g. every 15 min `*/15 * * * *`)? FIRMS data refreshes every ~3 hours, so hourly is the sweet spot — I'll go with hourly unless you say otherwise.
