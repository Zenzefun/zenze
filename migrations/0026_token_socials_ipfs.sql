-- Social links on launches. Strip the Zenze mark from every non-protocol token.
alter table tokens add column if not exists website text not null default '';
alter table tokens add column if not exists twitter text not null default '';
alter table tokens add column if not exists telegram text not null default '';

update tokens
set image_url = ''
where id <> 'znzf'
  and (
    image_url like '/brand/%'
    or image_url ilike '%capy-mark%'
    or image_url ilike '%capy-zen%'
    or image_url ilike '%capybara%'
  );
