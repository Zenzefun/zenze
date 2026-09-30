-- Canonical $ZNZF launchpad row. Contract is the ERC-20; the curve is published separately.
update tokens
set
  contract_address = '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0',
  graduated = false,
  quote_asset = coalesce(nullif(quote_asset, ''), 'eth'),
  virtual_base = coalesce(nullif(virtual_base, 0), 30),
  virtual_tokens = coalesce(nullif(virtual_tokens, 0), 1073000000),
  total_supply = coalesce(nullif(total_supply, 0), 1000000000),
  source = case
    when coalesce(curve_address, '') ~ '^0x[a-fA-F0-9]{40}$' then 'launched'
    else 'protocol'
  end
where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_robinhood', '0xe44A56Bb0138f3bD269C3182eCD51Fdcb5fA52f0')
on conflict (key) do update
  set value = excluded.value
where protocol_config.value is null or protocol_config.value = '';
