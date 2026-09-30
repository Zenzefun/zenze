-- User proposals + AI source. Safe on already-migrated desks.

alter table proposals add column if not exists proposer text;
alter table proposals add column if not exists source text not null default 'wallet';
