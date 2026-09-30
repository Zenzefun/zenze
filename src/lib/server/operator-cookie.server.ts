import { deleteCookie, getCookie, getRequestProtocol, setCookie } from "@tanstack/react-start/server";
import type { OperatorSession } from "@/lib/operator-session";

const NAME = "zenze_desk";
const MAX_AGE = 12 * 60 * 60;

export function readOperatorCookie(): OperatorSession | null {
  try {
    const raw = getCookie(NAME);
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw)) as OperatorSession;
    if (!parsed?.wallet || !parsed.signature || !parsed.timestamp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOperatorCookie(session: OperatorSession) {
  setCookie(NAME, encodeURIComponent(JSON.stringify(session)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: getRequestProtocol({ xForwardedProto: true }) === "https",
  });
}

export function clearOperatorCookie() {
  deleteCookie(NAME, { path: "/" });
}
