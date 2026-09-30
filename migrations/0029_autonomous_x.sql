-- Autonomous @ZenzeFun pulse: play labels, engagement, learned weights.

alter table marketing_posts add column if not exists play text;
alter table marketing_posts add column if not exists reply_to text;
alter table marketing_posts add column if not exists likes integer not null default 0;
alter table marketing_posts add column if not exists replies integer not null default 0;
alter table marketing_posts add column if not exists quotes integer not null default 0;
alter table marketing_posts add column if not exists views integer not null default 0;
alter table marketing_posts add column if not exists score numeric not null default 0;

create table if not exists marketing_learnings (
  play text primary key,
  posts integer not null default 0,
  score_sum numeric not null default 0,
  last_score numeric not null default 0,
  hook text not null default '',
  updated_at timestamptz not null default now()
);

insert into protocol_config (key, value) values
  ('x_auto_on', 'true'),
  ('x_auto_minutes', '45')
on conflict (key) do nothing;
