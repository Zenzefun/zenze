// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { createPublicClient, createWalletClient, decodeAbiParameters, decodeEventLog, decodeFunctionResult, encodeEventTopics, encodeFunctionData, formatUnits, http, keccak256, parseAbi, parseAbiItem, parseUnits, toHex, verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS, TOTAL_SUPPLY, TRADE_FEE_BPS, ZNZF_ID, UNISWAP_V4 } from "@/lib/chains";
import { quoteBuy, quoteSell, progressToGraduation } from "@/lib/curve";
import { getSql } from "@/lib/db";
import { FACTORY_MIN_WEI, LAUNCH_FEE_USD, STAKER_SHARE_BPS, launchValueWei, listValueWei, minAcceptWei, parseFeeUsd, weiToNative } from "@/lib/fees";
import { asNumber, formatEth, formatUsdCompact } from "@/lib/format";
import { computeHealth, healthBand } from "@/lib/health";
import { isBrandTokenArt, isIpfsArt, isTokenArt } from "@/lib/image-art";
import { isHexAddress, walletIntentMessage } from "@/lib/intent";
import { loadDeskConfig, liveProtocolConfig, PUBLIC_CONFIG_KEYS, CONTRACT_CONFIG_KEYS, configValue } from "@/lib/server/secrets";
import { publishedConfig, publishedZnzfCurve } from "@/lib/onchain";
import { summarizeHeld, unavailableBucket } from "@/lib/fee-buckets";
import { realStakeApy } from "@/lib/stake-apy";
import { isZnzfRef } from "@/lib/token-path";
import { PAIR_ASSETS, defaultQuote, quoteOf, quotesFor } from "@/lib/pairs";
import { persistTokenArtRequired, pinBrandFile } from "@/lib/pinata.server";
import { fetchEthUsd, fetchQuoteUsdMap } from "@/lib/quotes.server";
import { cleanSocial, readSocial } from "@/lib/socials";
import { cleanTokenName, parseTokenMeta } from "@/lib/token-name";
import { ZNZF_IPFS_GATEWAY } from "@/lib/znzf-image";
import { fromWei, getCode, getReceipt, getTransaction, quoteTxGas, readCreatorAccrued, readCreatorTaxBps, readCurveCreator, readCurveState, readErc20, readFactoryLaunchFee, readHolderSharing, readNativeBalance, readPendingHolderFees, readTokenBalance, readTokenHolders, getLogs, chainRpc } from "@/lib/rpc.server";
import { duneReady, duneSql } from "@/lib/server/dune";
import { verifyWalletIntent } from "@/lib/server/wallet-auth";
import { operatorMiddleware } from "@/lib/operator-middleware";
import { env } from "@/lib/env.server";
import { capCreatorTaxBps, clampShareOfFeeBps } from "@/lib/fee-split";
import { mergeTradeRows } from "@/lib/chart-window";
import { announceListing } from "@/lib/server/listing-promo";
import { migrateCurveIfReady } from "@/lib/server/auto-migrate";
import { activeLiquidityUsd, ethPerToken, ethPoolId, parseDexPool, pickUniswapV4Pool, traderSwap, v4EthPrice, v4SwapCall, NATIVE_ETH, V4_ETH_TIERS, tokenUnits } from "@/lib/dex-swap";
import { readEarlierWalletSwap, readRecentSwaps, resolveListedPool } from "@/lib/server/dex.server";

export type EnrichedToken = Record<string, any>;

