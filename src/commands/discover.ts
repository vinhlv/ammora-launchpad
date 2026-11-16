// Optional — launchpad discovery through the Ammora Data API.
//
//   discover              — list indexed launches for the configured chain
//   discover <token>      — one launch's indexed record
//
// Launches and pools are dynamic data; they are not copied into each SDK
// release. The Data API indexes canonical events from Ammora-reviewed
// factories, so every SDK consumer discovers the same typed result.
//
// The SDK's default fetcher re-reads the response body on the error path,
// which masks the real HTTP status ("Body has already been read"). A buffered
// fetcher reads the body exactly once and reports the true status instead.
import { AmmoraDataApiClient, type AmmoraDataApiFetch } from "@ammora-protocol/sdk";
import { printJson } from "../lib/format.js";

const DATA_API_URL = process.env.AMMORA_DATA_API_URL?.trim()
  || "https://ammora-giwa-sepolia-data.fly.dev";

const bufferedFetch: AmmoraDataApiFetch = async (input, init) => {
  const response = await fetch(input, init);
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    json: async () => (text.length === 0 ? null : JSON.parse(text)),
    text: async () => text,
  };
};

export const runDiscover = async (args: string[]): Promise<void> => {
  const [token] = args;
  const data = new AmmoraDataApiClient(DATA_API_URL, bufferedFetch);
  const chainId = 91_342n;
  try {
    if (token) {
      const launch = (await data.getLaunch(chainId, token as `0x${string}`)) as unknown;
      printJson({ source: DATA_API_URL, chainId: chainId.toString(), launch });
    } else {
      const launches = (await data.getLaunches({ chainId })) as unknown;
      printJson({ source: DATA_API_URL, chainId: chainId.toString(), launches });
    }
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number") {
      throw new Error(
        `Data API returned HTTP ${status}; the hosted indexer may be restarting. ` +
          "Preserve this error, retry later, or point AMMORA_DATA_API_URL at another reviewed instance.",
      );
    }
    throw error;
  }
};
