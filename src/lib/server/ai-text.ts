/** Pull the visible answer out of a chat-completions message. Never mix CoT into JSON. */

export function asChatText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function pickChatText(msg: { content?: unknown; reasoning_content?: unknown } | null | undefined): string {
  if (!msg) return "";
  const content = asChatText(msg.content);
  if (content) return content;
  return asChatText(msg.reasoning_content);
}

/** Maya is not Capy. Capy memory and the mascot prompt were the leftover mill. */
export function systemForKind(kind: string, extraSystem: string, capyPrompt: string): string {
  if (kind.startsWith("maya")) return extraSystem || capyPrompt;
  return extraSystem ? `${capyPrompt}\n\n${extraSystem}` : capyPrompt;
}

export function useCapyMemory(kind: string): boolean {
  return !kind.startsWith("maya");
}
