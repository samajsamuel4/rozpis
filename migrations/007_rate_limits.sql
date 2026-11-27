-- Durable rate-limit / lockout state shared across app instances.
create table if not exists rate_limits (
  bucket text primary key,
  fail_count integer not null default 0,
  window_start_ms bigint not null default 0,
  locked_until_ms bigint not null default 0,
  mutate_count integer not null default 0,
  mutate_window_start_ms bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into rate_limits (bucket)
values ('team-auth'), ('team-mutate')
on conflict (bucket) do nothing;
