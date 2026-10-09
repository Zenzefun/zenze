import { getSql } from "@/lib/db";
import { listingProof, projectHandle } from "@/lib/listing-promo";
import { capyChat } from "@/lib/server/ai-core.server";
import { scoreDraft } from "@/lib/server/maya/score";
import { isMillDump, shapePost, ensureDoor } from "@/lib/server/maya/shape";
import { publishTweet } from "@/lib/server/x";

async function writeListingPost(input: {
  symbol: string;
  twitter?: string | null;
  liquidityUsd?: number | null;
  mcap?: number | null;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ticker = input.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  if (!ticker) return { ok: false, error: "That listing has no ticker." };
  const handle = projectHandle(input.twitter);
  const proof = listingProof(input.liquidityUsd, input.mcap);
  const drafted = await capyChat(
    `Write one X post about a token that was just listed.
Ticker: $${ticker}
${handle ? `Their account is @${handle}. Name it once, and do not start the post with @.` : "They have no X account. Do not invent one."}
${proof ? `One true figure you may use: ${proof}` : "Do not invent liquidity, market cap, holders, or volume."}
Two or three sentences a person would say out loud, in one paragraph.
The first sentence names $${ticker} and is 12 words or fewer.
Do not use the words board, seat, seated, or page.
No URL. No question. No buy now. No price target. No slogan stacked on its own line.
Return only the post.`,
    320,
    "You write for @ZenzeFun. The reader should hear a person, not a slogan.",
    "listing:promo",
  );
  if (!drafted.ok) return { ok: false, error: drafted.error };
  const text = shapePost(drafted.text, "original");
  if (!text || isMillDump(text) || /\b(board|seat|seated|page is here)\b/i.test(text)) {
    return { ok: false, error: "The listing post was not usable." };
  }
  const scored = scoreDraft(text, {
    facts: proof,
    action: "original",
    job: "A4",
    segment: "traders",
    audience: "people who trade on Robinhood Chain",
    mentionedUs: false,
    isOurPost: false,
  });
  if (!scored.ok) return { ok: false, error: scored.reasons.join("; ") };
  return { ok: true, text };
}

/** Post one listing. No second post. The door is still zenzen.fun, and it does not spend the Maya cadence. */
export async function announceListing(input: {
  id: string;
  symbol: string;
  twitter?: string | null;
  telegram?: string | null;
  liquidityUsd?: number | null;
  mcap?: number | null;
}) {
  const sql = await getSql();
  const ticker = input.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  const boundary = `(^|[^A-Za-z0-9])\\$${ticker}([^A-Za-z0-9]|$)`;
  const prior = await sql<{ id: number }>`
    select id from marketing_posts
    where status = 'posted'
      and (
        request = ${`listing:${input.id}`}
        or (
          ${Boolean(ticker)}
          and kind = 'listing'
          and content ~* ${boundary}
          and coalesce(published_at, created_at) > now() - interval '1 day'
        )
      )
    limit 1
  `;
  if (prior.length) return { ok: true as const, skipped: true };
  const written = await writeListingPost(input);
  if (!written.ok) return written;
  const text = ensureDoor(written.text, `https://zenzen.fun/token/${encodeURIComponent(input.id)}`);
  const posted = await publishTweet(text);
  const note = posted.ok ? "" : posted.error;
  await sql`
    insert into marketing_posts (kind, content, status, token_id, request, x_post_id, published_at, research)
    values (
      'listing',
      ${text},
      ${posted.ok ? "posted" : "failed"},
      ${input.id},
      ${`listing:${input.id}`},
      ${posted.ok ? posted.id : null},
      ${posted.ok ? new Date().toISOString() : null},
      ${note}
    )
  `;
  if (!posted.ok) {
    console.error("listing promo", input.id, posted.error);
    return posted;
  }
  return posted;
}
