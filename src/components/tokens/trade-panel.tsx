import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { encodeFunctionData, maxUint160, parseAbi, parseUnits } from "viem";
import { SwapAssetPicker } from "@/components/tokens/swap-asset-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeButton } from "@/components/site/home-button";
import { curveBuyCalldata, curveSellCalldata, erc20ApproveCalldata } from "@/lib/contracts";
import { UNISWAP_V4, type ChainKey } from "@/lib/chains";
import { floorDecimal, formatAmount, formatUsdTiny } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { publishedConfig, publishedZnzfCurve } from "@/lib/onchain";
import { hasQuotedPool, hasTradablePool, isProtocolToken } from "@/lib/pool";
import { quoteBuy, quoteSell } from "@/lib/curve";
import { dexQuoteMarkets, dexSwapCall, getSwapBalances, getTradeBalances, listTokens, prepareWalletTx, previewDexSwap, quoteTrade, quoteUsdPrices, swapApprovals, tradeToken, type EnrichedToken } from "@/lib/server/market";
import { assetFromToken, attachDexQuotes, buildSwapCatalog, findSwapRoute, quoteRoute, type SwapAsset } from "@/lib/swap-route";
import { applyPayPick, applyReceivePick, flipSwapLegs, pageLegLocks } from "@/lib/swap-legs";
import { storedRef } from "@/lib/referral";
import { recordReferral } from "@/lib/server/referral";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";

export { hasQuotedPool, hasTradablePool };

