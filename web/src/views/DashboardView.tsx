// Dashboard — chain/deployment health, Data API discovery, local lifecycle state.
import { useEffect, useState } from "react";
import { verifyAmmoraV4CoreAtBlock } from "@ammora-protocol/sdk";
import {
  EXPLORER_URL,
  RPC_URL,
  core,
  deployment,
  explorerAddress,
  finalizedHead,
  publicClient,
} from "../lib/chain";
import { dataApi, isDataApiStatusError } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { shortAddress } from "../lib/format";
import { useLifecycleState } from "../lib/state";
import { Badge, Card, ErrorBox, Loading, NoticeBox, Row } from "../components/ui";

type LaunchSummary = {
  token?: string;
  name?: string;
  symbol?: string;
  [key: string]: unknown;
};

export function DashboardView() {
  const { state } = useLifecycleState();
  const [launches, setLaunches] = useState<LaunchSummary[] | null>(null);
  const [apiError, setApiError] = useState<string | undefined>(undefined);
  const [apiLoading, setApiLoading] = useState(true);

  const health = useAsync(async () => {
    const block = await finalizedHead();
    await verifyAmmoraV4CoreAtBlock(publicClient, core, block);
    return { block };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setApiLoading(true);
    dataApi
      .getLaunches({ chainId: 91_342n })
      .then((page) => {
        if (cancelled) return;
        const items = (page as { items?: LaunchSummary[] }).items ?? (page as unknown as LaunchSummary[]);
        setLaunches(Array.isArray(items) ? items : []);
        setApiError(undefined);
        setApiLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = isDataApiStatusError(error);
        setApiError(
          status
            ? `Data API returned HTTP ${status}; the hosted indexer may be restarting. Try again later.`
            : error instanceof Error
              ? error.message
              : String(error),
        );
        setApiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const healthSection = health.data && (
    <div>
      <Row label="Chain">91342 — GIWA Sepolia</Row>
      <Row label="RPC">{RPC_URL}</Row>
      <Row label="Explorer">{EXPLORER_URL}</Row>
      <Row label="Confirmed snapshot">block {health.data.block.toString()}</Row>
      <Row label="Config Registry">
        <a className="hover:underline" href={explorerAddress(core.configRegistry)} target="_blank" rel="noreferrer">
          {shortAddress(core.configRegistry)}
        </a>
      </Row>
      <Row label="Launch Factory">
        <a className="hover:underline" href={explorerAddress(core.launchFactory)} target="_blank" rel="noreferrer">
          {shortAddress(core.launchFactory)}
        </a>
      </Row>
      <Row label="Graduation Adapter">
        <a className="hover:underline" href={explorerAddress(core.graduationAdapter)} target="_blank" rel="noreferrer">
          {shortAddress(core.graduationAdapter)}
        </a>
      </Row>
      <Row label="Fee Policy">
        <a className="hover:underline" href={explorerAddress(core.feePolicy)} target="_blank" rel="noreferrer">
          {shortAddress(core.feePolicy)}
        </a>
      </Row>
    </div>
  );

  const launchesSection = launches && launches.length > 0 && (
    <ul className="space-y-2">
      {launches.slice(0, 10).map((item, index) => (
        <li key={item.token ?? index} className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-zinc-200">
              {item.name ?? "Unnamed"} {item.symbol ? `(${item.symbol})` : ""}
            </span>
            {item.token && (
              <a
                className="mono text-xs text-sky-400 hover:underline"
                href={explorerAddress(item.token)}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(item.token)}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Deployment health" subtitle="V4 Core verified at a reviewed confirmed snapshot" right={health.loading ? <Loading label="Verifying" /> : health.error ? <Badge tone="red">failed</Badge> : <Badge tone="green">verified</Badge>}>
        {health.error && <ErrorBox message={health.error} />}
        {healthSection}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Indexed launches" subtitle="Data API · https://ammora-giwa-sepolia-data.fly.dev">
          {apiLoading && <Loading label="Fetching launches" />}
          {apiError && <NoticeBox tone="amber">{apiError}</NoticeBox>}
          {launches && launches.length === 0 && (
            <p className="text-sm text-zinc-500">No launches indexed yet.</p>
          )}
          {launchesSection}
        </Card>

        <Card title="Your lifecycle state" subtitle="Saved locally from receipt-derived addresses">
          {state.configId || state.token || state.curve || state.pool ? (
            <div>
              <Row label="Config ID">#{state.configId ?? "—"}</Row>
              <Row label="Token">{state.token ? shortAddress(state.token) : "—"}</Row>
              <Row label="Curve">{state.curve ? shortAddress(state.curve) : "—"}</Row>
              <Row label="Canonical pool">{state.pool ? shortAddress(state.pool) : "—"}</Row>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">
              Nothing recorded yet. Create a launch in the <b>Launch</b> tab — token and curve addresses will be saved here automatically from receipts.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}