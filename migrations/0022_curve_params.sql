-- Curve swap fee is 2% (200 bps). ETH pairs graduate at 2 ETH into Uniswap v4.
-- Seeded "Keep the 1% curve fee" proposal is outdated. $ZNZF treasury is one holder.

insert into protocol_config (key, value) values
  ('trade_fee_bps', '200'),
  ('graduation_eth', '2')
on conflict (key) do update set value = excluded.value;

update proposals
   set title = 'Set the curve swap fee to 2%',
       body = 'Curve swaps are 2% on-chain. 70% of the fee goes to the creator and 30% to the protocol. Stakers share recorded protocol revenue. ETH pairs graduate at 2 ETH of real reserves. At that threshold the curve closes and remaining liquidity is sent to Uniswap v4. This matches the published curve bytecode for new launches.'
 where title ilike '%1% curve fee%'
    or title = 'Keep the 1% curve fee';

insert into proposals (title, body, status)
select
  'Graduate ETH pools at 2 ETH',
  'An ETH bonding curve closes once 2 ETH of real reserves are raised. Remaining tokens and quote are sent to Uniswap v4 when the migrator runs. 24 ETH was too high for this desk. Virtual reserves stay 30 ETH so the starting price does not jump. $ZNZF is not a Uniswap listing until its own curve graduates.',
  'open'
where not exists (
  select 1 from proposals where title = 'Graduate ETH pools at 2 ETH'
);

-- Canonical 1,000,000,000 $ZNZF is minted. The treasury holds that supply — one holder, not invented traction.
update tokens
   set holders = greatest(holders, 1)
 where id = 'znzf';
