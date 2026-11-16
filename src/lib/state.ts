// Lifecycle state file. It records the receipt-derived addresses each step
// produced so later steps can find them without retyping. Receipts are the
// canonical source: never record predicted addresses.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type LaunchpadState = {
  chainId?: number;
  generation?: string;
  deploymentSlot?: string;
  config?: {
    id: string;
    hash?: string;
    creationHash?: string;
    creationBlock?: string;
  };
  launch?: {
    token?: string;
    curve?: string;
    creator?: string;
    creationHash?: string;
    creationBlock?: string;
  };
  graduation?: {
    fillHash?: string;
    migrationHash?: string;
    canonicalPool?: string;
  };
};

const statePath = (): string =>
  process.env.AMMORA_STATE_FILE?.trim() || ".ammora-launchpad-state.json";

export const loadState = (): LaunchpadState => {
  const path = statePath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LaunchpadState;
  } catch {
    throw new Error(
      `${path} is not valid JSON; fix or delete it before continuing`,
    );
  }
};

/** Merge one section into the state file and persist it. */
export const saveState = (
  section: "config" | "launch" | "graduation",
  value: Record<string, unknown>,
): void => {
  const path = statePath();
  const current = loadState();
  const next = {
    ...current,
    [section]: { ...current[section], ...value },
  };
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`state     saved ${section} to ${path}`);
};

/** Require a value that an earlier lifecycle step must have produced. */
export const requireState = <T>(
  value: T | undefined,
  message: string,
): T => {
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `${message} — run the earlier lifecycle step, or pass the value explicitly.`,
    );
  }
  return value;
};
