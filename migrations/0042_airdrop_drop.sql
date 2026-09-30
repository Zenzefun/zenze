alter table airdrop_wallets add column if not exists x_user_id text;
alter table airdrop_wallets add column if not exists x_follow_ok boolean not null default false;
alter table airdrop_wallets add column if not exists spin_wei numeric;
alter table airdrop_wallets add column if not exists spin_at timestamptz;

create table if not exists x_oauth_states (
  state text primary key,
  wallet text not null,
  verifier text not null,
  created_at timestamptz not null default now()
);
