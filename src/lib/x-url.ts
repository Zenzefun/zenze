/** X autolinks a bare "Zenze.fun" as http://Zenze.fun and then warns. Only a full https URL is safe. */
export function neutralizeBareDomain(text: string): string {
  const https = text.replace(/https?:\/\/(?:www\.)?zenze\.fun([^\s]*)/gi, (_m, path: string) => {
    const clean = String(path || "").replace(/[),.;!?]+$/g, (punct) => `\0${punct}`);
    const [rest, punct = ""] = clean.split("\0");
    return `https://zenze.fun${rest}${punct}`;
  });
  return https.replace(/(^|[^\w:/.-])(?:www\.)?zenze\.fun\b/gi, "$1Zenze");
}
