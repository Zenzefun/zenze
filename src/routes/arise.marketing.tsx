import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { xIntent } from "@/components/share/share-x";
import { listMarketing, markPostStatus, publishQueuedPost, resolveMayaQueue, runXPulse, saveConfig, xDesk, xRadar } from "@/lib/server/admin";
import { discardCommunityNote, draftCommunityNote, sendCommunityNote, telegramDesk } from "@/lib/server/telegram";
import { referralDesk } from "@/lib/server/referral";
import { rewritePost, runMarketingJob } from "@/lib/server/ai";
import { timeAgo } from "@/lib/format";
import { deskLimits } from "@/lib/desk-limits";
import { RANK_RULE } from "@/lib/server/maya/rank";
import { ARC, themeFor } from "@/lib/server/maya/calendar";

export const Route = createFileRoute("/arise/marketing")({ component: AdminMarketing });

function AdminMarketing() {
  const [request, setRequest] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"x" | "drafts" | "room" | "watch">("x");
  const q = useQuery({ queryKey: ["marketing"], queryFn: () => listMarketing(), retry: false });
  const x = useQuery({ queryKey: ["x-desk"], queryFn: () => xDesk(), retry: false });
  const [roomHint, setRoomHint] = useState("");
  const room = useQuery({ queryKey: ["telegram-desk"], queryFn: () => telegramDesk(), retry: false });
  const invites = useQuery({ queryKey: ["referral-desk"], queryFn: () => referralDesk(), retry: false });
  const radar = useQuery({ queryKey: ["x-radar"], queryFn: () => xRadar(), enabled: tab === "watch", retry: false });
  const job = useMutation({
    mutationFn: (publish: boolean) => runMarketingJob({ data: { request, publish } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (res.status === "posted") toast.success(res.publishNote ?? "Live on @ZenzeFun.");
      else if (res.publishNote) toast.message(res.publishNote);
      else toast.success("Draft soaking in the queue.");
      q.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const mark = useMutation({
    mutationFn: (input: { id: number; status: "queued" | "posted" | "failed" }) => markPostStatus({ data: input }),
    onSuccess: () => q.refetch(),
  });
  const pub = useMutation({
    mutationFn: (id: number) => publishQueuedPost({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.error);
        if (res.intent) window.open(res.intent, "_blank", "noopener,noreferrer");
      } else {
        toast.success("Posted to @ZenzeFun.");
      }
      q.refetch();
    },
  });
  const rewrite = useMutation({
    mutationFn: (id: number) => rewritePost({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success("Rewritten.");
      q.refetch();
    },
  });
  const save = useMutation({
    mutationFn: (input: { key: string; value: string }) => saveConfig({ data: input }),
    onSuccess: (res, input) => {
      if (!res.ok) toast.error(res.error ?? "Could not save.");
      else if (input.key === "x_auto_on") toast.success(input.value === "true" ? "Autonomous pulse is on." : "Autonomous pulse paused.");
      else if (input.key.startsWith("x_daily_") || input.key === "x_auto_minutes") {
        toast.success("Saved.");
        setEdits((d) => {
          const next = { ...d };
          delete next[input.key];
          return next;
        });
      }
      else toast.success("Cadence saved.");
      void x.refetch();
      void room.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const pulse = useMutation({
    mutationFn: () => runXPulse(),
    onSuccess: (res) => {
      if (res.posted) toast.success(`Live ${res.play} post.`);
      else if (res.skipped) toast.message(res.queued ? `${res.skipped} · ${res.queued} queued.` : res.skipped);
      else toast.error(res.error ?? "Pulse did not post.");
      void q.refetch();
      void x.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const queueMut = useMutation({
    mutationFn: (input: { id: number; status: "approved" | "rejected" }) => resolveMayaQueue({ data: input }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(("error" in res && res.error) || "Queue failed.");
      else if ("posted" in res && res.posted) toast.success("Sent.");
      else toast.message(("skipped" in res && res.skipped) || "Updated.");
      void x.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const roomDraft = useMutation({
    mutationFn: () => draftCommunityNote({ data: { hint: roomHint } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Maya sent it to the room.");
        setRoomHint("");
      }
      void room.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const roomSend = useMutation({
    mutationFn: (id: number) => sendCommunityNote({ data: { id } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success("Sent to the Telegram room.");
      void room.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const roomDrop = useMutation({
    mutationFn: (id: number) => discardCommunityNote({ data: { id } }),
    onSuccess: () => void room.refetch(),
  });
  const posts = q.data ?? [];
  const auto = x.data?.auto;
  const limits = deskLimits(auto);
  function limitValue(key: string, fallback: string) {
    const typed = edits[key];
    return typed == null || typed === "" ? fallback : typed;
  }
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "drafts" || hash === "room" || hash === "watch") setTab(hash);
  }, []);
  function openTab(next: typeof tab) {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  }
  const nextLabel =
    auto?.on === false
      ? "Paused"
      : (auto?.today ?? 0) >= (auto?.originalCap ?? 2)
        ? "Day's cap"
        : auto?.nextIn === 0
          ? "Due now"
          : auto?.nextIn != null
            ? `In ${auto.nextIn}m`
            : "—";

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Marketing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {x.data?.ready ? `Live as @${x.data.username ?? x.data.handle}.` : x.data?.note ?? "Checking the X session."}
          </p>
        </div>
        <Button size="sm" variant="gold" disabled={pulse.isPending} onClick={() => pulse.mutate()}>
          {pulse.isPending ? "Researching…" : "Run now"}
        </Button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        <div className="bg-card px-3 py-3">
          <dt className="text-xs text-muted-foreground">Posts today</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{auto?.today ?? 0}<span className="text-sm font-normal text-muted-foreground"> / {auto?.originalCap ?? 2}</span></dd>
        </div>
        <div className="bg-card px-3 py-3">
          <dt className="text-xs text-muted-foreground">Next post</dt>
          <dd className="mt-1 text-lg font-semibold">{nextLabel}</dd>
        </div>
        <div className="bg-card px-3 py-3">
          <dt className="text-xs text-muted-foreground">Session</dt>
          <dd className="mt-1 text-lg font-semibold">{x.data?.ready ? "Live" : "Off"}</dd>
        </div>
        <div className="bg-card px-3 py-3">
          <dt className="text-xs text-muted-foreground">Loop</dt>
          <dd className="mt-1 text-lg font-semibold">{x.data?.loop?.running ? "Running" : "Idle"}</dd>
        </div>
      </dl>

      <div className="mt-5 flex gap-1 border-b border-border" role="tablist">
        {(
          [
            ["x", "X"],
            ["drafts", "Drafts"],
            ["room", "Room"],
            ["watch", "Watch"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "border-b-2 border-foreground px-3 py-2 text-sm font-medium" : "px-3 py-2 text-sm text-muted-foreground"}
            onClick={() => openTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "watch" && (
      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="font-medium">Today · {themeFor().name}</p>
        <p className="mt-2 whitespace-pre-wrap text-sm">{themeFor().example}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          The original ends with one link, {themeFor().url}. A reply adds that link only if someone asked where.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">The other days</summary>
          <ol className="mt-3 space-y-2">
            {ARC.filter((day) => day.name !== themeFor().name).map((day) => (
              <li key={day.day} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs font-medium text-stone">{day.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{day.example}</p>
              </li>
            ))}
          </ol>
        </details>
      </section>
      )}

      {tab === "room" && (
      <>
      <section className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-medium">Community room · Telegram</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Five notes a day, at 08:00, 12:00, 16:00, 20:00, and 23:00 WIB. A missed morning note goes out once.
              {room.data?.bot ? ` Bot ${room.data.bot}.` : " Add the bot token and chat id in Settings."}
              {room.data?.room ? ` ${room.data.room}.` : ""}
              {room.data?.error ? ` ${room.data.error}` : ""}
            </p>
            <Switch
              checked={room.data?.auto !== false}
              onCheckedChange={(v) => save.mutate({ key: "telegram_auto_on", value: v ? "true" : "false" })}
              disabled={save.isPending}
              aria-label="Maya sends to Telegram"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={roomHint}
            onChange={(e) => setRoomHint(e.target.value)}
            placeholder="Optional hint. Example: the bridge, in one sentence."
          />
          <Button variant="outline" disabled={roomDraft.isPending} onClick={() => roomDraft.mutate()}>
            {roomDraft.isPending ? "Maya is sending…" : "Send to the room"}
          </Button>
        </div>
        <ul className="space-y-3">
          {(room.data?.notes ?? []).filter((n) => n.status !== "discarded").map((n) => (
            <li key={n.id} className="rounded-lg border border-border px-3 py-2">
              <p className="text-sm">{n.content}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{n.status === "sent" ? `Sent ${timeAgo(n.sent_at ?? n.created_at)}` : n.status === "failed" ? "Not delivered" : `Waiting ${timeAgo(n.created_at)}`}</span>
                {n.status !== "sent" && (
                  <>
                    <Button size="sm" variant="gold" disabled={roomSend.isPending || !room.data?.ready} onClick={() => roomSend.mutate(n.id)}>
                      Send
                    </Button>
                    <Button size="sm" variant="outline" disabled={roomDrop.isPending} onClick={() => roomDrop.mutate(n.id)}>
                      Discard
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-medium">Invite links</p>
          <p className="mt-1 text-xs text-muted-foreground">
            A wallet copies https://zenzen.fun/airdrop?ref=… from the points page. A friend counts after they buy $ZNZF and still hold the minimum. Ten friends at most.
          </p>
        </div>
        {invites.isError ? (
          <p className="text-sm text-destructive">Invite links could not be read. Sign in again with the treasury wallet.</p>
        ) : (invites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No invite links yet. They appear after a wallet connects on the points page.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(invites.data ?? []).map((row) => (
              <li key={row.code} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="break-all font-mono text-xs">https://zenzen.fun/airdrop?ref={row.code}</span>
                <span className="text-xs text-muted-foreground">
                  {row.visits} arrived · {row.launches} launched · {row.buys} bought
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>
      )}
      {tab === "x" && (
      <section className="mt-6 min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium">X</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {x.data?.ready ? `Live as @${x.data.username ?? x.data.handle}.` : x.data?.note ?? "Checking the session."}
              {" "}The number you save is the number that runs. One like per pulse.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{RANK_RULE}</p>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="gold" disabled={pulse.isPending} onClick={() => pulse.mutate()}>
              {pulse.isPending ? "Researching…" : "Run now"}
            </Button>
            <Switch
              checked={auto?.on !== false}
              onCheckedChange={(v) => save.mutate({ key: "x_auto_on", value: v ? "true" : "false" })}
              disabled={save.isPending || !x.data}
              aria-label="Autonomous posting"
            />
          </div>
        </div>
        {(pulse.isError || pulse.data) && (
          <p className={pulse.isError || (pulse.data && !pulse.data.posted && pulse.data.error) ? "text-sm text-destructive" : "text-sm"}>
            {pulse.isError
              ? pulse.error.message
              : pulse.data?.posted
                ? "Posted."
                : pulse.data?.error || pulse.data?.skipped || "Nothing was posted."}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {x.data?.loop?.running ? "Loop running." : x.data?.loop?.enabled ? "Loop armed." : "Loop idle."}
          {" "}
          Next post:{" "}
          {auto?.on === false
            ? "paused"
            : (auto?.today ?? 0) >= (auto?.originalCap ?? 2)
              ? "day's cap"
              : auto?.nextIn === 0
                ? "due now"
                : auto?.nextIn != null
                  ? `in ${auto.nextIn}m`
                  : "—"}
        </p>
        <ul className="divide-y divide-border border-y border-border">
          {limits.map((row) => {
            const value = limitValue(row.key, row.value);
            return (
              <li key={row.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-xs text-muted-foreground">Today {row.today}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 text-right text-lg font-semibold tabular-nums">{row.value}</span>
                  <input
                    id={row.key}
                    type="text"
                    inputMode="numeric"
                    aria-label={`${row.label} limit`}
                    min={row.min}
                    max={row.max}
                    value={value}
                    onChange={(e) => setEdits((d) => ({ ...d, [row.key]: e.target.value.replace(/[^\d]/g, "") }))}
                    className="h-10 w-20 rounded-md border border-stone bg-background px-2 text-center text-base font-semibold text-ink"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={save.isPending || value.trim() === ""}
                    onClick={() => save.mutate({ key: row.key, value })}
                  >
                    Save
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {(
            [
              ["x_auto_replies_on_our_posts", "Reply when someone writes to us", auto?.autoReplies !== false],
              ["x_auto_follows", "Follow accounts scored 4 or 5", auto?.autoFollows !== false],
              ["x_auto_quotes", "Send quotes", auto?.autoQuotes !== false],
            ] as const
          ).map(([key, label, on]) => (
            <label key={key} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span>{label}</span>
              <Switch
                checked={on}
                onCheckedChange={(v) => save.mutate({ key, value: v ? "true" : "false" })}
                disabled={save.isPending || !x.data}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Posts use one link, https://zenzen.fun. The old domain is not written.
        </p>
        {(auto?.bottleneck || auto?.note) && (
          <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            {auto.bottleneck && (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bottleneck</p>
                <p className="mt-1 break-words [overflow-wrap:anywhere]">{auto.bottleneck}</p>
              </>
            )}
            {auto.strategy && (
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {auto.strategy}
              </p>
            )}
            {auto.note && (
              <p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {auto.note}
              </p>
            )}
          </div>
        )}
        {pulse.data?.text && (
          <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-muted/70 p-3 text-sm [overflow-wrap:anywhere]">
            {pulse.data.text}
          </pre>
        )}
        {auto?.last && (
          <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            Last auto {auto.last.play ?? "post"} · {auto.last.status} · {timeAgo(auto.last.created_at)}
            {auto.last.content ? ` — ${auto.last.content.slice(0, 140)}` : ""}
          </p>
        )}
        {auto?.learnings && auto.learnings.length > 0 && (
          <ul className="grid gap-2 text-xs sm:grid-cols-2">
            {auto.learnings.map((row) => (
              <li key={row.play} className="min-w-0 overflow-hidden rounded-lg border border-border px-3 py-2">
                <p className="break-words font-medium uppercase [overflow-wrap:anywhere]">
                  {row.play} · {row.posts} posts · score {row.avg.toFixed(1)}
                </p>
                {row.hook && (
                  <p className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">{row.hook}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        {auto?.pending && auto.pending.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Held items</p>
            <p className="text-xs text-muted-foreground">
              Cold first-touch and crisis stay here. Maya does not mill-queue LOW/MEDIUM.
            </p>
            <ul className="space-y-2">
              {auto.pending.map((card) => (
                <li key={card.id} className="min-w-0 overflow-hidden rounded-lg border border-border px-3 py-2 text-sm">
                  <p className="break-words text-xs uppercase text-muted-foreground [overflow-wrap:anywhere]">
                    {card.action} · {card.job} · {card.risk} · {card.segment || "unsegmented"}
                    {card.handle ? ` · @${card.handle}` : ""}
                  </p>
                  <p className="mt-1 break-words [overflow-wrap:anywhere]">{card.reason}</p>
                  {card.draft && (
                    <pre className="mt-1 max-w-full whitespace-pre-wrap break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {card.draft}
                    </pre>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="gold"
                      disabled={queueMut.isPending}
                      onClick={() => queueMut.mutate({ id: card.id, status: "approved" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={queueMut.isPending}
                      onClick={() => queueMut.mutate({ id: card.id, status: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      )}

      {tab === "drafts" && (
      <form
        className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          job.mutate(false);
        }}
      >
        <Label htmlFor="capy-req">Request</Label>
        <Textarea
          id="capy-req"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={4}
          placeholder="A calm $ZNZF tweet, a thread, a reply…"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="gold" disabled={job.isPending || request.trim().length < 4}>
            {job.isPending ? "Researching…" : "Research & draft"}
          </Button>
          <Button type="button" variant="default" disabled={job.isPending || request.trim().length < 4} onClick={() => job.mutate(true)}>
            Research & publish
          </Button>
        </div>
        {job.data && job.data.ok && (
          <div className="min-w-0 overflow-hidden rounded-lg bg-muted/70 p-3 text-sm">
            <p className="font-medium">Ready{job.data.provider ? ` · ${job.data.provider}` : ""}</p>
            <pre className="mt-2 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{job.data.text}</pre>
            <p className="mt-2 text-xs text-muted-foreground">{job.data.publishNote ?? `Status: ${job.data.status}`}</p>
          </div>
        )}
      </form>
      )}

      {tab === "watch" && radar.data?.posts && radar.data.posts.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">River watch</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mentions of @{radar.data.handle} and $ZNZF. A question can be answered. A cold first message waits.
          </p>
          <ul className="mt-3 space-y-2">
            {radar.data.posts.map((p) => (
              <li key={p.id} className="min-w-0 overflow-hidden rounded-xl border border-border px-3 py-2 text-sm">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="break-all">@{p.author}</span>
                  <span>{p.likes ? `${p.likes} likes` : ""}</span>
                </div>
                <p className="mt-1 break-words text-muted-foreground [overflow-wrap:anywhere]">{p.text}</p>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-stone underline"
                >
                  Open on X
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "drafts" && (
      <>
      {posts.length === 0 && <p className="mt-6 text-sm text-muted-foreground">No drafts yet. Nothing is invented here.</p>}
      <ul className="mt-6 space-y-3">
        {posts.map((p) => (
          <li key={p.id} className="stone-card min-w-0 overflow-hidden rounded-xl p-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="break-all uppercase">
                {p.kind}
                {p.play ? `/${p.play}` : ""} · {p.status}
                {p.provider ? ` · ${p.provider}` : ""}
                {p.model ? `/${p.model}` : ""}
                {p.x_post_id ? ` · ${p.x_post_id}` : ""}
                {Number(p.likes) > 0 ? ` · ${p.likes} likes` : ""}
              </span>
              <span>{timeAgo(p.created_at)}</span>
            </div>
            {p.request && <p className="mt-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">Ask: {p.request}</p>}
            <pre className="mt-2 max-w-full whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{p.content}</pre>
            {p.research && (
              <details className="mt-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer">Research</summary>
                <pre className="mt-1 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{p.research}</pre>
              </details>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {p.status !== "posted" && (
                <Button size="sm" variant="gold" disabled={pub.isPending} onClick={() => pub.mutate(p.id)}>
                  Publish to @ZenzeFun
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={rewrite.isPending || p.status === "posted"} onClick={() => rewrite.mutate(p.id)}>
                Rewrite
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mark.mutate({ id: p.id, status: "posted" })}>
                Mark posted
              </Button>
              <Button size="sm" variant="ghost" onClick={() => mark.mutate({ id: p.id, status: "failed" })}>
                Fail
              </Button>
              <a
                href={xIntent(p.content.slice(0, 240), "/")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
              >
                Open on X
              </a>
            </div>
          </li>
        ))}
      </ul>
      </>
      )}
    </div>
  );
}
