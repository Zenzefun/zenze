-- Fresh protocol addresses (owner 0x4eA8…). Applied after historical 0008/0011.
update tokens
   set contract_address = '0x4BB3Ceedc9961865940687DeFead4abc5390F4d6',
       curve_address = '0x0DD4c1532672698183D847CCd6b3A12c55F9385D'
 where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_robinhood', '0x4BB3Ceedc9961865940687DeFead4abc5390F4d6'),
  ('znzf_curve_robinhood', '0x0DD4c1532672698183D847CCd6b3A12c55F9385D'),
  ('vault_robinhood', '0x1f360c80C6160743C2b9d3A7B411A1177bbFbA3D'),
  ('factory_robinhood', '0x6074E1Ada803fFfA96E48921ff12Dd1703ae371E'),
  ('bridge_robinhood', '0x4Cb8bA8d05337a0c7444812Ab3253C06b0E9a564'),
  ('znzf_arc', '0x53eFF260FBf41530B345e70ae42042FD274aCBc6'),
  ('vault_arc', '0x1f360c80C6160743C2b9d3A7B411A1177bbFbA3D'),
  ('factory_arc', '0x6074E1Ada803fFfA96E48921ff12Dd1703ae371E'),
  ('bridge_arc', '0x4Cb8bA8d05337a0c7444812Ab3253C06b0E9a564'),
  ('deployer', '0x4eA876ba2Fe3A565344cBb127B381402D636f413')
on conflict (key) do update set value = excluded.value;
