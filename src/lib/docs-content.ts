import { CHAINS, TRADE_FEE_BPS, TOTAL_SUPPLY, MAX_CREATOR_TAX_BPS, DEFAULT_CREATOR_TAX_BPS, UNISWAP_V4 } from "./chains";
import { LAUNCH_FEE_USD, LISTING_FEE_USD } from "./fees";
import { publishedConfig, TREASURY_WALLET } from "./onchain";
import { PAIR_ASSETS } from "./pairs";

export type DocsGroup = "Protocol" | "Integration";

export type DocsBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "note"; text: string }
  | { type: "warn"; text: string };

export type DocsDoc = {
  slug: string;
  title: string;
  group: DocsGroup;
  description: string;
  blocks: DocsBlock[];
};

const cfg = publishedConfig();
const canonicalAddr = cfg.znzf_robinhood;
const bridgedAddr = cfg.znzf_arc;
const curveAddr = cfg.znzf_curve_robinhood;
const rhFactory = cfg.factory_robinhood;
const arcFactory = cfg.factory_arc;
const rhVault = cfg.vault_robinhood;
const arcVault = cfg.vault_arc;
const rhBridge = cfg.bridge_robinhood;
const arcBridge = cfg.bridge_arc;
const burnerAddr = cfg.buyback_robinhood;
const intakeAddr = cfg.intake_robinhood;
const splitterAddr = cfg.splitter_robinhood;
const migratorAddr = cfg.znzf_v4_migrator;
const stakeAddr = cfg.stake_robinhood;
const routerAddr = cfg.router_robinhood;
const retiredArc = cfg.znzf_arc_retired;
const unusedArc = cfg.znzf_arc_unused;
const rhExplorer = CHAINS.robinhood.explorer;
const arcExplorer = CHAINS.arc.explorer;

function a(addr: string | undefined, chain: "robinhood" | "arc" = "robinhood") {
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return "not published";
  const ex = chain === "arc" ? arcExplorer : rhExplorer;
  return `[${addr}](${ex}/address/${addr})`;
}

export const DOCS_VERSION = "Zenzen protocol · live contracts";

const overview: DocsDoc = {
  slug: "overview",
  title: "Overview",
  group: "Protocol",
  description: "The rules for a launch, the fee, and the $ZNZF pool. These pages are the mechanism. The rest of the site does not restate them.",
  blocks: [
    {
      type: "p",
      text: "What is live: canonical $ZNZF on Robinhood Chain, its fee vault, its ETH bonding curve, a fee intake, and a buyback splitter. The curve fee is 2%. New buys stop after 2 ETH of real reserves. That curve does not migrate. Buyback burns canonical supply on Robinhood only. Arc has the bridged token, a factory, and a fee vault. Arc supply equals completed Robinhood locks. Arc does not run buyback.",
    },
    {
      type: "p",
      text: "A new token starts on a curve. When that curve fills on Robinhood, the site moves the reserves into a Uniswap v4 pool and the swap on the token page uses that pool. The live $ZNZF curve does not move.",
    },
    {
      type: "p",
      text: "The ERC-20 in a wallet does not change if a future curve migrates. Migration is not part of the live $ZNZF market.",
    },
    {
      type: "h2",
      text: "What is live today",
    },
    {
      type: "ul",
      items: [
        `Robinhood Chain (id ${CHAINS.robinhood.id}) — ETH gas, explorer robinhoodchain.blockscout.com. Canonical $ZNZF, its curve, the fee vault, the intake, the splitter, the launch factory, and the bridge lock are live.`,
        `Arc (id ${CHAINS.arc.id}) — USDC gas, explorer explorer.arc.io. The live Arc token is the one that already holds the locked amount. It grows only when canonical tokens are locked. The factory, fee vault, and bridge are published. There is no $ZNZF pool and no buyback on Arc. The vault names this same live token.`,
        `$ZNZF was minted at ${TOTAL_SUPPLY.toLocaleString()} on Robinhood. Burns reduce totalSupply. The curve was seeded with 800,000,000 $ZNZF. The treasury wallet holds 200,000,000. The amount left on the curve changes when people trade. The fee is 2%. New buys stop after 2 ETH of real reserves. The curve does not migrate.`,
      ],
    },
    {
      type: "note",
      text: "These pages describe the contracts and parameters that are on-chain today, not a wishlist. If a number disagrees with a live `eth_call`, the chain is right.",
    },
  ],
};

