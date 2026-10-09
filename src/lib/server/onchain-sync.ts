import { decodeEventLog, encodeEventTopics, parseAbiItem } from "viem";
import { CHAINS, DEFAULT_CREATOR_TAX_BPS, type ChainKey } from "@/lib/chains";
import { getSql } from "@/lib/db";
import { computeHealth } from "@/lib/health";
import { displayTokenArt, isIpfsArt } from "@/lib/image-art";
import { isHexAddress } from "@/lib/intent";
import { FACTORY_LEGACY, isRetiredAddress } from "@/lib/onchain";
import { liveProtocolConfig } from "@/lib/server/secrets";
import { getLogs, readCreatorTaxBps, readErc20, readHolderSharing, readImageURI } from "@/lib/rpc.server";
import { cleanTokenName, isUnnamedTokenName } from "@/lib/token-name";

const LAUNCHED = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed curve, address indexed creator, address quote, string symbol)",
);

let lastSync = 0;
const SYNC_MS = 60_000;

export async function syncFactoryLaunches() {
  if (Date.now() - lastSync < SYNC_MS) return;
  lastSync = Date.now();
  const published = await liveProtocolConfig();
  const jobs: Promise<unknown>[] = [
    syncChain("robinhood", published.factory_robinhood),
    syncChain("arc", published.factory_arc),
  ];
  for (const addr of FACTORY_LEGACY.robinhood) jobs.push(syncChain("robinhood", addr));
  for (const addr of FACTORY_LEGACY.arc) jobs.push(syncChain("arc", addr));
  await Promise.allSettled(jobs);
}

async function syncChain(chain: ChainKey, factory?: string) {
  if (!isHexAddress(factory) || isRetiredAddress(factory)) return;
  const topic = encodeEventTopics({ abi: [LAUNCHED], eventName: "TokenLaunched" })[0];
  const logs = await getLogs(chain, factory, [topic]);
  if (!logs.length) return;
  const sql = await getSql();
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: [LAUNCHED],
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
    } catch {
      continue;
    }
    if (decoded.eventName !== "TokenLaunched") continue;
    const token = String(decoded.args.token).toLowerCase();
    const curve = String(decoded.args.curve).toLowerCase();
    const creator = String(decoded.args.creator).toLowerCase();
    const symbol = String(decoded.args.symbol || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 12)
      .toUpperCase();
    if (!isHexAddress(token) || !isHexAddress(curve) || !symbol) continue;
    const exists = await sql`
      select id from tokens
       where lower(coalesce(contract_address, '')) = ${token}
          or lower(coalesce(curve_address, '')) = ${curve}
       limit 1
    `;
    if (exists.length) continue;
    // Never index a launch without its own IPFS art. The Zenze mark is not a token face.
    let image = "";
    try {
      const uri = await readImageURI(chain, curve);
      if (isIpfsArt(uri)) image = displayTokenArt(uri);
    } catch {
      image = "";
    }
    if (!image) continue;
    let name = symbol;
    try {
      const meta = await readErc20(chain, token);
      name = cleanTokenName(meta.name, symbol);
    } catch {}
    name = cleanTokenName(name, symbol);
    if (isUnnamedTokenName(name)) name = symbol;
    const id = `${symbol.toLowerCase()}-${token.slice(2, 8)}`;
    const { health, rug } = computeHealth({ realBase: 0, holders: 1, topShare: 1, volumeNative24h: 0 });
    const [liveTax, liveSharing] = await Promise.all([
      readCreatorTaxBps(chain, curve),
      readHolderSharing(chain, curve),
    ]);
    const taxBps = liveTax == null ? DEFAULT_CREATOR_TAX_BPS : Math.max(0, Math.min(10_000, Math.round(liveTax)));
    const sharing = liveSharing === true;
    await sql`
      insert into tokens (
        id, name, symbol, description, image_url, creator_wallet, chain, quote_asset,
        virtual_base, virtual_tokens, holders, health_score, rug_probability,
        source, contract_address, curve_address, tx_hash, graduated,
        creator_tax_bps, holder_sharing
      ) values (
        ${id}, ${name}, ${symbol}, ${`Launched on ${CHAINS[chain].name}.`},
        ${image}, ${creator}, ${chain}, 'eth',
        30, 1073000000, 1, ${health}, ${rug},
        'launched', ${token}, ${curve}, ${log.transactionHash || null}, false,
        ${taxBps}, ${sharing}
      )
      on conflict (id) do nothing
    `;
  }
}
