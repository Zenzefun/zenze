-- $ZNZF is not listed on Uniswap. It trades on a Zenze curve once that curve is published.
-- Seed had graduated=true with no curve — that was wrong.
update tokens
set
  graduated = false,
  quote_asset = coalesce(nullif(quote_asset, ''), 'eth'),
  virtual_base = 30,
  virtual_tokens = 1073000000,
  image_url = case
    when image_url is null or image_url like '/brand/%' then '/brand/capy-mark-512.webp'
    else image_url
  end
where id = 'znzf';

insert into protocol_config (key, value) values
  ('znzf_curve_robinhood', ''),
  ('znzf_curve_arc', '')
on conflict (key) do nothing;
