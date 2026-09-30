import { readFileSync } from "node:fs";
import solc from "solc";
import { createPublicClient, createWalletClient, encodeDeployData, encodeFunctionData, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "./chain.mjs";

const file = process.env.SIGNER_FILE || "/root/.zenze-treasury.key";
const raw = readFileSync(file, "utf8");
const key = raw.split(/\s+/).find((part) => /^0x[a-fA-F0-9]{64}$/.test(part)) ?? "";
if (!/^0x[a-fA-F0-9]{64}$/.test(key)) {
  console.error("signer file is not a key");
  process.exit(1);
}

const ZNZF = "0x65ee0ce656908544a1f29856ac9aee8563b5002c";
const POOL = 50_000_000n * 10n ** 18n;
const erc20 = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);

function compile() {
  const source = readFileSync("contracts/ZenzeDrop.sol", "utf8");
  const input = {
    language: "Solidity",
    sources: { "ZenzeDrop.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const art = out.contracts["ZenzeDrop.sol"].ZenzeDrop;
  return { abi: art.abi, bytecode: `0x${art.evm.bytecode.object}` };
}

const account = privateKeyToAccount(key);
if (account.address.toLowerCase() !== "0x426b74d42607ae5484909dabfd3deb76db480f8e") {
  throw new Error(`signer is ${account.address}, not the treasury`);
}
const transport = http("https://rpc.mainnet.chain.robinhood.com", {
  fetchOptions: { headers: { "User-Agent": "Mozilla/5.0" } },
});
const publicClient = createPublicClient({ chain: robinhood, transport });
const wallet = createWalletClient({ account, chain: robinhood, transport });

const gas = await publicClient.getBalance({ address: account.address });
const held = await publicClient.readContract({ address: ZNZF, abi: erc20, functionName: "balanceOf", args: [account.address] });
console.log("treasury", account.address);
console.log("eth", gas.toString());
console.log("znzf", held.toString());
if (held < POOL) throw new Error("treasury holds less than 50,000,000 $ZNZF");
if (gas < 40_000_000_000_000n) throw new Error("not enough ETH");

const art = compile();
const data = encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args: [ZNZF, account.address] });
const deployHash = await wallet.sendTransaction({ data });
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
if (deployReceipt.status !== "success" || !deployReceipt.contractAddress) throw new Error(`deploy failed ${deployHash}`);
const drop = deployReceipt.contractAddress;
console.log("drop", drop);
console.log("deployTx", deployHash);

const fundData = encodeFunctionData({ abi: erc20, functionName: "transfer", args: [drop, POOL] });
const fundHash = await wallet.sendTransaction({ to: ZNZF, data: fundData });
const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundHash });
if (fundReceipt.status !== "success") throw new Error(`fund failed ${fundHash}`);
const pooled = await publicClient.readContract({ address: ZNZF, abi: erc20, functionName: "balanceOf", args: [drop] });
console.log("fundTx", fundHash);
console.log("pooled", pooled.toString());
if (pooled !== POOL) throw new Error("pool balance is not 50,000,000");
