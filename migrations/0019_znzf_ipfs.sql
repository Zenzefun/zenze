-- $ZNZF mark is the standing gold capybara disc, pinned on public IPFS.
update tokens
set
  image_url = 'https://copper-cheerful-mite-422.mypinata.cloud/ipfs/bafybeidouh5s5cq4qgvykv2ykzpfxiwiv3ptvgivtmv4euecrkwuw4qxvi',
  graduated = false,
  source = case when coalesce(curve_address, '') ~ '^0x[a-fA-F0-9]{40}$' then source else 'protocol' end
where id = 'znzf';
