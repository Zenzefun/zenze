do $$
begin
  begin
    alter table tokens add column if not exists dex_pool text not null default '';
  exception
    when insufficient_privilege or duplicate_column then
      null;
  end;
end $$;
