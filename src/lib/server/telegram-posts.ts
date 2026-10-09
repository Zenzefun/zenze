import { neutralizeBareDomain } from "../x-url.ts";

export const SLOTS_WIB = [8, 12, 16, 20, 23] as const;

const GAP_MS = 45 * 60 * 1000;

export function wibHour(now: Date) {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCHours();
}

export function jakartaDayStart(now: Date) {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - 7 * 60 * 60 * 1000);
}

export function jakartaDayIndex(now: Date) {
  const shifted = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const today = Date.UTC(y, shifted.getUTCMonth(), shifted.getUTCDate());
  const start = Date.UTC(y, 0, 0);
  return Math.floor((today - start) / 86400000);
}

export function announcementsOwed(now: Date) {
  const hour = wibHour(now);
  return SLOTS_WIB.filter((slot) => slot <= hour).length;
}

export function announcementDue(sentToday: number, lastSentAt: number, now: Date) {
  const owed = announcementsOwed(now);
  if (sentToday >= 5 || sentToday >= owed) return false;
  if (lastSentAt && now.getTime() - lastSentAt < GAP_MS) return false;
  return true;
}

export function cleanNote(raw: string): string | null {
  const text = neutralizeBareDomain(raw)
    .trim()
    .replace(/^["']|["']$/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .slice(0, 700);
  if (text.length < 20) return null;
  if (/seed phrase|private key|guaranteed|100x|to the moon|buy now|not affiliated/i.test(text)) return null;
  if (/0x[a-fA-F0-9]{40}/.test(text.replace(/https:\/\/zenzen\.fun\/token\/0x[a-fA-F0-9]{40}/gi, ""))) return null;
  if (/http:\/\//i.test(text)) return null;
  if (/(?:https?:\/\/(?:www\.)?)?zenze\.fun\b/i.test(text) || /linktr\.ee\/zenzefun/i.test(text)) return null;
  return text;
}

export function announcementText(index: number, znzfUrl: string) {
  const posts = [
    "Your token can have a pool today.\n\nYou name it. You pick the pair.\n\nThen it trades in public.\n\nhttps://zenzen.fun/launch",
    `You can buy $ZNZF and sell it back into the same pool.\n\nThe pool sets the price.\n\n${znzfUrl}`,
    "Points are counting now.\n\nWhen the pool opens, one point is the same share as any other.\n\nhttps://zenzen.fun/airdrop",
    "The bridge locks $ZNZF on Robinhood and releases the same amount on Arc.\n\nIt is not a second coin.\n\nhttps://zenzen.fun/bridge",
    "Stake locks the vote.\n\nA balance that is not locked does not speak.\n\nhttps://zenzen.fun/staking",
    "Open the board and read the pools that are already trading.\n\nLook before you launch.\n\nhttps://zenzen.fun/explore",
    "A token that already exists can still be listed here.\n\nThe page is short.\n\nhttps://zenzen.fun/list",
    "A friend who buys $ZNZF can add points, up to ten.\n\nThe invite appears after you connect.\n\nhttps://zenzen.fun/airdrop",
    "Arc gas is USDC.\n\nIt stays in your wallet. It is not a payment to Zenze.\n\nhttps://zenzen.fun/fund",
    "Name a token. The pool opens when the launch lands.\n\nYou can sell it back into that same pool.\n\nhttps://zenzen.fun/launch",
  ];
  const n = ((index % posts.length) + posts.length) % posts.length;
  return posts[n]!;
}
