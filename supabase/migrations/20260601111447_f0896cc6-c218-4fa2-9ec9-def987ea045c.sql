create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any prior schedule with the same name (idempotent re-runs)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'firms-telegram-hourly') then
    perform cron.unschedule('firms-telegram-hourly');
  end if;
end $$;

select cron.schedule(
  'firms-telegram-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://project--95489fd0-c93e-4275-8154-4296500d92e4.lovable.app/api/public/cron-dispatch',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhYW9ieHpxbHpyc3FtZ2x6aGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMDgyODEsImV4cCI6MjA5NTg4NDI4MX0.BIbbqcdGTscxaxhiNeD9KNV_vP7zn3Jm-m1I3WyAaDQ'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);