-- Replay protection for listing/launch txs and curve trades.
alter table trades add column if not exists tx_hash text;

create unique index if not exists trades_tx_hash_idx
  on trades (lower(tx_hash))
  where tx_hash is not null and tx_hash <> '';

create unique index if not exists tokens_tx_hash_idx
  on tokens (lower(tx_hash))
  where tx_hash is not null and tx_hash <> '';
