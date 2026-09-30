-- Quote assets (ETH / USDG / USDC / $ZNZF) + Capy marketing memory.

alter table tokens add column if not exists quote_asset text not null default 'eth';

update tokens set quote_asset = 'usdc' where chain = 'arc' and quote_asset = 'eth';
update tokens set quote_asset = 'eth' where id = 'znzf';

create table if not exists ai_memory (
  id serial primary key,
  kind text not null,
  content text not null,
  created_at timestamptz not null default now()
);

alter table marketing_posts add column if not exists request text;
alter table marketing_posts add column if not exists research text;
alter table marketing_posts add column if not exists x_post_id text;
alter table marketing_posts add column if not exists published_at timestamptz;

create index if not exists marketing_posts_status_idx on marketing_posts (status, created_at desc);
create index if not exists tokens_quote_idx on tokens (quote_asset, chain);

insert into protocol_config (key, value) values
  ('x_handle', 'ZenzeFun'),
  ('ai_provider', 'auto')
on conflict (key) do nothing;
