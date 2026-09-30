-- Desk-managed keys, Reown project id, and maintenance mode.
-- Values stay empty until the operator pastes them. Env remains the fallback.

insert into protocol_config (key, value) values
  ('reown_project_id', ''),
  ('maintenance', 'false'),
  ('maintenance_message', ''),
  ('pinata_jwt', ''),
  ('pinata_gateway', ''),
  ('dune_api_key', ''),
  ('xai_api_key', ''),
  ('deepseek_api_key', ''),
  ('x_bearer_token', ''),
  ('x_api_key', ''),
  ('x_api_secret', ''),
  ('x_handle', 'ZenzeFun')
on conflict (key) do nothing;
