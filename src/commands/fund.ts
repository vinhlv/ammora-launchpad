// Optional helper — wrap native ETH into the curve's quote token (WETH).
//
//   fund <humanAmount>
//
// GIWA's default path separates native ETH from WETH: gas uses ETH, ERC-20
// buys use the actual quote asset. Wrapping itself needs no ERC-20 approval.
// Only wrap the required amount; wrapping all ETH wastes gas flexibility.
import { encodeFunctionData, parseUnits } from "viem";
import { printJson } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { openAuthenticatedCurve, type V4Core } from "../lib/curve.js";
import { sendTransaction } from "../lib/tx.js";
import { loadState, requireState } from "../lib/state.js";

const depositAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
] as const;

export const resolveCore = (launch: ReturnType<typeof v4Deployment>["contracts"]["launch"]): V4Core => ({
  configRegistry: launch.configRegistry,
  launchFactory: launch.factory,
  graduationAdapter: launch.graduationAdapter,
  feePolicy: launch.feePolicy,
});

export const resolveCurveFromState = (): `0x${string}` =>
  requireState(loadState().launch?.curve, "missing ALC curve address") as `0x${string}`;

export const runFund = async (args: string[]): Promise<void> => {
  const [humanAmount] = args;
  if (!humanAmount || !/^\d+(\.\d+)?$/.test(humanAmount)) {
    throw new Error("usage: fund <humanAmount>  (e.g. 0.5 for 0.5 ETH)");
  }
  const value = parseUnits(humanAmount, 18);
  if (value <= 0n) throw new Error("amount must be positive");

  const { wallet, account } = signer();
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const curve = resolveCurveFromState();
  const { state } = await openAuthenticatedCurve(
    client,
    resolveCore(launch),
    curve,
    block.number,
  );
  const quoteToken = state.quoteToken;
  console.log(`quote token ${quoteToken}`);
  console.log(`wrapping    ${humanAmount} ETH -> WETH`);

  const { hash, blockNumber } = await sendTransaction(
    client,
    wallet,
    account,
    "WETH deposit",
    {
      to: quoteToken,
      data: encodeFunctionData({ abi: depositAbi, functionName: "deposit" }),
      value,
    },
  );
  const wrapped = await client.readContract({
    address: quoteToken,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ type: "address" }],
        outputs: [{ type: "uint256" }],
      },
    ] as const,
    functionName: "balanceOf",
    args: [account.address],
    blockNumber,
  });
  printJson({ hash, blockNumber, value: value.toString(), wethBalance: wrapped });
};
