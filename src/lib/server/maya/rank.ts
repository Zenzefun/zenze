/** xai-org/x-algorithm home-mixer/params/param.rs, last sync 2026-10-02T16:00:41Z. */
export const RANK_AS_OF = "2026-10-02";
export const RANK_COMMIT = "main";

export const RANK_WEIGHTS = {
  copyLink: 20,
  mutualReply: 20,
  reply: 5,
  quote: 5,
  dmShare: 5,
  follow: 4,
  share: 2,
  repost: 1,
  like: 0.5,
  stayAfterClick: 0.4,
  click: 0.3,
  openLink: 0.2,
  dwell: 0.05,
  scrollPast: -0.02,
  notInterested: -47.52,
  report: -234,
} as const;

/** The same sentence the desk shows and the writer is given. */
export const RANK_RULE =
  "For You, synced 2 Oct 2026: a copied link is 20, a reply on a mutual's original is 20, a reply or a quote is 5, a follow is 4, a repost is 1, a like is 0.5. Staying after a click is 0.4. A click is 0.3. Opening a link is 0.2. Scrolling past is -0.02. Not interested is -47.52. A report is -234. The first sentence is a fact someone would copy. The second sentence is why they stay. One question a mutual can answer may end it. One zenzen.fun link may sit on the last line. Never the old domain. No bait.";
