import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { CHAINS, DEFAULT_CREATOR_TAX_BPS, MAX_CREATOR_TAX_BPS, TRADE_FEE_BPS, type ChainKey } from "@/lib/chains";
import { curveBuyCalldata, erc20ApproveCalldata, launchCalldata } from "@/lib/contracts";
import { InviteLink } from "@/components/share/invite-link";
import { storedRef } from "@/lib/referral";
import { recordReferral } from "@/lib/server/referral";
import { quoteBuy } from "@/lib/curve";
import { formatCompact } from "@/lib/format";
import { isTokenArt } from "@/lib/image-art";
import { isHexAddress } from "@/lib/intent";
import { defaultQuote, pairLabel, quoteOf, type QuoteKey } from "@/lib/pairs";
import { publishedConfig } from "@/lib/onchain";
import { feeQuote, launchToken, pinLaunchArt, prepareWalletTx, protocolStats, publicConfig, tradeToken } from "@/lib/server/market";
import { pageHead } from "@/lib/seo";
import { cleanSocial } from "@/lib/socials";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";
import { parseTokenMeta } from "@/lib/token-name";

export const Route = createFileRoute("/launch")({
  component: Launch,
  head: () =>
    pageHead({
      title: "Launch",
      description: "Name your token and buy it first. You keep the creator share you set.",
      path: "/launch",
    }),
});

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
  const znzfLive = Boolean(znzf && /^0x[a-fA-F0-9]{40}$/.test(znzf));
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
  const devOut = Number.isFinite(devAmt) && devAmt > 0 ? quoteBuy(previewCurve, devAmt).tokensOut : 0;
  const tradeFeePct = (TRADE_FEE_BPS / 100).toFixed(2);

  function changeChain(next: ChainKey) {
    setChain(next);
    setQuote(defaultQuote(next));
  }

  function creatorTaxBps(): number {
    const n = Number(creatorTaxPct.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return 0;
    const bps = Math.round(n * 100);
    if (bps < 0) return 0;
    if (bps > MAX_CREATOR_TAX_BPS) return MAX_CREATOR_TAX_BPS;
    return bps;
  }

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
          <p className="mt-2 text-muted-foreground">Name it, buy first, and keep the creator share you set.</p>
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
                <Input id="symbol" required maxLength={8} value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="TICKER" />
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
                <PairSelect chain={chain} value={quote} onChange={setQuote} symbol={symbol || "TOKEN"} znzfLive={znzfLive} />
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
                Optional first buy on the curve, confirmed right after deploy. Leave 0 to skip.
                {devOut > 0 ? ` ≈ ${formatCompact(devOut)} ${symbol || "TOKEN"}.` : ""}
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
                        ? "Holders split the creator share and claim it on the token page or in Portfolio. This choice is locked at launch."
                        : "Creator fees go to the creator wallet. Turn this on before launch if holders should receive that share instead."}
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
                    Receives creator fees and the creator tax. Leave blank to use your connected wallet.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creator-tax">Creator tax %</Label>
                  <Input
                    id="creator-tax"
                    inputMode="decimal"
                    value={creatorTaxPct}
                    onChange={(e) => setCreatorTaxPct(e.target.value)}
                    placeholder="10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Traders pay {tradeFeePct}% in total, up to 10% of it yours.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Snipe tax exemptions</Label>
                  <p className="text-xs text-muted-foreground">
                    Buys in the launch second pay 99%, decaying to zero across 3s. Declare the wallets your team opens with.
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
            <Button type="submit" variant="gold" className="w-full" disabled={mut.isPending || !factoryLive}>
              {mut.isPending
                ? "Waiting on the wallet…"
                : wallet.connected
                  ? `Deploy ${pairLabel(symbol || "TOKEN", quoteAsset)}`
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
          <p className="text-sm font-medium">{pairLabel(symbol || "TICKER", quoteAsset)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Name is written on-chain and cannot be changed.</p>
          <p className="text-sm text-muted-foreground">{CHAINS[chain].name}</p>
          <p className="mt-3 text-sm text-muted-foreground">{description || "Describe the pool in your own words."}</p>
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
  const preview = quoteBuy(
    {
      virtualBase: input.quote.virtualBase,
      virtualTokens: input.quote.virtualTokens,
      realBase: 0,
      tokensSold: 0,
      feeBps: TRADE_FEE_BPS,
    },
    input.amount,
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
