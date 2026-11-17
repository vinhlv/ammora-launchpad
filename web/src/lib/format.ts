// Formatting helpers for the web UI.
import { formatUnits, parseUnits } from "viem";
import type { Address, PublicClient } from "viem";
import { erc20Abi } from "viem";

export const shortAddress = (value: string, size = 4): string =>
  `${value.slice(0, 2 + size)}…${value.slice(-size)}`;

export const fmtUnits = (raw: bigint, decimals: number): string =>
  formatUnits(raw, decimals);

export const fmtRaw = (raw: bigint | undefined): string =>
  raw === undefined ? "—" : raw.toString();

export type TokenMeta = { symbol: string; decimals: number };

export const fetchTokenMeta = async (
  client: PublicClient,
  token: Address,
): Promise<TokenMeta> => {
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
  ]);
  return { symbol, decimals: Number(decimals) };
};

export const parseHumanAmount = (
  text: string,
  meta: { decimals: number; symbol: string },
): bigint => {
  if (
    !/^\d+(\.\d+)?$/.test(text) ||
    (text.split(".")[1]?.length ?? 0) > meta.decimals
  ) {
    throw new Error(
      `"${text}" is not a valid ${meta.symbol} amount with at most ${meta.decimals} decimals`,
    );
  }
  const parsed = parseUnits(text, meta.decimals);
  if (parsed <= 0n) throw new Error("amount must be positive");
  return parsed;
};

export const formatAmount = (raw: bigint, meta: { decimals: number; symbol: string }): string =>
  `${formatUnits(raw, meta.decimals)} ${meta.symbol}`;

export const bigintReplacer = (_key: string, value: unknown): unknown =>
  typeof value === "bigint" ? value.toString() : value;