const lifecycle: DocsDoc = {
  slug: "lifecycle",
  title: "Launch lifecycle",
  group: "Protocol",
  description: "New factory launches on Robinhood: create, trade, close, then migrate only if a migrator is set. The live $ZNZF curve does not.",
  blocks: [
    {
      type: "p",
      text: "A new factory launch on Robinhood follows four steps. The live $ZNZF curve is not one of them: it has no migrator and does not close into a pool. An Arc factory curve can trade and close, but this app has no Uniswap v4 PoolManager on Arc, so it does not migrate.",
    },
    {
      type: "ol",
      items: [
        `Create — the wallet calls launchAdvanced on the factory, pays the launch take (default $${LAUNCH_FEE_USD.toFixed(2)} in native, plus gas), and the factory mints the full supply to a new bonding curve. Image must already be pinned to IPFS. Name, ticker, pair, creator wallet, creator tax, holder sharing, and up to 8 snipe-exempt wallets are set here and then frozen.`,
        "Trade — anyone buys and sells against that curve. Price is the constant-product of virtual + real reserves. The curve always takes the other side.",
        `Graduate — when realBase ≥ graduateAt (2 ETH for ETH pairs), the curve sets graduated = true. Further buy/sell revert. Remaining token inventory plus collected quote are the pool seed.`,
        "Pool — anyone may call migrate() on the curve after a migrator is set. The ZenzeV4Migrator seeds a full-range Uniswap v4 position on Robinhood Chain. Arc has no PoolManager in this app, so Arc curves do not migrate.",
      ],
    },
    {
      type: "p",
      text: "A launch cannot be left stranded because the creator walked away. Graduation is a state on the curve, and migrate() is public once the migrator address is set.",
    },
  ],
};

const curve: DocsDoc = {
  slug: "bonding-curve",
  title: "Bonding curve",
  group: "Protocol",
  description: "Constant-product virtual reserves. The curve holds the whole supply and always trades.",
  blocks: [
    {
      type: "p",
      text: "A new launch mints its full supply to the curve. The price is not set by a person. It is x / y where x = virtualBase + realBase and y = virtualTokens − tokensSold. The live $ZNZF curve was seeded with 800,000,000, not the whole mint. The treasury wallet holds 200,000,000.",
    },
    {
      type: "p",
      text: "ETH pairs open with virtualBase = 30 ETH and virtualTokens = 1,073,000,000. Other pairs scale those virtual reserves to the quote (USDG 12,500 / 1.073B, $ZNZF 1,250,000 / 1.073B, stock pairs similarly). The first buy is therefore not free, and a large buy moves the price because it walks the product k = x · y.",
    },
    {
      type: "h2",
      text: "Buy and sell",
    },
    {
      type: "ul",
      items: [
        "buyFor(amount, minTokensOut) — native quote is msg.value; ERC-20 quote is transferFrom. Snipe tax (if any) is taken first. The 2% fee is taken from what remains. minTokensOut is the sandwich bound.",
        "sellFor(tokensIn, minQuoteOut) — pulls the launch token, returns quote after the 2% fee. Snipe tax does not apply to sells.",
        "quote == address(0) means native gas (ETH on Robinhood, USDC on Arc). Anything else is an ERC-20 pair.",
      ],
    },
    {
      type: "p",
      text: "The one moment you cannot sell is after graduation. Reserves are held for the pool. Before that, the curve always trades.",
    },
    {
      type: "h2",
      text: "The live $ZNZF curve",
    },
    {
      type: "p",
      text: `The live curve is ${a(curveAddr)}. It charges 2% and does not migrate to Uniswap.`,
    },
  ],
};

