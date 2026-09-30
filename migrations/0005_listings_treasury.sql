alter table tokens add column if not exists source text not null default 'launched';
alter table tokens add column if not exists contract_address text;

create unique index if not exists tokens_contract_chain_idx
  on tokens (chain, lower(contract_address))
  where contract_address is not null and contract_address <> '';

create index if not exists tokens_source_idx on tokens (source, created_at desc);

create table if not exists withdrawals (
  id serial primary key,
  amount numeric not null,
  dest text not null,
  asset text not null default 'ETH',
  status text not null default 'queued',
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists referrals (
  id serial primary key,
  wallet text not null,
  token_id text,
  kind text not null,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);

insert into protocol_config (key, value) values
  ('treasury_address', ''),
  ('listing_fee_eth', '0.002')
on conflict (key) do nothing;

update tokens set source = 'protocol' where id = 'znzf' and source = 'launched';
