// ALC (pre-graduation curve) authentication, quotes and explicit-block planning.
//
// Raw state/quote methods alone do not authenticate a curve. Every command
// binds the curve to the reviewed factory and immutable fee policy at the same
// snapshot block before displaying or acting on it.
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

export type V4Core = {
  configRegistry: Address;
  launchFactory: Address;
  graduationAdapter: Address;
  feePolicy: Address;
};

/** Open a curve client and prove the curve belongs to the reviewed deployment. */
export const openAuthenticatedCurve = async (
  client: PublicClient,
  core: V4Core,
  curve: Address,
  blockNumber: bigint,
): Promise<{
  sdk: AmmoraV4LaunchCurveClient;
  state: Awaited<ReturnType<AmmoraV4LaunchCurveClient["getStateAtBlock"]>>;
}> => {
  await verifyAmmoraV4CoreAtBlock(client, core, blockNumber);
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, core);
  const state = await sdk.getStateAtBlock(blockNumber);
  if (state.asOfBlock !== blockNumber) {
    throw new Error("curve state is from a different block");
  }
  const factoryToken = await client.readContract({
    address: core.launchFactory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "tokenForCurve",
    args: [curve],
    blockNumber,
  });
  if (
    factoryToken === zeroAddress ||
    factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
    state.feePolicy.toLowerCase() !== core.feePolicy.toLowerCase() ||
    state.feePolicyVersion !== AMMORA_FEE_POLICY_VERSION
  ) {
    throw new Error(
      "curve is not bound to the reviewed V4 factory and fee policy",
    );
  }
  return { sdk, state };
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

/**
 * Explicit-block V4 planning. Authentication and quotes stay at the caller's
 * reviewed block; execution must still simulate against current state and
 * enforce minimum output. Ordinary orders must fill in full; a graduation buy
 * must reach the terminal boundary.
 */
export const planCurveAtBlock = async (
  client: PublicClient,
  core: V4Core,
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
) => {
  if (
    parameters.amountIn <= 0n ||
    !Number.isSafeInteger(parameters.slippageBps) ||
    parameters.slippageBps < 0 ||
    parameters.slippageBps > 1000
  ) {
    throw new Error(
      "positive input and slippage from 0 to 1000 bps required",
    );
  }
  const blockNumber = parameters.blockNumber;
  const { state } = await openAuthenticatedCurve(client, core, curve, blockNumber);
  if (state.status !== 1) {
    throw new Error(
      `Curve status ${state.status} (${curveStatusName(state.status)}) is not active`,
    );
  }
  const baseForQuote =
    parameters.tokenIn.toLowerCase() === state.baseToken.toLowerCase();
  if (
    !baseForQuote &&
    parameters.tokenIn.toLowerCase() !== state.quoteToken.toLowerCase()
  ) {
    throw new Error("tokenIn is not a curve asset");
  }
  const sdk = new AmmoraV4LaunchCurveClient(client, curve, core);
  const quote = await sdk.quoteExactInputAtBlock(
    parameters.amountIn,
    baseForQuote,
    blockNumber,
  );
  if (quote.asOfBlock !== blockNumber) {
    throw new Error("curve quote is from a different block");
  }
  const fill = classifyAmmoraV4ExactInputFill(quote, baseForQuote);
  const boundary = parameters.graduationBoundary === true;
  if (boundary ? fill.kind !== "graduation-boundary" : fill.kind !== "full") {
    throw new Error(
      `Unexpected ${fill.kind}; ordinary orders must fill in full and ` +
        "graduation buys must reach the boundary",
    );
  }
  const minimumAmountOut =
    (quote.amountOut * BigInt(10_000 - parameters.slippageBps)) / 10_000n;
  if (minimumAmountOut === 0n) {
    throw new Error("minimum output rounds to zero");
  }
  return {
    state,
    quote: { ...quote, minimumAmountOut },
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
    approvalRequirements: [
      {
        token: parameters.tokenIn,
        spender: curve,
        amount: parameters.amountIn,
      },
    ],
  };
};
