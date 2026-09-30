-- The curve balance moves. Do not store a fixed "800,000,000 sit on the curve" claim.
update tokens
   set description = 'The protocol token of Zenze.fun. Fixed 1,000,000,000 supply on Robinhood Chain. The curve was seeded with 800,000,000 $ZNZF and the balance left changes as people trade.'
 where id = 'znzf'
   and description like '%800,000,000 sit on the bonding curve%';