const graduation: DocsDoc = {
  slug: "graduation",
  title: "Graduation",
  group: "Protocol",
  description: "A new Robinhood curve can close at its pair threshold. Uniswap v4 receives the reserves only if a migrator is set. The live $ZNZF curve cannot.",
  blocks: [
    {
      type: "p",
      text: "This page is for new factory curves. The live $ZNZF curve has no setMigrator. It does not graduate. Graduation, when it exists, is the moment realBase reaches graduateAt. The curve flips graduated = true inside the buy that crosses the line. After that, buy and sell revert.",
    },
    {
      type: "table",
      headers: ["Pair", "graduateAt", "virtualBase"],
      rows: [
        ["ETH (Robinhood)", "2 ETH", "30 ETH"],
        ["USDG", "10,000 USDG", "12,500 USDG"],
        ["USDC (Arc)", "10,000 USDC", "12,500 USDC"],
        ["$ZNZF", "1,000,000 $ZNZF", "1,250,000 $ZNZF"],
        ["PONS", "20,000 PONS", "25,000 PONS"],
        ["Stock tokens", "≈ $10k of that token", "1.25 × threshold"],
      ],
    },
    {
      type: "p",
      text: "Not all of the supply is sold on the curve. virtualTokens is 1.073B against a 1.000B mint, so a reserved share stays in the curve as inventory for the pool. The last buy that would overshoot still fills at the quoted price; excess native on a native pair is not silently kept — the function takes msg.value as paid.",
    },
    {
      type: "h2",
      text: "migrate()",
    },
    {
      type: "p",
      text: "After the curve fills, the site calls migrate(). Remaining tokens and quote go into a Uniswap v4 pool on Robinhood Chain, and the token page swaps there. The live $ZNZF curve has no migrator, so it stays on its own pool. Arc has no Uniswap v4 pool in this app.",
    },
    {
      type: "p",
      text: `PoolManager on Robinhood Chain: ${a(UNISWAP_V4.robinhood.poolManager)}. Arc has no published PoolManager in this app. An Arc launch does not get a v4 pool from Zenzen.`,
    },
  ],
};

const pairs: DocsDoc = {
  slug: "pairs",
  title: "Custom pairs",
  group: "Protocol",
  description: "A launch prices in one quote for its whole life. The swap widget can still route other tokens that share that quote.",
  blocks: [
    {
      type: "p",
      text: "Most launches are priced in ETH. A creator may instead pick USDG, $ZNZF, PONS, USDC on Arc, or a Robinhood stock token (NVDA, AAPL, TSLA, GOOGL, SPY, QQQ, and the rest of the published pair list). That quote becomes the currency for buys, sells, graduation, and creator payouts. Nothing in the curve quietly converts between two quotes.",
    },
    {
      type: "p",
      text: "The pair is one asset. The swap widget is not limited to that one asset. If another live Zenze token uses the same quote, the widget routes sell A → quote → buy B. A published token that has a Uniswap v4 ETH pool, such as USDG or a Robinhood stock, can also pay an ETH curve: it is sold for ETH first, and 2% of that ETH stays with Zenzen. On a token page the token itself cannot be replaced. Selling that token pays ETH only. $ZNZF stays on its curve.",
    },
    {
      type: "h2",
      text: "Published quote contracts (Robinhood)",
    },
    {
      type: "table",
      headers: ["Asset", "Address", "Decimals"],
      rows: PAIR_ASSETS.filter((p) => p.chains.includes("robinhood")).slice(0, 12).map((p) => [
        p.symbol,
        p.native ? "native ETH (aeWETH 0x0Bd7…AD73 optional wrap)" : (p.key === "znzf" ? (canonicalAddr || "not published") : (p.address.robinhood ?? "—")),
        String(p.decimals),
      ]),
    },
    {
      type: "note",
      text: "The pair list is longer than this table. Stock/ETF addresses are the issuer contracts on Robinhood Chain. A creator cannot name an arbitrary ERC-20 as the quote — the factory accepts any address, but the app only offers the published list, and virtualBase / graduateAt are taken from that list at send time.",
    },
  ],
};

const snipe: DocsDoc = {
  slug: "snipe",
  title: "Snipe protection",
  group: "Protocol",
  description: "99% buy tax at second zero, linear to 0% across 3 seconds. Sells are not taxed. Up to 8 exempt wallets.",
  blocks: [
    {
      type: "p",
      text: "A launch is most vulnerable in the first seconds, when a bot can take a large slice of cheap supply. ZenzeBondingCurve charges a buy-only snipe tax that starts at 99% and decays linearly to 0% over 3 seconds:",
    },
    {
      type: "code",
      code: "snipeTaxBps(buyer):\n  if snipeExempt[buyer] → 0\n  elapsed = block.timestamp - launchedAt\n  if elapsed >= 3 → 0\n  else 9900 - (9900 * elapsed) / 3\n\n  t=0 → 99.00%\n  t=1 → 66.00%\n  t=2 → 33.00%\n  t=3 → 0",
    },
    {
      type: "p",
      text: "The snipe slice stays in the curve as realBase (it becomes pool liquidity). It is not burned and it is not paid to the creator. The 2% trading fee is computed on the remainder after snipe.",
    },
    {
      type: "p",
      text: "Exemptions: up to 8 wallets, set at launchAdvanced and then immutable. The creator is not automatically exempt — declare the wallets the team opens with. Read snipeTaxBps(recipient) before showing a quote in the first three seconds, or the number on screen will not match the fill.",
    },
    {
      type: "warn",
      text: "This is not the Pons 5-second exponential 99% tax, and it is not 32 exemptions. Those numbers belong to another protocol. Zenzen is 3 seconds, linear, 8 wallets.",
    },
  ],
};

