import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronDown, Fuel, Plus, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { ChainSelect } from "@/components/chains/chain-select";
import { PairSelect } from "@/components/chains/pair-select";
import { AppShell } from "@/components/layout/app-shell";
import { SmartImage } from "@/components/media/smart-image";
import { ArtPicker } from "@/components/tokens/art-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CHAINS, DEFAULT_CREATOR_TAX_BPS, TRADE_FEE_BPS, type ChainKey } from "@/lib/chains";
import { curveBuyCalldata, erc20ApproveCalldata, launchCalldata, setMigratorCalldata } from "@/lib/contracts";
import { storedRef } from "@/lib/referral";
import { myReferralCode, recordReferral } from "@/lib/server/referral";
import { draftLaunchDescription, generateLaunchImage } from "@/lib/server/ai";
import { defaultTokenArt } from "@/lib/default-art";
import { quoteBuy, quoteBuyWithSnipe } from "@/lib/curve";
import { boundCreatorTaxDraft, clampCreatorTaxBps, commitCreatorTaxDraft, formatFeePct, LAUNCH_SNIPE_START_BPS, MAX_CREATOR_TAX_PCT } from "@/lib/fee-split";
import { NATIVE_ETH, poolFeeLabel } from "@/lib/dex-swap";
import { formatAddress, formatAmount, formatCompact, formatUsd } from "@/lib/format";
import { fileToTokenArt, isTokenArt } from "@/lib/image-art";
import { isHexAddress } from "@/lib/intent";
import { defaultQuote, pairLabel, quoteOf, type QuoteKey } from "@/lib/pairs";
import { publishedConfig } from "@/lib/onchain";
import { feeQuote, launchToken, pinLaunchArt, prepareWalletTx, previewDexList, protocolStats, publicConfig, tradeToken } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { cleanSocial } from "@/lib/socials";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";
import { parseTokenMeta, cleanTokenSymbol } from "@/lib/token-name";

export const Route = createFileRoute("/launch")({
  component: Launch,
  head: () =>
    pageHead({
      title: "Launch",
      description: "Name a token, pick the pair, and launch. The fee rules are in the docs.",
      path: "/launch",
    }),
});

function QuotePool({ chain, quote }: { chain: ChainKey; quote: QuoteKey }) {
  const asset = quoteOf(quote, chain);
  const address = asset.address[chain] ?? "";
  const onRobinhood = chain === "robinhood" && !asset.native && isHexAddress(address);
  const pool = useQuery({
    queryKey: ["quote-pool", address.toLowerCase()],
    queryFn: () => previewDexList({ data: { chain: "robinhood", contract: address } }),
    enabled: onRobinhood,
    retry: false,
    staleTime: 60_000,
  });
  const row = pool.data?.ok ? pool.data : null;
  if (!onRobinhood) {
    return <p className="text-xs text-muted-foreground">The curve is the pool. It fills when the token launches against {asset.symbol}.</p>;
  }
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
      {pool.isPending && <p>Reading the {asset.symbol} pool…</p>}
      {pool.data && !pool.data.ok && <p>{pool.data.error}</p>}
      {row && (
        <p>
          Pool filled. {asset.symbol} / ETH · {poolFeeLabel(row.fee)} · tick {row.tickSpacing}
          {row.hooks.toLowerCase() === NATIVE_ETH ? "" : ` · hook ${formatAddress(row.hooks)}`}
          {row.liquidityUsd > 0 ? ` · ${formatUsd(row.liquidityUsd)}` : ""}
        </p>
      )}
    </div>
  );
}

function factoryKey(chain: ChainKey) {
  return chain === "arc" ? "factory_arc" : "factory_robinhood";
}

function znzfKey(chain: ChainKey) {
  return chain === "arc" ? "znzf_arc" : "znzf_robinhood";
}

