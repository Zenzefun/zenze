import { useQuery } from "@tanstack/react-query";
import { ChainMark } from "@/components/chains/chain-mark";
import { ArtPicker } from "@/components/tokens/art-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ChainKey } from "@/lib/chains";
import { NATIVE_ETH, poolFeeLabel } from "@/lib/dex-swap";
import { formatAddress, formatUsd } from "@/lib/format";
import { previewDexList } from "@/lib/server/market";
import { readSocial } from "@/lib/socials";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;

export function listingSocials(website: string, twitter: string, telegram: string) {
  const web = readSocial(website, "web");
  if (!web.ok) throw new Error(web.error);
  const x = readSocial(twitter, "x");
  if (!x.ok) throw new Error(x.error);
  const tg = readSocial(telegram, "tg");
  if (!tg.ok) throw new Error(tg.error);
  return { website: web.value, twitter: x.value, telegram: tg.value };
}

export function useListingPool(chain: ChainKey, contract: string) {
  const address = contract.trim();
  const ready = ADDRESS.test(address);
  return useQuery({
    queryKey: ["dex-list-preview", chain, address.toLowerCase()],
    queryFn: () => previewDexList({ data: { chain, contract: address } }),
    enabled: ready,
    retry: false,
    staleTime: 30_000,
  });
}

export function ListingFields({
  chain,
  onChain: _onChain,
  contract,
  onContract,
  imageUrl,
  onImage,
  description,
  onDescription,
  website,
  onWebsite,
  twitter,
  onTwitter,
  telegram,
  onTelegram,
}: {
  chain: ChainKey;
  onChain: (chain: ChainKey) => void;
  contract: string;
  onContract: (value: string) => void;
  imageUrl: string;
  onImage: (value: string) => void;
  description: string;
  onDescription: (value: string) => void;
  website: string;
  onWebsite: (value: string) => void;
  twitter: string;
  onTwitter: (value: string) => void;
  telegram: string;
  onTelegram: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Chain</Label>
        <div className="flex h-12 items-center gap-3 rounded-xl border border-border bg-card px-3 text-sm">
          <ChainMark chain="robinhood" className="size-7" />
          <span className="font-medium">Robinhood Chain</span>
        </div>
        <p className="text-xs text-muted-foreground">A listing reads a Uniswap v4 pool on Robinhood Chain.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ca">Contract</Label>
        <Input id="ca" required value={contract} onChange={(e) => onContract(e.target.value)} placeholder="0x…" className="font-mono" />
      </div>
      <PoolCard chain={chain} contract={contract} />
      <ArtPicker value={imageUrl} onChange={onImage} />
      <div className="space-y-2">
        <Label htmlFor="desc">Description</Label>
        <Textarea id="desc" required maxLength={280} value={description} onChange={(e) => onDescription(e.target.value)} placeholder="What should people know about this token?" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="web">Website</Label>
        <Input id="web" value={website} onChange={(e) => onWebsite(e.target.value)} placeholder="https://" inputMode="url" autoComplete="url" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="x">X</Label>
        <Input id="x" value={twitter} onChange={(e) => onTwitter(e.target.value)} placeholder="@handle" autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tg">Telegram</Label>
        <Input id="tg" value={telegram} onChange={(e) => onTelegram(e.target.value)} placeholder="t.me/…" autoComplete="off" />
      </div>
      <p className="text-xs text-muted-foreground">Website, X, and Telegram show on the token page. Leave a field blank if there is none.</p>
    </>
  );
}

function PoolCard({ chain, contract }: { chain: ChainKey; contract: string }) {
  const ready = ADDRESS.test(contract.trim());
  const pool = useListingPool(chain, contract);
  const row = pool.data?.ok ? pool.data : null;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <p className="font-medium">Pool</p>
      {!ready && (
        <p className="mt-1 text-muted-foreground">Paste the contract. The Uniswap pool fills itself. You do not type it.</p>
      )}
      {ready && pool.isPending && <p className="mt-1 text-muted-foreground">Reading the pool…</p>}
      {ready && pool.data && !pool.data.ok && <p className="mt-1 text-destructive">{pool.data.error}</p>}
      {ready && pool.isError && <p className="mt-1 text-destructive">The pool could not be read. Try again.</p>}
      {row && (
        <dl className="mt-2 grid gap-1 text-muted-foreground">
          <div className="flex justify-between gap-3">
            <dt>Pair</dt>
            <dd className="font-medium text-foreground">{row.symbol || "TOKEN"} / {row.quote}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Pool id</dt>
            <dd className="font-mono text-xs text-foreground">{formatAddress(row.poolId)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Fee</dt>
            <dd className="text-foreground">{poolFeeLabel(row.fee)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Tick spacing</dt>
            <dd className="text-foreground">{row.tickSpacing}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Hook</dt>
            <dd className="font-mono text-xs text-foreground">
              {row.hooks.toLowerCase() === NATIVE_ETH ? "none" : formatAddress(row.hooks)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Price</dt>
            <dd className="text-foreground">{formatUsd(row.priceUsd)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Liquidity</dt>
            <dd className="text-foreground">{row.liquidityUsd > 0 ? formatUsd(row.liquidityUsd) : "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
