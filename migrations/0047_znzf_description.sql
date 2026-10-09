-- Supply is shown on the token page. Keep the paragraph about the pool, not the mint count.
update tokens
   set description = 'The protocol token of Zenze.fun. It trades on Robinhood Chain. The pool opened with 800,000,000 $ZNZF, and what is left there changes as people trade. This pool does not move to Uniswap.'
 where id = 'znzf';
