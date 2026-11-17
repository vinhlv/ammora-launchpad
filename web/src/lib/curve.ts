// Browser port of the CLI's ALC curve authentication and explicit-block
// planning. Same guarantees: curve bound to the reviewed factory + fee policy
// at the same snapshot, strict fills for ordinary orders, boundary-only
// graduation buys.
import {
  AMMORA_FEE_POLICY_VERSION,
  AmmoraV4LaunchCurveClient,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
  classifyAmmoraV4ExactInputFill,
  verifyAmmoraV4CoreAtBlock,
} from "@ammora-protocol/sdk";
import { encodeFunctionData, zeroAddress } from "viem";
import type { Address, PublicClient } from "viem";
import type { V4LaunchContracts } from "./chain";

export type V4Core = {
  configRegistry: Address;
  launchFactory: Address;
  graduationAdapter: Address;
  feePolicy: Address;
};

export const curveStatusName = (status: number): string =>
  status === 0
    ? "Uninitialized"
    : status === 1
      ? "Active"
      : status === 2
        ? "ReadyToMigrate"
        : status === 3
          ? "Migrated"
          : `Unknown(${status})`;

export type CurveState = Awaited<
  ReturnType<AmmoraV4LaunchCurveClient["getStateAtBlock"]>
>;

export const openAuthenticatedCurve = async (
  client: PublicClient,
  launch: V4LaunchContracts,
  curve: Address,
  blockNumber: bigint,
): Promise<{ sdk: AmmoraV4LaunchCurveClient; state: CurveState }> => {
  const core: V4Core = {
    configRegistry: launch.configRegistry,
    launchFactory: launch.factory,
    graduationAdapter: launch.graduationAdapter,
    feePolicy: launch.feePolicy,
  };
  await verifyAmmoraV4CoreAtBlock(client, core, blockNumber);
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, core);
  const state = await sdk.getStateAtBlock(blockNumber);
  if (state.asOfBlock !== blockNumber) {
    throw new Error("curve state is from a different block");
  }
  const factoryToken = await client.readContract({
    address: launch.factory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "tokenForCurve",
    args: [curve],
    blockNumber,
  });
  if (
    factoryToken === zeroAddress ||
    factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
    state.feePolicy.toLowerCase() !== launch.feePolicy.toLowerCase() ||
    state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION
  ) {
    throw new Error("curve is not bound to the reviewed V4 factory and fee policy");
  }
  return { sdk, state };
};

export type CurvePlan = {
  state: CurveState;
  quote: { amountOut: bigint; amountIn: bigint; amountLeft: bigint; minimumAmountOut: bigint };
  fill: ReturnType<typeof classifyAmmoraV4ExactInputFill>;
  baseForQuote: boolean;
  tokenOut: Address;
  transaction: { to: Address; data: `0x${string}` };
  approvalRequirement: { token: Address; spender: Address; amount: bigint };
};

export const planCurveAtBlock = async (
  client: PublicClient,
  launch: V4LaunchContracts,
  curve: Address,
  parameters: {
    blockNumber: bigint;
    tokenIn: Address;
    amountIn: bigint;
    recipient: Address;
    deadline: bigint;
    slippageBps: number;
    graduationBoundary?: boolean;
  },
): Promise<CurvePlan> => {
  if (
    parameters.amountIn <= 0n ||
    !Number.isSafeInteger(parameters.slippageBps) ||
    parameters.slippageBps < 0 ||
    parameters.slippageBps > 1000
  ) {
    throw new Error("positive input and slippage from 0 to 1000 bps required");
  }
  const { state } = await openAuthenticatedCurve(client, launch, curve, parameters.blockNumber);
  if (state.status !== 1) {
    throw new Error(
      `Curve status ${state.status} (${curveStatusName(state.status)}) is not active`,
    );
  }
  const baseForQuote =
    parameters.tokenIn.toLowerCase() === state.baseToken.toLowerCase();
  if (!baseForQuote && parameters.tokenIn.toLowerCase() !== state.quoteToken.toLowerCase()) {
    throw new Error("tokenIn is not a curve asset");
  }
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, {
    launchFactory: launch.factory,
    feePolicy: launch.feePolicy,
  });
  const quote = await sdk.quoteExactInputAtBlock(
    parameters.amountIn,
    baseForQuote,
    parameters.blockNumber,
  );
  if (quote.asOfBlock !== parameters.blockNumber) {
    throw new Error("curve quote is from a different block");
  }
  const fill = classifyAmmoraV4ExactInputFill(quote, baseForQuote);
  const boundary = parameters.graduationBoundary === true;
  if (boundary ? fill.kind !== "graduation-boundary" : fill.kind !== "full") {
    throw new Error(
      `Unexpected ${fill.kind}; ordinary orders must fill in full and graduation buys must reach the boundary`,
    );
  }
  const minimumAmountOut = (quote.amountOut * BigInt(10_000 - parameters.slippageBps)) / 10_000n;
  if (minimumAmountOut === 0n) throw new Error("minimum output rounds to zero");
  return {
    state,
    quote: {
      amountOut: quote.amountOut,
      amountIn: quote.amountIn,
      amountLeft: quote.amountLeft,
      minimumAmountOut,
    },
    fill,
    baseForQuote,
    tokenOut: (baseForQuote ? state.quoteToken : state.baseToken) as Address,
    transaction: {
      to: curve,
      data: encodeFunctionData({
        abi: ammoraLaunchPoolV4Abi,
        functionName: "swapExactInput",
        args: [
          parameters.amountIn,
          minimumAmountOut,
          baseForQuote,
          boundary,
          parameters.recipient,
          parameters.deadline,
        ],
      }),
    },
    approvalRequirement: {
      token: parameters.tokenIn,
      spender: curve,
      amount: parameters.amountIn,
    },
  };
};
