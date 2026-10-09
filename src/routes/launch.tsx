import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Plus, X } from "lucide-react";
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
import { InviteLink } from "@/components/share/invite-link";
import { storedRef } from "@/lib/referral";
import { recordReferral } from "@/lib/server/referral";
import { quoteBuy, quoteBuyWithSnipe } from "@/lib/curve";
import { boundCreatorTaxDraft, clampCreatorTaxBps, commitCreatorTaxDraft, formatFeePct, LAUNCH_SNIPE_START_BPS, MAX_CREATOR_TAX_PCT } from "@/lib/fee-split";
import { NATIVE_ETH, poolFeeLabel } from "@/lib/dex-swap";
import { formatAddress, formatAmount, formatCompact, formatUsd } from "@/lib/format";
import { isTokenArt } from "@/lib/image-art";
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
  const navigate = useNavigate();
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

  const mut = useMutation({
    mutationFn: async () => {
      const meta = parseTokenMeta(name, symbol);
      if (!meta.ok) throw new Error(meta.error);
      if (!isTokenArt(imageUrl)) throw new Error("Upload a token image first.");
      if (!factoryLive) throw new Error("Launch is not open on this chain right now.");
      if (creatorWallet.trim() && !isHexAddress(creatorWallet.trim())) {
        throw new Error("Creator wallet must be a real address, or leave it blank.");
      }
      const exempt = snipeExempt.map((a) => a.trim()).filter(Boolean);
      for (const addr of exempt) {
        if (!isHexAddress(addr)) throw new Error("Snipe exemption wallets must be real addresses.");
      }
      if (!wallet.connected || !wallet.address) await wallet.connect();
      if (wallet.chainId !== CHAINS[chain].id) await wallet.switchChain(chain);
      const pinned = await pinLaunchArt({ data: { imageUrl } });
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
      const hash = await wallet.sendTransaction({
        to: factory,
        data: call.data,
        value: call.value,
        ...txGas(prep),
      });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success") throw new Error("Launch transaction reverted.");
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
          toast.error("Token launched. The Uniswap move could not be armed yet.");
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
          toast.error(err instanceof Error ? err.message : "Token launched. Developer buy did not confirm.");
        }
      }
      return token;
    },
    onSuccess: (token) => {
      const code = storedRef();
      const from = wallet.address;
      if (code && from) void recordReferral({ data: { code, kind: "launch", wallet: from } });
      toast.success("Token launched. You are the recorded creator.");
      navigate({ to: "/token/$id", params: { id: token.id } });
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  return (
    <AppShell znzfPrice={stats.data?.znzfPriceUsd}>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h1 className="text-3xl font-semibold">Create a token</h1>
          <p className="mt-2 text-muted-foreground">
            Name it, pick the pair, and launch.{" "}
            <Link to="/docs" className="font-medium text-stone underline-offset-2 hover:underline">
              Fee rules
            </Link>{" "}
            are in the docs.
          </p>
          <div className="mt-4">
            <InviteLink />
          </div>
          {!factoryLive && (
            <p className="mt-4 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              Launch is not open on {CHAINS[chain].name} right now. Try the other network.
            </p>
          )}
          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              mut.mutate();
            }}
          >
            <ArtPicker value={imageUrl} onChange={setImageUrl} size="hero" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" required minLength={2} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} placeholder="Zenze" />
                <p className="text-xs text-muted-foreground">Written on-chain as the ERC-20 name. Cannot be Unnamed Token.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="symbol">Ticker</Label>
                <Input id="symbol" required maxLength={8} value={symbol} onChange={(e) => setSymbol(cleanTokenSymbol(e.target.value).slice(0, 8))} placeholder="TICKER" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" required maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this pool for?" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="x">X</Label>
              <Input id="x" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@handle" />
              <p className="text-xs text-muted-foreground">Shown on the token page. Website and Telegram sit in Advanced.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Chain</Label>
                <ChainSelect value={chain} onChange={changeChain} />
              </div>
              <div className="space-y-2">
                <Label>Paired asset</Label>
                <PairSelect chain={chain} value={quote} onChange={setQuote} symbol={symbol || "TOKEN"} />
                <QuotePool chain={chain} quote={quote} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="devbuy">Developer buy</Label>
              <div className="flex gap-2">
                <Input
                  id="devbuy"
                  inputMode="decimal"
                  value={devBuy}
                  onChange={(e) => setDevBuy(e.target.value)}
                  placeholder="0"
                />
                <span className="inline-flex h-11 shrink-0 items-center rounded-md border border-border bg-card px-3 text-sm font-medium">
                  {quoteAsset.symbol}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Optional buy right after deploy. Leave 0 to skip. The estimate uses only the 2% fee.
                {devOut > 0
                  ? buyerExempt
                    ? ` This wallet is exempt, so that is about ${formatCompact(devOut)} ${symbol || "TOKEN"}.`
                    : ` About ${formatCompact(devOut)} ${symbol || "TOKEN"} if this wallet is exempt or the buy confirms after 3 seconds. At the launch timestamp, a 99% buy tax stays in the pool and the fill is about ${formatCompact(devOutSniped)}. That tax is not paid to you. List this wallet under exemptions if you want the larger fill.`
                  : ""}
              </p>
            </div>
            <details className="group rounded-xl border border-border">
              <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium">
                Advanced
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-5 border-t border-border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Holder fee sharing</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {holderSharing
                        ? "Holders claim your share of the fee. Locked at launch."
                        : "The creator wallet receives your share of the fee. Turn this on before launch if holders should claim it instead. Locked at launch."}
                    </p>
                  </div>
                  <Switch checked={holderSharing} onCheckedChange={(v) => setHolderSharing(v === true)} aria-label="Holder fee sharing" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creator-wallet">Creator wallet</Label>
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
                  <Label htmlFor="creator-tax">Your slice of the fee</Label>
                  <input
                    id="creator-tax-range"
                    type="range"
                    min={0}
                    max={MAX_CREATOR_TAX_PCT}
                    step={0.01}
                    value={Number.isFinite(Number(creatorTaxPct)) ? Math.min(MAX_CREATOR_TAX_PCT, Math.max(0, Number(creatorTaxPct))) : 0}
                    onChange={(e) => setCreatorTaxPct(commitCreatorTaxDraft(e.target.value))}
                    aria-label="Your slice of the 2% fee, from 0 to 10. Starts at 2."
                    className="mt-1 h-2 w-full cursor-pointer accent-gold"
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
                  <Label>Launch buy-tax exemptions</Label>
                  <p className="text-xs text-muted-foreground">
                    Buys only, for 3 seconds after the launch timestamp. The tax starts at 99% and falls in a straight line to 0% (66% after 1s, 33% after 2s). Sells are not taxed. The tax stays in the pool as liquidity. It is not paid to you. Your wallet is not exempt unless you list it. Up to 8 addresses. Locked at launch.
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
            <p className="text-xs text-muted-foreground">
              {fees.data
                ? `Deploy sends ${formatAmount(fees.data.launchNative)} ${fees.data.nativeSymbol} with this transaction${fees.data.legacyFactory ? " (the factory minimum, when that is above the desk quote)" : ` (about $${Number(fees.data.launchUsd).toFixed(2)} launch take)`}. Network gas is extra. This is not the 2% trade fee.`
                : "Deploy pays the launch take (default $0.50 in the gas token) plus network gas. That is not the 2% trade fee."}
            </p>
            <Button type="submit" variant="gold" className="w-full" disabled={mut.isPending || !factoryLive}>
              {mut.isPending
                ? "Waiting on the wallet…"
                : wallet.connected
                  ? `Deploy ${pairLabel(symbol || "TOKEN", quoteAsset, " ")}`
                  : "Connect wallet to launch"}
            </Button>
          </form>
        </div>
        <aside className="stone-card h-fit rounded-xl p-5">
          <p className="text-sm font-medium">Preview</p>
          {imageUrl ? (
            <SmartImage src={imageUrl} alt="" width={512} height={512} className="mt-3 mx-auto aspect-square w-full max-w-[280px]" rounded="full" />
          ) : (
            <div className="mt-3 mx-auto grid aspect-square w-full max-w-[280px] place-items-center rounded-full border border-dashed border-border text-sm text-muted-foreground">
              Upload art to preview
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