function parseAmt(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function plainAmount(n: number) {
  if (!(n > 0) || !Number.isFinite(n)) return "";
  return (Math.floor(n * 1e6) / 1e6).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function trimAmount(raw: string, decimals: number) {
  const [whole, frac = ""] = raw.replace(/,/g, "").trim().split(".");
  const cut = frac.slice(0, Math.max(0, decimals));
  return cut.length ? `${whole || "0"}.${cut}` : whole || "0";
}

function plainDecimal(n: number, decimals: number) {
  return floorDecimal(n, decimals);
}

function slipLabel(bps: number) {
  return `${Number((bps / 100).toFixed(2))}%`;
}

function mergeCatalog(base: SwapAsset[], extra: SwapAsset[]) {
  const seen = new Set(base.map((a) => a.graphId));
  const out = [...base];
  for (const a of extra) {
    if (!a || seen.has(a.graphId)) continue;
    seen.add(a.graphId);
    out.push(a);
  }
  return out;
}

export function TradePanel({ token, onTraded }: { token: EnrichedToken; onTraded: () => void }) {
  const wallet = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [payPick, setPayPick] = useState<SwapAsset | null>(null);
  const [receivePick, setReceivePick] = useState<SwapAsset | null>(null);
  const [picked, setPicked] = useState<SwapAsset[]>([]);
  const [order, setOrder] = useState<"market" | "limit">("market");
  const [limitOut, setLimitOut] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [slipOpen, setSlipOpen] = useState(false);
  const n = parseAmt(amount);
  const limitAmt = parseAmt(limitOut);
  const cfg = publishedConfig();
  const protocolCurve = isProtocolToken(token) ? publishedZnzfCurve(token.chain.key) : null;
  const tokenLive = useMemo(() => {
    if (!protocolCurve || isHexAddress(token.curve_address)) return token;
    return { ...token, curve_address: protocolCurve, source: "launched" as const, graduated: false };
  }, [token, protocolCurve]);
  const dexLive = Boolean(tokenLive.dex && tokenLive.dex.priceNative > 0);
  const advanced = dexLive;
  const mode: "market" | "limit" = advanced && order === "limit" ? "limit" : "market";
  const quoted = hasQuotedPool(tokenLive) || dexLive;
  const live = hasTradablePool(tokenLive) || dexLive;
  const znzfAddress =
    isProtocolToken(tokenLive) && isHexAddress(tokenLive.contract_address)
      ? tokenLive.contract_address
      : tokenLive.chain.key === "arc"
        ? cfg.znzf_arc
        : cfg.znzf_robinhood;

  const tokens = useQuery({
    queryKey: ["tokens"],
    queryFn: () => listTokens(),
    staleTime: 15_000,
    enabled: quoted,
  });
  const dexQuotes = useQuery({
    queryKey: ["dex-quotes", tokenLive.chain.key],
    queryFn: () => dexQuoteMarkets(),
    staleTime: 60_000,
    enabled: quoted && tokenLive.chain.key === "robinhood",
  });

  const catalog = useMemo(() => {
    const rows = [...(tokens.data ?? [])];
    const i = rows.findIndex((t) => t.id === tokenLive.id);
    if (i >= 0) rows[i] = tokenLive;
    else rows.unshift(tokenLive);
    const base = mergeCatalog(buildSwapCatalog({ chain: tokenLive.chain.key, tokens: rows, znzfAddress }), picked);
    return attachDexQuotes(base, dexQuotes.data ?? [], tokenLive.chain.key);
  }, [tokens.data, tokenLive, znzfAddress, picked, dexQuotes.data]);

  const pageAsset = useMemo(
    () => assetFromToken(tokenLive, znzfAddress) ?? catalog.find((a) => a.tokenId === tokenLive.id) ?? null,
    [tokenLive, znzfAddress, catalog],
  );
  const quoteAsset = useMemo(() => {
    if (pageAsset) {
      const hit = catalog.find((a) => a.graphId === pageAsset.quoteGraphId);
      if (hit) return hit;
    }
    return catalog.find((a) => a.native) ?? catalog.find((a) => a.kind === "quote") ?? null;
  }, [catalog, pageAsset]);
  const pay = (payPick ? catalog.find((a) => a.graphId === payPick.graphId) ?? payPick : null) ?? quoteAsset;
  const receive = (receivePick ? catalog.find((a) => a.graphId === receivePick.graphId) ?? receivePick : null) ?? pageAsset;

  useEffect(() => {
    setAmount("");
    setPayPick(null);
    setReceivePick(null);
    setPicked([]);
    setOrder("market");
    setLimitOut("");
    setSlippageBps(100);
    setSlipOpen(false);
  }, [token.id]);

  const route = useMemo(() => {
    if (!pay || !receive) return { ok: false as const, error: "Pick a pair." };
    return findSwapRoute(pay, receive, catalog);
  }, [pay, receive, catalog]);
  const preview = useMemo(() => quoteRoute(route, n), [route, n]);

  const prices = useQuery({
    queryKey: ["quote-usd"],
    queryFn: () => quoteUsdPrices(),
    staleTime: 30_000,
  });

  const bags = useQuery({
    queryKey: ["trade-bags", token.id, wallet.address],
    queryFn: () => getTradeBalances({ data: { wallet: wallet.address!, id: token.id } }),
    enabled: Boolean(wallet.address) && quoted,
    refetchInterval: 12_000,
  });
  const extraBal = useQuery({
    queryKey: ["swap-bal", token.chain.key, wallet.address, pay?.graphId],
    queryFn: () =>
      getSwapBalances({
        data: {
          chain: token.chain.key,
          wallet: wallet.address,
          assets: [{ id: pay!.graphId, native: pay!.native, address: pay!.address, decimals: pay!.decimals }],
        },
      }),
    enabled: Boolean(wallet.address && pay),
    refetchInterval: 12_000,
  });

  const q = useQuery({
    queryKey: ["quote-trade", token.id, amount, pay?.graphId, receive?.graphId, route.ok ? route.hops.map((hop) => `${hop.op}:${hop.token.graphId}`).join(",") : ""],
    queryFn: async () => {
      if (!route.ok || !pay) return null;
      if (route.hops.length === 1 && route.hops[0].token.venue !== "dex") {
        const hop = route.hops[0];
        if (!hop.token.tokenId) return null;
        const res = await quoteTrade({ data: { id: hop.token.tokenId, side: hop.op, amount: n } });
        if (!res?.ok) return null;
        const amountOut = hop.op === "buy" ? res.tokensOut : res.baseOut;
        return amountOut > 0 ? { ok: true as const, amountOut } : null;
      }
      let amt = n;
      let text = trimAmount(amount, pay.decimals || 18);
      for (const hop of route.hops) {
        if (hop.token.venue === "dex") {
          const listed = hop.token.kind === "token" && Boolean(hop.token.tokenId) && hop.token.tokenId !== "znzf";
          const res = await previewDexSwap({
            data: listed
              ? { id: hop.token.tokenId!, side: hop.op, amount: text }
              : { address: hop.token.address ?? "", side: hop.op, amount: text },
          });
          if (!res.ok || !(res.out > 0)) return null;
          amt = res.out;
          text = plainDecimal(res.out, hop.op === "buy" ? hop.token.decimals : 18);
        } else {
          if (!hop.token.curve) return null;
          const priced = hop.op === "buy" ? quoteBuy(hop.token.curve, amt) : quoteSell(hop.token.curve, amt);
          const out = hop.op === "buy" ? priced.tokensOut : priced.baseOut;
          if (!(out > 0)) return null;
          amt = out;
          text = plainDecimal(out, hop.op === "buy" ? hop.token.decimals : hop.token.quoteDecimals);
        }
      }
      return { ok: true as const, amountOut: amt };
    },
    enabled: n > 0 && quoted && route.ok,
    refetchInterval: 8_000,
  });

  const payAvail = (() => {
    if (!pay || !wallet.connected) return 0;
    if (pay.native) {
      return wallet.chainId === token.chain.id ? wallet.native : (bags.data?.native ?? extraBal.data?.[pay.graphId] ?? 0);
    }
    if (pay.tokenId === token.id) return bags.data?.token ?? 0;
    if (quoteAsset && pay.graphId === quoteAsset.graphId) return bags.data?.quote ?? extraBal.data?.[pay.graphId] ?? 0;
    return extraBal.data?.[pay.graphId] ?? 0;
  })();

  const receiveAmt = q.data?.ok ? q.data.amountOut : preview.ok ? preview.amountOut : 0;

  function usdFor(asset: SwapAsset | null): number | null {
    if (!asset) return null;
    if (asset.tokenId === token.id && token.priceUsd != null) return token.priceUsd;
    const book = prices.data ?? {};
    if (asset.native) return book.eth ?? token.ethUsd ?? null;
    const key = asset.symbol.replace(/^\$/, "").toLowerCase();
    if (key === "usdc" || key === "usdg") return 1;
    const live = book[key];
    if (live != null && Number.isFinite(live) && live > 0) return live;
    if (quoteAsset && asset.graphId === quoteAsset.graphId) {
      return token.quoteUsd ?? (token.quote.kind === "stable" ? 1 : token.ethUsd);
    }
    if (key === "znzf" && book.znzf != null) return book.znzf;
    return null;
  }

  const payUsd = n > 0 ? (() => { const u = usdFor(pay); return u != null ? n * u : null; })() : null;
  const receiveUsd =
    receiveAmt > 0
      ? (() => {
          const u = usdFor(receive);
          return u != null ? receiveAmt * u : null;
        })()
      : null;

  const percents = useMemo(() => [25, 50, 75, 100] as const, []);

  if (!quoted) {
    return (
      <div className="space-y-3 py-4 text-center">
        <p className="text-sm text-muted-foreground">This token is not trading yet.</p>
        <div className="flex justify-center">
          <HomeButton variant="outline" />
        </div>
      </div>
    );
  }
  if (!pay || !receive) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-12 rounded-full" />
        <p className="text-center text-xs text-muted-foreground">Loading the pair…</p>
      </div>
    );
  }

  function remember(asset: SwapAsset) {
    setPicked((prev) => (prev.some((x) => x.graphId === asset.graphId) ? prev : [...prev, asset]));
  }

  const nativeEth = catalog.find((a) => a.native) ?? null;
  const locks = pageLegLocks(pay, receive, pageAsset);

  function fillPct(pct: number) {
    let cap = payAvail * (pct / 100);
    if (pct === 100 && pay.native) cap = Math.max(0, cap - 0.0004);
    if (cap <= 0) {
      setAmount("");
      return;
    }
    const places = pay.kind === "token" ? 6 : Math.min(8, pay.decimals || 18);
    setAmount(floorDecimal(cap, places));
  }

  function choosePay(a: SwapAsset) {
    if (!pay || !receive) return;
    remember(a);
    const next = applyPayPick(a, pay, receive, nativeEth, pageAsset);
    setPayPick(next.pay);
    setReceivePick(next.receive);
    setAmount("");
    setLimitOut("");
  }

  function chooseReceive(a: SwapAsset) {
    if (!pay || !receive) return;
    remember(a);
    const next = applyReceivePick(a, pay, receive, nativeEth, pageAsset);
    setPayPick(next.pay);
    setReceivePick(next.receive);
    setAmount("");
    setLimitOut("");
  }

  async function submit() {
    try {
      if (n <= 0) {
        toast.error("Enter an amount greater than zero.");
        return;
      }
      if (mode === "limit" && !(limitAmt > 0)) {
        toast.error("Enter the amount you want to receive.");
        return;
      }
      if (!live) {
        toast.error("This pool is not trading yet.");
        return;
      }
      if (!route.ok) {
        toast.error(route.error);
        return;
      }
      if (route.hops.some((hop) => hop.op === "sell" && hop.token.venue !== "dex" && (hop.token.curve?.tokensSold ?? 0) <= 0)) {
        toast.error("This curve has not sold any tokens yet. Buy first — a sell reverts until someone has bought.");
        return;
      }
      if (!preview.ok) {
        toast.error(preview.error);
        return;
      }
      if (mode === "limit" && receiveAmt > 0 && limitAmt > receiveAmt) {
        toast.error("Your limit is above the market.");
        return;
      }
      if (route.hops.some((hop) => hop.token.venue === "dex") && q.isFetching && !q.data?.ok) {
        toast.error("Still quoting that swap.");
        return;
      }
      if (!wallet.connected || !wallet.address) await wallet.connect();
      if (wallet.chainId !== token.chain.id) await wallet.switchChain(token.chain.key);
      const from = wallet.address!;
      setBusy(true);
      const slip = advanced ? Math.min(5_000, Math.max(0, Math.round(slippageBps))) : 100;
      async function send(to: string, data: string, value: bigint = 0n) {
        const prep = await prepareWalletTx({
          data: { chain: token.chain.key, from, to, data, value: value.toString() },
        });
        if (!prep.ok) throw new Error(prep.error);
        return wallet.sendTransaction({ to, data, value: value > 0n ? value : undefined, ...txGas(prep) });
      }
      async function ensureSpend(tokenAddr: string, spender: string, amountWei: bigint, permit2?: string) {
        let gate = { erc20: false, permit2: false };
        try {
          const res = await swapApprovals({
            data: {
              chain: token.chain.key,
              token: tokenAddr,
              owner: from,
              spender,
              permit2: permit2 || "",
              amount: amountWei.toString(),
            },
          });
          if (res && typeof res.erc20 === "boolean") gate = { erc20: res.erc20, permit2: Boolean(res.permit2) };
        } catch {
          gate = { erc20: false, permit2: false };
        }
        if (!gate.erc20) {
          const approveHash = await send(tokenAddr, erc20ApproveCalldata(permit2 || spender, maxUint160));
          const approved = await wallet.waitReceipt(approveHash);
          if (approved.status !== "success") throw new Error("Token approval reverted.");
        }
        if (permit2 && !gate.permit2) {
          const permit = encodeFunctionData({
            abi: parseAbi(["function approve(address token, address spender, uint160 amount, uint48 expiration)"]),
            functionName: "approve",
            args: [tokenAddr as `0x${string}`, spender as `0x${string}`, maxUint160, 2_814_749_767_679],
          });
          const permitHash = await send(permit2, permit);
          const permitted = await wallet.waitReceipt(permitHash);
          if (permitted.status !== "success") throw new Error("Permit2 approval reverted.");
        }
      }
      let hopIn = n;
      let hopInText = trimAmount(amount, pay.decimals || 18);
      for (let i = 0; i < route.hops.length; i++) {
        const hop = route.hops[i];
        const last = i === route.hops.length - 1;
        const paysNative =
          (hop.token.venue === "dex" && hop.op === "buy") ||
          (hop.token.venue !== "dex" && hop.op === "buy" && hop.token.quoteNative);
        if (i > 0 && paysNative) {
          await useWallet.getState().refresh();
          const room = Math.max(0, useWallet.getState().native - 0.0002);
          const capped = Math.min(hopIn, room);
          if (!(capped > 0)) {
            throw new Error("Not enough ETH left for gas after the first swap. Keep a little ETH in the wallet, or swap a larger amount.");
          }
          hopIn = capped;
          hopInText = plainDecimal(capped, 18);
        }
        if (hop.token.venue === "dex") {
          if (token.chain.key !== "robinhood") throw new Error("Listed swaps are on Robinhood Chain.");
          const listed = hop.token.kind === "token" && Boolean(hop.token.tokenId) && hop.token.tokenId !== "znzf";
          if (!listed && (!hop.token.address || !isHexAddress(hop.token.address))) {
            throw new Error(`${hop.token.symbol} has no Uniswap pool.`);
          }
          if (hop.op === "sell") {
            const tokenAddr = hop.token.address;
            if (!tokenAddr || !isHexAddress(tokenAddr)) throw new Error("This pool has no token contract yet.");
            const permit2 = UNISWAP_V4.robinhood.permit2;
            const router = UNISWAP_V4.robinhood.universalRouter;
            const amountWei = parseUnits(hopInText, hop.token.decimals || 18);
            await ensureSpend(tokenAddr, router, amountWei, permit2);
          }
          const call = (await dexSwapCall({
            data: {
              id: listed ? hop.token.tokenId! : undefined,
              address: listed ? undefined : hop.token.address ?? undefined,
              side: hop.op,
              amount: hopInText,
              slippageBps: slip,
              minOut: mode === "limit" && last ? trimAmount(limitOut, hop.op === "buy" ? hop.token.decimals : 18) : undefined,
            },
          })) as
            | { ok: true; to: string; data: string; value: string; out: string; min?: string }
            | { ok: false; error: string };
          if (!call.ok) throw new Error(call.error);
          const hash = await send(call.to, call.data, BigInt(call.value || "0"));
          const receipt = await wallet.waitReceipt(hash);
          if (receipt.status !== "success") throw new Error("Swap reverted.");
          const nextRaw = !last && call.min ? call.min : call.out;
          const nextDec = hop.op === "buy" ? hop.token.decimals : 18;
          hopIn = Number(nextRaw);
          hopInText = plainDecimal(hopIn, nextDec);
        } else {
          const curve = hop.token.curveAddress;
          if (!curve || !isHexAddress(curve) || !hop.token.curve) throw new Error(`${hop.token.symbol} has no curve.`);
          const priced = hop.op === "buy" ? quoteBuy(hop.token.curve, hopIn) : quoteSell(hop.token.curve, hopIn);
          const expected = hop.op === "buy" ? priced.tokensOut : priced.baseOut;
          if (!(expected > 0)) throw new Error("That amount is too small for this curve.");
          if (mode === "limit" && last && limitAmt > expected) throw new Error("Your limit is above the market.");
          const slipped = expected * (1 - slip / 10_000);
          const minHuman = mode === "limit" && last ? limitAmt : slipped;
          if (hop.op === "buy") {
            const wei = parseUnits(plainDecimal(hopIn, hop.token.quoteDecimals), hop.token.quoteDecimals);
            const minTokens = parseUnits(plainDecimal(Math.max(minHuman, 0), 8), 18);
            if (!hop.token.quoteNative) {
              const quoteAddr = hop.token.quoteAddress;
              if (!quoteAddr || !isHexAddress(quoteAddr)) throw new Error("This quote asset is not published on this chain.");
              await ensureSpend(quoteAddr, curve, wei);
            }
            const call = curveBuyCalldata(wei, hop.token.quoteNative, minTokens);
            const hash = await send(curve, call.data, call.value);
            const receipt = await wallet.waitReceipt(hash);
            if (receipt.status !== "success") throw new Error("Buy transaction reverted.");
            if (hop.token.tokenId) {
              try {
                const signed = await wallet.signIntent({ action: "buy", tokenId: hop.token.tokenId, amount: String(hopIn) });
                await tradeToken({ data: { id: hop.token.tokenId, side: "buy", amount: hopIn, txHash: hash, ...signed } });
              } catch {}
            }
          } else {
            const tokenAddr = hop.token.address;
            if (!tokenAddr || !isHexAddress(tokenAddr)) throw new Error("This pool has no token contract yet.");
            const tokenWei = parseUnits(plainDecimal(hopIn, 8), 18);
            const minQuote = parseUnits(plainDecimal(Math.max(minHuman, 0), hop.token.quoteDecimals), hop.token.quoteDecimals);
            await ensureSpend(tokenAddr, curve, tokenWei);
            const hash = await send(curve, curveSellCalldata(tokenWei, minQuote));
            const receipt = await wallet.waitReceipt(hash);
            if (receipt.status !== "success") throw new Error("Sell transaction reverted.");
            if (hop.token.tokenId) {
              try {
                const signed = await wallet.signIntent({ action: "sell", tokenId: hop.token.tokenId, amount: String(hopIn) });
                await tradeToken({ data: { id: hop.token.tokenId, side: "sell", amount: hopIn, txHash: hash, ...signed } });
              } catch {}
            }
          }
          const nextAmt = last ? expected : slipped;
          hopIn = nextAmt;
          hopInText = plainDecimal(nextAmt, hop.op === "buy" ? hop.token.decimals : hop.token.quoteDecimals);
        }
        if (route.hops.length > 1 && i < route.hops.length - 1) {
          toast.message(`Hop ${i + 1} of ${route.hops.length} confirmed.`);
        }
      }
      toast.success(
        mode === "limit"
          ? "Limit swap confirmed."
          : receive?.tokenId === token.id
            ? "Buy confirmed."
            : "Swap confirmed.",
      );
      if (receive?.tokenId === token.id && wallet.address) {
        const code = storedRef();
        if (code) void recordReferral({ data: { code, kind: "buy", wallet: wallet.address } });
      }
      await bags.refetch();
      await extraBal.refetch();
      await wallet.refresh();
      onTraded();
    } catch (err) {
      toast.error(publicWalletError(err));
    } finally {
      setBusy(false);
    }
  }

  const sellBlocked =
    route.ok && route.hops.some((hop) => hop.op === "sell" && hop.token.venue !== "dex" && (hop.token.curve?.tokensSold ?? 0) <= 0);
  const quoting = route.ok && route.hops.some((hop) => hop.token.venue === "dex") && n > 0 && q.isFetching && !q.data?.ok;
  const limitBlocked = mode === "limit" && (!(limitAmt > 0) || (receiveAmt > 0 && limitAmt > receiveAmt));
  const dexLoading = token.chain.key === "robinhood" && dexQuotes.isLoading && !dexQuotes.data;
  const feeNote = sellBlocked
    ? "A sell fails until someone has bought."
    : dexLoading && !route.ok
      ? "Prices are still loading."
      : route.ok
        ? ""
        : route.error;

  function chooseOrder(next: "market" | "limit") {
    setOrder(next);
    setSlipOpen(false);
    if (next === "limit") setLimitOut(plainAmount(receiveAmt));
    else setLimitOut("");
  }

  return (
    <div className="space-y-3" data-pay={pay.symbol} data-receive={receive.symbol} data-order={mode} data-advanced={advanced ? "true" : "false"}>
      {advanced && (
      <div className="flex items-center justify-between gap-2">
        <div className="grid grid-cols-2 rounded-full border border-border p-0.5 text-xs font-semibold" role="tablist" aria-label="Order type">
          <button
            type="button"
            role="tab"
            aria-selected={order === "market"}
            onClick={() => chooseOrder("market")}
            className={order === "market" ? "rounded-full bg-[#c8f54a] px-3 py-1 text-[#111]" : "rounded-full px-3 py-1 text-muted-foreground"}
          >
            Market
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={order === "limit"}
            onClick={() => chooseOrder("limit")}
            className={order === "limit" ? "rounded-full bg-[#c8f54a] px-3 py-1 text-[#111]" : "rounded-full px-3 py-1 text-muted-foreground"}
          >
            Limit
          </button>
        </div>
        {order === "market" && (
          <div className="relative">
            <button type="button" onClick={() => setSlipOpen((open) => !open)} className="text-xs text-muted-foreground">
              Slippage {slipLabel(slippageBps)} <span className="font-semibold text-foreground">Adjust</span>
            </button>
            {slipOpen && (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-border bg-popover p-2 shadow-lg">
                <div className="grid grid-cols-4 gap-1">
                  {[50, 100, 200, 500].map((bps) => (
                    <button
                      key={bps}
                      type="button"
                      onClick={() => {
                        setSlippageBps(bps);
                        setSlipOpen(false);
                      }}
                      className={`h-8 rounded-full text-xs font-medium ${slippageBps === bps ? "bg-[#c8f54a] text-[#111]" : "border border-border"}`}
                    >
                      {slipLabel(bps)}
                    </button>
                  ))}
                </div>
                <label className="mt-2 block text-[10px] text-muted-foreground">
                  Custom %
                  <input
                    inputMode="decimal"
                    placeholder="1"
                    onBlur={(e) => {
                      const pct = Number(e.target.value);
                      if (!Number.isFinite(pct) || pct <= 0) return;
                      setSlippageBps(Math.round(Math.min(50, Math.max(0.1, pct)) * 100));
                      e.target.value = "";
                    }}
                    className="mt-1 h-8 w-full rounded-lg border border-border bg-transparent px-2 text-sm text-foreground"
                  />
                </label>
              </div>
            )}
          </div>
        )}
      </div>
      )}
      <div className="relative space-y-2">
        <SwapLeg
          label="Sell"
          value={amount}
          onChange={setAmount}
          usd={payUsd}
          asset={pay}
          available={payAvail}
          onMax={() => fillPct(100)}
          editable
          locked={locks.payLocked}
          assets={catalog}
          other={receive}
          chain={token.chain.key}
          znzfAddress={znzfAddress}
          onAsset={choosePay}
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <button
            type="button"
            onClick={() => {
              const next = flipSwapLegs(pay, receive, nativeEth, pageAsset);
              setPayPick(next.pay);
              setReceivePick(next.receive);
              setAmount("");
              setLimitOut("");
            }}
            className="pointer-events-auto grid size-10 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted"
            aria-label="Flip buy and sell"
          >
            <ArrowDownUp className="size-4" />
          </button>
        </div>
        <SwapLeg
          label="Buy"
          value={mode === "limit" ? limitOut : n > 0 && (preview.ok || q.data?.ok) ? formatAmount(receiveAmt, 6) : "0"}
          onChange={mode === "limit" ? setLimitOut : undefined}
          usd={
            mode === "limit"
              ? limitAmt > 0
                ? (() => {
                    const u = usdFor(receive);
                    return u != null ? limitAmt * u : null;
                  })()
                : null
              : n > 0
                ? receiveUsd
                : null
          }
          asset={receive}
          available={0}
          editable={mode === "limit"}
          locked={locks.receiveLocked}
          assets={catalog}
          other={pay}
          chain={token.chain.key}
          znzfAddress={znzfAddress}
          onAsset={chooseReceive}
        />
      </div>
      {mode === "limit" && (
        <p className="text-center text-xs text-muted-foreground">
          {n > 0 && receiveAmt > 0 ? `Market is about ${formatAmount(receiveAmt, 6)} ${receive.symbol}.` : "Enter the minimum you will accept."}
        </p>
      )}
      <div className="grid grid-cols-4 gap-2">
        {percents.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => fillPct(p)}
            className="h-9 rounded-full border border-border bg-card text-xs font-medium hover:bg-muted"
          >
            {p === 100 ? "Max" : `${p}%`}
          </button>
        ))}
      </div>
      {feeNote ? <p className="text-center text-xs text-muted-foreground">{feeNote}</p> : null}
      <Button
        className="h-12 w-full rounded-full bg-[#c8f54a] text-base font-semibold text-[#111] hover:opacity-90"
        disabled={busy || (wallet.connected && (!route.ok || sellBlocked || limitBlocked || quoting))}
        onClick={() => {
          if (!wallet.connected) {
            void wallet.connect().catch((err) => toast.error(publicWalletError(err)));
            return;
          }
          void submit();
        }}
      >
        {!wallet.connected
          ? "Connect Wallet"
          : busy
            ? "Waiting on the wallet…"
            : quoting
              ? "Quoting…"
              : dexLoading && !route.ok
                ? "Loading prices…"
                : !route.ok
                  ? "No route"
                  : limitBlocked
                    ? "Limit not reached"
                    : `Swap ${token.symbol}`}
      </Button>
    </div>
  );
}

