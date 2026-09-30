-- Protocol config only. No dummy pools, trades, or invented holder counts.
insert into protocol_config (key, value) values
  ('robinhood_enabled', 'true'),
  ('arc_enabled', 'true'),
  ('znzf_robinhood', ''),
  ('znzf_arc', ''),
  ('launch_fee_eth', '0.0005'),
  ('trade_fee_bps', '100')
on conflict (key) do nothing;

-- Native protocol token as a catalog row. Market figures stay at zero until
-- real wallets trade or the contract is set in operator settings.
insert into tokens (
  id, name, symbol, description, image_url, creator_wallet, chain,
  real_base, tokens_sold, holders, volume_24h, health_score, rug_probability, graduated, created_at
) values (
  'znzf', 'Zenze', 'ZNZF',
  'The protocol token of Zenze.fun. Fixed 1,000,000,000 supply. Governance, fee discounts, staking, and buyback-and-burn funded by actual protocol revenue.',
  '/brand/capy-mark.png', '0x0000000000000000000000000000000000000000', 'robinhood',
  0, 0, 0, 0, 50, 0, true, now()
)
on conflict (id) do nothing;
