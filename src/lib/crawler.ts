/**
 * Indexing / unfurl agents only.
 * Headless Chrome / Playwright are humans in tooling — do not 404 the desk.
 * In-app browsers (WhatsApp, Instagram, X) are real people.
 */
const CRAWLER =
  /googlebot|bingbot|bingpreview|yandex(bot|images)|baiduspider|twitterbot|facebookexternalhit|linkedinbot|slackbot|telegrambot|discordbot|gptbot|claudebot|bytespider|semrushbot|ahrefsbot|dotbot|applebot|petalbot|duckduckbot|ia_archiver|google-inspectiontool|chrome-lighthouse/i;


export function isCrawlerUa(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return CRAWLER.test(ua);
}