const fees: DocsDoc = {
  slug: "fees",
  title: "Fees",
  group: "Protocol",
  description: "New factory curves charge 2%. Creator tax is a slice of that fee, capped at 10% of it. Launch take is $0.50. Listing take is $19.",
  blocks: [
    {
      type: "h2",
      text: "Curve swap fee",
    },
    {
      type: "p",
      text: `New launches from the current factory use FEE_BPS = ${TRADE_FEE_BPS} (2%) on every buy and sell, always in the quote asset, never in the launch token. On a buy the fee comes off the input before pricing. On a sell it comes off the output after pricing.`,
    },
    {
      type: "p",
      text: `New launches charge ${TRADE_FEE_BPS / 100}% on every buy and sell (FEE_BPS = ${TRADE_FEE_BPS}). That percentage does not change. creatorTaxBps is the creator's slice of that fee, set once at launch. The form opens at ${DEFAULT_CREATOR_TAX_BPS / 100} and will not accept more than ${MAX_CREATOR_TAX_BPS / 100}. A value of ${DEFAULT_CREATOR_TAX_BPS / 100} is ${DEFAULT_CREATOR_TAX_BPS / 100}% of the fee, not ${DEFAULT_CREATOR_TAX_BPS / 100}% of the trade. At that default, a 1 ETH buy pays 0.02 ETH in fees. The creator keeps ${(0.02 * DEFAULT_CREATOR_TAX_BPS) / 10_000} ETH. The protocol keeps the rest. The live $ZNZF curve charges the same 2% and sets creatorTaxBps to 0.`,
    },
    {
      type: "p",
      text: "If holder sharing is on, the creator slice accrues to holders pro-rata instead of creatorAccrued. Holders pull it with claimHolderFees().",
    },
    {
      type: "h2",
      text: "Protocol take on create / list",
    },
    {
      type: "ul",
      items: [
        `Launch take defaults to $${LAUNCH_FEE_USD.toFixed(2)} USD, paid in native gas at the ETH/USD (or USDC) print at send time, plus network gas. factory.launchFee is the on-chain wei floor — current published factories set this to 0, so the USD take is what the wallet actually sends.`,
        `List take defaults to $${LISTING_FEE_USD.toFixed(0)} USD, paid to the fee vault. A referrer in the list link earns ${10}% of that take.`,
      ],
    },
    {
      type: "h2",
      text: "Uniswap swap on Zenzen",
    },
    {
      type: "p",
      text: `A listed token swapped from a Zenze page pays the same ${TRADE_FEE_BPS / 100}% in ETH to the fee vault. On a buy, that slice is sent before the rest is swapped. On a sell, that slice of the ETH received is sent to the vault and the rest goes to the wallet. The pool's own Uniswap fee is separate. A swap made directly on Uniswap does not pay Zenzen.`,
    },
    {
      type: "h2",
      text: "Buyback",
    },
    {
      type: "p",
      text: `Buyback runs on Robinhood Chain only. That is where the $ZNZF curve and the canonical supply are. Arc does not get an intake or a splitter. A copy on Arc cannot call the Robinhood curve, so it would not burn canonical $ZNZF.`,
    },
    {
      type: "p",
      text: `The live curve still pays its 2% to the fee vault ${a(rhVault)}. That address was fixed when the curve was deployed and cannot be changed.`,
    },
    {
      type: "ol",
      items: [
        `The treasury sweeps 80% of vault ETH to the intake ${a(intakeAddr)}. The fee vault BUYBACK_BPS is 8000, so the other 20% stays in the vault.`,
        `The intake forwards that ETH to the splitter ${a(splitterAddr)}. Pair assets can sit in either contract. They are not swapped.`,
        `The splitter calls the burner ${a(burnerAddr)}. The burner buys $ZNZF on the curve and burns it in the same transaction. totalBurned increases. totalSupply falls.`,
      ],
    },
    {
      type: "p",
      text: "The owner can sweep 80% of the ETH in the fee vault into buyback. BUYBACK_BPS is 8000, so 20% stays in the vault. The burn happens only when that transaction is sent. Unclaimed creator escrow is creatorAccrued on each new curve. The live $ZNZF curve accrues none.",
    },
    {
      type: "note",
      text: "The live $ZNZF curve charges FEE_BPS = 200 and creatorTaxBps = 0. Read both from the curve you are about to call. Do not reuse an older fee.",
    },
  ],
};

