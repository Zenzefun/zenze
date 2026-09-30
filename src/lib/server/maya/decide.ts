import { capyChat } from "@/lib/server/ai-core.server";
import { SITE } from "@/lib/seo";
import { isHexAddress } from "@/lib/intent";
import { MAYA_SYSTEM } from "./policy";
import type { ObservePack } from "./observe";
import { mentionIsQuestion } from "./observe";
import { parsePlan, type MayaItem, type MayaPlan } from "./plan";
import { scoreDraft } from "./score";
import { DAILY_CAPS } from "./policy";
import { isMillDump } from "./shape";
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

function originalUsable(item: MayaItem | undefined, obs: ObservePack): boolean {
  if (!item || item.action !== "original" || !item.draft) return false;
  if (isMillDump(item.draft)) return false;
  const scored = scoreDraft(item.draft, {
    facts: obs.factsText,
    action: item.action,
    job: item.job,
    segment: item.segment,
    audience: item.audience,
    mentionedUs: false,
    isOurPost: false,
  });
  return scored.ok;
}

function userPrompt(obs: ObservePack, extra = "") {
  const launchLine = obs.newestLaunch
    ? `PRODUCT MOMENT — unposted launch: $${obs.newestLaunch.symbol} (${obs.newestLaunch.name}) pair ${obs.newestLaunch.quote_asset ?? "ETH"} url ${
        isHexAddress(obs.newestLaunch.contract_address)
          ? `${SITE.url}/token/${obs.newestLaunch.contract_address}`
          : `${SITE.url}/explore`
      }. Prefer a low-risk original about this. Do not tell anyone to buy it.`
    : "No unposted launch this window.";

  const originalDue = obs.originalsToday < DAILY_CAPS.original && obs.minutesSinceOriginal >= obs.cadenceMin;
  const mentionDue = obs.mentions.length > 0;
  return `Handle: @${obs.handle}
Today's arc: ${obs.theme.name} — ${obs.theme.intent} (job ${obs.theme.job})
Preferred URL for today's arc: ${urlForTheme(obs.theme)}
Original due: ${originalDue ? "YES, after any waiting person" : "NO"} (${obs.originalsToday}/${DAILY_CAPS.original} originals, ${Math.round(obs.minutesSinceOriginal)}m since last)
Someone is waiting on a reply: ${mentionDue ? "YES — item 1 must be a reply that answers them. No promo." : "no"}
Graph freeze: ${obs.freezeUntil > Date.now() ? "YES until " + new Date(obs.freezeUntil).toISOString() : "no"}

${launchLine}

Facts (only these numbers exist — pick one, never paste the pack):
${obs.factsText}

Instrumentation gaps:
${obs.gaps.join("\n")}

Memory:
strategy: ${obs.memory.strategy || "(none)"}
bottleneck: ${obs.memory.bottleneck}
winning hooks: ${obs.memory.winningHooks.join(" | ") || "(none)"}
dead hooks: ${obs.memory.deadHooks.join(" | ") || "(none)"}
hot accounts: ${obs.memory.hotHandles.join(", ") || "(none)"}
last note: ${obs.memory.lastNote.slice(0, 400) || "(none)"}

${mentionBlock(obs)}

${weatherBlock(obs)}

Plan this pulse. Drafts you write POST LIVE this hour — no human approval.
One audience per item. A waiting person outranks an original.
If someone mentioned us, item 1 is a reply that answers them. No link unless they asked where. Do not tell them to check a DM.
If an original is due and nobody is waiting, tell today's story: one person, one moment, one true change. No URL. X still hides the domain.
Do not repeat the first line of the last post. Do not list every product. Do not print point weights.

Never paste the facts pack. Never ETH price. Never 24h vol dust. Never "on the tape".
Never stack 1,000,000,000 + bridged 1:1 + fee + volume. That is the old mill. Kill it.
Replies only on opt-in (they mentioned us or replied on our post). Answer the question.
You may add one named follow (score 4–5, why_this_account filled) and one planned like with a reason.
Do not invent traction. Do not write a template from dead hooks.
Do not sign as Capy. Do not use 🌿 or ♨️ unless the post is actually about Capy reads.
Return only a JSON object. No markdown.
${extra}`;
}

export async function decide(obs: ObservePack): Promise<MayaPlan | { error: string }> {
  const originalDue = obs.originalsToday < DAILY_CAPS.original && obs.minutesSinceOriginal >= obs.cadenceMin;
  const drafted = await capyChat(userPrompt(obs), 2048, MAYA_SYSTEM, "maya:decide");
  if (!drafted.ok) return { error: drafted.error };
  let plan = parsePlan(drafted.text);
  if (!plan) return { error: "Planner did not return usable JSON. Pulse skipped rather than posting a template." };

  if (originalDue && !originalUsable(plan.items.find((i) => i.action === "original"), obs)) {
    const retry = await capyChat(
      userPrompt(
        obs,
        `
REWRITE. Your previous original was a promo mill or a product tour.
Write today's story only: one person, one moment, one true change. No URL. No feature list. No point table. No second coin.
`,
      ),
      2048,
      MAYA_SYSTEM,
      "maya:decide:rewrite",
    );
    if (retry.ok) {
      const next = parsePlan(retry.text);
      if (next && (originalUsable(next.items.find((i) => i.action === "original"), obs) || next.items.length)) {
        plan = next;
      }
    }
  }

  return plan;
}
