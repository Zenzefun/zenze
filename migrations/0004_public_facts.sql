-- Strip staged demo pools / trades / burns so the public site only shows facts.
delete from tokens
 where id in ('onsen','moss','bamboo','lotus','hearth','steam','pebble','mist','dawn','kombu','rocky');

delete from znzf_events;

delete from protocol_config where key in ('admin_email', 'system_prompt');

update protocol_config
   set value = ''
 where key in ('znzf_robinhood', 'znzf_arc')
   and value in ('pending-deploy', 'pending');

update tokens set
  real_base = 0,
  tokens_sold = 0,
  holders = 0,
  volume_24h = 0,
  health_score = 50,
  rug_probability = 0,
  graduated = true,
  creator_wallet = '0x0000000000000000000000000000000000000000',
  description = 'The protocol token of Zenze.fun. Fixed 1,000,000,000 supply. Governance, fee discounts, staking, and buyback-and-burn funded by actual protocol revenue.'
where id = 'znzf';

create table if not exists wallet_stakes (
  wallet text primary key,
  amount numeric not null default 0,
  updated_at timestamptz not null default now()
);
