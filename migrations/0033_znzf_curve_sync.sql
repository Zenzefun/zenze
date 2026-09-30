-- Live $ZNZF curve is 0x0DD4… with 800M inventory. Reset stale sold/base from the retired 0xe44A curve.
update tokens
   set contract_address = '0x4BB3Ceedc9961865940687DeFead4abc5390F4d6',
       curve_address = '0x0DD4c1532672698183D847CCd6b3A12c55F9385D',
       quote_asset = 'eth',
       graduated = false,
       source = 'launched',
       real_base = 0,
       tokens_sold = 0,
       virtual_base = 30,
       virtual_tokens = 1073000000
 where id = 'znzf';

update protocol_config set value = '0x4BB3Ceedc9961865940687DeFead4abc5390F4d6' where key = 'znzf_robinhood';
update protocol_config set value = '0x0DD4c1532672698183D847CCd6b3A12c55F9385D' where key = 'znzf_curve_robinhood';
update protocol_config set value = '0x53eFF260FBf41530B345e70ae42042FD274aCBc6' where key = 'znzf_arc';

-- Trades/holdings on the retired curve are not inventory on 0x4BB3.
delete from trades where token_id = 'znzf';
delete from holdings where token_id = 'znzf';
