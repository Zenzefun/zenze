import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { SwapAssetPicker } from "@/components/tokens/swap-asset-picker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeButton } from "@/components/site/home-button";
import { curveBuyCalldata, curveSellCalldata, erc20ApproveCalldata } from "@/lib/contracts";
import type { ChainKey } from "@/lib/chains";
import { TRADE_FEE_BPS } from "@/lib/chains";
import { formatAmount, formatUsdTiny } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { publishedConfig, publishedZnzfCurve } from "@/lib/onchain";
import { hasQuotedPool, hasTradablePool, isProtocolToken } from "@/lib/pool";
import { getSwapBalances, getTradeBalances, listTokens, prepareWalletTx, quoteTrade, quoteUsdPrices, tradeToken, type EnrichedToken } from "@/lib/server/market";
import { assetFromToken, buildSwapCatalog, findSwapRoute, quoteRoute, routeLabel, type SwapAsset } from "@/lib/swap-route";
import { storedRef } from "@/lib/referral";
import { recordReferral } from "@/lib/server/referral";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";

export { hasQuotedPool, hasTradablePool };

function parseAmt(raw: string): number {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
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
  const n = parseAmt(amount);
  const cfg = publishedConfig();
  const protocolCurve = isProtocolToken(token) ? publishedZnzfCurve(token.chain.key) : null;
  const tokenLive = useMemo(() => {
    if (!protocolCurve || isHexAddress(token.curve_address)) return token;
    return { ...token, curve_address: protocolCurve, source: "launched" as const, graduated: false };
  }, [token, protocolCurve]);
  const quoted = hasQuotedPool(tokenLive);
  const live = hasTradablePool(tokenLive);
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

  const catalog = useMemo(() => {
    const rows = [...(tokens.data ?? [])];
    const i = rows.findIndex((t) => t.id === tokenLive.id);
    if (i >= 0) rows[i] = tokenLive;
    else rows.unshift(tokenLive);
    return mergeCatalog(buildSwapCatalog({ chain: tokenLive.chain.key, tokens: rows, znzfAddress }), picked);
  }, [tokens.data, tokenLive, znzfAddress, picked]);

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
    queryKey: ["quote-trade", token.id, amount, pay?.graphId, receive?.graphId],
    queryFn: async () => {
      if (!route.ok || route.hops.length !== 1) return null;
      const hop = route.hops[0];
      if (!hop.token.tokenId) return null;
      return quoteTrade({ data: { id: hop.token.tokenId, side: hop.op, amount: n } });
    },
    enabled: n > 0 && quoted && route.ok && route.hops.length === 1,
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

  const receiveAmt = q.data?.ok
    ? q.data.side === "buy"
      ? q.data.tokensOut
      : q.data.baseOut
    : preview.ok
      ? preview.amountOut
      : 0;

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
        <p className="text-sm text-muted-foreground">This pool is not quoting on a Zenze curve yet.</p>
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

  function fillPct(pct: number) {
    const cap = payAvail * (pct / 100);
    if (cap <= 0) {
      setAmount("");
      return;
    }
    setAmount(formatAmount(cap, pay?.kind === "token" ? 6 : 10));
  }

  function choosePay(a: SwapAsset) {
    if (!pay || !receive) return;
    remember(a);
    if (a.graphId === receive.graphId) {
      setPayPick(a);
      setReceivePick(pay);
    } else {
      setPayPick(a);
    }
    setAmount("");
  }

  function chooseReceive(a: SwapAsset) {
    if (!pay || !receive) return;
    remember(a);
    if (a.graphId === pay.graphId) {
      setReceivePick(a);
      setPayPick(receive);
    } else {
      setReceivePick(a);
    }
    setAmount("");
  }

  async function submit() {
    try {
      if (n <= 0) {
        toast.error("Enter an amount greater than zero.");
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
      if (route.hops.some((hop) => hop.op === "sell" && (hop.token.curve?.tokensSold ?? 0) <= 0)) {
        toast.error("This curve has not sold any tokens yet. Buy first — a sell reverts until someone has bought.");
        return;
      }
      if (!preview.ok) {
        toast.error(preview.error);
        return;
      }
      if (!wallet.connected || !wallet.address) await wallet.connect();
      if (wallet.chainId !== token.chain.id) await wallet.switchChain(token.chain.key);
      const from = wallet.address!;
      setBusy(true);
      const slipBps = 100n;
      async function send(to: string, data: string, value: bigint = 0n) {
        const prep = await prepareWalletTx({
          data: { chain: token.chain.key, from, to, data, value: value.toString() },
        });
        if (!prep.ok) throw new Error(prep.error);
        return wallet.sendTransaction({ to, data, value: value > 0n ? value : undefined, ...txGas(prep) });
      }
      let hopIn = n;
      for (let i = 0; i < route.hops.length; i++) {
        const hop = route.hops[i];
        const hopQuote = preview.hops[i];
        const curve = hop.token.curveAddress;
        if (!curve || !isHexAddress(curve)) throw new Error(`${hop.token.symbol} has no curve.`);
        const minOut = hopQuote.outAmt * (1 - Number(slipBps) / 10_000);
        if (hop.op === "buy") {
          const wei = parseUnits(hopIn.toFixed(Math.min(8, hop.token.quoteDecimals)), hop.token.quoteDecimals);
          const minTokens = parseUnits(Math.max(minOut, 0).toFixed(8), 18);
          if (!hop.token.quoteNative) {
            const quoteAddr = hop.token.quoteAddress;
            if (!quoteAddr || !isHexAddress(quoteAddr)) throw new Error("This quote asset is not published on this chain.");
            const approveHash = await send(quoteAddr, erc20ApproveCalldata(curve, wei));
            const approved = await wallet.waitReceipt(approveHash);
            if (approved.status !== "success") throw new Error("Quote approval reverted.");
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
          const tokenWei = parseUnits(hopIn.toFixed(8), 18);
          const minQuote = parseUnits(
            Math.max(minOut, 0).toFixed(Math.min(8, hop.token.quoteDecimals)),
            hop.token.quoteDecimals,
          );
          const approveHash = await send(tokenAddr, erc20ApproveCalldata(curve, tokenWei));
          const approved = await wallet.waitReceipt(approveHash);
          if (approved.status !== "success") throw new Error("Token approval reverted.");
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
        hopIn = hopQuote.outAmt;
        if (route.hops.length > 1 && i < route.hops.length - 1) {
          toast.message(`Hop ${i + 1} of ${route.hops.length} confirmed.`);
        }
      }
      toast.success(
        route.hops.length > 1
          ? "Routed swap confirmed."
          : receive?.tokenId === token.id
            ? "Buy confirmed on the curve."
            : "Sell confirmed on the curve.",
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
    route.ok && route.hops.some((hop) => hop.op === "sell" && (hop.token.curve?.tokensSold ?? 0) <= 0);
  const feeNote = sellBlocked
    ? "This curve has not sold any tokens yet. Buy first — a sell reverts until someone has bought."
    : route.ok
      ? route.hops.length > 1
        ? `Routed ${routeLabel(route)} · ${TRADE_FEE_BPS / 100}% per hop`
        : `Routed through the bonding curve · ${((route.hops[0]?.token.feeBps || TRADE_FEE_BPS) / 100).toFixed(0)}% swap fee`
      : route.error;

  return (
    <div className="space-y-3" data-pay={pay.symbol} data-receive={receive.symbol}>
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
              setPayPick(receive);
              setReceivePick(pay);
              setAmount("");
            }}
            className="pointer-events-auto grid size-10 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm hover:bg-muted"
            aria-label="Flip buy and sell"
          >
            <ArrowDownUp className="size-4" />
          </button>
        </div>
        <SwapLeg
          label="Buy"
          value={n > 0 && (preview.ok || q.data?.ok) ? formatAmount(receiveAmt, 6) : "0"}
          usd={n > 0 ? receiveUsd : null}
          asset={receive}
          available={0}
          assets={catalog}
          other={pay}
          chain={token.chain.key}
          znzfAddress={znzfAddress}
          onAsset={chooseReceive}
        />
      </div>
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
      <p className="text-center text-xs text-muted-foreground">{feeNote}</p>
      <Button
        className="h-12 w-full rounded-full bg-[#c8f54a] text-base font-semibold text-[#111] hover:opacity-90"
        disabled={busy || !route.ok || sellBlocked}
        onClick={() => void submit()}
      >
        {busy
          ? "Waiting on the wallet…"
          : !wallet.connected
            ? "Connect wallet to trade"
            : !route.ok
              ? "No route"
              : `Swap ${pay.symbol} → ${receive.symbol}`}
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
          onChange={onAsset}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{formatUsdTiny(usd)}</span>
        <span className="flex items-center gap-2">
          {editable && (
            <>
              <span className="tabular-nums">{formatAmount(available, 6)} available</span>
              {onMax && (
                <button type="button" onClick={onMax} className="rounded-full bg-[#c8f54a] px-2 py-0.5 text-[10px] font-semibold text-[#111]">
                  Max
                </button>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
