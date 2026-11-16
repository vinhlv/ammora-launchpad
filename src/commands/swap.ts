// Step 5 — trade on the pre-graduation ALC curve.
//
//   swap buy <humanQuoteAmount>   — WETH in, launch token out
//   swap sell <humanBaseAmount>   — launch token in, WETH out
//   swap <buy|sell> <humanAmount> <curve>
//
// Human decimal amounts are parsed against the input token's decimals. The
// command quotes at the reviewed confirmed snapshot, enforces minimum output,
// approves exactly the input amount, then sends one strict exact-input swap.
import { formatUnits } from "viem";
import { parseAmmoraV4SwapReceipt } from "@ammora-protocol/sdk";
import { printJson, tokenInfo, parseHumanAmount } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { planCurveAtBlock, type V4Core } from "../lib/curve.js";
import { approveIfNeeded, sendTransaction } from "../lib/tx.js";
import { loadState, requireState } from "../lib/state.js";
import { resolveCurve } from "./quote.js";

const coreFor = (launch: ReturnType<typeof v4Deployment>["contracts"]["launch"]): V4Core => ({
  configRegistry: launch.configRegistry,
  launchFactory: launch.factory,
  graduationAdapter: launch.graduationAdapter,
  feePolicy: launch.feePolicy,
});

export const runSwap = async (args: string[]): Promise<void> => {
  const [direction, amountText, curveArg] = args;
  if (
    !direction ||
    !amountText ||
    (direction !== "buy" && direction !== "sell")
  ) {
    throw new Error("usage: swap <buy|sell> <humanAmount> [curve]");
  }
  const curve = resolveCurve(curveArg);

  const { wallet, account } = signer();
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const core = coreFor(launch);
  const slippageBps = Number(process.env.AMMORA_SLIPPAGE_BPS ?? "100");
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1000) {
    throw new Error("AMMORA_SLIPPAGE_BPS must be an integer from 0 to 1000");
  }

  // Token-in resolution happens at the authenticated snapshot: buy pays the
  // quote token, sell pays the launch token.
  const { state } = await (async () => {
    const { openAuthenticatedCurve } = await import("../lib/curve.js");
    return openAuthenticatedCurve(client, core, curve, block.number);
  })();
  const tokenIn = direction === "buy" ? state.quoteToken : state.baseToken;
  const info = await tokenInfo(client, tokenIn);
  const amountIn = parseHumanAmount(amountText, info);

  const plan = await planCurveAtBlock(client, core, curve, {
    blockNumber: block.number,
    tokenIn,
    amountIn,
    recipient: account.address,
    deadline: block.timestamp + 20n * 60n,
    slippageBps,
  });

  const outInfo = await tokenInfo(client, plan.tokenOut);
  console.log(`pay       ${amount(amountIn, info)} ... `);
  console.log(`expected  ${formatUnits(plan.quote.amountOut, outInfo.decimals)} ${outInfo.symbol}`);
  console.log(`minimum   ${formatUnits(plan.quote.minimumAmountOut, outInfo.decimals)} ${outInfo.symbol}`);
  console.log(`fill      ${plan.fill.kind}`);
  console.log(`quote at  block ${block.number}`);
  console.log("");

  await approveIfNeeded(client, wallet, account, plan.approvalRequirements);
  const { hash, blockNumber: receiptBlock } = await sendTransaction(
    client,
    wallet,
    account,
    "ALC swapExactInput",
    plan.transaction,
  );
  const receipt = await client.getTransactionReceipt({ hash });
  const confirmed = parseAmmoraV4SwapReceipt(receipt, curve, {
    trader: account.address,
    recipient: account.address,
    baseForQuote: plan.baseForQuote,
    requestedAmountIn: amountIn,
    minimumAmountOut: plan.quote.minimumAmountOut,
  });
  console.log("");
  console.log(`consumed  ${confirmed.consumedAmountIn}`);
  console.log(`unused    ${confirmed.amountLeft}`);
  printJson({
    hash,
    blockNumber: receiptBlock,
    direction,
    tokenIn,
    tokenOut: plan.tokenOut,
    amountIn: amountIn.toString(),
    expectedAmountOut: plan.quote.amountOut.toString(),
    minimumAmountOut: plan.quote.minimumAmountOut.toString(),
    consumedAmountIn: confirmed.consumedAmountIn.toString(),
    amountLeft: confirmed.amountLeft.toString(),
  });
};

const amount = (raw: bigint, info: { decimals: number; symbol: string }): string =>
  `${formatUnits(raw, info.decimals)} ${info.symbol}`;
