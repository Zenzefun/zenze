-- On-chain launch metadata.

alter table tokens add column if not exists curve_address text;
alter table tokens add column if not exists quote_address text;
alter table tokens add column if not exists tx_hash text;

create index if not exists tokens_curve_idx on tokens (lower(curve_address)) where curve_address is not null;
