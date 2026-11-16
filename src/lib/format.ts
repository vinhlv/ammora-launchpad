// Output and input formatting helpers.
import { formatUnits, parseUnits } from "viem";
import type { Address, PublicClient } from "viem";
import { erc20Abi } from "viem";

/** Print any plan/result as JSON with bigints as decimal strings. */
export const printJson = (value: unknown): void => {
  console.log(
    JSON.stringify(
      value,
      (_, item) => (typeof item === "bigint" ? item.toString() : item),
      2,
    ),
  );
};

/** Parse a raw-unit integer argument. Raw units are not human decimals. */
export const rawAmount = (text: string, label: string): bigint => {
  if (!/^\d+$/.test(text)) {
    throw new Error(
      `${label} must be a non-negative decimal integer in raw units (no decimals, no separators)`,
    );
  }
  return BigInt(text);
};

export type TokenInfo = { address: Address; symbol: string; decimals: number };

/** Read ERC-20 metadata. Contract calls are rate-limit friendly: no batching. */
export const tokenInfo = async (
  client: PublicClient,
  token: Address,
): Promise<TokenInfo> => {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
  ]);
  return { address: token, symbol, decimals: Number(decimals) };
};

/** Human-readable amount with symbol, e.g. "0.5 WETH". */
export const amount = (
  raw: bigint,
  decimals: number,
  symbol: string,
): string => `${formatUnits(raw, decimals)} ${symbol}`;

/** Parse a human decimal amount against a token's decimals. */
export const parseHumanAmount = (
  text: string,
  info: { decimals: number; symbol: string },
): bigint => {
  if (!/^\d+(\.\d+)?$/.test(text) || (text.split(".")[1]?.length ?? 0) > info.decimals) {
    throw new Error(
      `${text} is not a valid ${info.symbol} amount with at most ${info.decimals} fractional digits`,
    );
  }
  const parsed = parseUnits(text, info.decimals);
  if (parsed <= 0n) throw new Error("amount must be positive");
  return parsed;
};
