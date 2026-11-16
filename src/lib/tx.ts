// Transaction submission, confirmed receipts and approval handling.
import { erc20Abi } from "viem";
import type { Account, Address, PublicClient, WalletClient } from "viem";

// GIWA Sepolia's reviewed confirmation window. Receipt reads bound to earlier
// steps wait for this depth before dependent state is trusted.
export const CONFIRMATIONS = 13;
export const RECEIPT_TIMEOUT_MS = 180_000;
export const POLL_INTERVAL_MS = 6_000;

export type AnyTransaction = {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
};

export type ApprovalRequirement = {
  token: Address;
  spender: Address;
  amount: bigint;
};

export const waitForConfirmedReceipt = (
  client: PublicClient,
  hash: `0x${string}`,
) =>
  client.waitForTransactionReceipt({
    hash,
    confirmations: CONFIRMATIONS,
    retryCount: 0,
    timeout: RECEIPT_TIMEOUT_MS,
    pollingInterval: POLL_INTERVAL_MS,
  });

export const sendTransaction = async (
  client: PublicClient,
  wallet: WalletClient,
  account: Account,
  label: string,
  transaction: AnyTransaction,
): Promise<{ hash: `0x${string}`; blockNumber: bigint }> => {
  const hash = await wallet.sendTransaction({
    account,
    chain: client.chain,
    to: transaction.to,
    data: transaction.data,
    ...(transaction.value !== undefined ? { value: transaction.value } : {}),
  });
  console.log(`sent      ${label}  ${hash}`);
  const receipt = await waitForConfirmedReceipt(client, hash);
  if (receipt.status !== "success") {
    throw new Error(`${label} transaction reverted: ${hash}`);
  }
  console.log(`confirmed ${label}  block ${receipt.blockNumber}`);
  return { hash, blockNumber: receipt.blockNumber };
};

/** Approve exactly what the plan requires, skipping sufficient allowances. */
export const approveIfNeeded = async (
  client: PublicClient,
  wallet: WalletClient,
  account: Account,
  requirements: readonly ApprovalRequirement[],
): Promise<`0x${string}`[]> => {
  const hashes: `0x${string}`[] = [];
  for (const requirement of requirements) {
    const current = await client.readContract({
      address: requirement.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, requirement.spender],
    });
    if ((current as bigint) >= requirement.amount) {
      console.log(
        `allowance sufficient ${requirement.spender} (${current}) >= ${requirement.amount}`,
      );
      continue;
    }
    const hash = await wallet.writeContract({
      account,
      chain: client.chain,
      address: requirement.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [requirement.spender, requirement.amount],
    });
    const receipt = await waitForConfirmedReceipt(client, hash);
    if (receipt.status !== "success") {
      throw new Error(`approval reverted: ${hash}`);
    }
    hashes.push(hash);
    console.log(
      `approved  ${requirement.token} -> ${requirement.spender} amount ${requirement.amount}`,
    );
  }
  return hashes;
};
