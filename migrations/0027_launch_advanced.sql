-- Per-launch creator tax and holder fee sharing (set at deploy, read on-chain too).
alter table tokens add column if not exists creator_tax_bps integer not null default 7000;
alter table tokens add column if not exists holder_sharing boolean not null default false;

-- Existing rows keep the legacy 70% creator split. New launches write the live tax.
