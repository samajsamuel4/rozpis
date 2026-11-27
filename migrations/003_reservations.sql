create table if not exists reservations (
  id serial primary key,
  reservation_date date not null,
  reservation_time text not null default '19:00',
  guest_count integer not null default 2,
  guest_name text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  check (guest_count > 0)
);

create index if not exists reservations_date_idx on reservations (reservation_date);
