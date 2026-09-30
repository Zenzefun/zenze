-- Factories that embed claimCreatorFees() on new bonding curves.
insert into protocol_config (key, value) values
  ('factory_robinhood', '0x8e337979730107df8124f144bcce60274a285537'),
  ('factory_arc', '0x92b3db1738bed8ad7dabbdbb0f0732d47c4695a1')
on conflict (key) do update set value = excluded.value;
