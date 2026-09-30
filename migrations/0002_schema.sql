-- Zenze.fun market, protocol, and operator tables.

create table if not exists tokens (
  id text primary key,
  name text not null,
  symbol text not null,
  description text not null default '',
  image_url text not null default '',
  creator_wallet text not null,
  chain text not null default 'robinhood',
  virtual_base numeric not null default 30,
  virtual_tokens numeric not null default 1073000000,
  real_base numeric not null default 0,
  tokens_sold numeric not null default 0,
  total_supply numeric not null default 1000000000,
  holders integer not null default 1,
  volume_24h numeric not null default 0,
  health_score integer not null default 70,
  rug_probability integer not null default 12,
  graduated boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists tokens_chain_idx on tokens (chain);
create index if not exists tokens_created_idx on tokens (created_at desc);

create table if not exists trades (
  id serial primary key,
  token_id text not null references tokens (id) on delete cascade,
  wallet text not null,
  side text not null,
  base_amount numeric not null,
  token_amount numeric not null,
  price numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists trades_token_idx on trades (token_id, created_at desc);

create table if not exists holdings (
  wallet text not null,
  token_id text not null references tokens (id) on delete cascade,
  amount numeric not null default 0,
  primary key (wallet, token_id)
);

create table if not exists watchlist (
  user_id text not null,
  token_id text not null references tokens (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, token_id)
);

create table if not exists admin_roles (
  user_id text primary key,
  email text,
  role text not null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id serial primary key,
  user_id text not null,
  action text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists marketing_posts (
  id serial primary key,
  kind text not null,
  content text not null,
  status text not null default 'queued',
  token_id text,
  created_at timestamptz not null default now()
);

create table if not exists protocol_config (
  key text primary key,
  value text not null
);

create table if not exists ai_analyses (
  token_id text primary key references tokens (id) on delete cascade,
  summary text not null,
  health_label text not null,
  rug_probability integer not null,
  whale_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists znzf_events (
  id serial primary key,
  kind text not null,
  amount numeric not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists stakes (
  user_id text not null,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id)
);
