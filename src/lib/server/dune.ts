import { configValue } from "@/lib/server/secrets";

type DuneRow = Record<string, unknown>;

const cache = new Map<string, { at: number; rows: DuneRow[] }>();

async function duneKey(): Promise<string | undefined> {
  return configValue("dune_api_key");
}

export async function duneSql(sql: string, ttlMs = 5 * 60_000): Promise<DuneRow[]> {
  const key = await duneKey();
  if (!key) throw new Error("Dune is not configured on this server.");
  const hit = cache.get(sql);
  if (hit && Date.now() - hit.at < ttlMs) return hit.rows;

  const exec = await fetch("https://api.dune.com/api/v1/sql/execute", {
    method: "POST",
    headers: { "X-Dune-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, performance: "medium" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!exec.ok) throw new Error(`Dune execute ${exec.status}`);
  const started = (await exec.json()) as { execution_id?: string };
  const id = started.execution_id;
  if (!id) throw new Error("Dune did not return an execution.");

  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1200));
    const res = await fetch(`https://api.dune.com/api/v1/execution/${id}/results?limit=200`, {
      headers: { "X-Dune-API-Key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Dune results ${res.status}`);
    const body = (await res.json()) as {
      state?: string;
      result?: { rows?: DuneRow[] };
    };
    if (body.state === "QUERY_STATE_COMPLETED") {
      const rows = body.result?.rows ?? [];
      cache.set(sql, { at: Date.now(), rows });
      return rows;
    }
    if (body.state === "QUERY_STATE_FAILED") throw new Error("Dune query failed.");
  }
  throw new Error("Dune query timed out.");
}

export async function duneReady(): Promise<boolean> {
  return Boolean(await duneKey());
}
