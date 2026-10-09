import { capyChat } from "@/lib/server/ai-core.server";
import { MAYA_SYSTEM } from "./policy";
import type { ObservePack } from "./observe";
import { mentionIsQuestion, attachWaitingReply } from "./observe";
import { parsePlan, type MayaItem, type MayaPlan } from "./plan";
import { scoreDraft } from "./score";
import { ensureDoor, isMillDump } from "./shape";
import { urlForTheme } from "./calendar";

export type { MayaItem, MayaPlan };
export { parsePlan };

function mentionBlock(obs: ObservePack) {
  if (!obs.mentions.length) return "Mentions: none this window.";
  return obs.mentions
    .slice(0, 6)
    .map((p) => {
      const q = mentionIsQuestion(p, obs.handle) ? "QUESTION" : "mention";
      return `- ${q} @${p.author} id=${p.id} likes=${p.likes} :: ${p.text.slice(0, 180)}`;
    })
    .join("\n");
}

function weatherBlock(obs: ObservePack) {
  if (!obs.weather.length) return `Weather query (${obs.weatherQuery}): quiet.`;
  return `Weather query: ${obs.weatherQuery}\n` + obs.weather
    .slice(0, 6)
    .map((p) => `- @${p.author} id=${p.id} likes=${p.likes} :: ${p.text.slice(0, 160)}`)
    .join("\n");
}

function originalReasons(item: MayaItem | undefined, obs: ObservePack): string[] {
  if (!item || item.action !== "original" || !item.draft) return ["no original was written"];
  const draft = ensureDoor(item.draft, urlForTheme(obs.theme), "original");
  if (isMillDump(draft)) return ["that draft is a facts paste"];
  const scored = scoreDraft(draft, {
    facts: obs.factsText,
    action: item.action,
    job: item.job,
    segment: item.segment,
    audience: item.audience,
    mentionedUs: false,
    isOurPost: false,
    ownDomain: obs.ownDomain,
  });
  return scored.ok ? [] : scored.reasons;
}

function replyReasons(plan: MayaPlan, obs: ObservePack): string[] {
  const waiting = obs.mentions.find((post) => mentionIsQuestion(post, obs.handle));
  if (!waiting) return [];
  const item = plan.items.find((row) => row.action === "reply");
  if (!item?.draft) return ["the waiting person did not get a reply"];
  const bound = attachWaitingReply(item, obs.mentions, obs.handle);
  const scored = scoreDraft(bound.draft, {
    facts: obs.factsText,
    action: "reply",
    job: bound.job,
    segment: bound.segment,
    audience: bound.audience,
    mentionedUs: true,
    isOurPost: false,
  });
  return scored.ok ? [] : scored.reasons;
}

function liveMemory(obs: ObservePack) {
  const here = new Set(obs.mentions.map((p) => p.author.toLowerCase()));
  const stale = (s: string) => {
    const names = s.match(/@([A-Za-z0-9_]+)/g) ?? [];
    return names.some((name) => !here.has(name.slice(1).toLowerCase()));
  };
  return {
    bottleneck: stale(obs.memory.bottleneck) ? "That person is not in this window." : obs.memory.bottleneck,
    note: stale(obs.memory.lastNote) ? "" : obs.memory.lastNote,
  };
}

function userPrompt(obs: ObservePack, extra = "") {
  const memory = liveMemory(obs);
  const launchLine = obs.newestLaunch
    ? `PRODUCT MOMENT — unposted launch: $${obs.newestLaunch.symbol} (${obs.newestLaunch.name}) pair ${obs.newestLaunch.quote_asset ?? "ETH"}. Prefer a low-risk original about this. Do not write the contract address. Do not tell anyone to buy it.`
    : "No unposted launch this window.";

  const originalDue = obs.originalsToday < obs.originalCap && obs.minutesSinceOriginal >= obs.cadenceMin;
  const mentionDue = obs.mentions.length > 0;
  return `Handle: @${obs.handle}
Today's arc: ${obs.theme.name} — ${obs.theme.intent} (job ${obs.theme.job})
Do not write the old domain. There is no /points page and no /stake page. Points are https://zenzen.fun/airdrop. The lock is https://zenzen.fun/staking.
Memory that says "no link" or "no URL" is retired. An original ends with one https://zenzen.fun link.
Original due: ${originalDue ? "YES, after any waiting person" : "NO"} (${obs.originalsToday}/${obs.originalCap} originals, ${Math.round(obs.minutesSinceOriginal)}m since last)
Someone is waiting on a reply: ${mentionDue ? "YES — item 1 must be a reply that answers them. No promo." : "no"}
Graph freeze: ${obs.freezeUntil > Date.now() ? "YES until " + new Date(obs.freezeUntil).toISOString() : "no"}

${launchLine}

Facts (only these numbers exist — pick one, never paste the pack):
${obs.factsText}

Instrumentation gaps:
${obs.gaps.join("\n")}

Memory:
strategy: ${obs.memory.strategy || "(none)"}
bottleneck: ${memory.bottleneck}
winning hooks: ${obs.memory.winningHooks.join(" | ") || "(none)"}
dead hooks: ${obs.memory.deadHooks.join(" | ") || "(none)"}
hot accounts: ${obs.memory.hotHandles.join(", ") || "(none)"}
last note: ${memory.note.slice(0, 400) || "(none)"}

${mentionBlock(obs)}

${weatherBlock(obs)}

Return the JSON object. Nothing else.
If someone is waiting, item 1 is a reply and post_id is their id from Mentions. Answer them. Add https://zenzen.fun only if they asked where.
If Mentions says none, do not write a reply. An old name in memory is not a person waiting. Item 1 is the original, and it ends with one https://zenzen.fun link.
If an original is due and nobody is waiting, write that original. Do not repeat the first line of the last post.
One follow and one like are optional. A like needs a reason. A follow needs why_this_account.
${extra}`;
}

export async function decide(obs: ObservePack): Promise<MayaPlan | { error: string }> {
  const originalDue = obs.originalsToday < obs.originalCap && obs.minutesSinceOriginal >= obs.cadenceMin;
  const drafted = await capyChat(userPrompt(obs), 2048, MAYA_SYSTEM, "maya:decide");
  if (!drafted.ok) return { error: drafted.error };
  let plan = parsePlan(drafted.text);
  if (!plan) return { error: "Planner did not return usable JSON. Nothing was posted." };
  const notes = [
    ...(originalDue ? originalReasons(plan.items.find((item) => item.action === "original"), obs) : []),
    ...replyReasons(plan, obs),
  ];
  if (notes.length) {
    const retry = await capyChat(
      userPrompt(
        obs,
        `Refused: ${notes.join("; ")}.
If someone is waiting, item 1 is the reply, and its post_id is the id from their mention. Answer them in two sentences. Then, only if an original is due, write that in your own words. The first sentence is a fact. One question may end it. No slogan. End that original with one https://zenzen.fun link.`,
      ),
      2048,
      MAYA_SYSTEM,
      "maya:decide:rewrite",
    );
    if (retry.ok) {
      const next = parsePlan(retry.text);
      if (next) plan = next;
    }
  }
  return plan;
}
