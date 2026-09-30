-- Live launch factories (launchFee = 0; USD take quoted by the app and paid as msg.value).
insert into protocol_config (key, value) values
  ('factory_robinhood', '0x8c1b7ee09cdb14b60b53cf8113e869425bc4b969'),
  ('factory_arc', '0x8e337979730107df8124f144bcce60274a285537')
on conflict (key) do update set value = excluded.value;
