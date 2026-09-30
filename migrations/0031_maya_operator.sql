-- Maya Chen operator loop: queue, contacts, structured memory, conservative caps.

alter table marketing_posts add column if not exists job text;
alter table marketing_posts add column if not exists segment text;
alter table marketing_posts add column if not exists risk text;
alter table marketing_posts add column if not exists audience text;

create table if not exists marketing_queue (
  id serial primary key,
  action text not null,
  job text not null default 'A1',
  risk text not null default 'high',
  segment text not null default '',
  audience text not null default '',
  reason text not null default '',
  draft text not null default '',
  handle text not null default '',
  post_id text not null default '',
  url text not null default '',
  payload jsonb not null default '{}',
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists marketing_queue_status_idx
  on marketing_queue (status, created_at desc);

create table if not exists marketing_contacts (
  handle text primary key,
  segment text not null default '',
  last_action text not null default '',
  last_topic text not null default '',
  temperature text not null default 'cold',
  objections text not null default '',
  next_action text not null default '',
  next_at timestamptz,
  do_not_contact boolean not null default false,
  score integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists marketing_memory (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists marketing_notes (
  id serial primary key,
  strategy text not null default '',
  bottleneck text not null default '',
  note text not null,
  created_at timestamptz not null default now()
);

insert into protocol_config (key, value) values
  ('x_auto_replies_on_our_posts', 'true'),
  ('x_auto_follows', 'false'),
  ('x_auto_quotes', 'false')
on conflict (key) do nothing;

update protocol_config set value = '8' where key = 'x_daily_likes';
update protocol_config set value = '24' where key = 'x_daily_follows';
update protocol_config set value = '6' where key = 'x_daily_reposts';
update protocol_config set value = '12' where key = 'x_daily_comments';