const payouts: DocsDoc = {
  slug: "payouts",
  title: "Payouts",
  group: "Protocol",
  description: "Creator fees accrue on the curve in the quote asset. The creator pulls them. They are not pushed.",
  blocks: [
    {
      type: "p",
      text: "Creator fees accrue as creatorAccrued on that launch’s curve, in that launch’s quote asset. They are not sent on each swap (a push to a contract creator would revert the trade). The creator wallet calls claimCreatorFees() and receives the quote.",
    },
    {
      type: "ul",
      items: [
        "claimCreatorFees() — msg.sender must be creator. Pays the full accrued balance, then zeroes it.",
        "claimHolderFees() — any holder. Syncs the reward-per-token accumulator, then pays that wallet’s share.",
        "Legacy curves from earlier factories may auto-pay the creator on each swap. Those contracts are immutable. New launches are pull-only.",
      ],
    },
    {
      type: "p",
      text: "There is no combined balance across launches. Each curve is its own pot. A creator with three pools claims three times.",
    },
  ],
};

const creator: DocsDoc = {
  slug: "creator",
  title: "Creator controls",
  group: "Protocol",
  description: "Almost everything is frozen at launch. The creator can claim fees, set a migrator once, and set imageURI once.",
  blocks: [
    {
      type: "p",
      text: "Frozen after launch: name, symbol, quote asset, virtual reserves, graduateAt, creatorTaxBps, holder sharing, snipe exemptions, and creator address. The mint cannot be increased. A burn, where the token allows one, reduces totalSupply.",
    },
    {
      type: "p",
      text: "The creator may still:",
    },
    {
      type: "ul",
      items: [
        "claimCreatorFees().",
        "setMigrator(address) once, then anyone can migrate() after graduation.",
        "setImageURI(string) once, if it was empty. The app pins art to IPFS before launch and the factory does not store the URI — the curve’s imageURI is optional metadata.",
      ],
    },
    {
      type: "p",
      text: "The creator cannot mint extra supply, pause trading, blacklist, raise tax, withdraw liquidity after migrate, or change the pair. There is no admin on ZenzeBondingCurve.",
    },
  ],
};

const bridge: DocsDoc = {
  slug: "bridge",
  title: "Bridge",
  group: "Protocol",
  description: "Canonical $ZNZF lives on Robinhood. Arc holds a 1:1 bridged representation. Lock on one side, mint on the other.",
  blocks: [
    {
      type: "p",
      text: `$ZNZF was minted once, on Robinhood Chain, at ${a(canonicalAddr)}. The mint was ${TOTAL_SUPPLY.toLocaleString()}. Burns reduce totalSupply. Arc does not mint a second supply. The live Arc token at ${a(bridgedAddr, "arc")} grows only when a lock is released 1:1. An unused Arc token with supply 0 is not this contract.`,
    },
    {
      type: "ul",
      items: [
        `Robinhood lock: ${a(rhBridge)}.`,
        `Arc release: ${a(arcBridge, "arc")}.`,
        "The public move page locks from the user’s wallet. After the lock confirms, the other chain releases 1:1. A return burns the Arc token and releases the Robinhood lock.",
      ],
    },
    {
      type: "warn",
      text: "There is no third mint. A wrapped $ZNZF that is not these two addresses is not the protocol token.",
    },
  ],
};

const znzf: DocsDoc = {
  slug: "znzf",
  title: "$ZNZF",
  group: "Protocol",
  description: "Protocol token. Minted on Robinhood. Arc starts at zero. The live curve does not graduate.",
  blocks: [
    {
      type: "ul",
      items: [
        `Canonical (Robinhood): ${a(canonicalAddr)}`,
        `Bridged (Arc): ${a(bridgedAddr, "arc")}`,
        `Live curve (Robinhood): ${a(curveAddr)}. Seeded with 800,000,000 $ZNZF. The balance left is on the curve and falls as tokens are bought.`,
        "The curve fee is 2% for every wallet. A holding rebate is not active.",
        "Stake locks $ZNZF. The treasury funded 1,000 $ZNZF of rewards over 30 days. That is the payment. Trading fees are not shared.",
      ],
    },
    {
      type: "p",
      text: "$ZNZF is not a Uniswap listing. The live curve trades against ETH, charges 2% (FEE_BPS = 200, read from the curve), and stops new buys after 2 ETH of real reserves. It does not migrate. Buyback of that supply happens through the Robinhood splitter and burner when the owner executes it. Arc supply equals completed Robinhood locks, 1:1. Nothing extra is minted.",
    },
  ],
};

