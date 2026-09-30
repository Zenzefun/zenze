import { createMiddleware } from "@tanstack/react-start";
import { readOperatorSession } from "@/lib/operator-session";

export const operatorMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    return next({ sendContext: { operator: readOperatorSession() ?? undefined } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("@/lib/auth/isolation.server");
    const { requireOperator } = await import("@/lib/server/operator");
    const { clearOperatorCookie, readOperatorCookie } = await import("@/lib/server/operator-cookie.server");
    assertSameSiteRequest();
    const cookie = readOperatorCookie();
    const candidates = [context.operator, cookie].filter((row) => row?.wallet && row.signature);
    let lastError: unknown = new Error("Unauthorized");
    const seen = new Set<string>();
    for (const session of candidates) {
      const mark = `${session?.wallet}:${session?.timestamp}`;
      if (seen.has(mark)) continue;
      seen.add(mark);
      try {
        const operatorWallet = await requireOperator(session);
        return next({ context: { operatorWallet } });
      } catch (err) {
        lastError = err;
      }
    }
    clearOperatorCookie();
    throw lastError;
  });
