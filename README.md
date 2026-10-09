<p align="center"><img src="https://zenzen.fun/brand/capy-mark-512.png" width="120" alt="Zenze capybara logo"></p>

# Zenze

**A token launchpad for Arc and Robinhood Chain. Launch a token, then sell it back into the same pool.**

App: https://zenze.fun (mirror https://zenzen.fun) · Docs: https://zenzen.fun/docs · X: [@ZenzeFun](https://x.com/ZenzeFun)

---

## Overview

Zenze is a noncustodial token launchpad. A creator names a token, uploads art, picks a pair and signs one transaction. The supply is seeded into a bonding curve, and **the curve is the pool**: buyers buy from it and sellers sell straight back into it. There is no presale and no separate liquidity step.

Zenze targets two chains:

| | Arc (Circle L1) | Robinhood Chain |
|---|---|---|
| Chain ID | 5042 | 4663 |
| Gas token | USDC | ETH |
| Explorer | https://explorer.arc.io | https://robinhoodchain.blockscout.com |
| Status | Contracts deployed; no public launch yet | Live |

### Why Arc

- **USDC gas:** launching and trading cost a predictable dollar amount, and users don't need a volatile gas token.
- **USDC-quoted curves:** curve prices read in dollars.
- **Fast, deterministic finality:** a good fit for curves, where each trade sets the next price.

## Arc mainnet deployment (chain 5042)

The Arc contracts are deployed on mainnet. **Arc launches are not live yet**: no token has been launched through the Arc factory so far. This section will link the first Arc launch once it happens.

| Contract | Address | Deploy tx |
|---|---|---|
| Launch factory | [`0xda1650faaec372925c9211e6625ba5d9a4397d57`](https://explorer.arc.io/address/0xda1650faaec372925c9211e6625ba5d9a4397d57) | [`0x37cccf06…1e92`](https://explorer.arc.io/tx/0x37cccf06a26c541c9f04eae0906bf5e8b5de43a2d2bcb65e0e96d9d3fc5d1e92) |
| Fee vault | [`0xeaeb7d39cd6d362e420609142c5cf8f05999bac6`](https://explorer.arc.io/address/0xeaeb7d39cd6d362e420609142c5cf8f05999bac6) | [`0xd1e5da05…6854`](https://explorer.arc.io/tx/0xd1e5da0506fafe6f34bd69d40b6f5a56926781a5889b25e85e2d886624d36854) |
| $ZNZF (bridged, 1:1) | [`0x65ee0ce656908544a1f29856ac9aee8563b5002c`](https://explorer.arc.io/address/0x65ee0ce656908544a1f29856ac9aee8563b5002c) | [`0xa38a597a…bbeb`](https://explorer.arc.io/tx/0xa38a597af2a3b89db2897683f12577d3e48168d3c3dc4af4888186655611bbeb) |
| $ZNZF bridge (release) | [`0x37c66bfd99fb9e86040b55b83681169d1a7b47bd`](https://explorer.arc.io/address/0x37c66bfd99fb9e86040b55b83681169d1a7b47bd) | [`0x648b1d42…29be`](https://explorer.arc.io/tx/0x648b1d423b0518b47940ed1bd32e63b0526d0b3a3259ec22f1e2b284097829be) |

> Addresses are chain-specific. The same hex can be a different contract on Robinhood Chain (for example `0xda16…7d57` is the Arc launch factory but the $ZNZF curve on Robinhood Chain). Always use the chain named here.

## Robinhood Chain deployment (chain 4663)

| Contract | Address |
|---|---|
| $ZNZF (canonical) | [`0x65ee0ce656908544a1f29856ac9aee8563b5002c`](https://robinhoodchain.blockscout.com/address/0x65ee0ce656908544a1f29856ac9aee8563b5002c) |
| $ZNZF curve | [`0xda1650faaec372925c9211e6625ba5d9a4397d57`](https://robinhoodchain.blockscout.com/address/0xda1650faaec372925c9211e6625ba5d9a4397d57) |
| Launch factory | [`0xbf656702ad1bdf92082f957937175278ff48e5d9`](https://robinhoodchain.blockscout.com/address/0xbf656702ad1bdf92082f957937175278ff48e5d9) |
| Fee vault | [`0xeaeb7d39cd6d362e420609142c5cf8f05999bac6`](https://robinhoodchain.blockscout.com/address/0xeaeb7d39cd6d362e420609142c5cf8f05999bac6) |
| Fee router | [`0x14bef4bb7cdc55b0a780a0570f8c9f76fe4fca43`](https://robinhoodchain.blockscout.com/address/0x14bef4bb7cdc55b0a780a0570f8c9f76fe4fca43) |
| Buyback burner | [`0x1f5287b157439db84aa7223bc5c42847e097e2fb`](https://robinhoodchain.blockscout.com/address/0x1f5287b157439db84aa7223bc5c42847e097e2fb) |
| $ZNZF stake | [`0xe02136725069bcbef161d0de2969ccce1c53d41e`](https://robinhoodchain.blockscout.com/address/0xe02136725069bcbef161d0de2969ccce1c53d41e) |
| $ZNZF bridge (lock) | [`0xf67c1c1fc3248a23e0a352003529badfaefb45e0`](https://robinhoodchain.blockscout.com/address/0xf67c1c1fc3248a23e0a352003529badfaefb45e0) |
| Uniswap v4 migrator | [`0x7e58bf6453b8a26682be81563f9a07a0c032386d`](https://robinhoodchain.blockscout.com/address/0x7e58bf6453b8a26682be81563f9a07a0c032386d) |

The machine-readable list, including deploy transactions, is in [`src/lib/onchain.json`](src/lib/onchain.json). Human-readable docs: https://zenzen.fun/docs/contracts.

## How it works

1. **Connect** a wallet and pick a chain.
2. **Launch:** name, ticker, image and quote asset. The factory deploys the ERC-20 and seeds its supply into a bonding curve in one transaction.
3. **Trade:** buy from the curve, or sell back into it at any time. Each trade pays a protocol fee into the fee vault, and the creator can receive a share of it.
4. **Anti-snipe:** buys in the first seconds after launch pay a launch tax that decays to zero.
5. **Graduation (Robinhood Chain only):** a filled curve can move into a Uniswap v4 pool. Arc curves don't migrate, and the live $ZNZF curve does not migrate.
6. **$ZNZF bridge:** canonical $ZNZF lives on Robinhood Chain. Locking it there releases the same amount 1:1 on Arc.

Fee parameters are documented at https://zenzen.fun/docs and can be read on-chain.

## Repository layout

```
src/            Web app (TanStack Start + React): routes, components, chain/curve logic
src/lib/        Chain config (chains.ts), deployed addresses (onchain.json, onchain.ts), ABIs
server/         Server middleware and plugins
contracts/      Solidity sources for the Robinhood Chain fee path, curve, stake and drop
migrations/     SQL schema migrations for the app database
scripts/        Build checks, deploy helpers and tests (keys are read from the environment)
infra/          nginx and server scripts
defillama/      DefiLlama adapter files
```

Not yet in this repo: the Solidity sources for the Arc launch factory, fee vault, bridged $ZNZF and bridge. They will be added so the Arc contracts can be verified on the explorer.

## Build & test

Requires Node.js 20+.

```bash
npm ci
npm run typecheck
npm test
npm run dev        # local dev server on :8080
```

Runtime configuration is read from environment variables. Keep them in a local `.env` (ignored by git) and never commit it.

## Security

- Not audited. Use at your own risk.
- Report issues to ariaerendev@gmail.com.
- No secrets are stored in this repo.

## License

MIT. See [LICENSE](LICENSE).
