// Step 3 — issue a new token and its pre-graduation ALC curve on a Config.
//
//   create-launch [configId] <name> <symbol> <metadataURI>
//
// The Config decides curve, fees and graduation; this only names the token.
// Reuse one platform Config across tokens; no new Config per token.
import {
  buildCreateAmmoraV4Launch,
  getAmmoraV4ConfigAtBlock,
  parseAmmoraV4LaunchCreatedReceipt,
  verifyAmmoraV4CoreAtBlock,
} from "@ammora-protocol/sdk";
import { printJson, rawAmount } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { sendTransaction } from "../lib/tx.js";
import { loadState, requireState, saveState } from "../lib/state.js";

export const runCreateLaunch = async (args: string[]): Promise<void> => {
  const [first, name, symbol, metadataURI] = args;
  if (!name || !symbol || !metadataURI) {
    throw new Error(
      "usage: create-launch [configId] <name> <symbol> <metadataURI>",
    );
  }
  const state = loadState();
  const configIdArgument =
    first && /^\d+$/.test(first)
      ? first
      : requireState(
          state.config?.id,
          "missing Config id (no state.config.id recorded)",
        );
  if (first && !/^\d+$/.test(first)) {
    throw new Error("configId must be a positive integer");
  }
  const configId = rawAmount(configIdArgument, "configId");

  const { wallet, account } = signer();
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const core = {
    configRegistry: launch.configRegistry,
    launchFactory: launch.factory,
    graduationAdapter: launch.graduationAdapter,
    feePolicy: launch.feePolicy,
  };
  await verifyAmmoraV4CoreAtBlock(client, core, block.number);
  const entry = await getAmmoraV4ConfigAtBlock(
    client,
    launch.configRegistry,
    configId,
    block.number,
  );
  const tokenDecimals = entry.config.tokenDecimals;
  if (!entry.enabled) {
    throw new Error(
      `config #${configId} is disabled, so it cannot be launched on`,
    );
  }

  const transaction = buildCreateAmmoraV4Launch(
    {
      name,
      symbol,
      metadataURI,
      creatorMetadataURI: metadataURI,
      tokenDecimals,
    },
    configId,
    entry.config.poolCreationFee,
  );

  console.log(`factory   ${launch.factory}`);
  console.log(`config    #${configId}  (${entry.segments.length} segment(s))`);
  console.log(`token     ${name} (${symbol}), ${tokenDecimals} decimals`);
  console.log(`fee       ${transaction.value ?? 0n} wei (native ETH, separate from WETH buy funds)`);
  console.log("");

  const { hash, blockNumber: receiptBlock } = await sendTransaction(
    client,
    wallet,
    account,
    "createLaunch",
    { to: launch.factory, ...transaction },
  );

  // The receipt is canonical. Do not infer token or curve addresses from an
  // unconfirmed latest-state read because public RPCs can lag after a write.
  const receipt = await client.getTransactionReceipt({ hash });
  const created = parseAmmoraV4LaunchCreatedReceipt(receipt, launch.factory);
  if (created.configId !== configId || created.configHash !== entry.configHash) {
    throw new Error(
      "V4 launch receipt does not match the selected immutable Config",
    );
  }
  console.log("");
  console.log(`token     ${created.token}`);
  console.log(`curve     ${created.curve}`);
  console.log(`version   ${created.protocolVersion}`);
  console.log(`block     ${receiptBlock}`);

  saveState("launch", {
    token: created.token,
    curve: created.curve,
    creator: account.address,
    creationHash: hash,
    creationBlock: receiptBlock.toString(),
  });
  printJson({
    token: created.token,
    curve: created.curve,
    configId: created.configId,
    configHash: created.configHash,
    creator: account.address,
    hash,
    blockNumber: receiptBlock,
  });
};
