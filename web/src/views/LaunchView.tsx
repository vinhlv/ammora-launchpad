// Launch — issue a new token + ALC curve on an existing Config.
// The Config decides economics; the UI only names the token. Addresses shown
// after sending come from the transaction receipt, never from predictions.
import { useState } from "react";
import {
  buildCreateAmmoraV4Launch,
  getAmmoraV4ConfigAtBlock,
  parseAmmoraV4LaunchCreatedReceipt,
} from "@ammora-protocol/sdk";
import { core, explorerAddress, explorerTx, finalizedHead, launchContracts, publicClient } from "../lib/chain";
import { useWallet } from "../lib/wallet";
import { useAsync } from "../lib/useAsync";
import { useLifecycleState } from "../lib/state";
import { shortAddress } from "../lib/format";
import { Badge, Button, Card, ErrorBox, Field, Loading, NoticeBox, Row, inputClass } from "../components/ui";

export function LaunchView() {
  const wallet = useWallet();
  const { state, update } = useLifecycleState();
  const [configId, setConfigId] = useState(state.configId ?? "6");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState("https://example.com/metadata.json");

  const config = useAsync(
    () => finalizedHead().then((block) =>
      getAmmoraV4ConfigAtBlock(publicClient, core.configRegistry, BigInt(configId || "0"), block),
    ),
    [configId],
  );

  const [preview, setPreview] = useState<{ data: `0x${string}`; value?: bigint } | undefined>();
  const [busy, setBusy] = useState<"" | "preview" | "send">("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{ hash: string; token: string; curve: string } | undefined>();

  const loadAndPreview = async () => {
    setError(undefined);
    setPreview(undefined);
    setResult(undefined);
    setBusy("preview");
    try {
      if (!wallet.address) throw new Error("Connect a wallet first");
      if (!name || !symbol || !uri) throw new Error("Name, symbol and metadata URI are required");
      if (!/^\d+$/.test(configId)) throw new Error("Config ID must be a positive integer");
      const entry = config.data
        ?? (await finalizedHead().then((block) =>
          getAmmoraV4ConfigAtBlock(publicClient, core.configRegistry, BigInt(configId), block),
        ));
      if (!entry || !entry.enabled) throw new Error(`Config #${configId} is disabled or unreadable`);
      const transaction = buildCreateAmmoraV4Launch(
        { name, symbol, metadataURI: uri, creatorMetadataURI: uri, tokenDecimals: entry.config.tokenDecimals },
        BigInt(configId),
        entry.config.poolCreationFee,
      );
      setPreview({ data: transaction.data, value: transaction.value });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const send = async () => {
    if (!preview) return;
    setBusy("send");
    setError(undefined);
    try {
      const { hash, status } = await wallet.sendTransaction({
        to: launchContracts.factory,
        data: preview.data,
        value: preview.value,
      });
      if (status !== "success") throw new Error("Transaction reverted");
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const created = parseAmmoraV4LaunchCreatedReceipt(receipt, launchContracts.factory);
      update({
        configId,
        token: created.token,
        curve: created.curve,
      });
      setResult({ hash, token: created.token, curve: created.curve });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Create launch" subtitle="Issues a new token + pre-graduation ALC curve on the selected Config">
        <div className="grid gap-4">
          <Field label="Config ID" hint="Reusable immutable economics. Template #6 is the reviewed GIWA example (verify in the CLI first).">
            <input className={inputClass} value={configId} onChange={(event) => setConfigId(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Token name">
              <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Launchpad Token" />
            </Field>
            <Field label="Symbol">
              <input className={inputClass} value={symbol} onChange={(event) => setSymbol(event.target.value)} placeholder="LPT" />
            </Field>
          </div>
          <Field label="Metadata URI">
            <input className={inputClass} value={uri} onChange={(event) => setUri(event.target.value)} />
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={() => void loadAndPreview()} loading={busy === "preview"}>
              Preview transaction
            </Button>
            {preview && (
              <Button onClick={() => void send()} loading={busy === "send"} disabled={!wallet.address}>
                Send with wallet
              </Button>
            )}
          </div>
          {error && <ErrorBox message={error} />}
        </div>
      </Card>

      <Card title="Selected config">
        <div className="grid gap-4">
          <div className="grid gap-4">
            <div>
              <span className="text-sm font-medium text-zinc-400 uppercase">Config</span>
              <span>#{configId}</span>
            </div>
            {error && <ErrorBox message={error} />}
            {config.data && (
              <div>
                <span className="text-sm font-medium text-zinc-400 uppercase">Enabled</span>
                <span>{config.data.enabled ? "yes" : "NO — cannot launch"}</span>
                <span className="text-sm font-medium text-zinc-400 uppercase">Token decimals</span>
                <span>{config.data.config.tokenDecimals}</span>
                <span className="text-sm font-medium text-zinc-400 uppercase">poolCreationFee</span>
                <span>{config.data.config.poolCreationFee.toString()} wei</span>
                <span className="text-sm font-medium text-zinc-400 uppercase">Curve segments</span>
                <span>{config.data.segments.length}</span>
                <span className="text-sm font-medium text-zinc-400 uppercase">Config hash</span>
                <span>{shortAddress(config.data.configHash)}</span>
              </div>
            )}
          </div>
          {config.loading ? <Loading /> : config.error ? <Badge tone="red">error</Badge> : <Badge tone="green">loaded</Badge>}
        </div>
      </Card>

      {preview && (
        <Card title="Transaction preview" subtitle="Built with buildCreateAmmoraV4Launch — exact calldata sent by your wallet">
          <div>
            <Row label="To">{shortAddress(launchContracts.factory)}</Row>
            <Row label="Value">{(preview.value ?? 0n).toString()} wei</Row>
            <Row label="Calldata">{shortAddress(preview.data, 10)}</Row>
          </div>
        </Card>
      )}

      {result && (
        <Card title="Launch created ✓" subtitle="Addresses parsed from the canonical receipt">
          <NoticeBox>
            Token and curve saved to local lifecycle state. Trade in the <b>Trade</b> tab.
          </NoticeBox>
          <div className="mt-3">
            <Row label="Tx">
              <a className="text-sky-400 hover:underline" href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
                {shortAddress(result.hash)}
              </a>
            </Row>
            <Row label="Token">
              <a className="text-sky-400 hover:underline" href={explorerAddress(result.token)} target="_blank" rel="noreferrer">
                {result.token}
              </a>
            </Row>
            <Row label="Curve">
              <a className="text-sky-400 hover:underline" href={explorerAddress(result.curve)} target="_blank" rel="noreferrer">
                {result.curve}
              </a>
            </Row>
          </div>
        </Card>
      )}
    </div>
  );
}