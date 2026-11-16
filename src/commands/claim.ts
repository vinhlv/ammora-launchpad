// Step 8 — claim the selected fee asset accrued to the connected wallet.
//
//   claim <feeTokenAddress> [payout]
//
// Creator and Partner each sign for their own entitlement in the same
// FeeVault. An optional payout address changes the destination, never the
// beneficiary. Zero claimable sends no transaction.
import {
  ammoraLaunchFactoryV4Abi,
  buildClaimFeeVaultFor,
  feeVaultAbi,
} from "@ammora-protocol/sdk";
import { zeroAddress } from "viem";
import { amount, printJson, tokenInfo } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { sendTransaction } from "../lib/tx.js";

export const runClaim = async (args: string[]): Promise<void> => {
  const [tokenArg, recipientArgument] = args;
  if (!tokenArg) {
    throw new Error("usage: claim <feeTokenAddress> [payout]");
  }
  const token = tokenArg as `0x${string}`;

  const { wallet, account } = signer();
  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const feeVault = (await client.readContract({
    address: launch.factory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "feeVault",
    blockNumber: block.number,
  })) as `0x${string}`;
  if (feeVault === zeroAddress) {
    throw new Error("factory records no fee vault");
  }

  const recipient = recipientArgument
    ? (recipientArgument as `0x${string}`)
    : account.address;
  if (
    recipient === zeroAddress ||
    recipient.toLowerCase() === feeVault.toLowerCase()
  ) {
    throw new Error("payout must be nonzero and outside the fee vault");
  }

  const owed = (await client.readContract({
    address: feeVault,
    abi: feeVaultAbi,
    functionName: "claimable",
    args: [token, account.address],
    blockNumber: block.number,
  })) as bigint;
  const info = await tokenInfo(client, token);
  console.log(`fee vault   ${feeVault}`);
  console.log(`beneficiary ${account.address}`);
  console.log(`owed        ${amount(owed, info.decimals, info.symbol)}`);
  if (owed === 0n) {
    console.log("\nnothing owed for this token, no transaction sent");
    return;
  }
  console.log(`paying to   ${recipient}`);

  // The connected account owns the claim; a payout address never selects a
  // beneficiary. Preserves the own-beneficiary claimFor semantics.
  const transaction = buildClaimFeeVaultFor(token, account.address, recipient);
  const { hash, blockNumber: receiptBlock } = await sendTransaction(
    client,
    wallet,
    account,
    "claim V4 launch fees",
    { to: feeVault, data: transaction.data },
  );
  const after = (await client.readContract({
    address: feeVault,
    abi: feeVaultAbi,
    functionName: "claimable",
    args: [token, account.address],
    blockNumber: receiptBlock,
  })) as bigint;
  if (after >= owed) {
    throw new Error(
      `claimable did not decrease (before ${owed}, after ${after}); reconcile the receipt before resending`,
    );
  }
  printJson({
    hash,
    blockNumber: receiptBlock,
    feeVault,
    token,
    beneficiary: account.address,
    payout: recipient,
    claimedRaw: owed - after,
    claimed: amount(owed - after, info.decimals, info.symbol),
    remainingRaw: after,
  });
  console.log(`received    ${amount(owed - after, info.decimals, info.symbol)}`);
};
