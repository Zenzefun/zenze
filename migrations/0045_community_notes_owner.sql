do $$
begin
  begin
    alter table community_notes add column if not exists kind text not null default 'note';
    alter table community_notes add column if not exists source_message_id text;
  exception
    when insufficient_privilege then
      null;
  end;
end $$;
