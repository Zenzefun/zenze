import fs from "node:fs";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhood } from "./chain.mjs";

const key = process.env.DEPLOY_KEY;
if (!key || !/^0x[a-fA-F0-9]{64}$/.test(key)) {
  console.error("DEPLOY_KEY missing");
  process.exit(1);
}

const BURNER = "0x1f5287b157439db84aa7223bc5c42847e097e2fb";
const VAULT = "0xeaeb7d39cd6d362e420609142c5cf8f05999bac6";
const ZERO = "0x0000000000000000000000000000000000000000";
const transport = http("https://rpc.mainnet.chain.robinhood.com", {
  fetchOptions: { headers: { "User-Agent": "Mozilla/5.0" } },
});

function compile(file, contractName) {
  const source = fs.readFileSync(file, "utf8");
  const input = {
    language: "Solidity",
    sources: { [file]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors || []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join("\n"));
  const art = out.contracts[file][contractName];
  return { abi: art.abi, bytecode: `0x${art.evm.bytecode.object}` };
}

const account = privateKeyToAccount(key);
const publicClient = createPublicClient({ chain: robinhood, transport });
const wallet = createWalletClient({ account, chain: robinhood, transport });

async function send(to, data, value = 0n) {
  const hash = await wallet.sendTransaction(to ? { to, data, value } : { data, value });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`reverted ${hash}`);
  return { hash, receipt };
}

const views = parseAbi([
  "function owner() view returns (address)",
  "function burner() view returns (address)",
  "function intake() view returns (address)",
  "function splitter() view returns (address)",
  "function BUYBACK_BPS() view returns (uint256)",
  "function assetCount() view returns (uint256)",
]);

async function view(to, fn, args = []) {
  const data = encodeFunctionData({ abi: views, functionName: fn, args });
  const raw = await publicClient.call({ to, data });
  return decodeFunctionResult({ abi: views, functionName: fn, data: raw.data });
}

const balance = await publicClient.getBalance({ address: account.address });
console.log("deployer", account.address, "balance", balance.toString());
if (balance < 200_000_000_000_000n) throw new Error("not enough ETH for two deploys");

const burnerOwner = await view(BURNER, "owner");
const vaultOwner = await view(VAULT, "owner");
if (burnerOwner.toLowerCase() !== account.address.toLowerCase()) throw new Error("burner owner mismatch");
if (vaultOwner.toLowerCase() !== account.address.toLowerCase()) throw new Error("vault owner mismatch");

const splitterArt = compile("contracts/ZenzeBuybackSplitter.sol", "ZenzeBuybackSplitter");
const intakeArt = compile("contracts/ZenzeFeeIntake.sol", "ZenzeFeeIntake");

const splitterData = encodeDeployData({
  abi: splitterArt.abi,
  bytecode: splitterArt.bytecode,
  args: [BURNER, account.address],
});
const splitterTx = await send(undefined, splitterData);
const splitter = splitterTx.receipt.contractAddress;
if (!splitter) throw new Error("splitter address missing");
console.log("splitter", splitter, splitterTx.hash);

const intakeData = encodeDeployData({
  abi: intakeArt.abi,
  bytecode: intakeArt.bytecode,
  args: [account.address],
});
const intakeTx = await send(undefined, intakeData);
const intake = intakeTx.receipt.contractAddress;
if (!intake) throw new Error("intake address missing");
console.log("intake", intake, intakeTx.hash);

const setIntake = await send(
  splitter,
  encodeFunctionData({
    abi: parseAbi(["function setIntake(address next)"]),
    functionName: "setIntake",
    args: [intake],
  }),
);
const setSplitter = await send(
  intake,
  encodeFunctionData({
    abi: parseAbi(["function setSplitter(address next)"]),
    functionName: "setSplitter",
    args: [splitter],
  }),
);
const linkedBurner = await view(splitter, "burner");
const linkedIntake = await view(splitter, "intake");
const linkedSplitter = await view(intake, "splitter");
if (linkedBurner.toLowerCase() !== BURNER.toLowerCase()) throw new Error("splitter burner mismatch");
if (linkedIntake.toLowerCase() !== intake.toLowerCase()) throw new Error("splitter intake mismatch");
if (linkedSplitter.toLowerCase() !== splitter.toLowerCase()) throw new Error("intake splitter mismatch");

const ownerTx = await send(
  BURNER,
  encodeFunctionData({
    abi: parseAbi(["function setOwner(address next)"]),
    functionName: "setOwner",
    args: [splitter],
  }),
);
const newOwner = await view(BURNER, "owner");
if (newOwner.toLowerCase() !== splitter.toLowerCase()) throw new Error("burner owner was not moved");
console.log("burner owner", newOwner, ownerTx.hash);

const cfgPath = "src/lib/onchain.json";
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
cfg.robinhood.intake = intake;
cfg.robinhood.splitter = splitter;
cfg.robinhood.txs = {
  ...cfg.robinhood.txs,
  intake: intakeTx.hash,
  splitter: splitterTx.hash,
  setIntake: setIntake.hash,
  setSplitter: setSplitter.hash,
  burnerOwner: ownerTx.hash,
};
fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);

let sweepHash = "";
let forwardHash = "";
try {
  const vaultEth = await publicClient.getBalance({ address: VAULT });
  const bps = await view(VAULT, "BUYBACK_BPS");
  const sweepAmount = (vaultEth * BigInt(bps)) / 10_000n;
  console.log("vault", vaultEth.toString(), "bps", bps.toString(), "sweep", sweepAmount.toString());
  if (sweepAmount > 0n) {
    const swept = await send(
      VAULT,
      encodeFunctionData({
        abi: parseAbi(["function sweep(address to, uint256 amount)"]),
        functionName: "sweep",
        args: [intake, sweepAmount],
      }),
    );
    sweepHash = swept.hash;
    const forwarded = await send(
      intake,
      encodeFunctionData({
        abi: parseAbi(["function forward(address asset, uint256 amount)"]),
        functionName: "forward",
        args: [ZERO, sweepAmount],
      }),
    );
    forwardHash = forwarded.hash;
    cfg.robinhood.txs.sweepToIntake = sweepHash;
    cfg.robinhood.txs.forwardToSplitter = forwardHash;
    fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
    console.log("swept", sweepHash, "forwarded", forwardHash);
  }
} catch (error) {
  console.error("sweep skipped", error instanceof Error ? error.message : error);
}

const splitterEth = await publicClient.getBalance({ address: splitter });
const intakeEth = await publicClient.getBalance({ address: intake });
const intakeCount = await view(intake, "assetCount");
const splitterCount = await view(splitter, "assetCount");
console.log("balances", { splitterEth: splitterEth.toString(), intakeEth: intakeEth.toString(), intakeCount: intakeCount.toString(), splitterCount: splitterCount.toString() });
console.log("CONFIG_OK");
