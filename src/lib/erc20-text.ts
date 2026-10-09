import { decodeFunctionResult, parseAbi } from "viem";

const AS_STRING = parseAbi(["function symbol() view returns (string)"]);

/** ERC-20 name and symbol are sometimes a string, sometimes a raw bytes32 word. */
export function decodeAbiWord(data: string | null | undefined): string {
  if (!data || data === "0x") return "";
  if (/^0x[0-9a-fA-F]{64}$/.test(data)) {
    const bytes: number[] = [];
    for (let i = 2; i < data.length; i += 2) {
      const n = Number.parseInt(data.slice(i, i + 2), 16);
      if (!n) break;
      bytes.push(n);
    }
    return Buffer.from(bytes).toString("utf8");
  }
  try {
    return String(decodeFunctionResult({ abi: AS_STRING, functionName: "symbol", data: data as `0x${string}` }));
  } catch {
    return "";
  }
}