function Launch() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => protocolStats() });
  const cfg = useQuery({ queryKey: ["public-config"], queryFn: () => publicConfig(), initialData: publishedConfig() });
  const wallet = useWallet();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [chain, setChain] = useState<ChainKey>("robinhood");
  const [quote, setQuote] = useState<QuoteKey>("eth");
  const [imageUrl, setImageUrl] = useState("");
  const [devBuy, setDevBuy] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [holderSharing, setHolderSharing] = useState(false);
  const [creatorWallet, setCreatorWallet] = useState("");
  const [creatorTaxPct, setCreatorTaxPct] = useState(String(DEFAULT_CREATOR_TAX_BPS / 100));
  const [snipeExempt, setSnipeExempt] = useState<string[]>([""]);
  const fees = useQuery({ queryKey: ["fee-quote", chain], queryFn: () => feeQuote({ data: { chain } }) });
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phase, setPhase] = useState<LaunchPhase>("idle");
  const [launched, setLaunched] = useState<{ id: string; symbol: string; name: string } | null>(null);
  const draft = useMutation({
    mutationFn: async () => {
      const res = await draftLaunchDescription({ data: { name, symbol, hint: description, wallet: wallet.address ?? "" } });
      if (!res.ok) throw new Error(res.error);
      return res.text;
    },
    onSuccess: (text) => setDescription(text),
    onError: (err) => toast.error(err instanceof Error ? err.message : "That draft is not available right now."),
  });
  const genImage = useMutation({
    mutationFn: async () => {
      const meta = parseTokenMeta(name, symbol);
      if (!meta.ok) throw new Error(meta.error);
      try {
        const res = await generateLaunchImage({ data: { name: meta.name, symbol: meta.symbol, description, wallet: wallet.address ?? "" } });
        if (!res.ok) throw new Error(res.error);
        // Same path as a user upload: square crop, compress, validate.
        const file = dataUrlToFile(res.dataUrl, `${meta.symbol.toLowerCase()}.img`);
        const art = await fileToTokenArt(file);
        if (!isTokenArt(art)) throw new Error("Generated image did not pass the upload check.");
        return { art, fallback: false };
      } catch (err) {
        const art = defaultTokenArt(meta.symbol, meta.name);
        if (!art) throw err;
        return { art, fallback: true, reason: err instanceof Error ? err.message : "" };
      }
    },
    onSuccess: (r) => {
      setImageUrl(r.art);
      if (r.fallback) toast.message(`Image generator unavailable${r.reason ? ` (${r.reason})` : ""}. Using the default image.`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not make an image."),
  });

  const factory = cfg.data?.[factoryKey(chain)];
  const znzf = cfg.data?.[znzfKey(chain)];
  const factoryLive = Boolean(factory && /^0x[a-fA-F0-9]{40}$/.test(factory));
  const quoteAsset = quoteOf(quote, chain);
  const devAmt = Number(devBuy.replace(/,/g, ""));
  const previewCurve = useMemo(
    () => ({
      virtualBase: quoteAsset.virtualBase,
      virtualTokens: quoteAsset.virtualTokens,
      realBase: 0,
      tokensSold: 0,
      feeBps: TRADE_FEE_BPS,
    }),
    [quoteAsset.virtualBase, quoteAsset.virtualTokens],
  );
  function changeChain(next: ChainKey) {
    setChain(next);
    setQuote(defaultQuote(next));
  }

  function creatorTaxBps(): number {
    return clampCreatorTaxBps(Number(creatorTaxPct.replace(/,/g, "")));
  }

  const devOut = Number.isFinite(devAmt) && devAmt > 0 ? quoteBuy(previewCurve, devAmt).tokensOut : 0;
  const devOutSniped =
    Number.isFinite(devAmt) && devAmt > 0 ? quoteBuyWithSnipe(previewCurve, devAmt, LAUNCH_SNIPE_START_BPS).tokensOut : 0;
  const tradeFeePct = (TRADE_FEE_BPS / 100).toFixed(2);
  const taxBps = creatorTaxBps();
  const shareOfFeePct = taxBps / 100;
  const buyer = (wallet.address || "").toLowerCase();
  const buyerExempt = Boolean(buyer) && snipeExempt.some((addr) => addr.trim().toLowerCase() === buyer);

  const onChain = wallet.connected && wallet.chainId === CHAINS[chain].id;
  const needNative = fees.data ? Number(fees.data.launchNative) * 1.2 + (quoteAsset.native && devAmt > 0 ? devAmt : 0) : 0;
  const lowGas = onChain && needNative > 0 && Number(wallet.native) < needNative;
  const step1Ok = parseTokenMeta(name, symbol).ok;
  const step2Ok = description.trim().length > 0;

  const mut = useMutation({
    mutationFn: async () => {
      const meta = parseTokenMeta(name, symbol);
      if (!meta.ok) throw new Error(meta.error);
      const artInput = isTokenArt(imageUrl) ? imageUrl : defaultTokenArt(meta.symbol, meta.name);
      if (!isTokenArt(artInput)) throw new Error("Upload a token image first.");
      if (!factoryLive) throw new Error("Launch is not open on this chain right now.");
      if (creatorWallet.trim() && !isHexAddress(creatorWallet.trim())) {
        throw new Error("Creator wallet must be a real address, or leave it blank.");
      }
      const exempt = snipeExempt.map((a) => a.trim()).filter(Boolean);
      for (const addr of exempt) {
        if (!isHexAddress(addr)) throw new Error("One of the wallets in Advanced → Early-buy protection isn't a valid address. Fix it or remove it, then try again.");
      }
      setPhase("prepare");
      if (!wallet.connected || !wallet.address) await wallet.connect();
      if (wallet.chainId !== CHAINS[chain].id) await wallet.switchChain(chain);
      const pinned = await pinLaunchArt({ data: { imageUrl: artInput } });
      if (!pinned.ok) throw new Error(pinned.error);
      const art = pinned.url;
      const quoteFees = fees.data ?? (await feeQuote({ data: { chain } }));
      const call = launchCalldata({
        name: meta.name,
        symbol: meta.symbol,
        quote: quoteAsset,
        chain,
        znzfAddress: znzf,
        value: BigInt(quoteFees.launchWei),
        creatorWallet: creatorWallet.trim() || null,
        creatorTaxBps: creatorTaxBps(),
        holderSharing,
        snipeExempt: exempt,
      });
      const from = wallet.address;
      if (!from) throw new Error("Connect a wallet first.");
      const prep = await prepareWalletTx({
        data: { chain, from, to: factory, data: call.data, value: call.value.toString() },
      });
      if (!prep.ok) throw new Error(prep.error);
      setPhase("sign");
      const hash = await wallet.sendTransaction({
        to: factory,
        data: call.data,
        value: call.value,
        ...txGas(prep),
      });
      setPhase("confirm");
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("Launch transaction reverted.");
      setPhase("index");
      let lastError = "Could not index that launch.";
      let token: {
        id: string;
        curve_address?: string | null;
        contract_address?: string | null;
        chain: { key: ChainKey; id: number };
      } | null = null;
      for (let i = 0; i < 8; i++) {
        const res = await launchToken({
          data: {
            name: meta.name,
            symbol: meta.symbol,
            description,
            chain,
            quote,
            imageUrl: art,
            txHash: hash,
            wallet: wallet.address!,
            website: cleanSocial(website, "web"),
            twitter: cleanSocial(twitter, "x"),
            telegram: cleanSocial(telegram, "tg"),
            creatorWallet: creatorWallet.trim() || undefined,
            creatorTaxBps: creatorTaxBps(),
            holderSharing,
            snipeExempt: exempt,
          },
        });
        if (res.ok) {
          token = res.token;
          break;
        }
        lastError = res.error;
        if (!/not found yet|Could not read|did not emit/i.test(res.error)) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!token) throw new Error(lastError);
      const migrator = publishedConfig().znzf_v4_migrator;
      const creator = (creatorWallet.trim() || wallet.address || "").toLowerCase();
      if (
        chain === "robinhood" &&
        isHexAddress(migrator) &&
        isHexAddress(token.curve_address) &&
        creator === (wallet.address || "").toLowerCase()
      ) {
        try {
          const data = setMigratorCalldata(migrator);
          const prep = await prepareWalletTx({
            data: { chain, from: wallet.address!, to: token.curve_address, data, value: "0" },
          });
          if (prep.ok) {
            const armed = await wallet.sendTransaction({
              to: token.curve_address,
              data,
              ...txGas(prep),
            });
            const armedReceipt = await wallet.waitReceipt(armed);
            if (armedReceipt.status !== "success") throw new Error("Migrator was not set.");
          }
        } catch {
          toast.message("Your token is live. It trades normally. One optional extra (automatic Uniswap listing later) didn't switch on. Ask us on Telegram (t.me/zenzefun) and we'll help.");
        }
      }
      if (Number.isFinite(devAmt) && devAmt > 0 && isHexAddress(token.curve_address)) {
        try {
          await developerBuy({
            token,
            amount: devAmt,
            chain,
            quote: quoteAsset,
            wallet,
          });
        } catch (err) {
          toast.error(`Your token is live, but your first buy didn't go through. ${publicWalletError(err)} You can buy it any time from your token page.`);
        }
      }
      return token;
    },
    onSuccess: (token) => {
      const code = storedRef();
      const from = wallet.address;
      if (code && from) void recordReferral({ data: { code, kind: "launch", wallet: from } });
      setPhase("live");
      toast.success("Token launched. You are the recorded creator.");
      setLaunched({ id: token.id, symbol: cleanTokenSymbol(symbol), name: name.trim() });
    },
    onError: (err) => {
      setPhase("error");
      toast.error(publicWalletError(err));
    },
  });

  if (launched) {
    return (
      <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
        <LaunchDone token={launched} wallet={wallet.address} />
      </AppShell>
    );
  }

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h1 className="max-w-[680px] text-3xl font-semibold text-balance sm:text-4xl">Create a token</h1>
          <p className="mt-3 max-w-[680px] text-pretty text-muted-foreground">
            Three steps. New to crypto?{" "}
            <Link to="/start" className="font-medium text-gold underline-offset-2 hover:underline">
              Launch your first token in 2 minutes
            </Link>
            .{" "}
            <Link to="/docs" className="font-medium text-stone underline-offset-2 hover:underline">
              Fee rules
            </Link>{" "}
            are in the docs.
          </p>
          <ol className="mt-6 grid grid-cols-3 gap-2 text-xs" aria-label="Launch steps">
            {(["Name", "Describe", "Deploy"] as const).map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const done = n < step;
              const reachable = n === 1 || (n === 2 && step1Ok) || (n === 3 && step1Ok && step2Ok);
              return (
                <li key={label}>
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => setStep(n)}
                    aria-current={n === step ? "step" : undefined}
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors duration-300 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${n === step ? "border-gold bg-card text-foreground" : "border-border text-muted-foreground hover:bg-muted"} disabled:opacity-50`}
                  >
                    {done ? <Check className="size-3.5" /> : <span>{n}.</span>} {label}
                  </button>
                </li>
              );
            })}
          </ol>
          {!factoryLive && (
            <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              Launch is not open on {CHAINS[chain].name} right now. Try the other network.
            </p>
          )}
          <form
            className="mt-6 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (step === 1) {
                if (step1Ok) setStep(2);
                else {
                  const meta = parseTokenMeta(name, symbol);
                  toast.error(meta.ok ? "Add a name and a ticker." : meta.error);
                }
                return;
              }
              if (step === 2) {
                if (step2Ok) setStep(3);
                return;
              }
              mut.mutate();
            }}
          >
            {step === 1 && (
              <>
                <ArtPicker value={imageUrl} onChange={setImageUrl} size="hero" />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => genImage.mutate()} disabled={genImage.isPending || !step1Ok}>
                    <Sparkles className="size-4" />
                    {genImage.isPending ? "Generating… (up to 20s)" : "Generate image"}
                  </Button>
                  <p className="text-xs text-muted-foreground">Optional. {step1Ok ? "Generate from the name and ticker, or skip" : "Add a name and ticker to generate, or skip"} for a default image.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" required minLength={2} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Zenze" />
                    <p className="text-xs text-muted-foreground">Written on-chain as the ERC-20 name.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="symbol">Ticker</Label>
                    <Input id="symbol" required maxLength={8} value={symbol} onChange={(e) => setSymbol(cleanTokenSymbol(e.target.value).slice(0, 8))} placeholder="TICKER" />
                  </div>
                </div>
                <Button type="submit" variant="gold" className="w-full" disabled={!step1Ok}>
                  Next: describe it
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="desc">Description</Label>
                    {(
                      <Button type="button" variant="outline" size="sm" onClick={() => draft.mutate()} disabled={draft.isPending}>
                        <Sparkles className="size-4" />
                        {draft.isPending ? "Writing…" : "Generate"}
                      </Button>
                    )}
                  </div>
                  <Textarea id="desc" required maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this token about?" />
                  {<p className="text-xs text-muted-foreground">Generate writes a draft from the name and ticker. Edit it before you deploy.</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="x">X</Label>
                  <Input id="x" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" />
                  <p className="text-xs text-muted-foreground">Optional. Website and Telegram sit in Advanced.</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)}>Back</Button>
                  <Button type="submit" variant="gold" className="flex-1" disabled={!step2Ok}>
                    Next: deploy
                  </Button>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Chain</Label>
                  <ChainSelect value={chain} onChange={changeChain} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="devbuy">Buy some yourself (optional)</Label>
                  <div className="flex gap-2">
                    <Input id="devbuy" inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value)} placeholder="0" />
                    <span className="inline-flex h-11 shrink-0 items-center rounded-md border border-border bg-card px-3 text-sm font-medium">
                      {quoteAsset.symbol}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave 0 to skip. If you enter an amount, you buy right after your token goes live.
                    {devOut > 0
                      ? buyerExempt
                        ? ` This wallet is exempt, so that is about ${formatCompact(devOut)} ${symbol || "TOKEN"}.`
                        : ` About ${formatCompact(devOut)} ${symbol || "TOKEN"} if exempt or after 3s; about ${formatCompact(devOutSniped)} in the first seconds (early-buy protection). Add your wallet in Advanced to skip it.`
                      : ""}
                  </p>
                </div>
                <details className="group rounded-xl border border-border">
                  <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium">
                    Advanced (optional)
                    <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                      Skip this on a first launch
                      <ChevronDown className="size-4 transition-transform duration-500 ease-soft group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="space-y-5 border-t border-border p-4">
                    <div className="space-y-2">
                      <Label>Trade it against</Label>
                      <PairSelect chain={chain} value={quote} onChange={setQuote} symbol={symbol || "TOKEN"} />
                      <QuotePool chain={chain} quote={quote} />
                    </div>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Share your earnings with holders</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {holderSharing
                        ? "Holders claim your earnings instead of you. This can't be changed after launch."
                        : "Off: your earnings go to you. Can't be changed after launch."}
                    </p>
                  </div>
                  <Switch checked={holderSharing} onCheckedChange={(v) => setHolderSharing(v === true)} aria-label="Share your earnings with holders" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creator-wallet">Send my earnings to</Label>
                  <Input
                    id="creator-wallet"
                    value={creatorWallet}
                    onChange={(e) => setCreatorWallet(e.target.value)}
                    placeholder="0x… · leave blank to use your wallet"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {holderSharing
                      ? "With this on, holders claim the share. Leave blank to record the wallet you launch with."
                      : "This wallet receives your share of the fee. Leave blank to use the wallet you launch with."}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creator-tax">How much you earn from trades</Label>
                  <input
                    id="creator-tax-range"
                    type="range"
                    min={0}
                    max={MAX_CREATOR_TAX_PCT}
                    step={0.01}
                    value={Number.isFinite(Number(creatorTaxPct)) ? Math.min(MAX_CREATOR_TAX_PCT, Math.max(0, Number(creatorTaxPct))) : 0}
                    onChange={(e) => setCreatorTaxPct(commitCreatorTaxDraft(e.target.value))}
                    aria-label="Your slice of the 2% fee, from 0 to 10. Starts at 2."
                    className="range-lg mt-1 w-full cursor-pointer accent-gold"
                  />
                  <div className="flex gap-2">
                    <Input
                      id="creator-tax"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="done"
                      maxLength={5}
                      min={0}
                      max={MAX_CREATOR_TAX_PCT}
                      aria-valuemin={0}
                      aria-valuemax={MAX_CREATOR_TAX_PCT}
                      value={creatorTaxPct}
                      onChange={(e) => setCreatorTaxPct(boundCreatorTaxDraft(e.target.value))}
                      onBlur={() => setCreatorTaxPct((current) => commitCreatorTaxDraft(current))}
                      placeholder="2"
                    />
                    <span className="inline-flex h-11 shrink-0 items-center rounded-md border border-border bg-card px-3 text-sm font-medium">
                      % of the 2% fee
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Starts at 2. Stops at {MAX_CREATOR_TAX_PCT}. Traders pay {tradeFeePct}% either way.{" "}
                    <Link to="/docs" className="underline-offset-2 hover:underline">
                      The split
                    </Link>{" "}
                    is in the docs.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Early-buy protection: skip list</Label>
                  <p className="text-xs text-muted-foreground">
                    Your token is protected from bots in its first seconds. Wallets you add here (up to 8) are not slowed down by that protection.{" "}
                    <Link to="/docs" className="underline-offset-2 hover:underline">Details</Link>
                  </p>
                  <div className="space-y-2">
                    {snipeExempt.map((addr, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={addr}
                          onChange={(e) => {
                            const next = [...snipeExempt];
                            next[i] = e.target.value;
                            setSnipeExempt(next);
                          }}
                          placeholder="0x…"
                          className="font-mono"
                        />
                        {snipeExempt.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Remove wallet"
                            onClick={() => setSnipeExempt(snipeExempt.filter((_, j) => j !== i))}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {snipeExempt.length < 8 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSnipeExempt([...snipeExempt, ""])}
                    >
                      <Plus className="size-4" />
                      Add wallet
                    </Button>
                  )}
                  {wallet.address && !buyerExempt && snipeExempt.filter((a) => a.trim()).length < 8 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const blank = snipeExempt.findIndex((a) => !a.trim());
                        if (blank >= 0) {
                          const next = [...snipeExempt];
                          next[blank] = wallet.address!;
                          setSnipeExempt(next);
                        } else {
                          setSnipeExempt([...snipeExempt, wallet.address!]);
                        }
                      }}
                    >
                      Exempt connected wallet
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="web">Website</Label>
                  <Input id="web" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tg">Telegram</Label>
                  <Input id="tg" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="t.me/…" />
                </div>
                  </div>
                </details>
                {lowGas && (
                  <p className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                    <span>Your wallet needs a little more {fees.data?.nativeSymbol ?? "gas"} to launch. <Link to="/start" hash="gas" className="underline">How to get it</Link></span>
                    <Link to="/fund" className="inline-flex shrink-0 items-center gap-1 font-medium text-gold underline-offset-2 hover:underline">
                      <Fuel className="size-4" /> Get gas
                    </Link>
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {fees.data
                    ? `Deploy sends ${formatAmount(fees.data.launchNative)} ${fees.data.nativeSymbol} with this transaction as the launch fee. A small network fee (gas) is added by your wallet.`
                    : "Deploy pays a small launch fee plus a network fee (gas) from your wallet."}
                </p>
                <LaunchTimeline phase={phase} />
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={mut.isPending}>Back</Button>
                  <Button type="submit" variant="gold" className="flex-1" disabled={mut.isPending || !factoryLive}>
                    {mut.isPending
                      ? "Waiting on the wallet…"
                      : wallet.connected
                        ? `Deploy ${pairLabel(symbol || "TOKEN", quoteAsset, " ")}`
                        : "Connect wallet to launch"}
                  </Button>
                </div>
              </>
            )}
          </form>
        </div>
        <aside className="stone-card h-fit rounded-xl p-5">
          <p className="text-sm font-medium">Preview</p>
          {imageUrl ? (
            <SmartImage src={imageUrl} alt="" width={512} height={512} className="mt-3 mx-auto aspect-square w-full max-w-[280px]" rounded="full" />
          ) : (
            <div className="mt-3 mx-auto grid aspect-square w-full max-w-[280px] place-items-center rounded-full border border-dashed border-border text-sm text-muted-foreground">
              A default image is used if you skip this
            </div>
          )}
          <p className="mt-3 font-display text-2xl">{name.trim() || "Your token"}</p>
          <p className="text-sm font-medium">{pairLabel(symbol || "TICKER", quoteAsset, " ")}</p>
          <p className="mt-1 text-xs text-muted-foreground">Name is written on-chain and cannot be changed.</p>
          <p className="text-sm text-muted-foreground">{CHAINS[chain].name}</p>
          <p className="mt-3 text-sm text-muted-foreground">{description || "Describe the pool in your own words."}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Traders pay {tradeFeePct}%. This launch keeps {formatFeePct(shareOfFeePct)}% of that fee
            {holderSharing ? " for holders." : " for the creator wallet."}
          </p>
          {twitter.trim() && (
            <p className="mt-2 text-sm text-muted-foreground">X {cleanSocial(twitter, "x") || twitter}</p>
          )}
          {wallet.address && (
            <p className="mt-4 font-mono text-xs text-muted-foreground break-all">Creator {wallet.address}</p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function LaunchDone({ token, wallet }: { token: { id: string; symbol: string; name: string }; wallet: string | null }) {
  const ref = useQuery({
    queryKey: ["referral-code", wallet],
    queryFn: () => myReferralCode({ data: { wallet: wallet ?? "" } }),
    enabled: Boolean(wallet),
  });
  const refUrl = ref.data && ref.data.ok ? ref.data.url : "";
  const tokenUrl = `https://zenzen.fun/token/${encodeURIComponent(token.id)}`;
  const text = `I just launched $${token.symbol} on @getzenzen. Come trade it:`;
  const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(tokenUrl)}`;
  return (
    <div className="mx-auto max-w-xl px-4 py-14 text-center">
      <p className="mx-auto grid size-12 place-items-center rounded-full bg-gold/15 text-gold"><Check className="size-6" /></p>
      <h1 className="mt-4 text-3xl font-semibold">${token.symbol} is live</h1>
      <p className="mt-2 text-muted-foreground">Get your first buyers. Three real buyers completes the Creator Quest.</p>
      <div className="mt-8 grid gap-3">
        <Button asChild variant="gold" className="h-12">
          <a href={xUrl} target="_blank" rel="noopener noreferrer">Share on X</a>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to="/token/$id" params={{ id: token.id }}>Open the token page</Link>
        </Button>
      </div>
      <div className="mt-8 rounded-xl border border-border bg-card p-4 text-left">
        <p className="text-sm font-medium">Your referral link</p>
        {refUrl ? (
          <div className="mt-2 flex gap-2">
            <Input readOnly value={refUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(refUrl);
                toast.success("Referral link copied.");
              }}
            >
              Copy
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{wallet ? "Loading your link…" : "Connect a wallet to get your link."}</p>
        )}
      </div>
      <p className="mt-6 text-sm">
        <Link to="/airdrop" className="font-medium underline-offset-2 hover:underline">Track the Creator Quest →</Link>
      </p>
    </div>
  );
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Generated image was not readable.");
  const bin = atob(m[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: m[1] });
}

async function developerBuy(input: {
  token: { id: string; curve_address?: string | null; contract_address?: string | null };
  amount: number;
  chain: ChainKey;
  quote: ReturnType<typeof quoteOf>;
  wallet: {
    address: string | null;
    signed: boolean;
    sendTransaction: (tx: { to: string; data: string; value?: bigint; gas?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint }) => Promise<string>;
    waitReceipt: (hash: string) => Promise<{ status: string }>;
    ensureSession: () => Promise<unknown>;
    signIntent: (input: { action: "buy"; tokenId: string; amount: string }) => Promise<Record<string, unknown>>;
  };
}) {
  const curve = input.token.curve_address;
  if (!curve || !isHexAddress(curve)) throw new Error("Curve is not on-chain yet.");
  const from = input.wallet.address;
  if (!from) throw new Error("Connect a wallet first.");
  const preview = quoteBuyWithSnipe(
    {
      virtualBase: input.quote.virtualBase,
      virtualTokens: input.quote.virtualTokens,
      realBase: 0,
      tokensSold: 0,
      feeBps: TRADE_FEE_BPS,
    },
    input.amount,
    LAUNCH_SNIPE_START_BPS,
  );
  if (preview.tokensOut <= 0) throw new Error("Developer buy is too small for this curve.");
  const wei = parseUnits(String(input.amount), input.quote.decimals);
  const minOut = (parseUnits(preview.tokensOut.toFixed(8), 18) * 9_900n) / 10_000n;
  async function send(to: string, data: string, value: bigint = 0n) {
    const prep = await prepareWalletTx({
      data: { chain: input.chain, from: from!, to, data, value: value.toString() },
    });
    if (!prep.ok) throw new Error(prep.error);
    return input.wallet.sendTransaction({ to, data, value: value > 0n ? value : undefined, ...txGas(prep) });
  }
  if (!input.quote.native) {
    const quoteAddr = input.quote.address[input.chain];
    if (!quoteAddr || !isHexAddress(quoteAddr)) throw new Error("This quote asset is not published on this chain.");
    const approveHash = await send(quoteAddr, erc20ApproveCalldata(curve, wei));
    const approved = await input.wallet.waitReceipt(approveHash);
    if (approved.status !== "success") throw new Error("Quote approval reverted.");
  }
  const call = curveBuyCalldata(wei, input.quote.native, minOut);
  const hash = await send(curve, call.data, call.value);
  const receipt = await input.wallet.waitReceipt(hash);
  if (receipt.status !== "success") throw new Error("Developer buy reverted.");
  if (!input.wallet.signed) await input.wallet.ensureSession();
  const signed = await input.wallet.signIntent({ action: "buy", tokenId: input.token.id, amount: String(input.amount) });
  const res = await tradeToken({ data: { id: input.token.id, side: "buy", amount: input.amount, txHash: hash, ...signed } });
  if (!res.ok) throw new Error(res.error);
}

type LaunchPhase = "idle" | "prepare" | "sign" | "confirm" | "index" | "live" | "error";

const LAUNCH_STEPS: { key: Exclude<LaunchPhase, "idle" | "error">; label: string; hint: string }[] = [
  { key: "prepare", label: "Preparing", hint: "Wallet, network and image" },
  { key: "sign", label: "Sign", hint: "Approve in your wallet" },
  { key: "confirm", label: "Confirming", hint: "Waiting for the chain" },
  { key: "index", label: "Opening pool", hint: "Adding it to the board" },
  { key: "live", label: "Live", hint: "Anyone can trade it" },
];

/** Narrates the launch so a wait never looks like a hang. */
function LaunchTimeline({ phase }: { phase: LaunchPhase }) {
  if (phase === "idle") return null;
  const at = LAUNCH_STEPS.findIndex((s) => s.key === phase);
  return (
    <ol aria-label="Launch status" aria-live="polite" className="grid gap-1.5 rounded-xl border border-border bg-card p-3 text-sm">
      {LAUNCH_STEPS.map((s, i) => {
        const done = phase === "live" ? true : at > i;
        const current = at === i && phase !== "live";
        return (
          <li key={s.key} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className={`size-2.5 shrink-0 rounded-full ${done ? "bg-signal" : current ? "animate-pulse bg-gold" : "bg-muted"}`}
            />
            <span className={done || current ? "font-medium text-foreground" : "text-muted-foreground"}>{s.label}</span>
            <span className="text-xs text-muted-foreground">· {s.hint}</span>
          </li>
        );
      })}
      {phase === "error" ? (
        <li className="text-xs text-destructive">That didn't go through. Nothing was launched unless your wallet shows a confirmed transaction. Fix the note above and try again.</li>
      ) : null}
    </ol>
  );
}
