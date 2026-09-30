-- Fresh start. The previous $ZNZF contracts were drained.
-- Wipes indexed pools, trades, stakes, governance, and marketing history.
-- Keeps auth users and desk secrets (API keys). Contract pointers are cleared
-- so the site cannot keep selling the retired token.

truncate table
  trades,
  holdings,
  watchlist,
  ai_analyses,
  tokens,
  wallet_stakes,
  stakes,
  znzf_events,
  withdrawals,
  referrals,
  bridge_transfers,
  proposal_votes,
  proposals,
  marketing_actions,
  marketing_learnings,
  marketing_queue,
  marketing_contacts,
  marketing_memory,
  marketing_notes,
  marketing_posts,
  ai_memory,
  ai_jobs,
  audit_logs,
  admin_roles,
  operator_wallets
restart identity cascade;

delete from protocol_config
 where key in (
    'znzf_robinhood',
    'znzf_curve_robinhood',
    'vault_robinhood',
    'factory_robinhood',
    'bridge_robinhood',
    'buyback_robinhood',
    'znzf_v4_migrator',
    'znzf_arc',
    'znzf_curve_arc',
    'vault_arc',
    'factory_arc',
    'bridge_arc'
  )
    or lower(btrim(value)) in (
    '0x4bb3ceedc9961865940687defead4abc5390f4d6',
    '0x53eff260fbf41530b345e70ae42042fd274acbc6',
    '0x0dd4c1532672698183d847ccd6b3a12c55f9385d',
    '0x1f360c80c6160743c2b9d3a7b411a1177bbfba3d',
    '0x6074e1ada803fffa96e48921ff12dd1703ae371e',
    '0x4cb8ba8d05337a0c7444812ab3253c06b0e9a564',
    '0xc19d678f484957173e90bdf7f79218e8d1f884f1',
    '0x6e3ed7c4fd360d8141e001d30cb18bee7bd8f81e',
    '0x8c1b7ee09cdb14b60b53cf8113e869425bc4b969',
    '0x8e337979730107df8124f144bcce60274a285537',
    '0x8cafd2398632da848be61784182b4257d0ef1a4a',
    '0x92b3db1738bed8ad7dabdbbb0f0732d47c4695a1'
  );

insert into protocol_config (key, value) values
  ('robinhood_enabled', 'true'),
  ('arc_enabled', 'true'),
  ('launch_fee_usd', '0.5'),
  ('listing_fee_usd', '19'),
  ('trade_fee_bps', '100')
on conflict (key) do nothing;

insert into tokens (
  id, name, symbol, description, image_url, creator_wallet, chain,
  real_base, tokens_sold, holders, volume_24h, health_score, rug_probability,
  graduated, created_at, source, quote_asset
) values (
  'znzf', 'Zenze', 'ZNZF',
  'The protocol token of Zenze.fun. Fixed 1,000,000,000 supply. The previous contract was retired after the supply was taken. This market stays dark until a new contract is published from the operator desk.',
  '/brand/capy-mark-512.webp',
  '0x0000000000000000000000000000000000000000',
  'robinhood',
  0, 0, 0, 0, 50, 0,
  false, now(), 'launched', 'eth'
);
