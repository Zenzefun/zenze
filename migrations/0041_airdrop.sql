create table if not exists airdrop_wallets (
  wallet text primary key,
  x_handle text,
  telegram_user_id text,
  telegram_ok boolean not null default false,
  created_at timestamptz not null default now()
);
