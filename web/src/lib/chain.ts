// GIWA Sepolia chain, reviewed deployment and shared read clients.
import { createPublicClient, defineChain, http } from "viem";
import type { Address, PublicClient } from "viem";
import {
  createAmmoraDeploymentSource,
  giwaSepoliaAutoRoute,
  giwaSepoliaAutoRouteDeployment,
  giwaSepoliaAutoRoutePoolProfiles,
  resolveAmmoraFinalizedHead,
  type AmmoraDeployment,
} from "@ammora-protocol/sdk";

export const RPC_URL =
  giwaSepoliaAutoRouteDeployment.chain.rpcUrls[0] ?? "https://sepolia-rpc.giwa.io";
export const EXPLORER_URL =
  giwaSepoliaAutoRouteDeployment.chain.blockExplorerUrl ?? "https://sepolia-explorer.giwa.io";

export const giwaChain = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: giwaSepoliaAutoRouteDeployment.chain.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Explorer", url: EXPLORER_URL } },
});

export const publicClient: PublicClient = createPublicClient({
  chain: giwaChain,
  transport: http(RPC_URL),
});

export const deployment = giwaSepoliaAutoRouteDeployment;
export type V4LaunchContracts = Extract<
  AmmoraDeployment["contracts"]["launch"],
  { protocolVersion: 4 }
>;
export const launchContracts = deployment.contracts.launch as V4LaunchContracts;

export const core = {
  configRegistry: launchContracts.configRegistry,
  launchFactory: launchContracts.factory,
  graduationAdapter: launchContracts.graduationAdapter,
  feePolicy: launchContracts.feePolicy,
} as const;

export const deploymentSource = createAmmoraDeploymentSource([deployment]);
export const factoryProfiles = giwaSepoliaAutoRoutePoolProfiles;

/** Reviewed confirmed snapshot block for dependent reads. */
export const finalizedHead = (): Promise<bigint> =>
  resolveAmmoraFinalizedHead([publicClient], giwaSepoliaAutoRoute.finality);

export const explorerTx = (hash: string): string => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddress = (address: string): string => `${EXPLORER_URL}/address/${address}`;

export const GIWA_CHAIN_ID = 91342;
export type { Address, PublicClient };
