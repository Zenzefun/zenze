/** X autolinks a bare "Zenze.fun" as http://Zenze.fun and then warns. Only a full https URL is safe. */
export function fixLivePaths(text: string) {
  return text
    .replace(/(?:https?:\/\/)?(?:www\.)?zenze[n]?\.fun\/points\b/gi, "https://zenzen.fun/airdrop")
    .replace(/(?:https?:\/\/)?(?:www\.)?zenze[n]?\.fun\/stake(?!ing)\b/gi, "https://zenzen.fun/staking");
}

export function neutralizeBareDomain(text: string): string {
  const fixed = fixLivePaths(text);
  const https = fixed.replace(/https?:\/\/(?:www\.)?zenze[n]?\.fun([^\s]*)/gi, (_m, path: string) => {
    const clean = String(path || "").replace(/[),.;!?]+$/g, (punct) => `\0${punct}`);
    const [rest, punct = ""] = clean.split("\0");
    return `https://zenzen.fun${rest}${punct}`;
  });
  return https.replace(/(^|[^\w:/.-])(?:www\.)?zenze[n]?\.fun\b/gi, "$1Zenzen");
}
