import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { publishedConfig } from "@/lib/onchain";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/guide")({
  component: Guide,
  head: () =>
    pageHead({
      title: "Guide",
      description: "Buy $ZNZF, launch your own token, or list one you already have.",
      path: "/guide",
    }),
});

function Guide() {
  const cfg = publishedConfig();
  const robinhood = cfg.znzf_robinhood?.startsWith("0x") ? cfg.znzf_robinhood : "";
  const arc = cfg.znzf_arc?.startsWith("0x") ? cfg.znzf_arc : "";
  return (
    <AppShell>
      <article className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-semibold">Guide</h1>
        <p className="mt-2 text-muted-foreground">Buy $ZNZF, launch your own, or list one you already have.</p>

        <h2 className="mt-10 text-2xl font-semibold">1. Connect</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Tap Wallet. That list is the only way to connect. Then pick Robinhood Chain or Arc.</li>
        </ol>

        <h2 className="mt-10 text-2xl font-semibold">2. Launch or list</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            <Link to="/launch" className="underline">
              Launch
            </Link>{" "}
            a new pool — connect, upload art, pick a pair, sign. The launch take is paid on-chain with that transaction.
          </li>
          <li>
            Or{" "}
            <Link to="/list" className="underline">
              list
            </Link>{" "}
            a token that already exists. The page reads the contract. You pay the listing take in that same transaction. Share a list
            link with your wallet in the <code className="text-foreground">ref</code> field — you earn a cut of that payment.
          </li>
          <li>Buy and sell launched pools on the curve against ETH, USDG, USDC, $ZNZF, or Robinhood stock tokens. Listed tokens open on the chain explorer.</li>
        </ol>

        <h2 className="mt-10 text-2xl font-semibold">3. $ZNZF</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          1,000,000,000 $ZNZF was minted on Robinhood Chain. Buyback burns reduce the supply. Name{" "}
          <strong className="text-foreground">Zenze</strong>, ticker <strong className="text-foreground">ZNZF</strong>, 18
          decimals. The Arc token grows only when canonical tokens are locked.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Canonical (Robinhood):{" "}
            <code className="break-all text-foreground">{robinhood || "not published"}</code>
            . Curve:{" "}
            <code className="break-all text-foreground">0xda1650faaec372925c9211e6625ba5d9a4397d57</code>
          </li>
          <li>
            Bridged (Arc): <code className="break-all text-foreground">{arc || "not published"}</code>
            . Same address text as Robinhood, different contract. It only grows when canonical tokens are locked.
          </li>
        </ul>

        <h2 className="mt-10 text-2xl font-semibold">4. Add USDC on Arc</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Arc gas is USDC.{" "}
          <Link to="/fund" className="underline">
            Add USDC
          </Link>{" "}
          buys it into the wallet you connected. It stays in that wallet. It is not a payment to Zenzen.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">5. Fees</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          What a trade pays, who receives it, and what happens in the first seconds of a launch are in the{" "}
          <Link to="/docs" className="underline">
            docs
          </Link>
          . This page does not restate them.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">6. Capy AI</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          <Link to="/capyai" className="underline">
            Capy AI
          </Link>{" "}
          reads a pool when you ask. It is not the account that posts. You open it, you pick a pool, you get the numbers in words.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">7. On X</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Share buttons open X with the token in the copy. Follow{" "}
          <a className="text-foreground underline" href="https://x.com/ZenzeFun" target="_blank" rel="noopener noreferrer">
            @ZenzeFun
          </a>
          .
        </p>

        <h2 className="mt-10 text-2xl font-semibold">8. Networks</h2>
        <div className="mt-3 overflow-x-auto text-sm">
          <table className="w-full text-left">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2"> </th>
                <th>Robinhood Chain</th>
                <th>Arc</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-t border-border">
                <td className="py-2 text-foreground">Gas</td>
                <td>ETH</td>
                <td>USDC</td>
              </tr>
              <tr className="border-t border-border">
                <td className="py-2 text-foreground">Explorer</td>
                <td>robinhoodchain.blockscout.com</td>
                <td>explorer.arc.io</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-2xl font-semibold">9. Trading pairs</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Launch picks a quote from a dropdown, same shape as the chain switcher. Each row uses the asset’s listed mark —
          ETH, USDG, USDC, $ZNZF, PONS, and Robinhood stock tokens (NVDA, AAPL, TSLA, SPY, and the rest). Search the
          ticker. Arc quotes are USDC and $ZNZF.
        </p>

        <h2 className="mt-10 text-2xl font-semibold">10. Add $ZNZF to a wallet</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>
            Open the{" "}
            <Link to="/znzf" className="underline">
              $ZNZF
            </Link>{" "}
            page.
          </li>
          <li>
            Connect, then tap <strong className="text-foreground">Add $ZNZF</strong> for the canonical Robinhood token.
          </li>
          <li>
            Tap <strong className="text-foreground">Add bridged $ZNZF</strong> after switching to Arc if you hold the
            bridged form.
          </li>
        </ol>

        <h2 className="mt-10 text-2xl font-semibold">11. Token images</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Launch and list crop art to a 512×512 square. PNG, JPG, or WebP. Uploaded images pin to IPFS so the pool page
          stays light.
        </p>
      </article>
    </AppShell>
  );
}
