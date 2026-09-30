import { createServerFn } from "@tanstack/react-start";

/**
 * Same response for every client. Do not change status by user-agent.
 * A scanner and a browser must see the same gate.
 */
export const probeDesk = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readOperatorCookie } = await import("@/lib/server/operator-cookie.server");
    const { verifyOperatorSession } = await import("@/lib/server/operator");
    const verified = await verifyOperatorSession(readOperatorCookie());
    if (verified.ok) return { crawler: false as const, signedIn: true as const, wallet: verified.wallet };
  } catch {
    // ignore — treat as signed out
  }
  return { crawler: false as const, signedIn: false as const };
});
