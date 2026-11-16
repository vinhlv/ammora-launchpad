// Step 8 — read launch fees accrued to a beneficiary.
//
//   fees [owner] [curve]
//
// The factory names its own FeeVault; Creator and Partner fees for every
// launch it made settle there. Reads claimable for the quote token and the
// launch token at one snapshot block. Read-only: no key required.
import {
  ammoraLaunchFactoryV4Abi,
  feeVaultAbi,
} from "@ammora-protocol/sdk";
import { zeroAddress, type Address } from "viem";
import { amount, printJson, tokenInfo } from "../lib/format.js";
import { readBlock, reader, v4Deployment } from "../lib/env.js";
import { openAuthenticatedCurve } from "../lib/curve.js";
import { loadState } from "../lib/state.js";
import { resolveCurve } from "./quote.js";

export const runFees = async (args: string[]): Promise<void> => {
  const [ownerArg, curveArg] = args;
  const state = loadState();
  const owner = (ownerArg ??
    process.env.AMMORA_ACCOUNT?.trim() ??
    state.launch?.creator) as Address | undefined;
  if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
    throw new Error(
      "missing beneficiary: pass an owner address, or set AMMORA_ACCOUNT",
    );
  }
  const curve = resolveCurve(curveArg);

  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const core = {
    configRegistry: launch.configRegistry,
    launchFactory: launch.factory,
    graduationAdapter: launch.graduationAdapter,
    feePolicy: launch.feePolicy,
  };
  const feeVault = (await client.readContract({
    address: launch.factory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "feeVault",
    blockNumber: block.number,
  })) as `0x${string}`;
  if (feeVault === zeroAddress) {
    throw new Error("factory records no fee vault");
  }

  const { state: curveState } = await openAuthenticatedCurve(
    client,
    core,
    curve,
    block.number,
  );
  const assets = [curveState.quoteToken, curveState.baseToken];
  const rows = [];
  for (const feeToken of assets) {
    const claimable = (await client.readContract({
      address: feeVault,
      abi: feeVaultAbi,
      functionName: "claimable",
      args: [feeToken, owner],
      blockNumber: block.number,
    })) as bigint;
    const info = await tokenInfo(client, feeToken);
    rows.push({
      feeToken,
      symbol: info.symbol,
      decimals: info.decimals,
      claimableRaw: claimable,
      claimable: amount(claimable, info.decimals, info.symbol),
    });
    console.log(`${info.symbol.padEnd(8)} claimable ${amount(claimable, info.decimals, info.symbol)}`);
  }
  printJson({
    feeVault,
    beneficiary: owner,
    blockNumber: block.number,
    rows,
    note:
      "Zero-claimable no-ops are not successful payments. ALC trades can accrue both assets: " +
      "inspect quote and launch token separately, then claim each wallet's own entitlement.",
  });
};
