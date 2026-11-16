// Step 6b — migration-only resume for a ReadyToMigrate curve.
//
//   migrate [curve]              — unsigned preview (no key required)
//   AMMORA_SEND=1 migrate [curve]
//
// This generates no buy and no approval. Reconcile uncertain prior
// hashes/nonces/receipts/canonical blocks first; RPC lag never justifies
// resending a final buy or migration.
import {
  AmmoraV4LaunchCurveClient,
} from "@ammora-protocol/sdk";
import { printJson } from "../lib/format.js";
import { readBlock, reader, v4Deployment } from "../lib/env.js";
import { curveStatusName, openAuthenticatedCurve } from "../lib/curve.js";
import { saveState } from "../lib/state.js";
import { resolveCurve } from "./quote.js";
import { migrateOnly } from "./graduate.js";

export const runMigrate = async (args: string[]): Promise<void> => {
  const curve = resolveCurve(args[0]);
  const sending = process.env.AMMORA_SEND === "1";
  if (!sending) {
    // Unsigned preview: plan only, never sign.
    const client = await reader();
    const launch = v4Deployment().contracts.launch;
    const snapshot = await readBlock(client);
    const core = {
      configRegistry: launch.configRegistry,
      launchFactory: launch.factory,
      graduationAdapter: launch.graduationAdapter,
      feePolicy: launch.feePolicy,
    };
    const { state } = await openAuthenticatedCurve(client, core, curve, snapshot.number);
    if (state.status === 3) {
      console.log(`already graduated to ${state.canonicalPool}`);
      return;
    }
    if (state.status !== 2) {
      throw new Error(
        `Curve status ${state.status} (${curveStatusName(state.status)}) is not ReadyToMigrate`,
      );
    }
    const sdk = new AmmoraV4LaunchCurveClient(client, curve, core);
    const migration = await sdk.planMigrateAtBlock(snapshot.number);
    printJson({
      curve,
      blockNumber: snapshot.number,
      transaction: migration.transaction,
      note:
        "Unsigned preview. Set AMMORA_SEND=1 to submit; status=3 curves return their existing canonicalPool instead.",
    });
    return;
  }
  await migrateOnly(curve);
  void saveState;
};