function quoteUsdPrice(quote, ethUsd, usdMap) {
	const live = usdMap?.[quote.key];
	if (live != null && Number.isFinite(live) && live > 0) return live;
	if (quote.key === "eth" || quote.native && quote.symbol === "ETH") return ethUsd;
	if (quote.kind === "stable" || quote.key === "usdc" || quote.key === "usdg") return 1;
	if (quote.refUsd != null && quote.refUsd > 0) return quote.refUsd;
	return null;
}
var LAUNCHED = parseAbiItem("event TokenLaunched(address indexed token, address indexed curve, address indexed creator, address quote, string symbol)");
var BUY = parseAbiItem("event Buy(address indexed buyer, uint256 baseIn, uint256 tokensOut, uint256 fee)");
var SELL = parseAbiItem("event Sell(address indexed seller, uint256 tokensIn, uint256 baseOut, uint256 fee)");
var CREATOR_BONUS_ZNZF = 1e3;
function curveOf(row) {
	const quote = quoteOf(row.quote_asset, row.chain);
	return {
		virtualBase: asNumber(row.virtual_base, quote.virtualBase),
		virtualTokens: asNumber(row.virtual_tokens, quote.virtualTokens),
		realBase: asNumber(row.real_base),
		tokensSold: asNumber(row.tokens_sold),
		feeBps: asNumber(row.fee_bps, 200) || 200
	};
}
export function enrichToken(row, opts) {
	const chain = CHAINS[row.chain] ?? CHAINS.robinhood;
	const quote = quoteOf(row.quote_asset, row.chain);
	const curve = curveOf(row);
	const y = Math.max(1, curve.virtualTokens - curve.tokensSold);
	const x = curve.virtualBase + curve.realBase;
	const storedDex = parseDexPool(row.dex_pool);
	const dex = storedDex && (row.source === "listed" || (row.graduated && row.id !== "znzf")) ? storedDex : null;
	const hasCurve = isHexAddress(row.curve_address);
	const quoteable = !dex && (hasCurve || row.id === "znzf");
	const price = dex ? dex.priceNative : quoteable && y > 0 ? x / y : 0;
	const supply = Math.max(1, asNumber(row.total_supply, 1e9) || 1e9);
	const nativeMcap = quoteable && price > 0 ? price * supply : 0;
	const unitUsd = quoteUsdPrice(quote, opts.ethUsd, opts.usdMap);
	const priceUsd = dex ? dex.priceUsd : quoteable && price > 0 && unitUsd != null ? price * unitUsd : null;
	const mcap = dex ? dex.mcap : quoteable && nativeMcap > 0 && unitUsd != null ? nativeMcap * unitUsd : nativeMcap;
	const liquidityUsd = dex ? dex.liquidityUsd : unitUsd != null ? curve.realBase * unitUsd : null;
	const enriched = {
		...row,
		chain,
		quote,
		band: healthBand(row.health_score),
		curve,
		price,
		priceUsd,
		priceQuote: formatEth(price),
		mcap,
		liquidityUsd,
		ethUsd: opts.ethUsd,
		quoteUsd: unitUsd,
		graduation: quote.graduation,
		progress: progressToGraduation(curve.realBase, quote.graduation),
		source: row.source ?? (row.id === "znzf" && !isHexAddress(row.curve_address) ? "protocol" : "launched"),
		feeBps: curve.feeBps ?? 200,
		dex
	};
	delete enriched.rug_probability;
	return enriched;
}
async function attachGraduatedPool(row) {
	if (!row?.graduated || row.id === "znzf" || row.chain !== "robinhood" || row.source === "listed") return row;
	const contract = String(row.contract_address || "");
	if (!isHexAddress(contract) || !isHexAddress(row.curve_address)) return row;
	const stored = parseDexPool(row.dex_pool);
	if (stored && stored.currency1 === contract.toLowerCase() && Number(stored.priceNative) > 0) {
		scheduleListedRefresh(row, contract);
		return row;
	}
	const moved = await migrateCurveIfReady("robinhood", row.curve_address).catch(() => false);
	if (!moved) return row;
	const live = await resolveListedPool("robinhood", contract, stored).catch(() => null);
	if (!live?.ok) return row;
	const json = dexJson(stored, live.dex);
	try {
		await (await getSql())`update tokens set dex_pool = ${json} where id = ${row.id}`;
		dropPublicCaches();
	} catch {}
	return { ...row, dex_pool: json };
}
async function overlayOnchain(row, wait = false) {
	if (row.source === "listed") {
		if (row.id !== "znzf" && isBrandTokenArt(row.image_url || "")) {
			try {
				await (await getSql())`update tokens set image_url = '' where id = ${row.id} and id <> ${ZNZF_ID}`;
			} catch {}
			row = {
				...row,
				image_url: ""
			};
		}
		const contract = row.contract_address ?? "";
		if (isHexAddress(contract)) {
			const stored = parseDexPool(row.dex_pool);
			if (stored && stored.currency1 === contract.toLowerCase() && stored.priceNative > 0) {
				scheduleListedRefresh(row, contract);
				return row;
			}
			const live = await resolveListedPool(row.chain, contract, stored);
			if (live.ok) {
				const json = dexJson(stored, live.dex);
				const name = live.name && live.name.trim().length >= 2 ? live.name : row.name;
				const symbol = live.symbol && live.symbol.trim().length >= 2 ? live.symbol : row.symbol;
				const supply = live.supply > 0 ? live.supply : row.total_supply;
				try {
					if (json !== (row.dex_pool ?? "")) await (await getSql())`update tokens set dex_pool = ${json}, volume_24h = ${live.dex.volumeUsd}, name = ${name}, symbol = ${symbol}, total_supply = ${supply} where id = ${row.id}`;
				} catch {}
				return {
					...row,
					name,
					symbol,
					total_supply: supply,
					dex_pool: json
				};
			}
		}
		return row;
	}
	let next = row;
	if (row.id !== "znzf" && isBrandTokenArt(row.image_url || "")) {
		next = {
			...next,
			image_url: ""
		};
		try {
			await (await getSql())`update tokens set image_url = '' where id = ${row.id} and id <> ${ZNZF_ID} and (image_url like '/brand/%' or image_url ilike '%capy-mark%')`;
		} catch {}
	}
	if (row.id === "znzf" && !row.image_url?.includes("/ipfs/")) next = {
		...next,
		image_url: ZNZF_IPFS_GATEWAY
	};
	if (row.id === "znzf") {
		const published = await liveProtocolConfig();
		const live = row.chain === "arc" ? published.znzf_arc : published.znzf_robinhood;
		const curve = published[row.chain === "arc" ? "znzf_curve_arc" : "znzf_curve_robinhood"] || (row.chain === "arc" ? "" : published.znzf_curve_robinhood);
		if (isHexAddress(live)) next = {
			...next,
			contract_address: live.toLowerCase()
		};
		if (isHexAddress(curve)) next = {
			...next,
			curve_address: curve.toLowerCase(),
			source: "launched",
			graduated: false
		};
	}
	if (!isHexAddress(next.curve_address)) return next;
	try {
		const quote = quoteOf(next.quote_asset, next.chain);
		const contract = isHexAddress(next.contract_address) ? next.contract_address : "";
		const [onchain, sharing, tax, meta] = await Promise.all([
			readCurveState(next.chain, next.curve_address),
			readHolderSharing(next.chain, next.curve_address),
			readCreatorTaxBps(next.chain, next.curve_address),
			contract ? readErc20(next.chain, contract).catch(() => null) : Promise.resolve(null),
		]);
		const realBase = fromWei(onchain.realBase, quote.decimals);
		const tokensSold = fromWei(onchain.tokensSold, 18);
		const virtualBase = fromWei(onchain.virtualBase, quote.decimals);
		const virtualTokens = fromWei(onchain.virtualTokens, 18);
		let totalSupply = asNumber(next.total_supply, TOTAL_SUPPLY);
		if (meta) {
			const liveSupply = fromWei(BigInt(meta.totalSupply), meta.decimals || 18);
			if (liveSupply > 0) totalSupply = liveSupply;
		}
		void (await getSql()).then((sql) => sql`
        update tokens set
          real_base = ${realBase},
          tokens_sold = ${tokensSold},
          virtual_base = ${virtualBase},
          virtual_tokens = ${virtualTokens},
          graduated = ${onchain.graduated},
          total_supply = ${totalSupply},
          creator_tax_bps = ${tax == null ? Number(next.creator_tax_bps ?? 0) : Math.max(0, Math.min(1e4, Math.round(tax)))},
          holder_sharing = ${sharing == null ? Boolean(next.holder_sharing) : sharing}
        where id = ${next.id}
      `).catch(() => {});
		if (onchain.graduated && next.id !== "znzf" && next.chain === "robinhood") {
			const moved = {
				...next,
				real_base: realBase,
				tokens_sold: tokensSold,
				virtual_base: virtualBase,
				virtual_tokens: virtualTokens,
				graduated: true,
				total_supply: totalSupply,
				source: next.source === "protocol" ? "launched" : next.source,
				fee_bps: onchain.feeBps,
				holder_sharing: sharing == null ? next.holder_sharing : sharing,
				creator_tax_bps: tax == null ? next.creator_tax_bps : tax
			};
			if (wait) return attachGraduatedPool(moved);
			attachGraduatedPool(moved).catch(() => {});
			return moved;
		}
		return {
			...next,
			real_base: realBase,
			tokens_sold: tokensSold,
			virtual_base: virtualBase,
			virtual_tokens: virtualTokens,
			graduated: onchain.graduated,
			total_supply: totalSupply,
			source: next.source === "protocol" ? "launched" : next.source,
			fee_bps: onchain.feeBps,
			holder_sharing: sharing == null ? next.holder_sharing : sharing,
			creator_tax_bps: tax == null ? next.creator_tax_bps : tax
		};
	} catch {
		return next;
	}
}
export async function findTokenRow(sql, id) {
	const raw = String(id ?? "").trim();
	if (!raw) return null;
	const lower = raw.toLowerCase();
	if (isZnzfRef(raw)) return (await sql`select * from tokens where id = ${"znzf"} limit 1`)[0] ?? null;
	if (isHexAddress(lower)) return (await sql`
      select * from tokens
      where lower(coalesce(contract_address, '')) = ${lower}
         or lower(coalesce(curve_address, '')) = ${lower}
      limit 1
    `)[0] ?? null;
	return (await sql`
    select * from tokens
    where id = ${raw} or lower(symbol) = ${lower}
    limit 1
  `)[0] ?? null;
}
var lastTradeSync = 0;
var PUBLIC_MS = 15e3;
var boardMemo = null;
var boardFlight = null;
var dexRefreshAt = /* @__PURE__ */ new Map();
function dropPublicCaches() {
	boardMemo = null;
	statsMemo = null;
}
function dexJson(stored, dex) {
	const athUsd = Math.max(Number(stored?.athUsd ?? 0), Number(dex.mcap) || 0);
	return dexPoolJson(athUsd > 0 ? {
		...dex,
		athUsd
	} : dex);
}
function scheduleListedRefresh(row, contract) {
	const key = contract.toLowerCase();
	const now = Date.now();
	if (now - (dexRefreshAt.get(key) ?? 0) < 6e4) return;
	dexRefreshAt.set(key, now);
	(async () => {
		const stored = parseDexPool(row.dex_pool);
		const live = await resolveListedPool(row.chain, contract, stored);
		if (!live.ok) return;
		const json = dexJson(stored, live.dex);
		if (json === (row.dex_pool ?? "")) return;
		if (row.source === "listed") {
			const name = live.name && live.name.trim().length >= 2 ? live.name : row.name;
			const symbol = live.symbol && live.symbol.trim().length >= 2 ? live.symbol : row.symbol;
			const supply = live.supply > 0 ? live.supply : row.total_supply;
			await (await getSql())`update tokens set dex_pool = ${json}, volume_24h = ${live.dex.volumeUsd}, name = ${name}, symbol = ${symbol}, total_supply = ${supply} where id = ${row.id}`;
			return;
		}
		await (await getSql())`update tokens set dex_pool = ${json} where id = ${row.id}`;
	})().catch(() => void 0);
}
const tradeRefreshAt = new Map();
function scheduleTradeRefresh(row, dex) {
	const key = String(row.id);
	const now = Date.now();
	if (now - (tradeRefreshAt.get(key) ?? 0) < 20_000) return;
	tradeRefreshAt.set(key, now);
	void Promise.resolve()
		.then(() => readRecentSwaps(dex, row.contract_address))
		.then(async (live) => {
			if (!live.length) return;
			await rememberTrades(await getSql(), row.id, live);
		})
		.catch(() => {});
}
var statsMemo = null;
var statsFlight = null;
async function syncCurveTrades(row) {
	if (!isHexAddress(row.curve_address)) return;
	const chain = row.chain === "arc" ? "arc" : "robinhood";
	const quote = quoteOf(row.quote_asset, row.chain);
	const buyTopic = encodeEventTopics({
		abi: [BUY],
		eventName: "Buy"
	})[0];
	const sellTopic = encodeEventTopics({
		abi: [SELL],
		eventName: "Sell"
	})[0];
	const [buys, sells] = await Promise.all([getLogs(chain, row.curve_address, [buyTopic]), getLogs(chain, row.curve_address, [sellTopic])]);
	const sql = await getSql();
	const existing = await sql`select lower(tx_hash) as h from trades where token_id = ${row.id} and tx_hash is not null`;
	const seen = new Set(existing.map((item) => item.h));
	const times = /* @__PURE__ */ new Map();
	async function at(block) {
		const known = times.get(block);
		if (known) return known;
		let iso = (/* @__PURE__ */ new Date()).toISOString();
		try {
			const result = await chainRpc(chain, "eth_getBlockByNumber", [block, false]);
			const stamp = result && typeof result === "object" ? Number(result.timestamp) : 0;
			if (Number.isFinite(stamp) && stamp > 0) iso = (/* @__PURE__ */ new Date(stamp * 1e3)).toISOString();
		} catch {}
		times.set(block, iso);
		return iso;
	}
	const logs = [...buys.map((log) => ({
		log,
		side: "buy",
		abi: BUY
	})), ...sells.map((log) => ({
		log,
		side: "sell",
		abi: SELL
	}))];
	for (const item of logs) {
		const hash = item.log.transactionHash;
		if (!hash || seen.has(hash)) continue;
		let decoded;
		try {
			decoded = decodeEventLog({
				abi: [item.abi],
				data: item.log.data,
				topics: item.log.topics
			});
		} catch {
			continue;
		}
		const args = decoded.args;
		const wallet = String(args.buyer || args.seller || "").toLowerCase();
		if (!isHexAddress(wallet)) continue;
		const base = fromWei(item.side === "buy" ? args.baseIn ?? 0n : args.baseOut ?? 0n, quote.decimals);
		const tokens = fromWei(item.side === "buy" ? args.tokensOut ?? 0n : args.tokensIn ?? 0n, 18);
		if (!(tokens > 0)) continue;
		const when = await at(item.log.blockNumber || "0x0");
		await sql`
      insert into trades (token_id, wallet, side, base_amount, token_amount, price, tx_hash, created_at)
      values (${row.id}, ${wallet}, ${item.side}, ${base}, ${tokens}, ${base / tokens}, ${hash}, ${when})
    `;
		seen.add(hash);
	}
	const nets = await sql`
    select lower(wallet) as wallet,
           sum(case when side = 'buy' then token_amount else -token_amount end)::float as amount
    from trades
    where token_id = ${row.id}
    group by lower(wallet)
  `;
	await sql`delete from holdings where token_id = ${row.id}`;
	let holders = 0;
	for (const net of nets) {
		if (!(net.amount > 0)) continue;
		holders += 1;
		await sql`
      insert into holdings (wallet, token_id, amount)
      values (${net.wallet}, ${row.id}, ${net.amount})
    `;
	}
	await sql`update tokens set holders = ${holders} where id = ${row.id}`;
}
async function syncListedSwaps(row) {
	if (row.source !== "listed" || !isHexAddress(row.contract_address)) return;
	const dex = parseDexPool(row.dex_pool);
	if (!dex) return;
	const live = await readRecentSwaps(dex, row.contract_address);
	if (!live.length) return;
	await rememberTrades(await getSql(), row.id, live);
}
async function loadTokenRows() {
	if (boardMemo && Date.now() - boardMemo.at < PUBLIC_MS) return boardMemo.rows;
	if (boardFlight) return boardFlight;
	boardFlight = loadTokenRowsNow().then((rows) => {
		boardMemo = {
			at: Date.now(),
			rows
		};
		return rows;
	}).finally(() => {
		boardFlight = null;
	});
	return boardFlight;
}
async function loadTokenRowsNow() {
	import("@/lib/server/onchain-sync").then(({ syncFactoryLaunches }) => syncFactoryLaunches()).catch(() => void 0);
	const rows = await (await getSql())`select * from tokens order by created_at desc`;
	const live = await Promise.all(rows.map((row) => overlayOnchain(row)));
	if (Date.now() - lastTradeSync > 6e4) {
		lastTradeSync = Date.now();
		Promise.allSettled(live.map((row) => Promise.all([syncCurveTrades(row).catch(() => void 0), syncListedSwaps(row).catch(() => void 0)])));
	}
	return live;
}
function launchedFromReceipt(logs) {
	for (const log of logs) try {
		const decoded = decodeEventLog({
			abi: [LAUNCHED],
			data: log.data,
			topics: log.topics
		});
		if (decoded.eventName === "TokenLaunched") {
			const args = decoded.args;
			return {
				token: args.token.toLowerCase(),
				curve: args.curve.toLowerCase(),
				creator: String(args.creator || "").toLowerCase()
			};
		}
	} catch {}
	return null;
}
function tradeFromReceipt(logs, side, quoteDecimals) {
	const item = side === "buy" ? BUY : SELL;
	for (const log of logs) try {
		const decoded = decodeEventLog({
			abi: [item],
			data: log.data,
			topics: log.topics
		});
		if (decoded.eventName === "Buy") {
			const args = decoded.args;
			return {
				base: fromWei(args.baseIn, quoteDecimals),
				tokens: fromWei(args.tokensOut, 18),
				fee: fromWei(args.fee, quoteDecimals)
			};
		}
		if (decoded.eventName === "Sell") {
			const args = decoded.args;
			return {
				base: fromWei(args.baseOut, quoteDecimals),
				tokens: fromWei(args.tokensIn, 18),
				fee: fromWei(args.fee, quoteDecimals)
			};
		}
	} catch {}
	return null;
}
export const publicConfig = createServerFn({ method: "GET" }).handler(async () => {
	const published = publishedConfig();
	try {
		const desk = await loadDeskConfig();
		const out = { ...published };
		for (const key of PUBLIC_CONFIG_KEYS) if (desk[key]) out[key] = desk[key];
		for (const key of CONTRACT_CONFIG_KEYS) if (desk[key]) out[key] = desk[key];
		return out;
	} catch {
		return published;
	}
});
export const feeQuote = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const ethUsd = await fetchEthUsd();
	const live = await liveProtocolConfig();
	const launchUsd = parseFeeUsd(live.launch_fee_usd, LAUNCH_FEE_USD);
	const listUsd = parseFeeUsd(live.listing_fee_usd, 19);
	const factory = live[chain === "arc" ? "factory_arc" : "factory_robinhood"];
	let factoryMin = 0n;
	let legacyFactory = false;
	if (isHexAddress(factory)) {
		const onchainFee = await readFactoryLaunchFee(chain, factory);
		if (onchainFee == null) {
			factoryMin = FACTORY_MIN_WEI;
			legacyFactory = true;
		} else factoryMin = onchainFee;
	}
	const launchWei = launchValueWei(launchUsd, ethUsd, chain, factoryMin);
	const listWei = listValueWei(listUsd, ethUsd, chain);
	const decimals = CHAINS[chain].decimals;
	return {
		chain,
		ethUsd,
		launchUsd,
		listUsd,
		launchWei: launchWei.toString(),
		listWei: listWei.toString(),
		launchNative: weiToNative(launchWei, decimals),
		listNative: weiToNative(listWei, decimals),
		nativeSymbol: CHAINS[chain].gas,
		legacyFactory
	};
});
export const prepareWalletTx = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const from = String(data.from ?? "").toLowerCase();
	const to = String(data.to ?? "").toLowerCase();
	if (!isHexAddress(from) || !isHexAddress(to)) return {
		ok: false,
		error: "Connect a wallet first."
	};
	let value = 0n;
	try {
		value = BigInt(data.value ?? "0");
	} catch {
		return {
			ok: false,
			error: "Invalid payment amount."
		};
	}
	if (value < 0n) return {
		ok: false,
		error: "Invalid payment amount."
	};
	const dataHex = typeof data.data === "string" && data.data.startsWith("0x") ? data.data : "0x";
	let quote;
	try {
		quote = await quoteTxGas(chain, {
			from,
			to,
			data: dataHex,
			value
		});
	} catch {
		return {
			ok: false,
			error: "Could not quote network gas. Try again in a moment."
		};
	}
	if (quote.balance < quote.total) {
		const dec = CHAINS[chain].decimals;
		const sym = CHAINS[chain].gas;
		return {
			ok: false,
			error: `Need ${weiToNative(quote.total, dec).toFixed(6)} ${sym} (protocol + network). This wallet has ${weiToNative(quote.balance, dec).toFixed(6)}.`
		};
	}
	return {
		ok: true,
		gas: quote.gas.toString(),
		maxFeePerGas: quote.maxFeePerGas.toString(),
		maxPriorityFeePerGas: quote.maxPriorityFeePerGas.toString(),
		gasPrice: quote.gasPrice.toString(),
		value: quote.value.toString()
	};
});
export const creatorFeeSnapshot = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const curve = String(data.curve ?? "").toLowerCase();
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const sql = await getSql();
	let token = null;
	if (data.tokenId) token = await findTokenRow(sql, data.tokenId);
	if (!token && isHexAddress(curve)) token = (await sql`select * from tokens where lower(coalesce(curve_address, '')) = ${curve} limit 1`)[0] ?? null;
	const creator = (token?.creator_wallet ?? "").toLowerCase();
	const symbol = token?.symbol ?? "";
	const feeBps = asNumber(token?.fee_bps, 200) || 200;
	const storedShare = clampShareOfFeeBps(token?.creator_tax_bps);
	let sweeps = 0;
	let volume = 0;
	if (token?.id) {
		const stats = await sql`select count(*)::int as n, coalesce(sum(base_amount), 0) as vol from trades where token_id = ${token.id}`;
		sweeps = Number(stats[0]?.n ?? 0);
		volume = asNumber(stats[0]?.vol);
	}
	const zero = "0x0000000000000000000000000000000000000000";
	const usable = (value) => isHexAddress(value) && value.toLowerCase() !== zero;
	if (curve === (publishedConfig().znzf_curve_robinhood || "").toLowerCase()) return {
		ok: true,
		claimable: false,
		accrued: 0,
		sweeps,
		earned: 0,
		creator: "",
		symbol: symbol || "ZNZF",
		holderSharing: false,
		protocol: true
	};
	let payee = creator;
	if (!usable(payee) && isHexAddress(curve)) {
		const onchain = await readCurveCreator(chain, curve);
		if (usable(onchain)) payee = onchain.toLowerCase();
	}
	if (!usable(payee) && token?.id === "znzf") payee = publishedConfig().deployer || "";
	const empty = {
		ok: true,
		claimable: false,
		accrued: 0,
		sweeps,
		earned: 0,
		creator: payee,
		symbol,
		holderSharing: false
	};
	if (!isHexAddress(curve)) return {
		...empty,
		ok: false
	};
	const [accrued, sharing, liveTax] = await Promise.all([
		readCreatorAccrued(chain, curve),
		readHolderSharing(chain, curve),
		readCreatorTaxBps(chain, curve)
	]);
	const shareBps = clampShareOfFeeBps(liveTax) ?? storedShare ?? 0;
	const earned = volume * (feeBps / 1e4) * (shareBps / 1e4);
	if (accrued == null) return {
		...empty,
		earned,
		holderSharing: sharing === true
	};
	return {
		ok: true,
		claimable: true,
		accrued: fromWei(accrued, CHAINS[chain].decimals),
		sweeps,
		earned: Math.max(earned, fromWei(accrued, CHAINS[chain].decimals)),
		creator: payee,
		symbol,
		holderSharing: sharing === true
	};
});
export const holderFeeSnapshot = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const curve = String(data.curve ?? "").toLowerCase();
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const wallet = String(data.wallet ?? "").toLowerCase();
	const empty = {
		ok: true,
		sharing: false,
		accrued: 0
	};
	if (!isHexAddress(curve) || !isHexAddress(wallet)) return {
		...empty,
		ok: false
	};
	if (await readHolderSharing(chain, curve) !== true) return empty;
	const accrued = await readPendingHolderFees(chain, curve, wallet);
	if (accrued == null) return {
		ok: true,
		sharing: true,
		accrued: 0
	};
	return {
		ok: true,
		sharing: true,
		accrued: fromWei(accrued, CHAINS[chain].decimals)
	};
});
export const protocolStats = createServerFn({ method: "GET" }).handler(async () => {
	if (statsMemo && Date.now() - statsMemo.at < PUBLIC_MS) return statsMemo.value;
	if (statsFlight) return statsFlight;
	statsFlight = computeProtocolStats().then((value) => {
		statsMemo = {
			at: Date.now(),
			value
		};
		return value;
	}).finally(() => {
		statsFlight = null;
	});
	return statsFlight;
});
async function computeProtocolStats() {
	try {
		await loadTokenRows();
	} catch {}
	const sql = await getSql();
	const usdMap = await fetchQuoteUsdMap();
	const ethUsd = usdMap.eth ?? null;
	const tokens = await sql`select count(*)::int as n from tokens`;
	const listed = await sql`select count(*)::int as n from tokens where source = 'listed'`;
	const volumeRows = await sql`
    select coalesce(t.quote_asset, 'eth') as quote, t.chain, coalesce(sum(tr.base_amount), 0) as v
    from trades tr
    join tokens t on t.id = tr.token_id
    where tr.created_at > now() - interval '24 hours'
    group by t.quote_asset, t.chain
  `;
	const tvlRows = await sql`
    select coalesce(quote_asset, 'eth') as quote, chain, coalesce(sum(real_base), 0) as v
    from tokens
    group by quote_asset, chain
  `;
	let volumeNative = 0;
	let volumeUsd = 0;
	let volumeHasUsd = false;
	for (const row of volumeRows) {
		const quote = quoteOf(row.quote, row.chain);
		const v = asNumber(row.v);
		const unit = quoteUsdPrice(quote, ethUsd, usdMap);
		if (quote.key === "eth" || quote.native && quote.symbol === "ETH") volumeNative += v;
		if (unit != null) {
			volumeUsd += v * unit;
			volumeHasUsd = true;
		}
	}
	const dexPools = await sql`select dex_pool from tokens where source = 'listed' and coalesce(dex_pool, '') <> ''`;
	for (const row of dexPools) {
		const dex = parseDexPool(row.dex_pool);
		if (dex && dex.volumeUsd > 0) {
			volumeUsd += dex.volumeUsd;
			volumeHasUsd = true;
		}
	}
	let tvlNative = 0;
	let tvlUsd = 0;
	let tvlHasUsd = false;
	for (const row of tvlRows) {
		const quote = quoteOf(row.quote, row.chain);
		const v = asNumber(row.v);
		const unit = quoteUsdPrice(quote, ethUsd, usdMap);
		if (quote.key === "eth" || quote.native && quote.symbol === "ETH") tvlNative += v;
		if (unit != null) {
			tvlUsd += v * unit;
			tvlHasUsd = true;
		}
	}
	const holders = await sql`select coalesce(sum(holders), 0)::int as n from tokens`;
	const burned = await sql`select coalesce(sum(amount), 0) as v from znzf_events where kind = 'burn'`;
	const fees = await sql`
    select coalesce(sum(amount), 0) as v from znzf_events where kind in ('fee_eth', 'listing_fee')
  `;
	const weekFees = await sql`
    select coalesce(sum(amount), 0) as v from znzf_events
    where kind in ('fee_eth', 'listing_fee') and created_at > now() - interval '7 days'
  `;
	const staked = await sql`select coalesce(sum(amount), 0) as v from wallet_stakes`;
	const znzfRows = await sql`select * from tokens where id = ${ZNZF_ID} limit 1`;
	const znzf = znzfRows[0] ? enrichToken(await overlayOnchain(znzfRows[0]), {
		ethUsd,
		usdMap
	}) : null;
	const totalStaked = asNumber(staked[0]?.v);
	const stakeApy = realStakeApy(asNumber(weekFees[0]?.v), totalStaked, ethUsd, znzf?.priceUsd ?? null);
	const supply = asNumber(znzf?.total_supply);
	const chainBurned = supply > 0 && supply <= 1e9 ? TOTAL_SUPPLY - supply : 0;
	return {
		tokens: tokens[0]?.n ?? 0,
		listed: listed[0]?.n ?? 0,
		volumeNative,
		volumeUsd: volumeHasUsd ? volumeUsd : null,
		holders: holders[0]?.n ?? 0,
		znzfPriceUsd: znzf?.priceUsd ?? null,
		znzfPriceNative: znzf?.price ?? null,
		znzfHolders: znzf?.holders ?? 0,
		burned: chainBurned || asNumber(burned[0]?.v),
		tvlNative,
		tvlUsd: tvlHasUsd ? tvlUsd : null,
		ethUsd,
		feesAccrued: asNumber(fees[0]?.v),
		stakeApy,
		totalStaked
	};
}
export const listTokens = createServerFn({ method: "GET" }).handler(async () => {
	const usdMap = await fetchQuoteUsdMap();
	return (await loadTokenRows()).map((r) => enrichToken(r, {
		ethUsd: usdMap.eth ?? null,
		usdMap
	}));
});
export const listTrades = createServerFn({ method: "GET" }).handler(async () => {
	return (await getSql())`
    select tr.*, t.symbol
    from trades tr
    join tokens t on t.id = tr.token_id
    order by tr.created_at desc
    limit 24
  `;
});
export const onchainHolders = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const address = String(data.address ?? "");
	if (!isHexAddress(address)) return {
		ok: false,
		holders: null,
		pending: false
	};
	const read = readTokenHolders(chain, address);
	if (read.holders != null) return {
		ok: true,
		holders: read.holders,
		pending: read.pending
	};
	const rows = await (await getSql())`select value from protocol_config where key = ${`holders:${chain}:${address.toLowerCase()}`} limit 1`;
	const stored = Number(rows[0]?.value);
	if (rows[0] && Number.isFinite(stored) && stored >= 0) return {
		ok: true,
		holders: stored,
		pending: read.pending
	};
	return {
		ok: true,
		holders: null,
		pending: true
	};
});
export const getToken = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const sql = await getSql();
	const raw = await findTokenRow(sql, data.id);
	if (!raw) return null;
	const row = await overlayOnchain(raw, true);
	const [shownTrades, holders, usdMap] = await Promise.all([
		sql`select * from trades where token_id = ${row.id} order by created_at asc limit 400`,
		sql`select wallet, amount from holdings where token_id = ${row.id} and amount > 0 order by amount desc limit 50`,
		fetchQuoteUsdMap(),
	]);
	const dex = parseDexPool(row.dex_pool);
	if ((row.source === "listed" || (row.graduated && row.id !== "znzf")) && dex && isHexAddress(row.contract_address)) {
		scheduleTradeRefresh(row, dex);
	}
	return {
		token: enrichToken(row, {
			ethUsd: usdMap.eth ?? null,
			usdMap
		}),
		trades: shownTrades,
		holders,
		tradesError: false
	};
});
export const quoteTrade = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const amount = Number(data.amount);
	if (!Number.isFinite(amount) || amount <= 0) return {
		ok: false,
		error: "Enter an amount greater than zero."
	};
	const raw = await findTokenRow(await getSql(), data.id);
	if (!raw) return {
		ok: false,
		error: "This pool is empty."
	};
	const usdMap = await fetchQuoteUsdMap();
	const token = enrichToken(await overlayOnchain(raw), {
		ethUsd: usdMap.eth ?? null,
		usdMap
	});
	if (token.graduated || token.source === "listed") return {
		ok: false,
		error: "This token does not trade on a Zenze curve."
	};
	if (!isHexAddress(token.curve_address) && token.id !== "znzf") return {
		ok: false,
		error: "This pool has no on-chain curve yet."
	};
	const buyQ = quoteBuy(token.curve, amount);
	const sellQ = quoteSell(token.curve, amount);
	const tokensOut = data.side === "buy" ? buyQ.tokensOut : amount;
	const baseOut = data.side === "buy" ? amount : sellQ.baseOut;
	const fee = data.side === "buy" ? buyQ.fee : sellQ.fee;
	return {
		ok: true,
		side: data.side,
		amount,
		tokensOut,
		baseOut,
		fee,
		avgPrice: data.side === "buy" ? buyQ.avgPrice : amount > 0 ? sellQ.baseOut / amount : 0,
		price: token.price,
		priceUsd: token.priceUsd,
		quote: token.quote.symbol,
		progress: token.progress
	};
});
export const getWalletHoldings = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const wallet = data.wallet.trim().toLowerCase();
	if (!isHexAddress(wallet)) return [];
	return (await getSql())`
      select wallet, token_id, amount from holdings where wallet = ${wallet}
    `;
});
export const walletSeat = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const wallet = String(data.wallet ?? "").trim().toLowerCase();
	if (!isHexAddress(wallet)) return {
		since: null,
		trades: 0,
		paying: 0,
		...seatCopy(null)
	};
	const sql = await getSql();
	await absorbListedSeat(sql, wallet);
	const rows = await sql`
    select min(created_at) as since, count(*)::int as trades
    from trades where wallet = ${wallet}
  `;
	const paying = await sql`
    select count(*)::int as n
    from holdings h
    join tokens t on t.id = h.token_id
    where h.wallet = ${wallet} and h.amount > 0 and t.holder_sharing = true
  `;
	const since = rows[0]?.since ? new Date(rows[0].since).toISOString() : null;
	return {
		since,
		trades: Number(rows[0]?.trades ?? 0),
		paying: Number(paying[0]?.n ?? 0),
		...seatCopy(since)
	};
});
async function rememberTrades(sql, tokenId, rows) {
	for (const row of rows) {
		const wallet = row.wallet.toLowerCase();
		const hash = row.tx_hash.toLowerCase();
		if (!isHexAddress(wallet) || !/^0x[a-f0-9]{64}$/.test(hash)) continue;
		if ((await sql`select id from trades where lower(coalesce(tx_hash, '')) = ${hash} limit 1`).length) continue;
		try {
			await sql`
      insert into trades (token_id, wallet, side, base_amount, token_amount, price, tx_hash, created_at)
      values (${tokenId}, ${wallet}, ${row.side}, ${row.base_amount}, ${row.token_amount}, ${row.price}, ${hash}, ${row.created_at})
    `;
		} catch {}
	}
}
async function absorbListedSeat(sql, wallet) {
	const listed = await sql`
    select id, contract_address, dex_pool from tokens
    where source = 'listed' and dex_pool is not null and contract_address is not null
    limit 8
  `;
	for (const token of listed) {
		const dex = parseDexPool(token.dex_pool);
		if (!dex || !isHexAddress(token.contract_address)) continue;
		let balance = 0n;
		try {
			balance = await readTokenBalance("robinhood", token.contract_address, wallet);
		} catch {
			continue;
		}
		if (balance <= 0n) continue;
		try {
			const live = await readRecentSwaps(dex, token.contract_address);
			await rememberTrades(sql, token.id, live);
			if (live.some((row) => row.wallet.toLowerCase() === wallet)) continue;
			const older = await readEarlierWalletSwap(dex, token.contract_address, wallet);
			if (older) await rememberTrades(sql, token.id, [older]);
		} catch {}
	}
}
export const getWalletStake = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const wallet = data.wallet.trim().toLowerCase();
	if (!isHexAddress(wallet)) return 0;
	const rows = await (await getSql())`select amount from wallet_stakes where wallet = ${wallet}`;
	return asNumber(rows[0]?.amount);
});
export const getTradeBalances = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const wallet = data.wallet.trim().toLowerCase();
	if (!isHexAddress(wallet)) return {
		native: 0,
		quote: 0,
		token: 0
	};
	const raw = await findTokenRow(await getSql(), data.id);
	if (!raw) return {
		native: 0,
		quote: 0,
		token: 0
	};
	const quote = quoteOf(raw.quote_asset, raw.chain);
	let native = 0;
	let quoteBal = 0;
	let tokenBal = 0;
	try {
		native = fromWei(await readNativeBalance(raw.chain, wallet), CHAINS[raw.chain].decimals);
	} catch {
		native = 0;
	}
	if (quote.native) quoteBal = native;
	else {
		const addr = quote.address[raw.chain];
		if (isHexAddress(addr)) try {
			quoteBal = fromWei(await readTokenBalance(raw.chain, addr, wallet), quote.decimals);
		} catch {
			quoteBal = 0;
		}
	}
	if (isHexAddress(raw.contract_address)) try {
		const dex = raw.source === "listed" ? parseDexPool(raw.dex_pool) : null;
		tokenBal = fromWei(await readTokenBalance(raw.chain, raw.contract_address, wallet), dex?.decimals || 18);
	} catch {
		tokenBal = 0;
	}
	return {
		native,
		quote: quoteBal,
		token: tokenBal
	};
});
export const getSwapBalances = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const wallet = String(data.wallet || "").trim().toLowerCase();
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const assets = Array.isArray(data.assets) ? data.assets.slice(0, 24) : [];
	const out = {};
	if (!isHexAddress(wallet)) {
		for (const a of assets) out[String(a.id || "")] = 0;
		return out;
	}
	await Promise.all(assets.map(async (a) => {
		const id = String(a.id || "");
		if (!id) return;
		try {
			if (a.native) out[id] = fromWei(await readNativeBalance(chain, wallet), CHAINS[chain].decimals);
			else if (isHexAddress(a.address)) out[id] = fromWei(await readTokenBalance(chain, a.address, wallet), Number(a.decimals) || 18);
			else out[id] = 0;
		} catch {
			out[id] = 0;
		}
	}));
	return out;
});
export const stakingPage = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const sql = await getSql();
	const ethUsd = await fetchEthUsd();
	const staked = await sql`select coalesce(sum(amount), 0) as v from wallet_stakes`;
	const weekFees = await sql`
      select coalesce(sum(amount), 0) as v from znzf_events
      where kind in ('fee_eth', 'listing_fee') and created_at > now() - interval '7 days'
    `;
	const allFees = await sql`
      select coalesce(sum(amount), 0) as v from znzf_events where kind in ('fee_eth', 'listing_fee')
    `;
	const totalStakedLedger = asNumber(staked[0]?.v);
	const week = asNumber(weekFees[0]?.v);
	const znzfRows = await sql`select * from tokens where id = ${ZNZF_ID} limit 1`;
	const znzfTok = znzfRows[0] ? enrichToken(znzfRows[0], { ethUsd }) : null;
	const wallet = (data.wallet ?? "").trim().toLowerCase();
	const stakeContract = (await liveProtocolConfig()).stake_robinhood || publishedConfig().stake_robinhood || "";
	let totalStaked = totalStakedLedger;
	let yourStake = 0;
	let onchain = 0;
	let onchainOk = false;
	if (isHexAddress(stakeContract)) try {
		const abi = parseAbi(["function staked(address) view returns (uint256)", "function totalStaked() view returns (uint256)"]);
		const totalRaw = await chainRpc("robinhood", "eth_call", [{
			to: stakeContract,
			data: encodeFunctionData({
				abi,
				functionName: "totalStaked"
			})
		}, "latest"]);
		totalStaked = fromWei(decodeFunctionResult({
			abi,
			functionName: "totalStaked",
			data: totalRaw
		}), 18);
		if (isHexAddress(wallet)) {
			const mineRaw = await chainRpc("robinhood", "eth_call", [{
				to: stakeContract,
				data: encodeFunctionData({
					abi,
					functionName: "staked",
					args: [wallet]
				})
			}, "latest"]);
			yourStake = fromWei(decodeFunctionResult({
				abi,
				functionName: "staked",
				data: mineRaw
			}), 18);
		}
	} catch {
		if (!(totalStaked > 0)) totalStaked = totalStakedLedger;
	}
	let rewardLeft = 0;
	let rewardPerDay = 0;
	let rewardEnds = "";
	if (isHexAddress(stakeContract)) try {
		const rewardAbi = parseAbi(["function rewardRate() view returns (uint256)", "function periodFinish() view returns (uint256)"]);
		const [rateRaw, finishRaw] = await Promise.all([
			chainRpc("robinhood", "eth_call", [{ to: stakeContract, data: encodeFunctionData({ abi: rewardAbi, functionName: "rewardRate" }) }, "latest"]),
			chainRpc("robinhood", "eth_call", [{ to: stakeContract, data: encodeFunctionData({ abi: rewardAbi, functionName: "periodFinish" }) }, "latest"]),
		]);
		const rate = decodeFunctionResult({ abi: rewardAbi, functionName: "rewardRate", data: rateRaw });
		const finish = decodeFunctionResult({ abi: rewardAbi, functionName: "periodFinish", data: finishRaw });
		const now = BigInt(Math.floor(Date.now() / 1000));
		const left = finish > now ? (finish - now) * rate : 0n;
		rewardLeft = fromWei(left, 18);
		rewardPerDay = fromWei(rate * 86400n, 18);
		rewardEnds = new Date(Number(finish) * 1000).toISOString();
	} catch {
		rewardLeft = 0;
	}
	else if (isHexAddress(wallet)) {
		const mine = await sql`select amount from wallet_stakes where wallet = ${wallet}`;
		yourStake = asNumber(mine[0]?.amount);
	}
	const stakeApy = realStakeApy(week, totalStaked, ethUsd, znzfTok?.priceUsd ?? null);
	if (isHexAddress(wallet)) {
		const token = (await liveProtocolConfig()).znzf_robinhood;
		if (isHexAddress(token)) try {
			onchain = fromWei(await readTokenBalance("robinhood", token, wallet), 18);
			onchainOk = true;
		} catch {
			onchain = 0;
		}
	}
	const liveWeight = isHexAddress(stakeContract) ? yourStake : Math.min(yourStake, onchainOk ? onchain : yourStake);
	let earned = 0;
	if (isHexAddress(stakeContract) && isHexAddress(wallet)) try {
		const abi = parseAbi(["function earned(address) view returns (uint256)"]);
		const raw = await chainRpc("robinhood", "eth_call", [{
			to: stakeContract,
			data: encodeFunctionData({
				abi,
				functionName: "earned",
				args: [wallet]
			})
		}, "latest"]);
		earned = fromWei(decodeFunctionResult({
			abi,
			functionName: "earned",
			data: raw
		}), 18);
	} catch {
		earned = 0;
	}
	const pendingShare = totalStaked > 0 ? liveWeight / totalStaked * week * (STAKER_SHARE_BPS / 1e4) : 0;
	return {
		stakeApy,
		totalStaked,
		weekFees: week,
		feesAccrued: asNumber(allFees[0]?.v),
		stakerShareBps: STAKER_SHARE_BPS,
		yourStake,
		earned,
		rewardLeft,
		rewardPerDay,
		rewardEnds,
		onchainZnzf: onchain,
		liveWeight,
		pendingShare,
		ethUsd,
		znzfPriceUsd: znzfTok?.priceUsd ?? null,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
});
export const governancePage = createServerFn({ method: "GET" }).handler(async () => {
	const sql = await getSql();
	let proposals = [];
	try {
		proposals = (await sql`
      select p.id, p.title, p.body, p.status, p.created_at, p.proposer, coalesce(p.source, 'wallet') as source,
             coalesce((select sum(weight) from proposal_votes v where v.proposal_id = p.id and v.support), 0) as yes,
             coalesce((select sum(weight) from proposal_votes v where v.proposal_id = p.id and not v.support), 0) as no
      from proposals p
      order by p.created_at desc
      limit 40
    `).map((p) => ({
			...p,
			source: p.source ?? "wallet",
			yes: asNumber(p.yes),
			no: asNumber(p.no)
		}));
	} catch {
		proposals = [];
	}
	return { proposals };
});
export const znzfPage = createServerFn({ method: "GET" }).handler(async () => {
	const sql = await getSql();
	const ethUsd = await fetchEthUsd();
	const rows = await sql`select * from tokens where id = ${ZNZF_ID} limit 1`;
	if (rows[0] && (rows[0].image_url.startsWith("/brand/") || !rows[0].image_url.includes("/ipfs/"))) {
		const pinned = await pinBrandFile("brand/capy-mark.png", "znzf-capy-mark.png", "image/png");
		if (pinned) {
			await sql`update tokens set image_url = ${pinned} where id = ${ZNZF_ID} and (image_url like '/brand/%' or image_url not like '%/ipfs/%')`;
			rows[0] = {
				...rows[0],
				image_url: pinned
			};
		}
	}
	const tokenRow = rows[0] ? await overlayOnchain(rows[0]) : null;
	const events = await sql`
    select id, kind, amount, note, created_at
    from znzf_events
    where kind in ('buyback', 'burn', 'creator_bonus') and amount > 0
    order by created_at desc
    limit 24
  `;
	let burned = 0;
	try {
		const burner = (await liveProtocolConfig()).buyback_robinhood || publishedConfig().buyback_robinhood;
		if (isHexAddress(burner)) {
			const abi = parseAbi(["function totalBurned() view returns (uint256)"]);
			const raw = await chainRpc("robinhood", "eth_call", [{
				to: burner,
				data: encodeFunctionData({
					abi,
					functionName: "totalBurned"
				})
			}, "latest"]);
			burned = fromWei(decodeFunctionResult({
				abi,
				functionName: "totalBurned",
				data: raw
			}), 18);
		}
	} catch {
		burned = 0;
	}
	const feed = events.filter((event) => Number(event.amount) >= 0.01).map((event) => {
		const note = String(event.note ?? "").trim();
		return { ...event, note: !note || note.toLowerCase() === "znzf" ? "" : note };
	});
	let proposals = [];
	try {
		proposals = (await sql`
    select p.id, p.title, p.body, p.status, p.created_at,
           coalesce((select sum(weight) from proposal_votes v where v.proposal_id = p.id and v.support), 0) as yes,
           coalesce((select sum(weight) from proposal_votes v where v.proposal_id = p.id and not v.support), 0) as no
    from proposals p
    order by p.created_at desc
    limit 12
  `).map((p) => ({
			...p,
			yes: asNumber(p.yes),
			no: asNumber(p.no)
		}));
	} catch {
		proposals = [];
	}
	const staked = await sql`select coalesce(sum(amount), 0) as v from wallet_stakes`;
	const weekFees = await sql`
    select coalesce(sum(amount), 0) as v from znzf_events
    where kind in ('fee_eth', 'listing_fee') and created_at > now() - interval '7 days'
  `;
	let totalStaked = asNumber(staked[0]?.v);
	const stakeContract = (await liveProtocolConfig()).stake_robinhood || publishedConfig().stake_robinhood || "";
	if (isHexAddress(stakeContract)) try {
		const stakeAbi = parseAbi(["function totalStaked() view returns (uint256)"]);
		const stakeRaw = await chainRpc("robinhood", "eth_call", [{ to: stakeContract, data: encodeFunctionData({ abi: stakeAbi, functionName: "totalStaked" }) }, "latest"]);
		const chainStaked = fromWei(decodeFunctionResult({ abi: stakeAbi, functionName: "totalStaked", data: stakeRaw }), 18);
		if (chainStaked > 0) totalStaked = chainStaked;
	} catch {}
	let arcSupply = 0;
	const arcToken = (await liveProtocolConfig()).znzf_arc || publishedConfig().znzf_arc || "";
	if (isHexAddress(arcToken)) try {
		const read = await readErc20("arc", arcToken);
		arcSupply = fromWei(BigInt(read.totalSupply), read.decimals || 18);
	} catch {}
	const stakeApy = realStakeApy(asNumber(weekFees[0]?.v), totalStaked, ethUsd, tokenRow ? enrichToken(tokenRow, { ethUsd }).priceUsd : null);
	return {
		token: tokenRow ? enrichToken(tokenRow, { ethUsd }) : null,
		events: feed,
		proposals,
		totalStaked,
		stakeApy,
		burned,
		arcSupply
	};
});
var analyticsMemo = null;
var analyticsFlight = null;
export const analyticsPage = createServerFn({ method: "GET" }).handler(async () => {
	if (analyticsMemo && Date.now() - analyticsMemo.at < PUBLIC_MS) return analyticsMemo.value;
	if (analyticsFlight) return analyticsFlight;
	analyticsFlight = computeAnalytics().then((value) => {
		analyticsMemo = {
			at: Date.now(),
			value
		};
		return value;
	}).finally(() => {
		analyticsFlight = null;
	});
	return analyticsFlight;
});
async function computeAnalytics() {
	const listed = (await loadTokenRows()).filter((row) => row.source === "listed");
	await Promise.allSettled(listed.map((row) => syncListedSwaps(row)));
	const sql = await getSql();
	const [stats, usdMap, cfg] = await Promise.all([
		protocolStats(),
		fetchQuoteUsdMap(),
		liveProtocolConfig()
	]);
	const recent = await sql`
    select id, name, symbol, chain, contract_address, created_at, creator_wallet
    from tokens
    where id <> ${ZNZF_ID}
    order by created_at desc
    limit 20
  `;
	const launchRows = await sql`
    select created_at from tokens where id <> ${ZNZF_ID}
  `;
	const tradeRows = await sql`
    select tr.created_at, tr.base_amount, coalesce(t.quote_asset, 'eth') as quote, t.chain
    from trades tr
    join tokens t on t.id = tr.token_id
  `;
	const devRows = await sql`
    select creator_wallet, created_at from tokens where id <> ${ZNZF_ID}
  `;
	const now = Date.now();
	const day = 864e5;
	const days = Array.from({ length: 14 }, (_, i) => {
		return (/* @__PURE__ */ new Date(now - (13 - i) * day)).toISOString().slice(0, 10);
	});
	const volumeByDay = new Map(days.map((d) => [d, 0]));
	const launchByDay = new Map(days.map((d) => [d, 0]));
	let volume24h = 0;
	let volumePrior = 0;
	let volumeAll = 0;
	let volumeKnown = false;
	for (const row of tradeRows) {
		const at = new Date(row.created_at).getTime();
		const unit = quoteUsdPrice(quoteOf(row.quote, row.chain), usdMap.eth ?? null, usdMap);
		const usd = unit == null ? null : asNumber(row.base_amount) * unit;
		if (usd == null) continue;
		volumeKnown = true;
		volumeAll += usd;
		const key = new Date(at).toISOString().slice(0, 10);
		if (volumeByDay.has(key)) volumeByDay.set(key, (volumeByDay.get(key) ?? 0) + usd);
		if (at > now - day) volume24h += usd;
		else if (at > now - 2 * day) volumePrior += usd;
	}
	let launches24h = 0;
	let launchesPrior = 0;
	let launchesAll = 0;
	for (const row of launchRows) {
		launchesAll += 1;
		const at = new Date(row.created_at).getTime();
		const key = new Date(at).toISOString().slice(0, 10);
		if (launchByDay.has(key)) launchByDay.set(key, (launchByDay.get(key) ?? 0) + 1);
		if (at > now - day) launches24h += 1;
		else if (at > now - 2 * day) launchesPrior += 1;
	}
	const devsAll = new Set(devRows.map((r) => String(r.creator_wallet || "").toLowerCase()).filter(Boolean)).size;
	const devs24h = new Set(devRows.filter((r) => new Date(r.created_at).getTime() > now - day).map((r) => String(r.creator_wallet || "").toLowerCase()).filter(Boolean)).size;
	let arcSupply = null;
	let burned = 0;
	let vaultEth = 0;
	let curveEth = 0;
	const ethUsd = usdMap.eth ?? null;
	const inventoryAbi = parseAbi([
		"function assetCount() view returns (uint256)",
		"function assets(uint256) view returns (address)",
		"function balanceOf(address) view returns (uint256)",
		"function creatorAccrued() view returns (uint256)",
		"function quote() view returns (address)",
		"function totalBurned() view returns (uint256)"
	]);
	const zero = "0x0000000000000000000000000000000000000000";
	const markAsset = (address, amount) => {
		const addr = String(address).toLowerCase();
		if (addr === zero) return {
			address: addr,
			symbol: "ETH",
			amount,
			usd: ethUsd == null ? null : amount * ethUsd
		};
		const pair = PAIR_ASSETS.find((p) => Object.values(p.address).some((a) => String(a).toLowerCase() === addr));
		if (!pair) return {
			address: addr,
			symbol: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
			amount,
			usd: null
		};
		const unit = pair.native ? ethUsd : usdMap[pair.key] ?? pair.refUsd ?? (pair.kind === "stable" ? 1 : null);
		return {
			address: addr,
			symbol: pair.symbol,
			amount,
			usd: unit == null ? null : amount * unit
		};
	};
	const callView = async (to, data) => {
		const raw = await chainRpc("robinhood", "eth_call", [{
			to,
			data
		}, "latest"]);
		if (typeof raw !== "string" || !raw.startsWith("0x")) throw new Error("empty view");
		return raw;
	};
	const readInventory = async (holder) => {
		if (!isHexAddress(holder)) return unavailableBucket();
		try {
			const countRaw = await callView(holder, encodeFunctionData({
				abi: inventoryAbi,
				functionName: "assetCount"
			}));
			const count = Number(decodeFunctionResult({
				abi: inventoryAbi,
				functionName: "assetCount",
				data: countRaw
			}));
			const rows = [];
			for (let i = 0; i < Math.min(count, 80); i++) {
				const assetRaw = await callView(holder, encodeFunctionData({
					abi: inventoryAbi,
					functionName: "assets",
					args: [BigInt(i)]
				}));
				const asset = String(decodeFunctionResult({
					abi: inventoryAbi,
					functionName: "assets",
					data: assetRaw
				})).toLowerCase();
				let amount = 0;
				if (asset === zero) amount = fromWei(await readNativeBalance("robinhood", holder), 18);
				else {
					const pair = PAIR_ASSETS.find((p) => Object.values(p.address).some((a) => String(a).toLowerCase() === asset));
					const balRaw = await callView(asset, encodeFunctionData({
						abi: inventoryAbi,
						functionName: "balanceOf",
						args: [holder]
					}));
					amount = fromWei(decodeFunctionResult({
						abi: inventoryAbi,
						functionName: "balanceOf",
						data: balRaw
					}), pair?.decimals ?? 18);
				}
				rows.push(markAsset(asset, amount));
			}
			return summarizeHeld(rows);
		} catch {
			return unavailableBucket();
		}
	};
	const [splitter, intake] = await Promise.all([readInventory(cfg.splitter_robinhood), readInventory(cfg.intake_robinhood)]);
	let escrow = unavailableBucket();
	try {
		const curves = /* @__PURE__ */ new Set();
		if (isHexAddress(cfg.znzf_curve_robinhood)) curves.add(cfg.znzf_curve_robinhood.toLowerCase());
		const listed = await sql`select curve_address from tokens where curve_address ~ '^0x[a-fA-F0-9]{40}$'`;
		for (const row of listed) curves.add(String(row.curve_address).toLowerCase());
		const totals = /* @__PURE__ */ new Map();
		let readable = false;
		for (const curve of curves) try {
			const [accRaw, quoteRaw] = await Promise.all([callView(curve, encodeFunctionData({
				abi: inventoryAbi,
				functionName: "creatorAccrued"
			})), callView(curve, encodeFunctionData({
				abi: inventoryAbi,
				functionName: "quote"
			}))]);
			readable = true;
			const accrued = decodeFunctionResult({
				abi: inventoryAbi,
				functionName: "creatorAccrued",
				data: accRaw
			});
			const quote = String(decodeFunctionResult({
				abi: inventoryAbi,
				functionName: "quote",
				data: quoteRaw
			})).toLowerCase();
			const pair = PAIR_ASSETS.find((p) => Object.values(p.address).some((a) => String(a).toLowerCase() === quote));
			const amount = fromWei(accrued, quote === zero ? 18 : pair?.decimals ?? 18);
			totals.set(quote, (totals.get(quote) ?? 0) + amount);
		} catch {}
		if (readable) escrow = summarizeHeld([...totals.entries()].map(([address, amount]) => markAsset(address, amount)));
	} catch {
		escrow = unavailableBucket();
	}
	try {
		if (isHexAddress(cfg.buyback_robinhood)) {
			const burnedRaw = await callView(cfg.buyback_robinhood, encodeFunctionData({
				abi: inventoryAbi,
				functionName: "totalBurned"
			})).catch(() => null);
			if (typeof burnedRaw === "string") burned = fromWei(decodeFunctionResult({
				abi: inventoryAbi,
				functionName: "totalBurned",
				data: burnedRaw
			}), 18);
		}
		if (isHexAddress(cfg.vault_robinhood)) vaultEth = fromWei(await readNativeBalance("robinhood", cfg.vault_robinhood), 18);
		if (isHexAddress(cfg.znzf_curve_robinhood)) {
			const curve = await readCurveState("robinhood", cfg.znzf_curve_robinhood).catch(() => null);
			if (curve) curveEth = fromWei(curve.realBase, 18);
		}
		if (isHexAddress(cfg.znzf_arc)) {
			const arcToken = await readErc20("arc", cfg.znzf_arc);
			arcSupply = fromWei(BigInt(arcToken.totalSupply), arcToken.decimals || 18);
		}
	} catch {}
	const fees = {
		splitter,
		escrow,
		intake,
		burned,
		vaultEth,
		vaultUsd: ethUsd == null ? null : vaultEth * ethUsd,
		arcSupply
	};
	const buyback = {
		ok: Boolean(splitter?.deployed),
		eth: splitter?.native ?? 0,
		usd: splitter?.usd ?? null,
		burned,
		curveEth,
		curveUsd: ethUsd == null ? null : curveEth * ethUsd,
		arcSupply
	};
	let dune = {
		ok: false,
		stockTickers: 0
	};
	try {
		if (await duneReady()) {
			const rows = await duneSql("select count(*) as n from evms.erc20_tokens where blockchain = 'robinhood' and lower(name) like '%robinhood token%'", 9e5);
			const n = Number(rows[0]?.n ?? rows[0]?.N ?? 0);
			if (Number.isFinite(n)) dune = {
				ok: true,
				stockTickers: n
			};
		}
	} catch {
		dune = {
			ok: false,
			stockTickers: 0
		};
	}
	if (stats?.znzfPriceUsd) usdMap.znzf = stats.znzfPriceUsd;
	const published = [
		[
			"Robinhood $ZNZF",
			"robinhood",
			cfg.znzf_robinhood
		],
		[
			"$ZNZF curve",
			"robinhood",
			cfg.znzf_curve_robinhood
		],
		[
			"Buyback burner",
			"robinhood",
			cfg.buyback_robinhood
		],
		[
			"Buyback splitter",
			"robinhood",
			cfg.splitter_robinhood
		],
		[
			"Fee intake",
			"robinhood",
			cfg.intake_robinhood
		],
		[
			"Fee vault",
			"robinhood",
			cfg.vault_robinhood
		],
		[
			"Robinhood factory",
			"robinhood",
			cfg.factory_robinhood
		],
		[
			"Robinhood lock",
			"robinhood",
			cfg.bridge_robinhood
		],
		[
			"Uniswap v4 migrator",
			"robinhood",
			cfg.znzf_v4_migrator
		],
		[
			"Arc $ZNZF",
			"arc",
			cfg.znzf_arc
		],
		[
			"Arc release",
			"arc",
			cfg.bridge_arc
		],
		[
			"Arc factory",
			"arc",
			cfg.factory_arc
		]
	].map(([label, chain, address]) => ({
		label,
		chain,
		address: isHexAddress(address) ? String(address).toLowerCase() : "",
		status: isHexAddress(address) ? "live" : "not-deployed"
	}));
	return {
		readAt: new Date(now).toISOString(),
		stats,
		config: publishedConfig(),
		contracts: published,
		pairs: PAIR_ASSETS,
		prices: usdMap,
		recent,
		dune,
		volume: {
			h24: volumeKnown ? volume24h : 0,
			prior: volumeKnown ? volumePrior : 0,
			all: volumeKnown ? volumeAll : 0,
			known: volumeKnown
		},
		launches: {
			h24: launches24h,
			prior: launchesPrior,
			all: launchesAll
		},
		devs: {
			h24: devs24h,
			all: devsAll
		},
		series: {
			volume: days.map((dayKey) => ({
				day: dayKey,
				value: volumeByDay.get(dayKey) ?? 0
			})),
			launches: days.map((dayKey) => ({
				day: dayKey,
				value: launchByDay.get(dayKey) ?? 0
			}))
		},
		fees,
		buyback
	};
}
export const quoteUsdPrices = createServerFn({ method: "GET" }).handler(async () => {
	const map = await fetchQuoteUsdMap();
	try {
		const stats = await protocolStats();
		if (stats?.znzfPriceUsd) map.znzf = stats.znzfPriceUsd;
	} catch {}
	return map;
});
var liveQuoteCache = /* @__PURE__ */ new Map();
export const liveQuotes = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const hit = liveQuoteCache.get(data.chain);
	if (hit && Date.now() - hit.at < 6e5) return hit.keys;
	const published = await liveProtocolConfig();
	const keys = [];
	await Promise.all(quotesFor(data.chain).map(async (asset) => {
		if (asset.native) {
			keys.push(asset.key);
			return;
		}
		if (asset.key === "znzf") {
			const addr = data.chain === "arc" ? published.znzf_arc : published.znzf_robinhood;
			if (isHexAddress(addr)) try {
				const code = await getCode(data.chain, addr);
				if (code && code !== "0x") keys.push(asset.key);
			} catch {
				keys.push(asset.key);
			}
			return;
		}
		const addr = asset.address[data.chain];
		if (!isHexAddress(addr)) return;
		try {
			const code = await getCode(data.chain, addr);
			if (code && code !== "0x" && code.length > 4) keys.push(asset.key);
		} catch {}
	}));
	const order = quotesFor(data.chain).map((q) => q.key);
	const unique = [...new Set(keys)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
	const fallback = unique.length > 0 ? unique : quotesFor(data.chain).filter((q) => q.native).map((q) => q.key);
	liveQuoteCache.set(data.chain, {
		at: Date.now(),
		keys: fallback
	});
	return fallback;
});
export const pinLaunchArt = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	return persistTokenArtRequired(String(data.imageUrl ?? ""));
});
export const launchToken = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const meta = parseTokenMeta(data.name, data.symbol);
	if (!meta.ok) return {
		ok: false,
		error: meta.error
	};
	const name = meta.name;
	const symbol = meta.symbol;
	const txHash = data.txHash.trim().toLowerCase();
	if (!name || symbol.length < 2) return {
		ok: false,
		error: "Name and ticker are required."
	};
	if (symbol === "ZNZF") return {
		ok: false,
		error: "$ZNZF is reserved."
	};
	if (!isTokenArt(data.imageUrl) || isBrandTokenArt(data.imageUrl)) return {
		ok: false,
		error: "Upload a token image first."
	};
	if (!/^0x[a-f0-9]{64}$/.test(txHash)) return {
		ok: false,
		error: "Launch transaction is missing."
	};
	const live = await liveProtocolConfig();
	const factory = live[data.chain === "arc" ? "factory_arc" : "factory_robinhood"];
	if (!isHexAddress(factory)) return {
		ok: false,
		error: "Launch is not open on this chain right now."
	};
	let receipt;
	try {
		receipt = await getReceipt(data.chain, txHash);
	} catch {
		return {
			ok: false,
			error: `Could not read that launch on ${CHAINS[data.chain].name}.`
		};
	}
	if (!receipt) return {
		ok: false,
		error: "Launch transaction not found yet. Wait for a block, then retry."
	};
	if (receipt.status !== "success") return {
		ok: false,
		error: "Launch transaction reverted."
	};
	if (receipt.to !== factory.toLowerCase()) return {
		ok: false,
		error: "Launch must go through the Zenze factory."
	};
	const launcher = receipt.from;
	if (data.wallet && data.wallet.toLowerCase() !== launcher) return {
		ok: false,
		error: "That launch was not sent from the connected wallet."
	};
	if (data.signature && data.timestamp && data.wallet) {
		const verified = await verifyWalletIntent({
			action: "launch",
			wallet: data.wallet,
			signature: data.signature,
			timestamp: data.timestamp,
			tokenId: txHash,
			amount: symbol
		});
		if (!verified.ok) return {
			ok: false,
			error: verified.error
		};
	}
	const sql = await getSql();
	const existing = await sql`select * from tokens where lower(coalesce(tx_hash, '')) = ${txHash} limit 1`;
	if (existing[0]) return {
		ok: true,
		token: enrichToken(existing[0], { ethUsd: await fetchEthUsd() })
	};
	let paidTx;
	try {
		paidTx = await getTransaction(data.chain, txHash);
	} catch {
		return {
			ok: false,
			error: "Could not read the launch payment."
		};
	}
	if (!paidTx) return {
		ok: false,
		error: "Launch transaction not found yet. Wait for a block, then retry."
	};
	const ethUsd = await fetchEthUsd();
	const launchUsd = parseFeeUsd(live.launch_fee_usd, LAUNCH_FEE_USD);
	let factoryMin = 0n;
	if (isHexAddress(factory)) {
		const onchainFee = await readFactoryLaunchFee(data.chain, factory);
		factoryMin = onchainFee == null ? FACTORY_MIN_WEI : onchainFee;
	}
	let expected;
	try {
		expected = launchValueWei(launchUsd, ethUsd, data.chain, factoryMin);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Could not quote the launch payment."
		};
	}
	if (paidTx.value < minAcceptWei(expected)) return {
		ok: false,
		error: "Launch payment was too small."
	};
	const paid = fromWei(paidTx.value, CHAINS[data.chain].decimals);
	const launched = launchedFromReceipt(receipt.logs);
	if (!launched) return {
		ok: false,
		error: "Factory did not emit a token launch."
	};
	const creator = isHexAddress(launched.creator) ? launched.creator : launcher;
	const [liveTax, liveSharing] = await Promise.all([readCreatorTaxBps(data.chain, launched.curve), readHolderSharing(data.chain, launched.curve)]);
	const taxBps = liveTax == null ? capCreatorTaxBps(Number(data.creatorTaxBps)) : Math.max(0, Math.min(1e4, Math.round(liveTax)));
	const holderSharing = liveSharing == null ? Boolean(data.holderSharing) : liveSharing;
	const quote = quoteOf(data.quote, data.chain);
	if ((await sql`
      select id from tokens
      where lower(symbol) = ${symbol.toLowerCase()}
         or (chain = ${data.chain} and lower(coalesce(contract_address, '')) = ${launched.token})
      limit 1
    `).length) return {
		ok: false,
		error: `$${symbol} is already on Zenzen.`
	};
	const id = `${symbol.toLowerCase()}-${launched.token.slice(2, 8)}`;
	const { health, rug } = computeHealth({
		realBase: 0,
		holders: 1,
		topShare: 1,
		volumeNative24h: 0
	});
	const pinned = await persistTokenArtRequired(data.imageUrl);
	if (!pinned.ok) return pinned;
	const imageUrl = pinned.url;
	if (!isIpfsArt(imageUrl)) return {
		ok: false,
		error: "Could not save that image. Try another file."
	};
	const website = cleanSocial(data.website, "web");
	const twitter = cleanSocial(data.twitter, "x");
	const telegram = cleanSocial(data.telegram, "tg");
	await sql`
      insert into tokens (
        id, name, symbol, description, image_url, creator_wallet, chain, quote_asset,
        virtual_base, virtual_tokens, holders, health_score, rug_probability,
        source, contract_address, curve_address, quote_address, tx_hash, graduated,
        website, twitter, telegram, creator_tax_bps, holder_sharing
      ) values (
        ${id}, ${name}, ${symbol}, ${data.description.trim().slice(0, 280)},
        ${imageUrl}, ${creator}, ${data.chain}, ${quote.key},
        ${quote.virtualBase}, ${quote.virtualTokens}, 1, ${health}, ${rug},
        'launched', ${launched.token}, ${launched.curve}, ${quote.address[data.chain] ?? null}, ${txHash}, false,
        ${website}, ${twitter}, ${telegram}, ${taxBps}, ${holderSharing}
      )
    `;
	dropPublicCaches();
	const rows = await sql`select * from tokens where id = ${id}`;
	if (paid > 0) await sql`insert into znzf_events (kind, amount, note) values ('fee_eth', ${paid}, ${`Launch $${symbol}`})`;
	return {
		ok: true,
		token: enrichToken(rows[0], { ethUsd })
	};
});
export const tradeToken = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const verified = await verifyWalletIntent({
		action: data.side,
		wallet: data.wallet,
		signature: data.signature,
		timestamp: data.timestamp,
		tokenId: data.id,
		amount: String(data.amount)
	});
	if (!verified.ok) return {
		ok: false,
		error: verified.error
	};
	const amount = Number(data.amount);
	if (!Number.isFinite(amount) || amount <= 0) return {
		ok: false,
		error: "Enter an amount greater than zero."
	};
	const sql = await getSql();
	const raw = await findTokenRow(sql, data.id);
	if (!raw) return {
		ok: false,
		error: "This pool is empty."
	};
	const row = await overlayOnchain(raw);
	if (row.graduated || row.source === "listed") return {
		ok: false,
		error: "This token does not trade on the Zenze curve."
	};
	const curveAddr = row.curve_address?.toLowerCase();
	if (!curveAddr || !isHexAddress(curveAddr)) return {
		ok: false,
		error: "This pool has no on-chain curve yet."
	};
	const txHash = (data.txHash ?? "").trim().toLowerCase();
	if (!/^0x[a-f0-9]{64}$/.test(txHash)) return {
		ok: false,
		error: "Confirm the trade in your wallet first."
	};
	if ((await sql`select id from trades where lower(coalesce(tx_hash, '')) = ${txHash} limit 1`).length) return {
		ok: false,
		error: "That trade is already recorded."
	};
	let receipt;
	try {
		receipt = await getReceipt(row.chain, txHash);
	} catch {
		return {
			ok: false,
			error: "Could not read that trade on-chain."
		};
	}
	if (!receipt) return {
		ok: false,
		error: "Trade transaction not found yet. Wait for a block, then retry."
	};
	if (receipt.status !== "success") return {
		ok: false,
		error: "Trade transaction reverted."
	};
	if (receipt.from !== verified.wallet) return {
		ok: false,
		error: "That trade was not sent from the connected wallet."
	};
	if (receipt.to !== curveAddr) return {
		ok: false,
		error: "Trade must go to this pool’s curve."
	};
	const quote = quoteOf(row.quote_asset, row.chain);
	const decoded = tradeFromReceipt(receipt.logs, data.side, quote.decimals);
	if (!decoded) return {
		ok: false,
		error: "Curve did not emit this trade."
	};
	let onchain;
	try {
		onchain = await readCurveState(row.chain, curveAddr);
	} catch {
		return {
			ok: false,
			error: "Could not read the curve after that trade."
		};
	}
	const newReal = fromWei(onchain.realBase, quote.decimals);
	const newSold = fromWei(onchain.tokensSold, 18);
	const tokenDelta = data.side === "buy" ? decoded.tokens : -decoded.tokens;
	const baseDelta = data.side === "buy" ? decoded.base : -decoded.base;
	const fee = decoded.fee;
	const price = decoded.tokens > 0 ? decoded.base / decoded.tokens : 0;
	const { health, rug } = computeHealth({
		realBase: newReal,
		holders: Math.max(1, row.holders + (data.side === "buy" ? 1 : 0)),
		topShare: .2,
		volumeNative24h: asNumber(row.volume_24h) + Math.abs(baseDelta)
	});
	const graduated = onchain.graduated || newReal >= quote.graduation;
	await sql`
      update tokens set
        real_base = ${newReal},
        tokens_sold = ${newSold},
        volume_24h = volume_24h + ${Math.abs(baseDelta)},
        health_score = ${health},
        rug_probability = ${rug},
        graduated = ${graduated}
      where id = ${row.id}
    `;
	await sql`
      insert into trades (token_id, wallet, side, base_amount, token_amount, price, tx_hash)
      values (${row.id}, ${verified.wallet}, ${data.side}, ${Math.abs(baseDelta)}, ${Math.abs(tokenDelta)}, ${price}, ${txHash})
    `;
	await sql`
      insert into holdings (wallet, token_id, amount)
      values (${verified.wallet}, ${row.id}, ${Math.max(0, tokenDelta)})
      on conflict (wallet, token_id) do update set amount = holdings.amount + ${tokenDelta}
    `;
	await sql`
      update tokens set holders = (
        select count(*)::int from holdings where token_id = ${row.id} and amount > 0
      )
      where id = ${row.id}
    `;
	if (fee > 0) {
		const taxBps = clampShareOfFeeBps(row.creator_tax_bps) ?? 0;
		const creatorCut = row.id === "znzf" ? 0 : fee * taxBps / 1e4;
		await sql`insert into znzf_events (kind, amount, note) values ('fee_eth', ${fee}, ${`${data.side} $${row.symbol}`})`;
		if (creatorCut > 0) await sql`insert into znzf_events (kind, amount, note) values ('creator_share', ${creatorCut}, ${row.id})`;
	}
	if (graduated && !row.graduated) await sql`
        insert into znzf_events (kind, amount, note)
        values ('creator_bonus', ${CREATOR_BONUS_ZNZF}, ${`Graduate $${row.symbol} · ${row.creator_wallet}`})
      `;
	return {
		ok: true,
		token: enrichToken((await sql`select * from tokens where id = ${row.id}`)[0], { ethUsd: await fetchEthUsd() })
	};
});
export const stakeZnzf = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const verified = await verifyWalletIntent({
		action: "stake",
		wallet: data.wallet,
		signature: data.signature,
		timestamp: data.timestamp,
		tokenId: ZNZF_ID,
		amount: String(data.amount)
	});
	if (!verified.ok) return {
		ok: false,
		error: verified.error
	};
	const amount = Number(data.amount);
	if (!Number.isFinite(amount) || amount <= 0) return {
		ok: false,
		error: "Enter an amount greater than zero."
	};
	const token = (await liveProtocolConfig()).znzf_robinhood;
	if (!isHexAddress(token)) return {
		ok: false,
		error: "Canonical $ZNZF is not published yet."
	};
	let onchain = 0;
	try {
		onchain = fromWei(await readTokenBalance("robinhood", token, verified.wallet), 18);
	} catch {
		return {
			ok: false,
			error: "Could not read your on-chain $ZNZF balance."
		};
	}
	const sql = await getSql();
	const stakedNow = await sql`select amount from wallet_stakes where wallet = ${verified.wallet}`;
	if (asNumber(stakedNow[0]?.amount) + amount > onchain + 1e-8) return {
		ok: false,
		error: "Stake cannot exceed the $ZNZF this wallet holds on Robinhood Chain."
	};
	await sql`
      insert into wallet_stakes (wallet, amount, updated_at)
      values (${verified.wallet}, ${amount}, now())
      on conflict (wallet) do update set amount = wallet_stakes.amount + ${amount}, updated_at = now()
    `;
	const staked = await sql`select amount from wallet_stakes where wallet = ${verified.wallet}`;
	return {
		ok: true,
		staked: asNumber(staked[0]?.amount),
		onchain
	};
});
export const unstakeZnzf = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const verified = await verifyWalletIntent({
		action: "unstake",
		wallet: data.wallet,
		signature: data.signature,
		timestamp: data.timestamp,
		tokenId: ZNZF_ID,
		amount: String(data.amount)
	});
	if (!verified.ok) return {
		ok: false,
		error: verified.error
	};
	const amount = Number(data.amount);
	if (!Number.isFinite(amount) || amount <= 0) return {
		ok: false,
		error: "Enter an amount greater than zero."
	};
	const sql = await getSql();
	const stakedNow = await sql`select amount from wallet_stakes where wallet = ${verified.wallet}`;
	if (amount > asNumber(stakedNow[0]?.amount) + 1e-8) return {
		ok: false,
		error: "You do not have that much staked."
	};
	await sql`update wallet_stakes set amount = amount - ${amount}, updated_at = now() where wallet = ${verified.wallet}`;
	const staked = await sql`select amount from wallet_stakes where wallet = ${verified.wallet}`;
	return {
		ok: true,
		staked: asNumber(staked[0]?.amount)
	};
});
export const voteProposal = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const verified = await verifyWalletIntent({
		action: "vote",
		wallet: data.wallet,
		signature: data.signature,
		timestamp: data.timestamp,
		tokenId: String(data.id),
		amount: data.support ? "yes" : "no"
	});
	if (!verified.ok) return {
		ok: false,
		error: verified.error
	};
	const sql = await getSql();
	const open = await sql`select id, status from proposals where id = ${data.id} limit 1`;
	if (!open[0] || open[0].status !== "open") return {
		ok: false,
		error: "That vote is closed."
	};
	const bag = await sql`
      select amount from holdings where wallet = ${verified.wallet} and token_id = ${ZNZF_ID}
    `;
	const stakeContract = (await liveProtocolConfig()).stake_robinhood || publishedConfig().stake_robinhood || "";
	let locked = 0;
	if (isHexAddress(stakeContract)) try {
		const abi = parseAbi(["function staked(address) view returns (uint256)"]);
		const raw = await chainRpc("robinhood", "eth_call", [{
			to: stakeContract,
			data: encodeFunctionData({
				abi,
				functionName: "staked",
				args: [verified.wallet]
			})
		}, "latest"]);
		locked = fromWei(decodeFunctionResult({
			abi,
			functionName: "staked",
			data: raw
		}), 18);
	} catch {
		locked = 0;
	}
	const staked = await sql`select amount from wallet_stakes where wallet = ${verified.wallet}`;
	let onchain = 0;
	const token = (await liveProtocolConfig()).znzf_robinhood;
	if (isHexAddress(token)) try {
		onchain = fromWei(await readTokenBalance("robinhood", token, verified.wallet), 18);
	} catch {
		onchain = 0;
	}
	const weight = isHexAddress(stakeContract) ? locked : onchain > 0 ? onchain : asNumber(bag[0]?.amount) + asNumber(staked[0]?.amount);
	if (weight <= 0) return {
		ok: false,
		error: isHexAddress(stakeContract) ? "Lock $ZNZF in the stake contract to vote." : "Hold or stake $ZNZF to vote."
	};
	await sql`
      insert into proposal_votes (proposal_id, wallet, support, weight)
      values (${data.id}, ${verified.wallet}, ${data.support}, ${weight})
      on conflict (proposal_id, wallet) do update set support = excluded.support, weight = excluded.weight
    `;
	return {
		ok: true,
		weight
	};
});
export const createProposal = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const title = data.title.trim().slice(0, 120);
	const body = data.body.trim().slice(0, 4e3);
	const verified = await verifyWalletIntent({
		action: "propose",
		wallet: data.wallet,
		signature: data.signature,
		timestamp: data.timestamp,
		tokenId: "governance",
		amount: title
	});
	if (!verified.ok) return {
		ok: false,
		error: verified.error
	};
	if (title.length < 8) return {
		ok: false,
		error: "Give the proposal a real title."
	};
	if (body.length < 24) return {
		ok: false,
		error: "Write what you want the protocol to do."
	};
	const token = (await liveProtocolConfig()).znzf_robinhood;
	const stakeContract = (await liveProtocolConfig()).stake_robinhood || publishedConfig().stake_robinhood || "";
	let locked = 0;
	if (isHexAddress(stakeContract)) try {
		const abi = parseAbi(["function staked(address) view returns (uint256)"]);
		const raw = await chainRpc("robinhood", "eth_call", [{
			to: stakeContract,
			data: encodeFunctionData({
				abi,
				functionName: "staked",
				args: [verified.wallet]
			})
		}, "latest"]);
		locked = fromWei(decodeFunctionResult({
			abi,
			functionName: "staked",
			data: raw
		}), 18);
	} catch {
		locked = 0;
	}
	let onchain = 0;
	if (isHexAddress(token)) try {
		onchain = fromWei(await readTokenBalance("robinhood", token, verified.wallet), 18);
	} catch {
		onchain = 0;
	}
	const sql = await getSql();
	const staked = await sql`select amount from wallet_stakes where wallet = ${verified.wallet}`;
	if (!(isHexAddress(stakeContract) ? locked > 0 : onchain + asNumber(staked[0]?.amount) > 0)) return {
		ok: false,
		error: isHexAddress(stakeContract) ? "Lock $ZNZF in the stake contract to open a proposal." : "Hold or stake $ZNZF to open a proposal."
	};
	const source = data.source === "ai" ? "ai" : "wallet";
	return {
		ok: true,
		id: (await sql`
      insert into proposals (title, body, status, proposer, source)
      values (${title}, ${body}, 'open', ${verified.wallet}, ${source})
      returning id
    `)[0]?.id ?? 0
	};
});
async function indexExternalToken(input) {
	const contract = input.contract.trim().toLowerCase();
	if (!isHexAddress(contract)) return {
		ok: false,
		error: "Paste a real contract address."
	};
	if (!isTokenArt(input.imageUrl) || isBrandTokenArt(input.imageUrl)) return {
		ok: false,
		error: "Upload a token image first."
	};
	let onchain;
	try {
		onchain = await readErc20(input.chain, contract);
	} catch (err) {
		const reason = err instanceof Error ? err.message : "";
		console.error("list erc20", contract, reason);
		if (reason === "no contract") return {
			ok: false,
			error: `No contract at that address on ${CHAINS[input.chain].name}.`
		};
		if (reason === "not a token") return {
			ok: false,
			error: "That address is not a token contract. Paste the token, not a pool or a wallet."
		};
		const found = await resolveListedPool(input.chain, contract);
		if (found.ok && found.symbol) onchain = {
			name: found.name || found.symbol,
			symbol: found.symbol,
			decimals: found.dex.decimals || 18,
			totalSupply: String(found.supply || 0)
		};
		else if (!found.ok) return found;
		else return {
			ok: false,
			error: `${CHAINS[input.chain].name} did not answer. Try the same address again.`
		};
	}
	if (!onchain.symbol || onchain.symbol === "ZNZF") return {
		ok: false,
		error: "That ticker cannot be listed here."
	};
	const dex = await resolveListedPool(input.chain, contract);
	if (!dex.ok) return dex;
	const website = readSocial(input.website, "web");
	if (!website.ok) return website;
	const twitter = readSocial(input.twitter, "x");
	if (!twitter.ok) return twitter;
	const telegram = readSocial(input.telegram, "tg");
	if (!telegram.ok) return telegram;
	const sql = await getSql();
	if (input.txHash) {
		if ((await sql`select id from tokens where lower(coalesce(tx_hash, '')) = ${input.txHash.toLowerCase()} limit 1`).length) return {
			ok: false,
			error: "That payment is already used."
		};
	}
	if ((await sql`
      select id from tokens
      where (chain = ${input.chain} and lower(coalesce(contract_address, '')) = ${contract})
         or lower(symbol) = ${onchain.symbol.toLowerCase()}
      limit 1
    `).length) return {
		ok: false,
		error: `$${onchain.symbol} is already on Zenzen.`
	};
	const id = `list-${onchain.symbol.toLowerCase()}-${contract.slice(2, 8)}`;
	const description = String(input.description ?? "").trim().slice(0, 280);
	if (!description) return {
		ok: false,
		error: "Add a description."
	};
	const { health, rug } = computeHealth({
		realBase: 0,
		holders: 0,
		topShare: 0,
		volumeNative24h: 0
	});
	const quote = defaultQuote(input.chain);
	const pinned = await persistTokenArtRequired(input.imageUrl);
	if (!pinned.ok) return pinned;
	const imageUrl = pinned.url;
	if (!isIpfsArt(imageUrl)) return {
		ok: false,
		error: "Could not save that image. Try another file."
	};
	await sql`
    insert into tokens (
      id, name, symbol, description, image_url, creator_wallet, chain, quote_asset,
      health_score, rug_probability, source, contract_address, total_supply, graduated, tx_hash, dex_pool,
      website, twitter, telegram
    ) values (
      ${id}, ${cleanTokenName(onchain.name, onchain.symbol)}, ${onchain.symbol},
      ${description || `Listed ${onchain.symbol} on ${CHAINS[input.chain].name}.`},
      ${imageUrl}, ${input.creator}, ${input.chain}, ${quote},
      ${health}, ${rug}, 'listed', ${contract}, ${tokenUnits(onchain.totalSupply, onchain.decimals) || onchain.totalSupply}, true, ${input.txHash}, ${dexPoolJson(dex.dex)},
      ${website.value}, ${twitter.value}, ${telegram.value}
    )
  `;
	dropPublicCaches();
	let promo = "failed";
	let promoError = "";
	try {
		const announced = await announceListing({
			id,
			symbol: onchain.symbol,
			twitter: twitter.value,
			telegram: telegram.value,
			liquidityUsd: dex.dex.liquidityUsd,
			mcap: dex.dex.mcap
		});
		if (announced.ok && "skipped" in announced && announced.skipped) promo = "skipped";
		else if (announced.ok) promo = "posted";
		else promoError = announced.error;
	} catch (err) {
		promoError = err instanceof Error ? err.message : "The X post did not go out.";
	}
	if (input.paidNative && input.paidNative > 0) await sql`
      insert into znzf_events (kind, amount, note)
      values ('listing_fee', ${input.paidNative}, ${`List $${onchain.symbol} ${contract}`})
    `;
	return {
		ok: true,
		token: enrichToken((await sql`select * from tokens where id = ${id}`)[0], { ethUsd: await fetchEthUsd() }),
		onchain,
		promo,
		promoError
	};
}
export const listExternalToken = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	if (!String(data.description ?? "").trim()) return {
		ok: false,
		error: "Add a description."
	};
	const contract = data.contract.trim().toLowerCase();
	const txHash = data.txHash.trim().toLowerCase();
	const live = await liveProtocolConfig();
	const listUsd = parseFeeUsd(live.listing_fee_usd, 19);
	const verified = await verifyWalletIntent({
		action: "list",
		wallet: data.wallet,
		signature: data.signature,
		timestamp: data.timestamp,
		tokenId: contract,
		amount: String(listUsd)
	});
	if (!verified.ok) return {
		ok: false,
		error: verified.error
	};
	if (!/^0x[a-f0-9]{64}$/.test(txHash)) return {
		ok: false,
		error: "Confirm the listing payment in your wallet first."
	};
	const vault = live[data.chain === "arc" ? "vault_arc" : "vault_robinhood"];
	if (!isHexAddress(vault)) return {
		ok: false,
		error: "Listing is not open on this chain right now."
	};
	let receipt;
	try {
		receipt = await getReceipt(data.chain, txHash);
	} catch {
		return {
			ok: false,
			error: `Could not read that payment on ${CHAINS[data.chain].name}.`
		};
	}
	if (!receipt) return {
		ok: false,
		error: "Payment not found yet. Wait for a block, then retry."
	};
	if (receipt.status !== "success") return {
		ok: false,
		error: "Payment transaction reverted."
	};
	if (receipt.from !== verified.wallet) return {
		ok: false,
		error: "That payment was not sent from the connected wallet."
	};
	if (receipt.to !== vault.toLowerCase()) return {
		ok: false,
		error: "Listing payment must go to the protocol vault."
	};
	let paid;
	try {
		paid = await getTransaction(data.chain, txHash);
	} catch {
		return {
			ok: false,
			error: "Could not read the listing payment."
		};
	}
	if (!paid) return {
		ok: false,
		error: "Payment not found yet. Wait for a block, then retry."
	};
	const ethUsd = await fetchEthUsd();
	let expected;
	try {
		expected = listValueWei(listUsd, ethUsd, data.chain);
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Could not quote the listing payment."
		};
	}
	if (paid.value < minAcceptWei(expected)) return {
		ok: false,
		error: "Listing payment was too small."
	};
	return indexExternalToken({
		chain: data.chain,
		contract,
		description: data.description,
		imageUrl: data.imageUrl,
		website: data.website,
		twitter: data.twitter,
		telegram: data.telegram,
		creator: verified.wallet,
		txHash,
		paidNative: fromWei(paid.value, CHAINS[data.chain].decimals)
	});
});
export const previewDexList = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const found = await resolveListedPool(data.chain === "arc" ? "arc" : "robinhood", String(data.contract ?? ""));
	if (!found.ok) return found;
	return {
		ok: true,
		name: found.name,
		symbol: found.symbol,
		quote: found.dex.quote,
		poolId: found.dex.poolId,
		fee: found.dex.fee,
		tickSpacing: found.dex.tickSpacing,
		hooks: found.dex.hooks,
		priceUsd: found.dex.priceUsd,
		liquidityUsd: found.dex.liquidityUsd,
		mcap: found.dex.mcap
	};
});
export const dexQuoteMarkets = createServerFn({ method: "GET" }).handler(async () => {
	return loadDexQuoteMarkets(quotesFor("robinhood").filter((quote) => !quote.native && quote.key !== "znzf" && isHexAddress(quote.address.robinhood)).map((quote) => ({
		address: quote.address.robinhood,
		decimals: quote.decimals,
		symbol: quote.symbol
	})));
});
async function resolveSwapDex(data) {
	const direct = String(data.address ?? "").trim().toLowerCase();
	if (isHexAddress(direct)) {
		const cfg = publishedConfig();
		if ([
			cfg.znzf_robinhood,
			cfg.znzf_arc,
			"0x65ee0ce656908544a1f29856ac9aee8563b5002c"
		].map((value) => String(value || "").toLowerCase()).filter(Boolean).includes(direct)) return {
			ok: false,
			error: "$ZNZF trades on its curve. It does not swap through Uniswap."
		};
		const live = await resolveListedPool("robinhood", direct);
		if (!live.ok) return live;
		return {
			ok: true,
			dex: live.dex,
			symbol: live.symbol || "TOKEN"
		};
	}
	const row = await findTokenRow(await getSql(), String(data.id ?? ""));
	if (!row || row.id === "znzf") return {
		ok: false,
		error: "This token is not on Uniswap."
	};
	const graduated = Boolean(row.graduated) && row.source !== "listed";
	if (row.source !== "listed" && !graduated) return {
		ok: false,
		error: "This token is not on Uniswap yet."
	};
	let dex = parseDexPool(row.dex_pool);
	if (!dex && isHexAddress(row.contract_address)) {
		const live = await resolveListedPool(row.chain, row.contract_address);
		if (!live.ok) return live;
		dex = live.dex;
	}
	if (!dex) return {
		ok: false,
		error: "This token has no Uniswap v4 pool."
	};
	return {
		ok: true,
		dex,
		symbol: row.symbol
	};
}
var SPEND_ALLOWANCE = parseAbi(["function allowance(address owner, address spender) view returns (uint256)"]);
var PERMIT_ALLOWANCE = parseAbi(["function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)"]);
export const swapApprovals = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const chain = data.chain === "arc" ? "arc" : "robinhood";
	const token = String(data.token ?? "");
	const owner = String(data.owner ?? "");
	const spender = String(data.spender ?? "");
	const permit2 = String(data.permit2 ?? "");
	const none = {
		erc20: false,
		permit2: false
	};
	if (!isHexAddress(token) || !isHexAddress(owner) || !isHexAddress(spender)) return none;
	let need = 0n;
	try {
		need = BigInt(String(data.amount ?? "0"));
	} catch {
		return none;
	}
	if (need <= 0n) return none;
	const erc20Spender = isHexAddress(permit2) ? permit2 : spender;
	async function call(to, calldata) {
		const raw = await chainRpc(chain, "eth_call", [{
			to,
			data: calldata
		}, "latest"]);
		return typeof raw === "string" && raw.startsWith("0x") ? raw : null;
	}
	let erc20 = false;
	try {
		const raw = await call(token, encodeFunctionData({
			abi: SPEND_ALLOWANCE,
			functionName: "allowance",
			args: [owner, erc20Spender]
		}));
		if (raw) {
			const amount = decodeFunctionResult({
				abi: SPEND_ALLOWANCE,
				functionName: "allowance",
				data: raw
			});
			erc20 = BigInt(amount) >= need;
		}
	} catch {}
	let permit = false;
	if (isHexAddress(permit2)) try {
		const raw = await call(permit2, encodeFunctionData({
			abi: PERMIT_ALLOWANCE,
			functionName: "allowance",
			args: [
				owner,
				token,
				spender
			]
		}));
		if (raw) {
			const decoded = decodeFunctionResult({
				abi: PERMIT_ALLOWANCE,
				functionName: "allowance",
				data: raw
			});
			const amount = Array.isArray(decoded) ? decoded[0] : decoded.amount;
			const expiration = BigInt(Array.isArray(decoded) ? decoded[1] : decoded.expiration);
			const now = BigInt(Math.floor(Date.now() / 1e3));
			permit = BigInt(amount) >= need && expiration > now + 3600n;
		}
	} catch {}
	return {
		erc20,
		permit2: permit
	};
});
export const dexSwapCall = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const found = await resolveSwapDex(data);
	if (!found.ok) return found;
	const dex = found.dex;
	const side = data.side === "sell" ? "sell" : "buy";
	let amountIn;
	try {
		amountIn = parseUnits(String(data.amount ?? "0"), side === "buy" ? 18 : dex.decimals);
	} catch {
		return {
			ok: false,
			error: "Enter an amount greater than zero."
		};
	}
	if (amountIn <= 0n) return {
		ok: false,
		error: "Enter an amount greater than zero."
	};
	const liveCfg = await liveProtocolConfig();
	const feeRecipient = String(liveCfg.vault_robinhood || "");
	if (!isHexAddress(feeRecipient)) return {
		ok: false,
		error: "The swap fee vault is not set."
	};
	const feeIn = side === "buy" ? amountIn * BigInt(200) / 10000n : 0n;
	const swapIn = amountIn - feeIn;
	if (swapIn <= 0n) return {
		ok: false,
		error: "Amount is too small."
	};
	const gross = await quoteV4ExactIn(dex, side === "buy", swapIn);
	if (!gross) return {
		ok: false,
		error: "Could not quote that swap."
	};
	const feeOut = side === "sell" ? gross * BigInt(200) / 10000n : 0n;
	const userOut = gross - feeOut;
	const outDecimals = side === "buy" ? dex.decimals : 18;
	let minOut;
	const limitRaw = String(data.minOut ?? "").trim();
	if (limitRaw) {
		try {
			minOut = parseUnits(limitRaw, outDecimals);
		} catch {
			return {
				ok: false,
				error: "That limit has too many decimals."
			};
		}
		if (minOut <= 0n) return {
			ok: false,
			error: "Enter a limit greater than zero."
		};
		if (minOut > userOut) return {
			ok: false,
			error: "Your limit is above the market."
		};
	} else {
		const bps = Math.min(5e3, Math.max(0, Math.floor(Number(data.slippageBps ?? 100)) || 0));
		minOut = userOut * (10000n - BigInt(bps)) / 10000n;
	}
	if (minOut <= 0n) return {
		ok: false,
		error: "Amount is too small."
	};
	const call = v4SwapCall({
		dex,
		side,
		amountIn,
		minOut,
		deadline: BigInt(Math.floor(Date.now() / 1e3) + 1200),
		feeRecipient
	});
	if (side === "buy" && call.fee <= 0n) return {
		ok: false,
		error: "Amount is too small."
	};
	return {
		ok: true,
		to: call.to,
		data: call.data,
		value: call.value.toString(),
		out: tokenUnits(userOut.toString(), outDecimals).toString(),
		min: tokenUnits(minOut.toString(), outDecimals).toString(),
		fee: tokenUnits((side === "buy" ? call.fee : feeOut).toString(), 18).toString(),
		quote: side === "buy" ? found.symbol : dex.quote
	};
});
export const previewDexSwap = createServerFn({ method: "POST" }).validator((input) => input).handler(async ({ data }) => {
	const found = await resolveSwapDex(data);
	if (!found.ok) return found;
	const dex = found.dex;
	const side = data.side === "sell" ? "sell" : "buy";
	let amountIn;
	try {
		amountIn = parseUnits(String(data.amount ?? "0"), side === "buy" ? 18 : dex.decimals);
	} catch {
		return {
			ok: false,
			error: "Enter an amount greater than zero."
		};
	}
	if (amountIn <= 0n) return {
		ok: false,
		error: "Enter an amount greater than zero."
	};
	const feeIn = side === "buy" ? amountIn * BigInt(200) / 10000n : 0n;
	const gross = await quoteV4ExactIn(dex, side === "buy", amountIn - feeIn);
	if (!gross) return {
		ok: false,
		error: "Could not quote that swap."
	};
	const feeOut = side === "sell" ? gross * BigInt(200) / 10000n : 0n;
	const userOut = gross - feeOut;
	return {
		ok: true,
		out: tokenUnits(userOut.toString(), side === "buy" ? dex.decimals : 18),
		fee: tokenUnits((side === "buy" ? feeIn : feeOut).toString(), 18)
	};
});
export const deskIndexToken = createServerFn({ method: "POST" }).middleware([operatorMiddleware]).validator((input) => input).handler(async ({ data, context }) => {
	const res = await indexExternalToken({
		chain: data.chain,
		contract: data.contract,
		description: data.description,
		imageUrl: data.imageUrl,
		website: data.website,
		twitter: data.twitter,
		telegram: data.telegram,
		creator: context.operatorWallet,
		txHash: null
	});
	if (!res.ok) return res;
	await (await getSql())`
      insert into audit_logs (user_id, action, detail)
      values (${context.operatorWallet}, 'desk_list', ${`${data.chain}:${data.contract}`})
    `;
	return res;
});