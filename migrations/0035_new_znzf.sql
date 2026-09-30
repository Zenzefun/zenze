-- New $ZNZF after the retired contracts. Curve is not published yet:
-- the treasury was short ~0.000008 ETH of gas, so the curve tx was not sent.
update tokens
   set contract_address = '0x65ee0ce656908544a1f29856ac9aee8563b5002c',
       curve_address = null,
       quote_asset = 'eth',
       graduated = false,
       source = 'launched',
       real_base = 0,
       tokens_sold = 0,
       virtual_base = 30,
       virtual_tokens = 1073000000,
       description = 'The protocol token of Zenze.fun. Fixed 1,000,000,000 supply on Robinhood Chain. The previous contract was retired. Trading opens when the new bonding curve is published.'
 where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_robinhood', '0x65ee0ce656908544a1f29856ac9aee8563b5002c'),
  ('vault_robinhood', '0xeaeb7d39cd6d362e420609142c5cf8f05999bac6'),
  ('znzf_arc', '0x65ee0ce656908544a1f29856ac9aee8563b5002c'),
  ('vault_arc', '0xeaeb7d39cd6d362e420609142c5cf8f05999bac6'),
  ('factory_arc', '0xda1650faaec372925c9211e6625ba5d9a4397d57'),
  ('bridge_arc', '0x37c66bfd99fb9e86040b55b83681169d1a7b47bd'),
  ('deployer', '0x4ea876ba2fe3a565344cbb127b381402d636f413')
on conflict (key) do update set value = excluded.value;

delete from protocol_config
 where key in ('znzf_curve_robinhood', 'factory_robinhood', 'bridge_robinhood', 'buyback_robinhood', 'znzf_v4_migrator');
