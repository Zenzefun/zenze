/**
 * Team / operator wallets. Arya can add more here.
 * Used to separate community launches from team/protocol on the board.
 */
const TEAM = [
  "0x6878719902a11148815e521fead2d2c9fa81dacc", // TREASURY_WALLET / current deployer (onchain.json)
  "0x4ea876ba2fe3a565344cbb127b381402d636f413", // desk admin / previous $ZNZF creator
  "0x9571f0e9b944d4eabb678a3a4969b400c97a2573", // historical deployer (early migrations)
  "0x426b74d42607ae5484909dabfd3deb76db480f8e", // previous treasury, rotated to 0x6878…dacc
  "0xed43c2daf601c14b1053c57a5dfe4971b7b0fc58", // testnet deployer (Elysium / QMS)
].map((a) => a.toLowerCase());

const TEAM_SET = new Set(TEAM);

export function isTeamWallet(addr: string | null | undefined): boolean {
  if (!addr) return false;
  return TEAM_SET.has(addr.toLowerCase());
}

type TokenLike = {
  id?: string | null;
  symbol?: string | null;
  source?: string | null;
  creator_wallet?: string | null;
};

export function isCommunityLaunch(token: TokenLike): boolean {
  if (!token) return false;
  if (token.source === "listed") return false;
  const id = (token.id ?? "").trim().toLowerCase();
  const symbol = (token.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  if (id === "znzf" || symbol === "ZNZF") return false; // same rule as isProtocolToken
  if (isTeamWallet(token.creator_wallet)) return false;
  return true;
}

export { TEAM as TEAM_WALLETS };
