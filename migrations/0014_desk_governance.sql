-- $ZNZF mark is the header capy. Governance + stake ledger for the protocol page.

update tokens
   set image_url = '/brand/capy-mark.png'
 where id = 'znzf';

create table if not exists proposals (
  id serial primary key,
  title text not null,
  body text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists proposal_votes (
  proposal_id integer not null references proposals (id) on delete cascade,
  wallet text not null,
  support boolean not null,
  weight numeric not null default 0,
  created_at timestamptz not null default now(),
  primary key (proposal_id, wallet)
);

insert into proposals (title, body, status)
select
  'Keep the 1% curve fee',
  'Curve swaps stay at 1% on-chain. 70% to the creator, 30% to the protocol. Stakers share protocol revenue.',
  'open'
where not exists (select 1 from proposals);

insert into protocol_config (key, value) values
  ('launch_fee_usd', '0.5'),
  ('listing_fee_usd', '10'),
  ('staker_share_bps', '5000')
on conflict (key) do nothing;
