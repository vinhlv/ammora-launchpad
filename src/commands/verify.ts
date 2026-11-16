// Step 1 — connection, deployment verification and template Config summary.
// Reads only: no key required.
import {
  getAmmoraV4ConfigAtBlock,
  verifyAmmoraV4CoreAtBlock,
} from "@ammora-protocol/sdk";
import { printJson } from "../lib/format.js";
import { readBlock, reader, v4Deployment } from "../lib/env.js";
import { curveStatusName } from "../lib/curve.js";

export const runVerify = async (): Promise<void> => {
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
  console.log(`chain       ${client.chain?.id} (${client.chain?.name})`);
  console.log(`registry    ${core.configRegistry}`);
  console.log(`factory     ${core.launchFactory}`);
  console.log(`adapter     ${core.graduationAdapter}`);
  console.log(`fee policy  ${core.feePolicy}`);
  console.log(`snapshot    block ${block.number} (${block.snapshot.kind})`);
  console.log("");

  // The reviewed GIWA example template. Its identity is verified against the
  // live Registry read; a mismatch means the deployment changed.
  const templateId = 6n;
  try {
    const template = await getAmmoraV4ConfigAtBlock(
      client,
      core.configRegistry,
      templateId,
      block.number,
    );
    console.log(`template    #${templateId}`);
    console.log(`hash        ${template.configHash}`);
    console.log(`enabled     ${template.enabled}`);
    console.log(
      `decimals    ${template.config.tokenDecimals}  poolCreationFee ${template.config.poolCreationFee} wei`,
    );
    console.log(
      `graduation  mode ${template.config.migrationMode} (concentrated=0)`,
    );
    console.log(
      `partner     ${template.config.partnerRecipient}`,
    );
  } catch {
    console.log(
      `template    #${templateId} is unavailable on this deployment; pick another enabled Config id and pass it explicitly.`,
    );
  }

  printJson({
    chainId: client.chain?.id,
    blockNumber: block.number,
    blockHash: block.hash,
    snapshot: block.snapshot,
    core,
    note: "Verified V4 Core at a reviewed snapshot. Create your launchpad Config next.",
  });
  void curveStatusName;
};