const safety: DocsDoc = {
  slug: "safety",
  title: "Safety and recovery",
  group: "Protocol",
  description: "No custody. The live $ZNZF curve does not move liquidity to Uniswap. New factory curves can.",
  blocks: [
    {
      type: "ul",
      items: [
        "Zenzen does not hold wallets or trading inventory. Factory, curve, token, vault, and the move contract are called by the user.",
        "After migrate(), remaining curve inventory is in the v4 position. There is no unlock() on ZenzeV4Migrator.",
        "Tokens sent to a contract address by mistake are not recoverable from this app.",
        "A launch whose image was not IPFS-pinned is rejected by the app. On-chain, the factory does not store art — a token without art in the index is hidden or shown with an identicon, never the Zenze mark.",
        "Signers for moves and the treasury are not shipped in the client bundle.",
      ],
    },
  ],
};

const risk: DocsDoc = {
  slug: "risk",
  title: "Risk disclosures",
  group: "Protocol",
  description: "Tokens can go to zero. Names are not unique. Graduation is not a quality rating.",
  blocks: [
    {
      type: "ul",
      items: [
        "Tokens launched here can lose all value. The curve will still quote a number on the way down.",
        "Names and tickers are not unique and are not verified. Always check the contract address on this site before you trade.",
        "Creator tax is set at launch, up to 10% of the 2% fee. Read creatorTaxBps before trading.",
        "Snipe tax in the first 3 seconds can take most of a buy. Read snipeTaxBps(your wallet).",
        "Graduation means the curve filled its threshold. It is not an audit, a listing, or a statement of quality.",
        "Custom pairs carry the underlying asset’s risk (stock token, stablecoin, $ZNZF).",
        "Wallet-submitted transactions cannot be undone. Gas on Orbit L2 is not mainnet gas — the app quotes gas from the chain you are on.",
        "These contracts are not presented as audited. Treat them as unaudited production.",
      ],
    },
  ],
};

const contracts: DocsDoc = {
  slug: "contracts",
  title: "Contracts",
  group: "Integration",
  description: "Live addresses on Robinhood Chain (4663) and Arc (5042).",
  blocks: [
    {
      type: "h2",
      text: "Robinhood Chain · 4663",
    },
    {
      type: "table",
      headers: ["Role", "Address"],
      rows: [
        ["Treasury / deployer", TREASURY_WALLET],
        ["$ZNZF (canonical)", canonicalAddr || "not published"],
        ["$ZNZF curve", curveAddr || "not published"],
        ["Fee vault", rhVault],
        ["Fee intake", intakeAddr || "not published"],
        ["Buyback splitter", splitterAddr || "not published"],
        ["Buyback burner", burnerAddr || "not published"],
        ["Fee router", routerAddr || "not published"],
        ["$ZNZF stake", stakeAddr || "not published"],
        ["Launch factory (current)", rhFactory],
        ["Robinhood lock", rhBridge || "not published"],
        ["Uniswap v4 migrator", migratorAddr || "not published"],
        ["Uniswap v4 PoolManager", UNISWAP_V4.robinhood.poolManager],
        ["Position manager", UNISWAP_V4.robinhood.positionManager],
        ["Universal Router", UNISWAP_V4.robinhood.universalRouter],
      ],
    },
    {
      type: "p",
      text: "Index TokenLaunched only from the factory address in this table.",
    },
    {
      type: "h2",
      text: "Arc · 5042",
    },
    {
      type: "table",
      headers: ["Role", "Address"],
      rows: [
        ["$ZNZF (bridged)", bridgedAddr || "not published"],
        ["Fee vault", arcVault],
        ["Launch factory (current)", arcFactory],
        ["Arc release", arcBridge],
      ],
    },
    {
      type: "p",
      text: "No fee intake and no buyback splitter on Arc. Buyback burns canonical $ZNZF on Robinhood. The live $ZNZF curve has no migrator, so it does not graduate into Uniswap. New factory curves can.",
    },
    ...(retiredArc || unusedArc
      ? [{
          type: "warn" as const,
          text: [
            retiredArc ? `The previous Arc token ${a(retiredArc, "arc")} still has an earlier balance. Use Send the old balance home on the move page. Do not import it as the live token.` : "",
            unusedArc ? `An unused Arc token at ${a(unusedArc, "arc")} has supply 0. Do not import it as the live token. 0xc4e6…f226 on Arc is also unused. That same hex on Robinhood is the stake contract. Do not import it on the wrong chain.` : "",
          ].filter(Boolean).join(" "),
        }]
      : []),
    {
      type: "note",
      text: "Addresses are chain-specific. The same hex can be a factory on Arc and a curve on Robinhood. Import a contract only on the chain named in this table.",
    },
  ],
};

