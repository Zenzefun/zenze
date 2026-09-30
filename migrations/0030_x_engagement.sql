-- Daily @ZenzeFun engagement: likes, follows, reposts, comments.
-- Quotas live in protocol_config; actions are de-duplicated per target.

create table if not exists marketing_actions (
  id serial primary key,
  kind text not null,
  target_id text not null,
  target_user text not null default '',
  tweet_id text,
  status text not null default 'ok',
  error text,
  created_at timestamptz not null default now(),
  unique (kind, target_id)
);

create index if not exists marketing_actions_day_kind
  on marketing_actions (kind, created_at desc);

insert into protocol_config (key, value) values
  ('x_daily_likes', '35'),
  ('x_daily_follows', '50'),
  ('x_daily_reposts', '50'),
  ('x_daily_comments', '50')
on conflict (key) do nothing;
