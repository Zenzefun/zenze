-- First-party, cookie-less site events. No IP, user-agent, or wallet.
create table if not exists site_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  name text not null check (name in ('pageview', 'launch_form_start', 'launch_form_complete')),
  path text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer_host text,
  session_id text not null
);

create index if not exists site_events_occurred_idx on site_events (occurred_at desc);
create index if not exists site_events_name_occurred_idx on site_events (name, occurred_at desc);
create index if not exists site_events_campaign_occurred_idx on site_events (utm_campaign, occurred_at desc);

-- UTM on launches (first-touch from the browser that submitted the form).
alter table tokens add column if not exists utm_source text;
alter table tokens add column if not exists utm_medium text;
alter table tokens add column if not exists utm_campaign text;
alter table tokens add column if not exists utm_content text;
alter table tokens add column if not exists utm_term text;
