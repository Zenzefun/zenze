import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CHAINS } from "@/lib/chains";
import { launchFactoryDeploy } from "@/lib/contracts";
import { isHexAddress } from "@/lib/intent";
import { isRetiredAddress, publishedConfig } from "@/lib/onchain";
import { adminOverview, connectXSession, saveConfig, xDesk } from "@/lib/server/admin";
import { publicWalletError, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/arise/settings")({ component: AdminSettings });

const LIVE = [
  ["Robinhood", "$ZNZF", "znzf_robinhood"],
  ["Robinhood", "Fee vault", "vault_robinhood"],
  ["Robinhood", "Launch factory", "factory_robinhood"],
  ["Robinhood", "$ZNZF pool", "znzf_curve_robinhood"],
  ["Robinhood", "Fee intake", "intake_robinhood"],
  ["Robinhood", "Buyback splitter", "splitter_robinhood"],
  ["Robinhood", "Buyback burner", "buyback_robinhood"],
  ["Robinhood", "Stake", "stake_robinhood"],
  ["Robinhood", "Fee router", "router_robinhood"],
  ["Robinhood", "Drop", "drop_robinhood"],
  ["Robinhood", "Lock side", "bridge_robinhood"],
  ["Arc", "$ZNZF", "znzf_arc"],
  ["Arc", "Fee vault", "vault_arc"],
  ["Arc", "Launch factory", "factory_arc"],
  ["Arc", "Release side", "bridge_arc"],
] as const;

const SECRET_FIELDS = [
  ["pinata_jwt", "Pinata JWT", "Pins launch art to public IPFS."],
  ["dune_api_key", "Dune API key", "Powers Analytics."],
  ["deepseek_api_key", "DeepSeek API key", "Used only on this desk. Visitors never see the drafts."],
  ["xai_api_key", "xAI API key", "Backup if DeepSeek is down. Desk only."],
  ["twitterapis_key", "TwitterAPIs key", "Posts and reads as @ZenzeFun via twitterapis.com."],
  ["x_auth_token", "X auth_token cookie", "From x.com → Application → Cookies. Lets the desk publish."],
  ["x_ct0", "X ct0 cookie", "CSRF cookie paired with auth_token."],
  ["x_bearer_token", "X bearer token", "Optional official API fallback."],
  ["x_api_key", "X API key", "Optional X consumer key."],
  ["x_api_secret", "X API secret", "Optional X consumer secret."],
  ["x_oauth_client_id", "X OAuth client id", "Not used for the drop. The 5-point check reads a public post, so no paid X API is required."],
  ["x_oauth_client_secret", "X OAuth client secret", "Paired with the OAuth client id. Leave empty only if the X app is a public client."],
  ["telegram_bot_token", "Telegram bot token", "From @BotFather. Maya sends with this. Turn off group privacy so she can read the room."],
  ["telegram_chat_id", "Telegram chat id", "The group or channel id, or @username. This is the community room."],
] as const;

function AdminSettings() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: () => adminOverview(), retry: false });
  const x = useQuery({ queryKey: ["x-desk"], queryFn: () => xDesk(), retry: false });
  const linkX = useMutation({
    mutationFn: () => connectXSession(),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success(res.username ? `X session live as @${res.username}.` : "X session linked.");
      void x.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const save = useMutation({
    mutationFn: (input: { key: string; value: string }) => saveConfig({ data: input }),
    onSuccess: (res, input) => {
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else {
        toast.success(input.key === "reown_project_id" ? "Saved. Reload the site so wallets pick up the new Project ID." : "Saved.");
      }
      q.refetch();
    },
  });
  const cfg = q.data && q.data.ok ? q.data.config : {};
  const keys = q.data && q.data.ok ? (q.data.keys ?? {}) : {};
  const [draft, setDraft] = useState<Record<string, string>>({});

  function setKey(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <div className="max-w-3xl space-y-10 page-enter">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-stone">Desk</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Settings</h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          What visitors see is decided here. A switch on this page is live on the site.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          $ZNZF and its pool stay on Robinhood. Arc only releases the same coin when someone locks it. Arc does not run buyback.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Maintenance</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Visitors see the closed page. This desk stays open so you can turn it off.</p>
          </div>
          <Switch
            checked={cfg.maintenance === "true"}
            onCheckedChange={(v) => save.mutate({ key: "maintenance", value: v ? "true" : "false" })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance_message">Closed-onsen note</Label>
          <Textarea
            id="maintenance_message"
            rows={3}
            className="min-h-20"
            placeholder="Capy is soaking. Zenzen will open again when the water settles."
            value={draft.maintenance_message ?? cfg.maintenance_message ?? ""}
            onChange={(e) => setKey("maintenance_message", e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => save.mutate({ key: "maintenance_message", value: draft.maintenance_message ?? cfg.maintenance_message ?? "" })}
          >
            Save note
          </Button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="font-medium">Reown AppKit</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Phones use this id to show a WalletConnect code.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Paste the 32-character id from{" "}
            <a href="https://dashboard.reown.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              dashboard.reown.com
            </a>
            . Without it, OKX still opens in its own browser.
          </p>
        </div>
        {keys.reown_project_id?.set && (
          <p className="font-mono text-xs text-muted-foreground">Live: {keys.reown_project_id.hint}</p>
        )}
        <Input
          id="reown_project_id"
          autoComplete="off"
          spellCheck={false}
          placeholder={cfg.reown_project_id || "32-character project id"}
          value={draft.reown_project_id ?? cfg.reown_project_id ?? ""}
          onChange={(e) => setKey("reown_project_id", e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={() => save.mutate({ key: "reown_project_id", value: (draft.reown_project_id ?? "").trim() })}>
          Save Project ID
        </Button>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="font-medium">Protocol takes</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            These are the prices a visitor pays to launch or to list.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Change one and the next quote uses it. Network gas is extra.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="launch_fee_usd">Launch take (USD)</Label>
            <Input
              id="launch_fee_usd"
              type="number"
              min="0"
              max="10000"
              step="0.01"
              placeholder={cfg.launch_fee_usd || "0.5"}
              value={draft.launch_fee_usd ?? cfg.launch_fee_usd ?? "0.5"}
              onChange={(e) => setKey("launch_fee_usd", e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => save.mutate({ key: "launch_fee_usd", value: (draft.launch_fee_usd ?? cfg.launch_fee_usd ?? "0.5").trim() })}
            >
              Save launch take
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="listing_fee_usd">List take (USD)</Label>
            <Input
              id="listing_fee_usd"
              type="number"
              min="0"
              max="10000"
              step="0.01"
              placeholder={cfg.listing_fee_usd || "19"}
              value={draft.listing_fee_usd ?? cfg.listing_fee_usd ?? "19"}
              onChange={(e) => setKey("listing_fee_usd", e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => save.mutate({ key: "listing_fee_usd", value: (draft.listing_fee_usd ?? cfg.listing_fee_usd ?? "19").trim() })}
            >
              Save list take
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="font-medium">API keys</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Paste a new value to replace the old one. Leave a field empty to keep what is already saved.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            These keys never appear on the public site.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {[
            ["reown_project_id", "Reown"],
            ["pinata_jwt", "Pinata"],
            ["deepseek_api_key", "DeepSeek Flash"],
            ["twitterapis_key", "TwitterAPIs"],
            ["x_auth_token", "X auth_token"],
            ["x_ct0", "X ct0"],
            ["dune_api_key", "Dune"],
            ["xai_api_key", "xAI"],
          ].map(([key, label]) => {
            const live = key === "reown_project_id" ? keys.reown_project_id : keys[key];
            const on = Boolean(live?.set) || (key === "reown_project_id" && Boolean(cfg.reown_project_id));
            return (
              <li key={key} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span>{label}</span>
                <span className={on ? "font-medium text-moss" : "text-destructive"}>{on ? live?.hint || "live" : "not set"}</span>
              </li>
            );
          })}
        </ul>
        {q.data && q.data.ok && (
          <p className="text-xs text-muted-foreground">
            Pinata gateway {cfg.pinata_gateway || "default"} · IPFS {q.data.pinata ? "live" : "off"} · X {x.data?.ready ? `@${x.data.username || x.data.handle}` : x.data?.note || "checking…"}
          </p>
        )}
        {SECRET_FIELDS.map(([key, label, hint]) => (
          <div key={key} className="space-y-2">
            <Label htmlFor={key}>{label}</Label>
            <p className="text-xs text-muted-foreground">
              {hint} {keys[key]?.set ? `· ${keys[key].hint}` : "· not set"}
            </p>
            <Input
              id={key}
              type="password"
              autoComplete="off"
              placeholder={keys[key]?.set ? "•••• keep current" : "Paste key"}
              value={draft[key] ?? ""}
              onChange={(e) => setKey(key, e.target.value)}
            />
            <Button size="sm" variant="outline" onClick={() => save.mutate({ key, value: draft[key] ?? "" })}>
              Save
            </Button>
          </div>
        ))}
        <div className="space-y-2">
          <Label htmlFor="pinata_gateway">Pinata gateway</Label>
          <Input
            id="pinata_gateway"
            placeholder={cfg.pinata_gateway || "https://….mypinata.cloud"}
            value={draft.pinata_gateway ?? cfg.pinata_gateway ?? ""}
            onChange={(e) => setKey("pinata_gateway", e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => save.mutate({ key: "pinata_gateway", value: draft.pinata_gateway ?? "" })}>
            Save
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="x_handle">X handle</Label>
          <Input
            id="x_handle"
            placeholder={cfg.x_handle || "ZenzeFun"}
            value={draft.x_handle ?? cfg.x_handle ?? ""}
            onChange={(e) => setKey("x_handle", e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={() => save.mutate({ key: "x_handle", value: draft.x_handle ?? "" })}>
            Save
          </Button>
        </div>
        <div className="rounded-lg bg-muted/60 p-3 text-sm">
          <p className="font-medium">@ZenzeFun session</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {x.data?.note ?? "Checking TwitterAPIs…"}
            {x.data?.username ? ` · @${x.data.username}` : ""}
            {x.data?.ping && !x.data.ping.ok ? ` · key ${x.data.ping.error}` : x.data?.ping?.ok ? " · TwitterAPIs live" : ""}
            {x.data?.auto ? ` · autonomous ${x.data.auto.on ? "on" : "paused"} · ${x.data.auto.minutes}m` : ""}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={linkX.isPending}
            onClick={() => linkX.mutate()}
          >
            {linkX.isPending ? "Linking…" : "Link X session"}
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="font-medium">Robinhood Chain</p>
          <p className="text-xs text-muted-foreground">Canonical $ZNZF · ETH gas</p>
        </div>
        <Switch
          checked={cfg.robinhood_enabled !== "false"}
          onCheckedChange={(v) => save.mutate({ key: "robinhood_enabled", value: v ? "true" : "false" })}
        />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
        <div>
          <p className="font-medium">Arc Chain</p>
          <p className="text-xs text-muted-foreground">Bridged $ZNZF · USDC gas</p>
        </div>
        <Switch
          checked={cfg.arc_enabled !== "false"}
          onCheckedChange={(v) => save.mutate({ key: "arc_enabled", value: v ? "true" : "false" })}
        />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 text-sm">
        <p className="font-medium">Treasury / deployer</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{cfg.deployer || "Not set"}</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 md:p-6 text-sm">
        <p className="font-medium">Token art</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {q.data && q.data.ok && q.data.pinata
            ? "IPFS pinning is live. Uploaded launch images pin publicly, then the gateway URL is stored."
            : "Images stay as cropped local data until Pinata is set above."}
        </p>
      </div>
      <div className="space-y-5">
        <PublishLaunchFactory
          vaultRobinhood={cfg.vault_robinhood}
          vaultArc={cfg.vault_arc}
          factoryRobinhood={cfg.factory_robinhood}
          factoryArc={cfg.factory_arc}
          onSaved={() => q.refetch()}
        />
        <PublishZnzfCurve curve={cfg.znzf_curve_robinhood} migrator={cfg.znzf_v4_migrator} />
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <h2 className="font-display text-lg font-semibold">Published contracts</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Every address below already has code. A blank box was only an empty form, not a missing contract.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Arc has the token, the vault, the factory, and the bridge. It has no $ZNZF pool and no buyback. Adding either would mint a second supply. The desk will not do that.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The Arc token is the one that already holds the locked amount. The vault names that same token. An earlier Arc token with supply 0 is not the live one.
          </p>
          <ul className="mt-5 divide-y divide-border">
            {LIVE.map(([chain, label, key]) => {
              const addr = cfg[key];
              return (
                <li key={key} className="grid gap-1 py-3 sm:grid-cols-[7rem_9rem_1fr] sm:items-baseline">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{chain}</span>
                  <span className="text-sm font-medium">{label}</span>
                  <span className="break-all font-mono text-xs text-muted-foreground">{addr?.startsWith("0x") ? addr : "Not published"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function keptAddress(value?: string) {
  return isHexAddress(value) && !isRetiredAddress(value) ? value : "";
}

function PublishZnzfCurve({
  curve,
  migrator,
}: {
  curve?: string;
  migrator?: string;
}) {
  const liveCurve = keptAddress(curve) || keptAddress(publishedConfig().znzf_curve_robinhood);
  const liveMigrator = keptAddress(migrator) || keptAddress(publishedConfig().znzf_v4_migrator);

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 md:p-6">
      <p className="font-medium">$ZNZF pool</p>
      <p className="text-sm leading-relaxed text-muted-foreground">
        This pool is already on Robinhood. It does not move to Uniswap. Arc has no second pool. The fee rules are in the docs.
      </p>
      {liveCurve ? (
        <p className="break-all font-mono text-xs text-muted-foreground">Live pool {liveCurve}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No pool address is published. This desk will not mint another supply.</p>
      )}
      {liveMigrator && <p className="break-all font-mono text-xs text-muted-foreground">Migrator {liveMigrator}</p>}
    </div>
  );
}

function PublishLaunchFactory({
  vaultRobinhood,
  vaultArc,
  factoryRobinhood,
  factoryArc,
  onSaved,
}: {
  vaultRobinhood?: string;
  vaultArc?: string;
  factoryRobinhood?: string;
  factoryArc?: string;
  onSaved: () => void;
}) {
  const wallet = useWallet();
  const [busy, setBusy] = useState<string | null>(null);

  async function publish(chain: "robinhood" | "arc") {
    const vault = keptAddress(chain === "arc" ? vaultArc : vaultRobinhood);
    const key = chain === "arc" ? "factory_arc" : "factory_robinhood";
    if (!isHexAddress(vault)) {
      toast.error(`Fee vault is missing on ${CHAINS[chain].name}.`);
      return;
    }
    try {
      setBusy(chain);
      if (!wallet.connected) await wallet.connect();
      if (wallet.chainId !== CHAINS[chain].id) await wallet.switchChain(chain);
      const data = launchFactoryDeploy(vault);
      const hash = await wallet.sendTransaction({ data });
      const receipt = await wallet.waitReceipt(hash);
      if (receipt.status !== "success" || !receipt.contractAddress) {
        throw new Error("Factory deploy did not return a contract.");
      }
      const saved = await saveConfig({ data: { key, value: receipt.contractAddress } });
      if (!saved.ok) throw new Error(saved.error ?? "Could not save the factory address.");
      toast.success(`${CHAINS[chain].name} factory is on-chain. Launch take is now the desk USD quote.`);
      onSaved();
    } catch (err) {
      toast.error(publicWalletError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 md:p-6">
      <p className="font-medium">Launch factory</p>
      <p className="text-xs text-muted-foreground">
        New factory bytecode: holder fee sharing, a creator slice that starts at 2% of the 2% swap fee and stops at 10% of it, and 3s buy-tax exemptions. Launch take is the USD quote above plus network gas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["robinhood", "arc"] as const).map((chain) => {
          const live = keptAddress(chain === "arc" ? factoryArc : factoryRobinhood);
          return (
            <div key={chain} className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">{CHAINS[chain].name}</p>
              {isHexAddress(live) ? (
                <p className="break-all font-mono text-[11px] text-muted-foreground">{live}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No factory saved yet.</p>
              )}
              {isHexAddress(live) ? (
                <p className="text-xs text-muted-foreground">Already published. A second factory is not created from here.</p>
              ) : (
                <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void publish(chain)}>
                  {busy === chain ? "Deploying…" : "Publish factory"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
