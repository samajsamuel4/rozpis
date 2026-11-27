alter table leave_requests
  add column if not exists leave_type text not null default 'free_day';

alter table people
  add column if not exists work_start text not null default '08:00';

alter table people
  add column if not exists work_end text not null default '16:00';
