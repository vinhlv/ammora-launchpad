// Step 6 — finish a V4 launch curve and execute its separate permissionless
// Graduation.
//
//   AMMORA_GRADUATION_CONFIRM=1 AMMORA_SEND=1 graduate <maxQuoteInRaw>
//
// The input is a maximum, not a promise to spend it all. At the terminal
// quote-to-base boundary the curve consumes only what remains fillable and
// leaves the unused input in the wallet (no refund transfer on GIWA ERC-20
// paths). A second transaction calls migrate(); the migrate command resumes
// that permissionless step if this combined run is interrupted after the fill.
import {
  classifyAmmoraV4ExactInputFill,
  parseAmmoraV4MigratedReceipt,
  parseAmmoraV4SwapReceipt,
} from "@ammora-protocol/sdk";
import { printJson, rawAmount } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { openAuthenticatedCurve, planCurveAtBlock, curveStatusName, type V4Core } from "../lib/curve.js";
import { approveIfNeeded, sendTransaction } from "../lib/tx.js";
import { saveState } from "../lib/state.js";
import { resolveCurve } from "./quote.js";

const coreFor = (launch: ReturnType<typeof v4Deployment>["contracts"]["launch"]): V4Core => ({
  configRegistry: launch.configRegistry,
  launchFactory: launch.factory,
  graduationAdapter: launch.graduationAdapter,
  feePolicy: launch.feePolicy,
});

/** Migration only: run after a confirmed ReadyToMigrate state. */
export const migrateOnly = async (curve: `0x${string}`): Promise<void> => {
  const { wallet, account } = signer();
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const snapshot = await readBlock(client);
  const { state } = await openAuthenticatedCurve(
    client,
    coreFor(launch),
    curve,
    snapshot.number,
  );
  if (state.status === 3) {
    console.log(`already graduated to ${state.canonicalPool}`);
    return;
  }
  if (state.status !== 2) {
    throw new Error(
      `Curve status ${state.status} (${curveStatusName(state.status)}) is not ReadyToMigrate; ` +
        "never repeat a successful final buy",
    );
  }
  const migration = await (async () => {
    const { AmmoraV4LaunchCurveClient } = await import("@ammora-protocol/sdk");
    const sdk = new AmmoraV4LaunchCurveClient(client, curve, coreFor(launch));
    return sdk.planMigrateAtBlock(snapshot.number);
  })();
  const { hash, blockNumber } = await sendTransaction(
    client,
    wallet,
    account,
    "graduate to ARL (migration)",
    migration.transaction,
  );
  const receipt = await client.getTransactionReceipt({ hash });
  const graduated = parseAmmoraV4MigratedReceipt(receipt, curve);
  console.log(`ARL pool   ${graduated.canonicalPool}`);
  saveState("graduation", {
    migrationHash: hash,
    canonicalPool: graduated.canonicalPool,
  });
  printJson({ hash, blockNumber, canonicalPool: graduated.canonicalPool });
};

/** Final fill (if still Active) then migration, as two separate transactions. */
export const runGraduate = async (args: string[]): Promise<void> => {
  const [inputArgument] = args;
  if (!inputArgument) {
    throw new Error("usage: graduate <maxQuoteInRaw>   (raw integer, a maximum not a promise)");
  }
  const maximumQuoteInput = rawAmount(inputArgument, "maxQuoteInRaw");
  if (maximumQuoteInput === 0n) {
    throw new Error("maxQuoteInRaw must be a positive raw-unit integer");
  }
  if (process.env.AMMORA_GRADUATION_CONFIRM !== "1") {
    throw new Error(
      "Set AMMORA_GRADUATION_CONFIRM=1 after reviewing the maximum input, unused input, and migration",
    );
  }
  const curve = resolveCurve(undefined);
  const { wallet, account } = signer();
  if (process.env.AMMORA_READ_RECEIPT?.trim()) {
    throw new Error(
      "Clear AMMORA_READ_RECEIPT before Graduation; this write flow selects fresh confirmed snapshots and must not reuse an earlier creation snapshot",
    );
  }
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const core = coreFor(launch);
  const snapshot = await readBlock(client);
  const { state } = await openAuthenticatedCurve(client, core, curve, snapshot.number);
  if (state.status === 3) {
    console.log(`already graduated to ${state.canonicalPool}`);
    return;
  }
  if (state.status !== 1 && state.status !== 2) {
    throw new Error(
      `Curve status ${state.status} (${curveStatusName(state.status)}) is not active or migration-ready`,
    );
  }

  let dependencyBlock = snapshot.number;
  if (state.status === 1) {
    const { sdk, state: freshState } = await openAuthenticatedCurve(client, core, curve, snapshot.number);
    const quote = await sdk.quoteExactInputAtBlock(maximumQuoteInput, false, snapshot.number);
    const fill = classifyAmmoraV4ExactInputFill(quote, false);
    if (fill.kind !== "graduation-boundary") {
      throw new Error(
        `this buy is ${fill.kind}, not an executable Graduation boundary; ` +
          "ordinary orders must fill in full without reaching the boundary",
      );
    }
    console.log(`requested   ${fill.requestedAmountIn}`);
    console.log(`consumed    ${fill.consumedAmountIn}`);
    console.log(`unused input ${fill.refundableAmountIn}  (stays in the wallet; not a refund payment)`);

    const plan = await planCurveAtBlock(client, core, curve, {
      blockNumber: snapshot.number,
      tokenIn: freshState.quoteToken,
      amountIn: maximumQuoteInput,
      recipient: account.address,
      deadline: snapshot.timestamp + 20n * 60n,
      slippageBps: 100,
      graduationBoundary: true,
    });
    const plannedFill = classifyAmmoraV4ExactInputFill(plan.quote, false);
    if (plannedFill.kind !== "graduation-boundary") {
      throw new Error(
        `the refreshed plan is ${plannedFill.kind}, not a Graduation boundary`,
      );
    }
    await approveIfNeeded(client, wallet, account, plan.approvalRequirements);
    const { hash: fillHash, blockNumber: fillBlock } = await sendTransaction(
      client,
      wallet,
      account,
      "final curve fill",
      plan.transaction,
    );
    const fillReceipt = await client.getTransactionReceipt({ hash: fillHash });
    dependencyBlock = fillReceipt.blockNumber;
    const confirmedFill = parseAmmoraV4SwapReceipt(fillReceipt, curve, {
      trader: account.address,
      recipient: account.address,
      baseForQuote: false,
      requestedAmountIn: maximumQuoteInput,
      minimumAmountOut: plan.quote.minimumAmountOut,
    });
    console.log(`confirmed   ${confirmedFill.consumedAmountIn}`);
    console.log(`unused input ${confirmedFill.amountLeft}`);
    saveState("graduation", { fillHash, fillBlock: fillBlock.toString() });
  }

  // Select a new confirmed snapshot only after it includes the successful fill.
  // A lagging RPC never causes a repeated buy; resume status=2 after reconciliation.
  let migrationSnapshot = await readBlock(client);
  if (migrationSnapshot.number < dependencyBlock) {
    console.log(
      `waiting for a confirmed snapshot that includes the final fill block ${dependencyBlock}`,
    );
    const deadline = Date.now() + 120_000;
    while (migrationSnapshot.number < dependencyBlock && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      migrationSnapshot = await readBlock(client);
    }
  }
  if (migrationSnapshot.number < dependencyBlock) {
    throw new Error(
      `Final fill confirmed at block ${dependencyBlock}; wait for the reviewed ` +
        "confirmation window, reconcile its hash/nonce, then resume with the migrate command only",
    );
  }
  await migrateOnly(curve);
};
