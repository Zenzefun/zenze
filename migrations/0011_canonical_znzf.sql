-- Canonical $ZNZF on Robinhood (1B). Arc is the bridged representation (0 initial supply).
-- Old Arc ZenzeToken at 0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0 was burned to 0.

update tokens
   set image_url = '/brand/znzf.svg',
       contract_address = '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0',
       creator_wallet = '0x9571f0E9B944D4eABb678A3A4969b400c97A2573',
       chain = 'robinhood'
 where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_robinhood', '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0'),
  ('vault_robinhood', '0x75260Cb596Da0eb8fC8E8dA8b52162Eaf059350F'),
  ('factory_robinhood', '0x6E3Ed7c4FD360D8141E001D30cB18BeE7Bd8F81e'),
  ('bridge_robinhood', '0x8f14165140A221fE039fDFE37d24457AdDe5D65b'),
  ('znzf_arc', '0xCb350973184084915AE487649A30aAa8c948d506'),
  ('vault_arc', '0xf1C3453e5946B99E3451945ce44CbF68A8f118FB'),
  ('factory_arc', '0x8CafD2398632dA848BE61784182b4257D0eF1A4a'),
  ('bridge_arc', '0xAb47E5E9204E5282F38656FEF827bbb5D3F48618'),
  ('znzf_robinhood_kind', 'canonical'),
  ('znzf_arc_kind', 'bridged'),
  ('canonical_chain', 'robinhood'),
  ('total_supply', '1000000000'),
  ('deployer', '0x9571f0E9B944D4eABb678A3A4969b400c97A2573')
on conflict (key) do update set value = excluded.value;
