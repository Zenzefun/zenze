-- Desk is wallet-gated. Drop leftover email seats and kitchen config.
delete from admin_roles;
delete from protocol_config where key in ('admin_email', 'system_prompt');
delete from audit_logs where action in ('claim_operator');

insert into operator_wallets (wallet, role) values
  ('0x9571f0e9b944d4eabb678a3a4969b400c97a2573', 'super_admin')
on conflict (wallet) do update set role = excluded.role;
