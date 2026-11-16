// Step 7 — trade the post-graduation ARL pool.
//
//   swap-pool <tokenIn> <humanAmount> [model] [pool]
//
// Model defaults to concentrated (template #6's graduation model). Uses the
// SDK's reviewed swap client: fresh quote, approval requirements and
// receipt-block output reconciliation are handled inside prepared.execute().
import {
  AmmoraSwapClient,
  type AmmoraSwapModel,
} from "@ammora-protocol/sdk";
import { printJson, parseHumanAmount, tokenInfo } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { loadState, requireState } from "../lib/state.js";
import { resolveCurve } from "./quote.js";

const MODELS: readonly AmmoraSwapModel[] = [
  "concentrated",
  "compounding",
  "almm",
  "dbc",
];

export const runSwapPool = async (args: string[]): Promise<void> => {
  const [tokenInArg, amountText, modelArg, poolArg] = args;
  if (!tokenInArg || !amountText) {
    throw new Error(
      "usage: swap-pool <tokenIn> <humanAmount> [concentrated|compounding|almm|dbc] [pool]",
    );
  }
  const model = (modelArg ?? "concentrated") as AmmoraSwapModel;
  if (!MODELS.includes(model)) {
    throw new Error(`model must be one of: ${MODELS.join(", ")}`);
  }
  const pool = poolArg
    ? poolArg
    : requireState(
        loadState().graduation?.canonicalPool,
        "missing canonical pool address",
      );
  const tokenIn = tokenInArg;

  const { wallet, account } = signer();
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  void resolveCurve; // the pool, not the curve, is the trading venue now

  const chainId = Number(client.chain?.id);
  const swaps = await AmmoraSwapClient.create(client, {
    deploymentCatalog: { [chainId]: v4Deployment() },
  });
  const info = await tokenInfo(client, tokenIn as `0x${string}`);
  const amountIn = parseHumanAmount(amountText, info);

  const prepared = await swaps.prepareExactIn({
    model,
    pool: pool as `0x${string}`,
    tokenIn: tokenIn as `0x${string}`,
    inputAsset: "erc20",
    amountIn,
    payer: account.address,
    recipient: account.address,
    slippageBps: 50,
    executionMode: "direct-wallet",
    quoteBlockNumber: block.number,
  });
  const outInfo = await tokenInfo(client, prepared.quote.tokenOut);
  console.log(`pay       ${amountIn} ${info.symbol}`);
  console.log(`expected  ${prepared.quote.expectedAmountOut} (${outInfo.symbol})`);
  console.log(`minimum   ${prepared.quote.minimumAmountOut} (${outInfo.symbol})`);
  console.log(`quote at  block ${prepared.quote.quoteBlockNumber}`);

  const result = await prepared.execute(wallet, {
    onStatus: (status) =>
      console.log(
        `status    ${JSON.stringify(status, (_, value) => (typeof value === "bigint" ? value.toString() : value))}`,
      ),
  });
  if (result.amountReceived === null) {
    throw new Error("Swap succeeded but receipt-block output reconciliation was unavailable");
  }
  printJson({
    hash: result.hash,
    approvalHashes: result.approvalHashes,
    blockNumber: result.receipt.blockNumber.toString(),
    balanceVerifiedAtBlock: result.balanceVerifiedAtBlock?.toString() ?? null,
    tokenIn,
    tokenOut: prepared.quote.tokenOut,
    amountIn: amountIn.toString(),
    minimumAmountOut: prepared.quote.minimumAmountOut.toString(),
    amountReceived: result.amountReceived.toString(),
  });
};
