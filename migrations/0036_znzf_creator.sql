-- The fresh $ZNZF row was seeded with the zero address, so the claim control
-- never treated the treasury as the creator.
update tokens
   set creator_wallet = '0x4ea876ba2fe3a565344cbb127b381402d636f413'
 where id = 'znzf'
   and lower(creator_wallet) in ('', '0x0000000000000000000000000000000000000000');
