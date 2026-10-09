-- Forgotten inserts used to inherit the retired 70% creator split (7000).
-- New rows default to 10% of the 2% fee. Existing rows are left as stored.
alter table tokens alter column creator_tax_bps set default 1000;
