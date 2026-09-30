create table if not exists community_notes (
  id bigserial primary key,
  platform text not null default 'telegram',
  content text not null,
  status text not null default 'draft',
  telegram_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
