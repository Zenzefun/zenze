update tokens
   set curve_address = '0xda1650faaec372925c9211e6625ba5d9a4397d57',
       contract_address = '0x65ee0ce656908544a1f29856ac9aee8563b5002c',
       creator_wallet = '0x4ea876ba2fe3a565344cbb127b381402d636f413',
       quote_asset = 'eth',
       graduated = false,
       source = 'launched',
       real_base = 0,
       tokens_sold = 0,
       virtual_base = 30,
       virtual_tokens = 1073000000,
       description = 'The protocol token of Zenze.fun. Fixed 1,000,000,000 supply on Robinhood Chain. 800,000,000 sit on the bonding curve.'
 where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_curve_robinhood', '0xda1650faaec372925c9211e6625ba5d9a4397d57'),
  ('buyback_robinhood', '0x1f5287b157439db84aa7223bc5c42847e097e2fb')
on conflict (key) do update set value = excluded.value;
