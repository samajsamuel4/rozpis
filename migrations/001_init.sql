create table if not exists people (
  id serial primary key,
  name text not null,
  color text not null default '#2f6f5e',
  created_at timestamptz not null default now()
);

create table if not exists shifts (
  id serial primary key,
  person_id integer not null references people(id) on delete cascade,
  work_date date not null,
  start_time text not null default '08:00',
  end_time text not null default '16:00',
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (person_id, work_date)
);

create table if not exists leave_requests (
  id serial primary key,
  person_id integer not null references people(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  check (status in ('pending', 'approved', 'cancelled')),
  check (end_date >= start_date)
);

create index if not exists shifts_work_date_idx on shifts (work_date);
create index if not exists leave_requests_dates_idx on leave_requests (start_date, end_date);