function SwapLeg({
  label,
  value,
  onChange,
  usd,
  asset,
  available,
  onMax,
  editable = false,
  locked = false,
  assets,
  other,
  chain,
  znzfAddress,
  onAsset,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  usd: number | null;
  asset: SwapAsset;
  available: number;
  onMax?: () => void;
  editable?: boolean;
  locked?: boolean;
  assets: SwapAsset[];
  other: SwapAsset;
  chain: ChainKey;
  znzfAddress?: string | null;
  onAsset: (asset: SwapAsset) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-3">
        {editable ? (
          <input
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="0"
            value={value}
            onChange={(e) => onChange?.(e.target.value.replace(/[^0-9.]/g, ""))}
            className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50"
          />
        ) : (
          <p className="min-w-0 flex-1 truncate text-3xl font-semibold tabular-nums">{value || "0"}</p>
        )}
        <SwapAssetPicker
          assets={assets}
          value={asset}
          other={other}
          chain={chain}
          znzfAddress={znzfAddress}
          locked={locked}
          onChange={onAsset}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{formatUsdTiny(usd)}</span>
        <span className="flex items-center gap-2">
          {onMax && (
            <>
              <span className="tabular-nums">{formatAmount(available, 6)} available</span>
              <button type="button" onClick={onMax} className="rounded-full bg-[#c8f54a] px-2 py-0.5 text-[10px] font-semibold text-[#111]">
                Max
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
