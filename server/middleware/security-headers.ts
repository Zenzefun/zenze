/** Security headers on every response. No content rewrite. */
interface SecurityEvent {
  req: { method: string; headers: Headers };
}

function stamp(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  headers.set("x-dns-prefetch-control", "off");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default async function securityHeaders(
  _event: SecurityEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  try {
    const result = await next();
    return result instanceof Response ? stamp(result) : result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/aborted|ECONNRESET/i.test(message)) return new Response(null, { status: 499 });
    throw err;
  }
}
