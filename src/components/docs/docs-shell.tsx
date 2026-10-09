import { Link } from "@tanstack/react-router";
import { Menu, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { DOCS_NAV, DOCS_VERSION, type DocsBlock, type DocsDoc } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (link) {
          const href = link[2];
          const external = href.startsWith("http");
          if (external) {
            return (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-[0.85em] text-stone underline decoration-border underline-offset-2 hover:text-gold">
                {link[1]}
              </a>
            );
          }
          return (
            <Link key={i} to={href} className="text-stone underline decoration-border underline-offset-2 hover:text-gold">
              {link[1]}
            </Link>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export function DocsBlocks({ blocks }: { blocks: DocsBlock[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => {
        if (block.type === "p") {
          return (
            <p key={i} className="text-[15px] leading-7 text-muted-foreground">
              <Rich text={block.text} />
            </p>
          );
        }
        if (block.type === "h2") {
          return (
            <h2 key={i} className="pt-4 font-display text-2xl font-semibold text-foreground">
              {block.text}
            </h2>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Rich text={item} />
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === "ol") {
          return (
            <ol key={i} className="list-decimal space-y-2 pl-5 text-[15px] leading-7 text-muted-foreground">
              {block.items.map((item, j) => (
                <li key={j}>
                  <Rich text={item} />
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={i} className="overflow-x-auto rounded-xl border border-border bg-card p-4 font-mono text-[13px] leading-6 text-foreground">
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.type === "table") {
          return (
            <div key={i} className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="bg-muted/60 text-foreground">
                  <tr>
                    {block.headers.map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r} className="border-t border-border">
                      {row.map((cell, c) => (
                        <td key={c} className="px-3 py-2 align-top font-mono text-[12px] leading-5 text-muted-foreground break-all">
                          <Rich text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === "note" || block.type === "warn") {
          return (
            <aside
              key={i}
              className={cn(
                "rounded-xl border px-4 py-3 text-sm leading-6",
                block.type === "warn" ? "border-blossom/50 bg-blossom/10 text-foreground" : "border-border bg-card text-muted-foreground",
              )}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">{block.type === "warn" ? "Watch" : "On-chain"}</p>
              <p className="mt-1">
                <Rich text={block.text} />
              </p>
            </aside>
          );
        }
        return null;
      })}
    </div>
  );
}

function NavList({
  active,
  query,
  onPick,
}: {
  active: string;
  query: string;
  onPick?: () => void;
}) {
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    return DOCS_NAV.map((g) => ({
      ...g,
      items: g.items.filter((it) => !q || it.title.toLowerCase().includes(q) || it.slug.includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [q]);
  return (
    <nav className="space-y-6">
      {groups.map((g) => (
        <div key={g.group}>
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const on = active === it.slug;
              const cls = cn(
                "block rounded-lg px-2.5 py-1.5 text-sm",
                on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              );
              if (it.slug === "overview") {
                return (
                  <li key={it.slug}>
                    <Link to="/docs" onClick={onPick} className={cls}>
                      {it.title}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={it.slug}>
                  <Link to="/docs/$slug" params={{ slug: it.slug }} onClick={onPick} className={cls}>
                    {it.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {groups.length === 0 && <p className="px-2 text-sm text-muted-foreground">No matching pages.</p>}
    </nav>
  );
}

export function DocsShell({ doc, children }: { doc: DocsDoc; children?: ReactNode }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-3 py-8 sm:px-4 lg:py-10">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20 space-y-4">
            <div>
              <p className="font-display text-lg font-semibold">Zenzen docs</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{DOCS_VERSION}</p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 pl-8 text-sm" />
            </div>
            <NavList active={doc.slug} query={q} />
          </div>
        </aside>
        <article className="min-w-0 flex-1">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <div>
              <p className="font-display text-lg font-semibold">Zenzen docs</p>
              <p className="text-[11px] text-muted-foreground">{DOCS_VERSION}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Menu className="size-4" />
              Pages
            </Button>
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{doc.group}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 max-w-2xl text-base text-muted-foreground">{doc.description}</p>
          <div className="mt-8">
            <DocsBlocks blocks={doc.blocks} />
            {children}
          </div>
        </article>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[min(100%,20rem)]">
          <SheetTitle className="mb-4">Zenzen docs</SheetTitle>
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-9 pl-8 text-sm" />
          </div>
          <NavList active={doc.slug} query={q} onPick={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
