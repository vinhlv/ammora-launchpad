// Environment, deployment selection and reviewed read snapshots.
//
// Nothing here has a place to paste a private key into source. Keep keys in a
// local .env that never reaches source control.
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  getAddress,
  http,
} from "viem";
import type {
  Account,
  Address,
  Chain,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  createAmmoraDeploymentSource,
  getAmmoraDeployment,
  giwaSepoliaAutoRoute,
  giwaSepoliaAutoRouteDeployment,
  giwaSepoliaAutoRoutePoolProfiles,
  giwaSepoliaPermissionless,
  resolveAmmoraFinalizedHead,
  type AmmoraDeployment,
} from "@ammora-protocol/sdk";

config();

export type AmmoraV4Deployment = AmmoraDeployment & {
  readonly contracts: AmmoraDeployment["contracts"] & {
    readonly launch: Extract<
      AmmoraDeployment["contracts"]["launch"],
      { readonly protocolVersion: 4 }
    >;
  };
};

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in. See the README.`,
    );
  }
  return value;
};

/** The reviewed deployment for the configured chain, or a refusal naming why not. */
export const deployment = (): AmmoraDeployment => {
  const chainId = Number(required("AMMORA_CHAIN_ID"));
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("AMMORA_CHAIN_ID must be a positive safe integer");
  }
  const generation = process.env.AMMORA_GIWA_GENERATION?.trim() || "legacy";
  if (!["legacy", "auto-route"].includes(generation)) {
    throw new Error("AMMORA_GIWA_GENERATION must be legacy or auto-route");
  }
  if (chainId !== 91342 && generation !== "legacy") {
    throw new Error("auto-route generation is reviewed for GIWA only");
  }
  const found =
    chainId === 91342
      ? generation === "auto-route"
        ? giwaSepoliaAutoRouteDeployment
        : giwaSepoliaPermissionless
      : getAmmoraDeployment(chainId);
  if (!found) {
    throw new Error(
      `chain ${chainId} has no reviewed Ammora deployment. The SDK ships the catalog; ` +
        "pick a chain that appears in it.",
    );
  }
  return found;
};

/** Refuses legacy launch generations before a V4 command constructs calldata. */
export const v4Deployment = (): AmmoraV4Deployment => {
  const target = deployment();
  if (target.contracts.launch.protocolVersion !== 4) {
    throw new Error(
      `deployment ${target.slot} uses launch protocol V${target.contracts.launch.protocolVersion}; ` +
        "this launchpad requires Ammora V4",
    );
  }
  return target as AmmoraV4Deployment;
};

export const clientOptions = () => {
  const target = deployment();
  return {
    deploymentSource: createAmmoraDeploymentSource([target]),
    ...(target === giwaSepoliaAutoRouteDeployment
      ? { factoryProfiles: giwaSepoliaAutoRoutePoolProfiles }
      : {}),
  };
};

const rpcUrl = (target: AmmoraDeployment): string => {
  const override = process.env.AMMORA_RPC_URL?.trim();
  if (override) return override;
  const fallback = target.chain.rpcUrls[0];
  if (!fallback) {
    throw new Error(
      `chain ${target.chain.id} records no RPC URL; set AMMORA_RPC_URL`,
    );
  }
  return fallback;
};

export const chain = (): Chain => {
  const target = deployment();
  return defineChain({
    id: target.chain.id,
    name: target.chain.name,
    nativeCurrency: target.chain.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl(target)] } },
    ...(target.chain.blockExplorerUrl
      ? {
          blockExplorers: {
            default: { name: "Explorer", url: target.chain.blockExplorerUrl },
          },
        }
      : {}),
  });
};

/** Serialize read calls on shared public RPCs; never retry implicitly. */
export const pacedHttp = (
  url?: string,
  intervalMs = Number(process.env.AMMORA_RPC_INTERVAL_MS ?? "600"),
): Transport => {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0 || intervalMs > 60_000) {
    throw new Error("AMMORA_RPC_INTERVAL_MS must be an integer from 0 to 60000");
  }
  let tail: Promise<unknown> = Promise.resolve();
  let nextStart = 0;
  return (parameters) => {
    const base = http(url, { retryCount: 0 })(parameters);
    return custom(
      {
        request: (args) => {
          const result = tail.then(async () => {
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(0, nextStart - Date.now())),
            );
            try {
              return await base.request(args);
            } finally {
              nextStart = Date.now() + intervalMs;
            }
          });
          tail = result.catch(() => undefined);
          return result;
        },
      },
      { retryCount: 0 },
    )(parameters);
  };
};

/** Read client whose configured chain is re-checked against the live RPC. */
export const reader = async (): Promise<PublicClient> => {
  const configured = chain();
  const client: PublicClient = createPublicClient({
    chain: configured,
    transport: pacedHttp(),
  });
  // client.chain is configuration, not evidence of the RPC's actual chain.
  const actualChainId = await client.getChainId();
  if (actualChainId !== configured.id) {
    throw new Error(
      `RPC chain ${actualChainId} does not match AMMORA_CHAIN_ID ${configured.id}`,
    );
  }
  return client;
};

export type SnapshotBlock = {
  number: bigint;
  hash: `0x${string}`;
  timestamp: bigint;
  snapshot: { kind: "receipt" | "confirmations"; note: string };
};

/**
 * Select a reviewed snapshot, or explicitly bind a dependent read to a
 * successful receipt. Public RPC replicas can announce a latest head before
 * serving its contract state; the reviewed confirmation window guards that.
 */
export const readBlock = async (client: PublicClient): Promise<SnapshotBlock> => {
  if (client.chain?.id !== giwaSepoliaAutoRoute.chainId) {
    throw new Error("No reviewed read-snapshot finality policy for this chain");
  }
  const receiptHash = process.env.AMMORA_READ_RECEIPT?.trim();
  if (receiptHash) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(receiptHash)) {
      throw new Error("AMMORA_READ_RECEIPT must be a transaction hash");
    }
    const receipt = await client.getTransactionReceipt({
      hash: receiptHash as `0x${string}`,
    });
    if (receipt.status !== "success") {
      throw new Error(
        "AMMORA_READ_RECEIPT reverted; refusing its dependent read",
      );
    }
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    if (block.hash !== receipt.blockHash) {
      throw new Error(
        "AMMORA_READ_RECEIPT is not in the canonical block; reconcile before continuing",
      );
    }
    return {
      ...block,
      snapshot: {
        kind: "receipt",
        note: "Canonical at read time; no confirmation-depth or L1-finality guarantee.",
      },
    };
  }
  const blockNumber = await resolveAmmoraFinalizedHead(
    [client],
    giwaSepoliaAutoRoute.finality,
  );
  const block = await client.getBlock({ blockNumber });
  return {
    ...block,
    snapshot: {
      kind: "confirmations",
      note: "Confirmed snapshot under the reviewed finality policy.",
    },
  };
};

export const requireSend = (): void => {
  if (process.env.AMMORA_SEND !== "1") {
    throw new Error(
      "Refusing to sign or send. Review the inputs, then set AMMORA_SEND=1",
    );
  }
};

/**
 * Signing client. Only commands that actually submit transactions call this,
 * so every preview and read-only command runs without a key.
 */
export const signer = (): { wallet: WalletClient; account: Account } => {
  requireSend();
  const key = required("AMMORA_PRIVATE_KEY");
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "AMMORA_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string",
    );
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  return {
    account,
    wallet: createWalletClient({
      account,
      chain: chain(),
      transport: http(undefined, { retryCount: 0 }),
    }),
  };
};

/** An address argument, from the command line or the environment. */
export const addressArg = (name: string, positional?: string): Address => {
  const value = (positional ?? process.env[name])?.trim();
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(
      `${name} must be a 0x address. Pass it as an argument or set it in .env`,
    );
  }
  // Normalize the bytes, then return the canonical EIP-55 representation.
  return getAddress(value.toLowerCase());
};

export const explorerLink = (hash: string): string => {
  const base = deployment().chain.blockExplorerUrl;
  return base ? `${base}/tx/${hash}` : hash;
};
