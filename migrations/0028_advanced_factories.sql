-- Factories with launchAdvanced (holder sharing, creator tax, snipe exemptions).
insert into protocol_config (key, value) values
  ('factory_robinhood', '0x92b3db1738bed8ad7dabbdbb0f0732d47c4695a1'),
  ('factory_arc', '0x058efe1d55d4ff7c5cee33a0f78103b58eba4549')
on conflict (key) do update set value = excluded.value;
