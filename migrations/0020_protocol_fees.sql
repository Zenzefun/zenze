-- Live protocol takes. Desk Settings can change these. $0.50 launch, $19 list.
insert into protocol_config (key, value) values
  ('launch_fee_usd', '0.5'),
  ('listing_fee_usd', '19')
on conflict (key) do update
  set value = excluded.value
  where protocol_config.key = 'listing_fee_usd'
    and protocol_config.value in ('10', '10.0', '');

update protocol_config
   set value = '19'
 where key = 'listing_fee_usd'
   and value in ('10', '10.0', '');
