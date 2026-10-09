import { encodeDeployData, encodeFunctionData, encodePacked, keccak256, parseAbi, parseUnits, type Abi } from "viem";
import artifacts from "./abi/contracts.json";
import buybackArtifact from "./abi/buyback.json";
import { ZERO_ADDRESS } from "./chains";
import { capCreatorTaxBps } from "./fee-split";
import { FACTORY_MIN_WEI } from "./fees";
import { quoteAddress, type QuoteAsset } from "./pairs";
import type { ChainKey } from "./chains";
import { parseTokenMeta } from "./token-name";

type Artifact = { abi: Abi; bytecode: `0x${string}` };

const CONTRACTS = artifacts as Record<string, Artifact>;
const BUYBACK = buybackArtifact as { abi: Abi; bytecode: `0x${string}` };

export const PROTOCOL_ABI = {
  ZenzeToken: CONTRACTS.ZenzeToken.abi,
  ZenzeBridgedToken: CONTRACTS.ZenzeBridgedToken.abi,
  ZenzeFeeVault: CONTRACTS.ZenzeFeeVault.abi,
  ZenzeLaunchFactory: CONTRACTS.ZenzeLaunchFactory.abi,
  ZenzeMultiChainBridge: CONTRACTS.ZenzeMultiChainBridge.abi,
  ZenzeForeignBridge: CONTRACTS.ZenzeForeignBridge.abi,
  ZenzeBondingCurve: CONTRACTS.ZenzeBondingCurve.abi,
  ZenzeV4Migrator: CONTRACTS.ZenzeV4Migrator.abi,
};

export function deployData(name: keyof typeof CONTRACTS, args: readonly unknown[]): `0x${string}` {
  const art = CONTRACTS[name];
  return encodeDeployData({ abi: art.abi, bytecode: art.bytecode, args: args as never });
}

export function launchCalldata(input: {
  name: string;
  symbol: string;
  quote: QuoteAsset;
  chain: ChainKey;
  znzfAddress?: string | null;
  value?: bigint;
  creatorWallet?: string | null;
  creatorTaxBps?: number;
  holderSharing?: boolean;
  snipeExempt?: string[];
}): { data: `0x${string}`; value: bigint } {
  const meta = parseTokenMeta(input.name, input.symbol);
  if (!meta.ok) throw new Error(meta.error);
  let quoteAddr = quoteAddress(input.quote, input.chain);
  if (input.quote.key === "znzf") {
    const z = input.znzfAddress?.toLowerCase();
    if (!z || !z.startsWith("0x") || z.length !== 42) {
      throw new Error("$ZNZF is not published on this chain yet.");
    }
    quoteAddr = z as `0x${string}`;
  }
  const virtualBase = parseUnits(String(input.quote.virtualBase), input.quote.decimals);
  const virtualTokens = parseUnits(String(input.quote.virtualTokens), 18);
  const graduateAt = parseUnits(String(input.quote.graduation), input.quote.decimals);
  const creator =
    input.creatorWallet && /^0x[a-fA-F0-9]{40}$/.test(input.creatorWallet)
      ? (input.creatorWallet as `0x${string}`)
      : ZERO_ADDRESS;
  let tax = capCreatorTaxBps(Number(input.creatorTaxBps));
  const exempt = (input.snipeExempt ?? [])
    .map((a) => a.trim())
    .filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a))
    .slice(0, 8) as `0x${string}`[];
  return {
    data: encodeFunctionData({
      abi: PROTOCOL_ABI.ZenzeLaunchFactory,
      functionName: "launchAdvanced",
      args: [
        meta.name,
        meta.symbol,
        quoteAddr === ZERO_ADDRESS ? ZERO_ADDRESS : quoteAddr,
        virtualBase,
        virtualTokens,
        graduateAt,
        creator,
        tax,
        Boolean(input.holderSharing),
        exempt,
      ],
    }),
    value: input.value && input.value > 0n ? input.value : FACTORY_MIN_WEI,
  };
}

export function intakeForwardCalldata(asset: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function forward(address asset, uint256 amount)"]),
    functionName: "forward",
    args: [asset as `0x${string}`, amount],
  });
}

export function splitterValueCalldata(minTokensOut: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function executeBuybackValue(uint256 minTokensOut)"]),
    functionName: "executeBuybackValue",
    args: [minTokensOut],
  });
}

export function splitterInventoryCalldata(amount: bigint, minTokensOut: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function executeBuyback(uint256 amount, uint256 minTokensOut)"]),
    functionName: "executeBuyback",
    args: [amount, minTokensOut],
  });
}

export function splitterHeldCalldata(minTokensOut: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function executeHeld(uint256 minTokensOut)"]),
    functionName: "executeHeld",
    args: [minTokensOut],
  });
}

export function buybackCalldata(minTokensOut: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: BUYBACK.abi,
    functionName: "buyback",
    args: [minTokensOut],
  });
}

export function buybackHeldCalldata(minTokensOut: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: BUYBACK.abi,
    functionName: "buybackHeld",
    args: [minTokensOut],
  });
}

