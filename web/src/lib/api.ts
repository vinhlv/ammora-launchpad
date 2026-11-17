// Ammora Data API client for the browser. The SDK's default fetcher re-reads
// the response body on the error path; a buffered fetcher reads once and
// surfaces the real HTTP status instead.
import { AmmoraDataApiClient, type AmmoraDataApiFetch } from "@ammora-protocol/sdk";

export const DATA_API_URL =
  import.meta.env.VITE_AMMORA_DATA_API_URL?.trim() ||
  "https://ammora-giwa-sepolia-data.fly.dev";

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

export const dataApi = new AmmoraDataApiClient(DATA_API_URL, bufferedFetch);

export const isDataApiStatusError = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
};
