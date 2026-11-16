// Step 7 — verify the graduated pool and switch trading context.
//
//   pool [curve]
//
// Read-only. Curve status must be Migrated (3) with a canonicalPool matching
// the migration receipt. Post-graduation trades target POOL, not CURVE.
import { printJson, tokenInfo } from "../lib/format.js";
import { readBlock, reader, v4Deployment } from "../lib/env.js";
import { curveStatusName, openAuthenticatedCurve } from "../lib/curve.js";
import { loadState, requireState } from "../lib/state.js";
import { resolveCurve } from "./quote.js";

export const runPool = async (args: string[]): Promise<void> => {
  const curve = resolveCurve(args[0]);
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const core = {
    configRegistry: launch.configRegistry,
    launchFactory: launch.factory,
    graduationAdapter: launch.graduationAdapter,
    feePolicy: launch.feePolicy,
  };
  const { state } = await openAuthenticatedCurve(client, core, curve, block.number);
  if (state.status !== 3 || state.canonicalPool === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      `Curve status ${state.status} (${curveStatusName(state.status)}); no canonical pool to trade on yet`,
    );
  }
  const pool = state.canonicalPool;
  const base = await tokenInfo(client, state.baseToken);
  const quote = await tokenInfo(client, state.quoteToken);
  console.log(`status         ${state.status} (${curveStatusName(state.status)})`);
  console.log(`canonical pool ${pool}`);
  console.log(`base token     ${state.baseToken} (${base.symbol})`);
  console.log(`quote token    ${state.quoteToken} (${quote.symbol})`);

  const savedPool = loadState().graduation?.canonicalPool;
  if (savedPool && savedPool.toLowerCase() !== pool.toLowerCase()) {
    throw new Error(
      `saved canonicalPool ${savedPool} does not match the live curve state ${pool}; reconcile the migration receipt before trading`,
    );
  }
  printJson({
    curve,
    blockNumber: block.number,
    status: state.status,
    statusName: curveStatusName(state.status),
    canonicalPool: pool,
    baseToken: base,
    quoteToken: quote,
    note:
      "Post-graduation trades target the canonical pool via the swap-pool command. " +
      "Preserve every migration LP NFT (Creator, Partner, rounding dust) for fee claims.",
  });
};
