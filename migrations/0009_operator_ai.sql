-- Operator wallets (staff desk). No email seats.
create table if not exists operator_wallets (
  wallet text primary key,
  role text not null default 'super_admin',
  created_at timestamptz not null default now()
);

insert into operator_wallets (wallet, role) values
  ('0x9571f0e9b944d4eabb678a3a4969b400c97a2573', 'super_admin')
on conflict (wallet) do nothing;

create table if not exists ai_jobs (
  id serial primary key,
  provider text not null,
  model text not null,
  kind text not null,
  status text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table marketing_posts add column if not exists provider text;
alter table marketing_posts add column if not exists model text;
