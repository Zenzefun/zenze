import { createServerFn } from "@tanstack/react-start";
import { env } from "@/lib/env.server";
import { isHexAddress } from "@/lib/intent";

/** Arc USDC funding is a Circle session. The key never leaves the server. */
export const onrampStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { live: Boolean(env("ONRAMP_API_KEY")) };
});

export const startOnramp = createServerFn({ method: "POST" })
  .validator((input: { wallet?: string }) => input)
  .handler(async ({ data }) => {
    const wallet = String(data?.wallet ?? "");
    if (!isHexAddress(wallet)) return { ok: false as const, error: "Connect a wallet first." };
    const apiKey = env("ONRAMP_API_KEY");
    if (!apiKey) return { ok: false as const, error: "USDC funding is not open yet." };
    try {
      const { createOnrampServerKit } = await import("@circle-fin/onramp-kit/server");
      const server = createOnrampServerKit({ apiKey, referrerDomain: "zenze.fun" });
      const session = await server.createSession({
        appUserId: wallet.toLowerCase(),
        destinationAddress: wallet,
        destinationChain: "Arc",
        currency: "USD",
        assets: { pairs: [{ token: "USDC", chain: "arc" }] },
      });
      return { ok: true as const, session };
    } catch {
      return { ok: false as const, error: "USDC funding could not start. Try again in a moment." };
    }
  });
