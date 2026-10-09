do $$
begin
  begin
    create index if not exists trades_wallet_created_idx on trades (wallet, created_at);
  exception
    when insufficient_privilege then
      null;
  end;
end $$;
