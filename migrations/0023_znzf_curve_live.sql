-- Live $ZNZF bonding curve on Robinhood, seeded with 800,000,000 $ZNZF.
insert into protocol_config (key, value)
values ('znzf_curve_robinhood', '0xf1c3453e5946b99e3451945ce44cbf68a8f118fb')
on conflict (key) do update set value = excluded.value;

update tokens
   set curve_address = '0xf1c3453e5946b99e3451945ce44cbf68a8f118fb',
       contract_address = coalesce(nullif(contract_address, ''), '0xe44a56bb0138f3bd269c3182ecd51fdcb5fa52f0'),
       graduated = false,
       source = 'launched',
       holders = greatest(holders, 1)
 where id = 'znzf';

create table if not exists bridge_transfers (
  id text primary key,
  from_chain text not null,
  to_chain text not null,
  sender text not null,
  amount numeric not null,
  lock_tx text,
  mint_tx text,
  status text not null default 'locked',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
