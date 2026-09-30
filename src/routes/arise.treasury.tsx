import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHAINS, ZERO_ADDRESS } from "@/lib/chains";
import { intakeForwardCalldata, routerRunCalldata, splitterHeldCalldata, splitterInventoryCalldata, splitterValueCalldata, vaultBurnCalldata, vaultSweepCalldata } from "@/lib/contracts";
import { quoteBuy } from "@/lib/curve";
import { formatEth } from "@/lib/format";
import { isHexAddress } from "@/lib/intent";
import { treasurySnapshot } from "@/lib/server/admin";
import { prepareWalletTx } from "@/lib/server/market";
import { publicWalletError, txGas, useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/arise/treasury")({ component: AdminTreasury });

function minOutFor(chain: NonNullable<Extract<Awaited<ReturnType<typeof treasurySnapshot>>, { ok: true }>["chain"]>, ethIn: number) {
  const quoted = quoteBuy(
    {
      virtualBase: chain.virtualBase,
      virtualTokens: chain.virtualTokens,
      realBase: chain.realBase,
      tokensSold: chain.tokensSold,
      feeBps: chain.feeBps,
    },
    ethIn,
  );
  const min = quoted.tokensOut * 0.98;
  if (!(min > 0)) return 0n;
  return parseUnits(min.toFixed(8), 18);
}

function AdminTreasury() {
  const wallet = useWallet();
  const q = useQuery({ queryKey: ["treasury"], queryFn: () => treasurySnapshot(), refetchInterval: 20_000 });
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState("");

  async function send(label: string, to: string, data: string, value = 0n) {
    if (!wallet.connected || !wallet.address) await wallet.connect();
    if (wallet.chainId !== CHAINS.robinhood.id) await wallet.switchChain("robinhood");
    const from = wallet.address;
    if (!from) throw new Error("Connect the treasury wallet.");
    setBusy(label);
    const prep = await prepareWalletTx({ data: { chain: "robinhood", from, to, data, value: value.toString() } });
    if (!prep.ok) throw new Error(prep.error);
    const hash = await wallet.sendTransaction({ to, data, value: value > 0n ? value : undefined, ...txGas(prep) });
    const receipt = await wallet.waitReceipt(hash);
    if (receipt.status !== "success") throw new Error("Transaction reverted.");
    toast.success(`${label} confirmed.`);
    await q.refetch();
  }

  const act = useMutation({
    mutationFn: async (run: () => Promise<void>) => {
      try {
        await run();
      } finally {
        setBusy("");
      }
    },
    onError: (err) => toast.error(publicWalletError(err)),
  });

  if (!q.data || !q.data.ok) return <p className="text-sm text-muted-foreground">Loading treasury…</p>;
  const d = q.data;
  const chain = d.chain;
  const eth = Number(amount);
  const explorer = CHAINS.robinhood.explorer;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Treasury</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every action on this page is a Robinhood Chain transaction from the connected wallet. Nothing is marked sent in a database.
        </p>
      </div>
      {d.chainError && <p className="text-sm text-destructive">{d.chainError}</p>}
      {chain && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Desk vault ETH" value={formatEth(chain.vaultEth)} />
            <Stat label="Desk vault $ZNZF" value={formatEth(chain.vaultZnzf)} />
            <Stat label="Burned $ZNZF" value={formatEth(chain.burned)} />
            <Stat label="Curve reserve ETH" value={formatEth(chain.curveEth)} />
            <Stat label="Curve sold" value={formatEth(chain.tokensSold)} />
            <Stat label="Buyback burned" value={formatEth(chain.burnedByBuyback)} />
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <Addr label="Desk vault" href={`${explorer}/address/${chain.vault}`} value={chain.vault} />
            <Addr label="$ZNZF curve" href={`${explorer}/address/${chain.curve}`} value={chain.curve} />
            <Addr label="Buyback burner" href={chain.buyback ? `${explorer}/address/${chain.buyback}` : undefined} value={chain.buyback || "Not published"} />
            <Addr label="Fee intake" href={chain.intake ? `${explorer}/address/${chain.intake}` : undefined} value={chain.intake || "Not published"} />
            <Addr label="Buyback splitter" href={chain.splitter ? `${explorer}/address/${chain.splitter}` : undefined} value={chain.splitter || "Not published"} />
            <Addr label="Curve fee vault" href={`${explorer}/address/${chain.curveFeeVault}`} value={chain.curveFeeVault} />
            {!chain.curveFeeVaultIsDesk && (
              <p className="text-sm text-foreground">
                The live $ZNZF curve pays fees to {chain.curveFeeVault}, not the desk vault. That recipient was set when the curve was deployed and this wallet cannot retarget it. Factory launches still pay the desk vault. Buyback spends ETH you send, then burns the $ZNZF it buys.
              </p>
            )}
          </div>
          <form
            className="stone-card space-y-3 rounded-xl p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chain.splitter) {
                toast.error("Buyback splitter is not published.");
                return;
              }
              if (!(eth > 0)) {
                toast.error("Enter an ETH amount.");
                return;
              }
              const minOut = minOutFor(chain, eth);
              const value = parseUnits(eth.toFixed(8), 18);
              void act.mutate(async () => {
                await send("Buyback and burn", chain.splitter, splitterValueCalldata(minOut), value);
              });
            }}
          >
            <p className="font-medium">Buy back and burn</p>
            <p className="text-xs text-muted-foreground">
              Sends ETH through the splitter to the burner. The burner buys $ZNZF on the curve and burns it in the same transaction. 2% slippage floor. The burner only accepts this from the splitter.
            </p>
            <div className="space-y-1">
              <Label htmlFor="amt">ETH to spend</Label>
              <Input id="amt" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="gold" disabled={act.isPending || !chain.splitter || chain.graduated}>
                {busy === "Buyback and burn" ? "Waiting on the wallet…" : "Buy back and burn"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={act.isPending || !chain.splitter || chain.splitterEth <= 0}
                onClick={() => {
                  const minOut = minOutFor(chain, chain.splitterEth);
                  const wei = parseUnits(chain.splitterEth.toFixed(8), 18);
                  void act.mutate(async () => {
                    await send("Burn splitter ETH", chain.splitter, splitterInventoryCalldata(wei, minOut));
                  });
                }}
              >
                Burn ETH on the splitter ({formatEth(chain.splitterEth)})
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={act.isPending || !chain.splitter || chain.buybackEth <= 0}
                onClick={() => {
                  const minOut = minOutFor(chain, chain.buybackEth);
                  void act.mutate(async () => {
                    await send("Burn ETH on the burner", chain.splitter, splitterHeldCalldata(minOut));
                  });
                }}
              >
                Burn ETH already on the burner ({formatEth(chain.buybackEth)})
              </Button>
            </div>
          </form>
          <div className="stone-card space-y-3 rounded-xl p-4">
            <p className="font-medium">Desk vault</p>
            <p className="text-sm text-foreground">
              Fees on the live curve still arrive here. One router call sweeps the vault’s buyback share into the intake, forwards it to the splitter, and burns it through the curve. The live $ZNZF curve does not migrate. Arc has no buyback.
            </p>
            <p className="text-xs text-muted-foreground">
              Intake {formatEth(chain.intakeEth)} ETH. Splitter {formatEth(chain.splitterEth)} ETH. Owner-only.
            </p>
            <div className="flex flex-wrap gap-2">
              {chain.router ? (
                <Button
                  type="button"
                  disabled={act.isPending || (chain.vaultEth <= 0 && chain.intakeEth <= 0 && chain.splitterEth <= 0)}
                  onClick={() => {
                    void act.mutate(async () => {
                      await send("Run buyback", chain.router, routerRunCalldata(0n));
                    });
                  }}
                >
                  Run buyback
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={act.isPending || Boolean(chain.router) || !chain.intake || chain.vaultEth <= 0 || chain.buybackBps <= 0}
                onClick={() => {
                  const share = (chain.vaultEth * chain.buybackBps) / 10_000;
                  const wei = parseUnits(share.toFixed(8), 18);
                  void act.mutate(async () => {
                    await send("Sweep vault to intake", chain.vault, vaultSweepCalldata(chain.intake, wei));
                  });
                }}
              >
                Sweep {chain.buybackBps / 100}% of vault ETH to intake
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={act.isPending || !chain.intake || chain.intakeEth <= 0}
                onClick={() => {
                  const wei = parseUnits(chain.intakeEth.toFixed(8), 18);
                  void act.mutate(async () => {
                    await send("Forward intake", chain.intake, intakeForwardCalldata(ZERO_ADDRESS, wei));
                  });
                }}
              >
                Forward intake ETH to splitter
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={act.isPending || chain.vaultZnzf <= 0}
                onClick={() => {
                  const wei = parseUnits(chain.vaultZnzf.toFixed(8), 18);
                  void act.mutate(async () => {
                    await send("Burn vault $ZNZF", chain.vault, vaultBurnCalldata(wei));
                  });
                }}
              >
                Burn vault $ZNZF
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stone-card rounded-xl p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums">{value}</p>
    </div>
  );
}

function Addr({ label, value, href }: { label: string; value: string; href?: string }) {
  const body = isHexAddress(value) ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  return (
    <p>
      {label}:{" "}
      {href ? (
        <a className="font-mono text-foreground underline-offset-2 hover:underline" href={href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <span className="font-mono text-foreground">{body}</span>
      )}
    </p>
  );
}