const launching: DocsDoc = {
  slug: "launching",
  title: "Launching a token",
  group: "Integration",
  description: "Factory entry points. IPFS art is required by the app before the wallet is asked to sign.",
  blocks: [
    {
      type: "code",
      code: "function launch(\n  string name,\n  string symbol,\n  address quote,\n  uint256 virtualBase,\n  uint256 virtualTokens,\n  uint256 graduateAt\n) payable returns (address token, address curve)\n\nfunction launchAdvanced(\n  string name,\n  string symbol,\n  address quote,\n  uint256 virtualBase,\n  uint256 virtualTokens,\n  uint256 graduateAt,\n  address creatorWallet,\n  uint16 creatorTaxBps,\n  bool holderSharing,\n  address[] snipeExempt\n) payable returns (address token, address curve)\n\nfunction launchFee() view returns (uint256)",
    },
    {
      type: "ul",
      items: [
        "msg.value must be ≥ launchFee. Current published factories have launchFee = 0; the app still sends the USD take as msg.value.",
        "creatorTaxBps ≤ 1000. snipeExempt.length ≤ 8. creatorWallet = 0x0 uses msg.sender.",
        "quote = 0x0 for native. Otherwise an ERC-20 the curve will transferFrom.",
        "Event: TokenLaunched(token, curve, creator, quote, symbol).",
        "The app refuses to send the transaction without an IPFS image. The factory does not see the image.",
      ],
    },
  ],
};

const trading: DocsDoc = {
  slug: "trading",
  title: "Buying and selling",
  group: "Integration",
  description: "Curve buyFor / sellFor. Multi-token widget routes through shared quotes.",
  blocks: [
    {
      type: "code",
      code: "function buyFor(uint256 amount, uint256 minTokensOut) payable\nfunction sellFor(uint256 tokensIn, uint256 minQuoteOut)\nfunction buy(uint256 amount) payable          // legacy, minOut = 0\nfunction sell(uint256 tokensIn)               // legacy, minOut = 0\nfunction snipeTaxBps(address buyer) view returns (uint256)\nfunction spotPrice() view returns (uint256)",
    },
    {
      type: "p",
      text: "Prefer buyFor / sellFor. A token still on its curve sends 1% slippage as minOut and does not show a slippage control. A listed pool uses the slippage set in the widget. For an ERC-20 quote, approve the curve first. For a sell, approve the launch token on the curve.",
    },
    {
      type: "p",
      text: "A token still on its bonding curve uses a direct swap. Market, limit, and the slippage control appear only after that stage is finished and the token trades as a listed pool. The token on the page cannot be replaced, and selling it pays ETH only. There is no resting order book. If the widget says there is no route, that token has no curve and no Uniswap v4 ETH pool.",
    },
  ],
};

const quoting: DocsDoc = {
  slug: "quoting",
  title: "Getting a quote",
  group: "Integration",
  description: "There is no quote() on the curve. Read reserves and apply the fee yourself.",
  blocks: [
    {
      type: "code",
      code: "x = virtualBase + realBase\ny = virtualTokens - tokensSold\nk = x * y\nfeeBps = FEE_BPS()                // 200 on live $ZNZF and new launches\nsnipe = paid * snipeTaxBps(to) / 10_000\ntradable = paid - snipe\nfee = tradable * feeBps / 10_000\nnet = tradable - fee\nnewX = x + net\nnewY = k / newX\ntokensOut = y - newY",
    },
    {
      type: "p",
      text: "On a sell, fee is taken from the quote out, not the token in. If you skip snipeTaxBps in the first three seconds, the UI will over-promise tokensOut.",
    },
  ],
};

