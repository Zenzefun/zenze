create table if not exists referral_codes (
  code text primary key,
  wallet text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists referral_events (
  id bigserial primary key,
  code text not null,
  kind text not null,
  wallet text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists referral_visit_once
  on referral_events (code, wallet)
  where kind = 'visit';
