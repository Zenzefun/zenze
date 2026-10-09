-- Launch form default is 2% of the 2% fee (200), not the 10% cap.
alter table tokens alter column creator_tax_bps set default 200;