const claiming: DocsDoc = {
  slug: "claiming",
  title: "Claiming fees",
  group: "Integration",
  description: "Pull creatorAccrued or holder rewards from the curve in the quote asset.",
  blocks: [
    {
      type: "code",
      code: "function claimCreatorFees()           // creator only\nfunction claimHolderFees()            // any holder\nfunction creatorAccrued() view returns (uint256)\nfunction pendingHolderFees(address) view returns (uint256)\nfunction creator() view returns (address)\nfunction holderSharing() view returns (bool)\nfunction creatorTaxBps() view returns (uint16)",
    },
    {
      type: "p",
      text: "Paid in the quote asset. Native quote uses a call{value:}. ERC-20 quote uses transfer. A token page always shows the Creator fees panel; the claim button is enabled only for the creator wallet on a pull-style curve.",
    },
  ],
};

const events: DocsDoc = {
  slug: "events",
  title: "Events to index",
  group: "Integration",
  description: "Factory TokenLaunched plus curve Buy, Sell, Graduated, fee claims, and migrate.",
  blocks: [
    {
      type: "code",
      code: "TokenLaunched(address token, address curve, address creator, address quote, string symbol)\nBuy(address buyer, uint256 baseIn, uint256 tokensOut, uint256 fee)\nSell(address seller, uint256 tokensIn, uint256 baseOut, uint256 fee)\nGraduated(uint256 realBase)\nMigratorSet(address migrator)\nMigrated(address migrator, uint256 tokens, uint256 quoteAmount)\nImageSet(string uri)\nCreatorFeesClaimed(address creator, uint256 amount)\nHolderFeesClaimed(address holder, uint256 amount)\nLaunchFeeSet(uint256 fee)",
    },
    {
      type: "p",
      text: "Index TokenLaunched from the factory address published on this site for that chain. Skip a launch that has no IPFS art. The app must not fall back to the Zenze mark.",
    },
  ],
};

const errors: DocsDoc = {
  slug: "errors",
  title: "Errors",
  group: "Integration",
  description: "Revert strings from the live factory and curve. They are short require() strings, not custom errors.",
  blocks: [
    {
      type: "table",
      headers: ["String", "Where", "Meaning"],
      rows: [
        ["fee", "factory", "msg.value < launchFee"],
        ["curve", "factory / curve", "virtualBase, virtualTokens, or graduateAt is 0"],
        ["tax", "factory / curve", "creatorTaxBps > 1000"],
        ["exempt", "factory / curve", "more than 8 snipe wallets"],
        ["graduated", "curve buy/sell", "curve is closed"],
        ["slippage", "buyFor / sellFor", "minOut not met"],
        ["value", "buy", "no quote paid"],
        ["native", "buy", "msg.value sent to an ERC-20 pair"],
        ["dust", "buy", "tokensOut is 0"],
        ["inventory", "buy", "curve token balance too low"],
        ["amt", "sell", "tokensIn is 0 or above tokensSold"],
        ["creator", "claim / setMigrator / setImageURI", "caller is not creator"],
        ["none", "claim", "nothing accrued"],
        ["set", "setMigrator / setImageURI", "already set"],
        ["migrate", "migrate", "migrator call failed; state rolled back"],
        ["reentrancy", "curve", "nonReentrant guard"],
      ],
    },
  ],
};

export const DOCS: DocsDoc[] = [
  overview,
  lifecycle,
  curve,
  graduation,
  pairs,
  snipe,
  fees,
  payouts,
  creator,
  bridge,
  znzf,
  safety,
  risk,
  contracts,
  launching,
  trading,
  quoting,
  claiming,
  events,
  errors,
];

export const DOCS_NAV: { group: DocsGroup; items: { slug: string; title: string }[] }[] = [
  {
    group: "Protocol",
    items: DOCS.filter((d) => d.group === "Protocol").map((d) => ({ slug: d.slug, title: d.title })),
  },
  {
    group: "Integration",
    items: DOCS.filter((d) => d.group === "Integration").map((d) => ({ slug: d.slug, title: d.title })),
  },
];

export function docsBySlug(slug: string | undefined): DocsDoc | null {
  if (!slug || slug === "overview") return overview;
  return DOCS.find((d) => d.slug === slug) ?? null;
}

export function docsPath(slug: string) {
  return slug === "overview" ? "/docs" : `/docs/${slug}`;
}
