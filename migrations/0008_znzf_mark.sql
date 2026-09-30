-- Transparent $ZNZF coin mark + live mainnet contracts (same CREATE address on both chains).
update tokens
   set image_url = '/brand/znzf.svg',
       contract_address = '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0',
       creator_wallet = '0x9571f0E9B944D4eABb678A3A4969b400c97A2573'
 where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_robinhood', '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0'),
  ('vault_robinhood', '0x75260Cb596Da0eb8fC8E8dA8b52162Eaf059350F'),
  ('factory_robinhood', '0x6E3Ed7c4FD360D8141E001D30cB18BeE7Bd8F81e'),
  ('bridge_robinhood', '0x8f14165140A221fE039fDFE37d24457AdDe5D65b'),
  ('znzf_arc', '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0'),
  ('vault_arc', '0x75260Cb596Da0eb8fC8E8dA8b52162Eaf059350F'),
  ('factory_arc', '0x6E3Ed7c4FD360D8141E001D30cB18BeE7Bd8F81e'),
  ('bridge_arc', '0x8f14165140A221fE039fDFE37d24457AdDe5D65b'),
  ('deployer', '0x9571f0E9B944D4eABb678A3A4969b400c97A2573')
on conflict (key) do update set value = excluded.value;
