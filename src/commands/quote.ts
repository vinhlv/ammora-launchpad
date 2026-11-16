// Step 4 — read ALC curve state and optional raw-unit quotes.
//
//   quote [curve]                      — state only
//   quote [curve] buy <amountInRaw>    — quote-token -> base-token quote
//   quote [curve] sell <amountInRaw>   — base-token -> quote-token quote
//
// Raw integers differ from human decimal amounts. Receipt overrides
// (AMMORA_READ_RECEIPT) apply to one read only; clear them before trading.
import {
  classifyAmmoraV4ExactInputFill,
  type AmmoraV4LaunchCurveClient,
} from "@ammora-protocol/sdk";
import type { Address } from "viem";
import { printJson, rawAmount } from "../lib/format.js";
import { readBlock, reader, v4Deployment } from "../lib/env.js";
import {
  curveStatusName,
  openAuthenticatedCurve,
  type V4Core,
} from "../lib/curve.js";
import { loadState, requireState } from "../lib/state.js";

type CurveState = Awaited<
  ReturnType<AmmoraV4LaunchCurveClient["getStateAtBlock"]>
>;

const readCurveQuote = async (
  sdk: Pick<AmmoraV4LaunchCurveClient, "getStateAtBlock" | "quoteExactInputAtBlock">,
  blockNumber: bigint,
  request?: { amountIn: bigint; baseForQuote: boolean },
) => {
  const state = await sdk.getStateAtBlock(blockNumber);
  if (state.asOfBlock !== blockNumber) {
    throw new Error("curve state is from a different block");
  }
  if (!request || state.status !== 1) {
    return { state, quote: null, fill: null };
  }
  const quote = await sdk.quoteExactInputAtBlock(
    request.amountIn,
    request.baseForQuote,
    blockNumber,
  );
  if (quote.asOfBlock !== blockNumber) {
    throw new Error("curve quote is from a different block");
  }
  return { state, quote, fill: classifyAmmoraV4ExactInputFill(quote, request.baseForQuote) };
};

export const resolveCurve = (positional?: string): Address =>
  (positional ??
    requireState(loadState().launch?.curve, "missing ALC curve address")) as Address;

export const coreFor = (launch: ReturnType<typeof v4Deployment>["contracts"]["launch"]): V4Core => ({
  configRegistry: launch.configRegistry,
  launchFactory: launch.factory,
  graduationAdapter: launch.graduationAdapter,
  feePolicy: launch.feePolicy,
});

export const describeCurveState = (state: CurveState) => ({
  status: state.status,
  statusName: curveStatusName(state.status),
  baseToken: state.baseToken,
  quoteToken: state.quoteToken,
  canonicalPool: state.canonicalPool,
});

export const runQuote = async (args: string[]): Promise<void> => {
  const [curveArg, direction, raw, ...extra] = args;
  if (
    extra.length > 0 ||
    (direction !== undefined && direction !== "buy" && direction !== "sell")
  ) {
    throw new Error("usage: quote [curve] [buy|sell <amountInRaw>]");
  }
  const curve = resolveCurve(curveArg);
  const request = direction
    ? {
        amountIn: rawAmount(raw ?? "", "amountInRaw"),
        baseForQuote: direction === "sell",
      }
    : undefined;

  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const { sdk } = await openAuthenticatedCurve(
    client,
    coreFor(launch),
    curve,
    block.number,
  );
  const result = await readCurveQuote(sdk, block.number, request);
  printJson({
    curve,
    blockNumber: block.number,
    blockHash: block.hash,
    snapshot: block.snapshot,
    direction: direction ?? null,
    ...result,
    state: describeCurveState(result.state),
    note:
      result.state.status === 1
        ? "Read-only snapshot. Re-quote and simulate before signing; partial sells remain strict."
        : "Curve is not active; no curve trade quoted. ReadyToMigrate requires a separate migration; after graduation use canonicalPool.",
  });
};
