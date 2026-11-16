// Ammora launchpad CLI — the shared launchpad path from the reviewed guide:
//
//   Config → token issuance → ALC trading → final fill → migration →
//   post-graduation ARL trading → Creator/Partner fee claims
//
// Every command defaults to a read-only or unsigned preview. Signing commands
// refuse to run until AMMORA_SEND=1, and Config creation additionally requires
// the reviewHash printed by its preview.
import { runVerify } from "./commands/verify.js";
import { runConfig } from "./commands/config.js";
import { runCreateLaunch } from "./commands/create-launch.js";
import { runQuote } from "./commands/quote.js";
import { runFund } from "./commands/fund.js";
import { runSwap } from "./commands/swap.js";
import { runGraduate } from "./commands/graduate.js";
import { runMigrate } from "./commands/migrate.js";
import { runPool } from "./commands/pool.js";
import { runSwapPool } from "./commands/swap-pool.js";
import { runFees } from "./commands/fees.js";
import { runClaim } from "./commands/claim.js";
import { runDiscover } from "./commands/discover.js";
import { runState } from "./commands/state.js";

const help = (): never => {
  console.log(`ammora-launchpad — token launchpad on @ammora-protocol/sdk 0.3.9 (GIWA Sepolia)

Lifecycle commands (run in order):

  verify                                            connection + V4 Core + template Config check (read-only)
  config preview <policy.json> <saleSupplyRaw> <quoteThresholdRaw>
                                                    derive + review the launchpad Config (unsigned)
  config create <policy.json> <saleSupplyRaw> <quoteThresholdRaw> <reviewHash>
                                                    create the immutable Config (AMMORA_SEND=1)
  create-launch [configId] <name> <symbol> <metadataURI>
                                                    issue a token + its ALC curve (AMMORA_SEND=1)
  quote [curve] [buy|sell <amountInRaw>]            curve state + raw-unit quotes (read-only)
  fund <humanEthAmount>                             wrap native ETH into the curve quote token (AMMORA_SEND=1)
  swap <buy|sell> <humanAmount> [curve]             trade on the ALC curve (AMMORA_SEND=1)
  graduate <maxQuoteInRaw>                          final boundary buy + separate migration
                                                    (AMMORA_SEND=1 AMMORA_GRADUATION_CONFIRM=1)
  migrate [curve]                                   migration only, for ReadyToMigrate resumes (preview / AMMORA_SEND=1)
  pool [curve]                                      verify the graduated canonical pool (read-only)
  swap-pool <tokenIn> <humanAmount> [model] [pool]  trade the post-graduation ARL pool (AMMORA_SEND=1)
  fees [owner] [curve]                              read claimable Creator/Partner fees (read-only)
  claim <feeToken> [payout]                         claim the connected wallet's own fees (AMMORA_SEND=1)
  discover [token]                                  Ammora Data API discovery (read-only)
  state                                             print the lifecycle state file

Send gate: signing commands require AMMORA_SEND=1. Set AMMORA_READ_RECEIPT
right after a creation to bind dependent reads to that receipt's block.
`);
  process.exit(0);
};

const [, , command, ...args] = process.argv;
if (!command || command === "help" || command === "--help" || command === "-h") {
  help();
}

const commands: Record<string, (args: string[]) => Promise<void>> = {
  verify: () => runVerify(),
  config: (rest) => runConfig(rest),
  "create-launch": (rest) => runCreateLaunch(rest),
  quote: (rest) => runQuote(rest),
  fund: (rest) => runFund(rest),
  swap: (rest) => runSwap(rest),
  graduate: (rest) => runGraduate(rest),
  migrate: (rest) => runMigrate(rest),
  pool: (rest) => runPool(rest),
  "swap-pool": (rest) => runSwapPool(rest),
  fees: (rest) => runFees(rest),
  claim: (rest) => runClaim(rest),
  discover: (rest) => runDiscover(rest),
  state: () => runState(),
};

const selected = commands[command as string];
if (!selected) {
  console.error(`unknown command: ${command}\n`);
  help();
}

selected(args).catch((error: unknown) => {
  console.error(
    `error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