export function vaultSweepCalldata(to: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeFeeVault,
    functionName: "sweep",
    args: [to as `0x${string}`, amount],
  });
}

export function routerRunCalldata(minTokensOut: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function run(uint256 minTokensOut)"]),
    functionName: "run",
    args: [minTokensOut],
  });
}

export function stakeCalldata(amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function stake(uint256 amount)"]),
    functionName: "stake",
    args: [amount],
  });
}

export function unstakeCalldata(amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function unstake(uint256 amount)"]),
    functionName: "unstake",
    args: [amount],
  });
}

export function claimStakeCalldata(): `0x${string}` {
  return encodeFunctionData({
    abi: parseAbi(["function claim()"]),
    functionName: "claim",
  });
}

export function vaultBurnCalldata(amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeFeeVault,
    functionName: "burnHeldZnzf",
    args: [amount],
  });
}

export function curveBuyCalldata(amountWei: bigint, native: boolean, minTokensOut: bigint = 0n): { data: `0x${string}`; value: bigint } {
  return {
    data: encodeFunctionData({
      abi: PROTOCOL_ABI.ZenzeBondingCurve,
      functionName: "buyFor",
      args: [amountWei, minTokensOut],
    }),
    value: native ? amountWei : 0n,
  };
}

export function curveSellCalldata(tokenWei: bigint, minQuoteOut: bigint = 0n): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeBondingCurve,
    functionName: "sellFor",
    args: [tokenWei, minQuoteOut],
  });
}

export function claimCreatorFeesCalldata(): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeBondingCurve,
    functionName: "claimCreatorFees",
    args: [],
  });
}

export function claimHolderFeesCalldata(): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeBondingCurve,
    functionName: "claimHolderFees",
    args: [],
  });
}

export function erc20ApproveCalldata(spender: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "approve",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [spender as `0x${string}`, amount],
  });
}

export function erc20TransferCalldata(to: string, amount: bigint): `0x${string}` {
  return encodeFunctionData({
    abi: [
      {
        type: "function",
        name: "transfer",
        stateMutability: "nonpayable",
        inputs: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "transfer",
    args: [to as `0x${string}`, amount],
  });
}

export function bridgeLockCalldata(amount: bigint, dstChainId: number, id: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeMultiChainBridge,
    functionName: "lock",
    args: [amount, BigInt(dstChainId), id],
  });
}

export function bridgeTransferId(from: string, amount: bigint, salt: number): `0x${string}` {
  return keccak256(encodePacked(["address", "uint256", "uint256"], [from as `0x${string}`, amount, BigInt(salt)]));
}

export function bridgeAttestCalldata(id: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeMultiChainBridge,
    functionName: "attest",
    args: [id],
  });
}

export function bridgeMintCalldata(to: string, amount: bigint, id: `0x${string}`): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeForeignBridge,
    functionName: "mint",
    args: [to as `0x${string}`, amount, id],
  });
}

export function protocolCurveDeploy(input: {
  token: string;
  quote: string;
  creator: string;
  feeVault: string;
  virtualBase: bigint;
  virtualTokens: bigint;
  graduateAt: bigint;
}): `0x${string}` {
  return deployData("ZenzeBondingCurve", [
    {
      token: input.token,
      quote: input.quote,
      creator: input.creator,
      feeVault: input.feeVault,
      virtualBase: input.virtualBase,
      virtualTokens: input.virtualTokens,
      graduateAt: input.graduateAt,
      creatorTaxBps: 0,
      holderSharing: false,
    },
    [],
  ]);
}

export function launchFactoryDeploy(vault: string): `0x${string}` {
  return deployData("ZenzeLaunchFactory", [vault]);
}

export function v4MigratorDeploy(poolManager: string): `0x${string}` {
  return deployData("ZenzeV4Migrator", [poolManager]);
}

export function setImageURICalldata(uri: string): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeBondingCurve,
    functionName: "setImageURI",
    args: [uri],
  });
}

export function setMigratorCalldata(migrator: string): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeBondingCurve,
    functionName: "setMigrator",
    args: [migrator as `0x${string}`],
  });
}

export function znzfTokenDeploy(treasury: string): `0x${string}` {
  return deployData("ZenzeToken", [treasury]);
}

export function feeVaultDeploy(owner: string, znzf: string): `0x${string}` {
  return deployData("ZenzeFeeVault", [owner, znzf]);
}

export function homeBridgeDeploy(token: string, operator: string): `0x${string}` {
  return deployData("ZenzeMultiChainBridge", [token, [operator], 1n]);
}

export function bridgedTokenDeploy(owner: string): `0x${string}` {
  return deployData("ZenzeBridgedToken", [owner]);
}

export function foreignBridgeDeploy(token: string, operator: string): `0x${string}` {
  return deployData("ZenzeForeignBridge", [token, [operator], 1n]);
}

export function setBridgeCalldata(bridge: string): `0x${string}` {
  return encodeFunctionData({
    abi: PROTOCOL_ABI.ZenzeBridgedToken,
    functionName: "setBridge",
    args: [bridge as `0x${string}`],
  });
}

