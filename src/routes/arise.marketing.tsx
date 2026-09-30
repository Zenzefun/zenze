import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { generateCopy, rewritePost, runMarketingJob } from "@/lib/server/ai";
import { timeAgo } from "@/lib/format";
import { ARC, REPLY_SHAPE, themeFor } from "@/lib/server/maya/calendar";

export const Route = createFileRoute("/arise/marketing")({ component: AdminMarketing });

function AdminMarketing() {
  const [request, setRequest] = useState("");
  const [minutesDraft, setMinutesDraft] = useState("");
  const [capDraft, setCapDraft] = useState({ like: "", follow: "", repost: "", comment: "" });
  const q = useQuery({ queryKey: ["marketing"], queryFn: () => listMarketing(), retry: false });
  const x = useQuery({ queryKey: ["x-desk"], queryFn: () => xDesk(), retry: false });
  const [roomHint, setRoomHint] = useState("");
  const room = useQuery({ queryKey: ["telegram-desk"], queryFn: () => telegramDesk(), retry: false });
  const invites = useQuery({ queryKey: ["referral-desk"], queryFn: () => referralDesk(), retry: false });
  const radar = useQuery({ queryKey: ["x-radar"], queryFn: () => xRadar(), retry: false });
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
  const gen = useMutation({
    mutationFn: () => generateCopy({ data: { kind: "insight" } }),
    onSuccess: (res) => {
      if (!res.ok) toast.error(res.error);
      else toast.success("Insight drafted.");
      q.refetch();
    },
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
      else if (input.key.startsWith("x_daily_")) toast.success("Daily cap saved.");
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
  const minutesValue = minutesDraft || String(auto?.minutes ?? 45);
  const capValue = (key: "like" | "follow" | "repost" | "comment") =>
    capDraft[key] || String(auto?.quotas?.[key]?.cap ?? "");

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Capy desk</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask Capy to research, write, and publish as <span className="font-medium text-foreground">@ZenzeFun</span>.
            Maya plans and sends. Originals, mention replies, quotes, and named follows go live. No mill templates.
            {x.data ? ` ${x.data.ready ? `Live as @${x.data.username ?? x.data.handle}.` : x.data.note}` : ""}
          </p>
        </div>
        <Button variant="outline" disabled={gen.isPending} onClick={() => gen.mutate()}>
          {gen.isPending ? "Capy writing…" : "Draft insight"}
        </Button>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="font-medium">Daily posts</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Fourteen days, then it repeats. Today is {themeFor().name}. Maya retells the story. She does not paste it twice, and she does not attach the domain while X hides it. If someone asks where, she answers first: {REPLY_SHAPE}
        </p>
        <ol className="mt-3 space-y-2">
          {ARC.map((day) => (
            <li key={day.day} className={day.name === themeFor().name ? "rounded-lg border border-gold bg-background px-3 py-2" : "rounded-lg border border-border px-3 py-2"}>
              <p className="text-xs font-medium text-stone">{day.name}{day.name === themeFor().name ? " · today" : ""}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{day.example}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-medium">Community room · Telegram</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Maya writes and sends. She replies when someone speaks in the room, and she asks a question when the room is quiet.
              You still see every message here. The bot has to be in the group. If it cannot see messages, turn off group privacy in BotFather.
              {room.data?.bot ? ` Bot ${room.data.bot}.` : " Add the bot token and chat id in Settings."}
              {room.data?.room ? ` Room: ${room.data.room}.` : ""}
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
            placeholder="Optional hint. Example: ask what people want to launch."
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
            This is the acquisition path besides Telegram. A wallet shares https://zenze.fun/?ref=… and this desk counts real visits, launches, and buys. There is no reward payout.
          </p>
        </div>
        {(invites.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No invite links yet. They appear after a wallet opens the launch page and connects.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {(invites.data ?? []).map((row) => (
              <li key={row.code} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span className="font-mono text-xs">?ref={row.code}</span>
                <span className="text-xs text-muted-foreground">
                  {row.visits} arrived · {row.launches} launched · {row.buys} bought
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 min-w-0 space-y-4 overflow-hidden rounded-xl border border-border bg-card p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium">Autonomous @ZenzeFun</p>
            <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
            Maya writes a shaped post (hook, one true line, one complete URL) and sends it.
            Mentions, replies on our posts, quotes, and named 4–5 follows send themselves.
            One planned like per pulse. Cold first-touch stays off. Maya is not Capy — no mill dumps, no cut URLs.
            </p>
          </div>
          <Switch
            checked={auto?.on !== false}
            onCheckedChange={(v) => save.mutate({ key: "x_auto_on", value: v ? "true" : "false" })}
            disabled={save.isPending || !x.data}
          />
        </div>
        {auto?.bottleneck && (
          <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Bottleneck</p>
            <p className="mt-1 break-words [overflow-wrap:anywhere]">{auto.bottleneck}</p>
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
        <dl className="grid gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="text-muted-foreground">Session</dt>
            <dd className="mt-0.5 font-medium">{x.data?.ready ? "live" : "not live"}</dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="text-muted-foreground">Today</dt>
            <dd className="mt-0.5 font-medium">{auto?.today ?? 0} / 8 originals</dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="text-muted-foreground">Next original</dt>
            <dd className="mt-0.5 font-medium">
              {auto?.on === false ? "paused" : auto?.nextIn != null ? `${auto.nextIn}m` : "—"}
            </dd>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <dt className="text-muted-foreground">Loop</dt>
            <dd className="mt-0.5 font-medium">
              {x.data?.loop?.running ? "running" : x.data?.loop?.enabled ? "armed" : "preview idle"}
            </dd>
          </div>
        </dl>
        {auto?.quotas && (
          <div className="space-y-3">
            <dl className="grid min-w-0 gap-3 text-xs sm:grid-cols-4">
              {(
                [
                  ["like", "Likes", "x_daily_likes"],
                  ["follow", "Follows", "x_daily_follows"],
                  ["repost", "Reposts", "x_daily_reposts"],
                  ["comment", "Comments", "x_daily_comments"],
                ] as const
              ).map(([key, label, configKey]) => {
                const row = auto.quotas[key];
                return (
                  <div key={key} className="min-w-0 overflow-hidden rounded-lg border border-border px-3 py-2">
                    <dt className="text-muted-foreground">{label} today</dt>
                    <dd className="mt-0.5 font-medium">
                      {row.done} / {row.cap}
                    </dd>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-stone"
                        style={{ width: `${Math.min(100, row.cap ? (row.done / row.cap) * 100 : 0)}%` }}
                      />
                    </div>
                    <Label htmlFor={`cap-${key}`} className="mt-2 block text-[10px] uppercase tracking-wide text-muted-foreground">
                      Daily cap
                    </Label>
                    <Input
                      id={`cap-${key}`}
                      type="number"
                      min={0}
                      max={80}
                      className="mt-1 h-8"
                      value={capValue(key)}
                      onChange={(e) => setCapDraft((d) => ({ ...d, [key]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 w-full"
                      disabled={save.isPending}
                      onClick={() => save.mutate({ key: configKey, value: capValue(key) })}
                    >
                      Save
                    </Button>
                  </div>
                );
              })}
            </dl>
            <p className="text-[11px] text-muted-foreground">
              Caps are 0–80 per UTC day. Maya still clamps to 8 likes, 24 follows, 12 comments, 6 reposts.
              Originals, mention replies, quotes, and named follows send themselves. One planned like per pulse.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="x-auto-min">Cadence (minutes)</Label>
            <Input
              id="x-auto-min"
              type="number"
              min={20}
              max={180}
              className="w-28"
              value={minutesValue}
              onChange={(e) => setMinutesDraft(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate({ key: "x_auto_minutes", value: minutesValue })}
          >
            Save cadence
          </Button>
          <Button size="sm" variant="gold" disabled={pulse.isPending} onClick={() => pulse.mutate()}>
            {pulse.isPending ? "Researching…" : "Run pulse now"}
          </Button>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          {(
            [
              ["x_auto_replies_on_our_posts", "Auto-reply on our posts", auto?.autoReplies !== false],
              ["x_auto_follows", "Auto-follow scored 4–5 cards", auto?.autoFollows !== false],
              ["x_auto_quotes", "Auto-send quotes", auto?.autoQuotes !== false],
            ] as const
          ).map(([key, label, on]) => (
            <label key={key} className="inline-flex items-center gap-2">
              <Switch
                checked={on}
                onCheckedChange={(v) => save.mutate({ key, value: v ? "true" : "false" })}
                disabled={save.isPending || !x.data}
              />
              {label}
            </label>
          ))}
        </div>
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

      {radar.data?.posts && radar.data.posts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">River watch</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live mentions of @{radar.data.handle} and $ZNZF. Maya watches this river plus rotating pad-weather searches.
            First-touch replies wait in the queue. Questions at us can auto-reply.
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
              <Button size="sm" variant="outline" disabled={rewrite.isPending} onClick={() => rewrite.mutate(p.id)}>
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
    </div>
  );
}
