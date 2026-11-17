// Fees — read claimable Creator/Partner launch fees for the connected wallet
// and claim them with an own-beneficiary signature (payout only changes the
// destination, never the beneficiary).
import { useState } from "react";
import {
  ammoraLaunchFactoryV4Abi,
  buildClaimFeeVaultFor,
  feeVaultAbi,
} from "@ammora-protocol/sdk";
import { zeroAddress } from "viem";
import type { Address } from "viem";
import { explorerTx, finalizedHead, launchContracts, publicClient } from "../lib/chain";
import { useWallet } from "../lib/wallet";
import { openAuthenticatedCurve, type CurveState } from "../lib/curve";
import { fetchTokenMeta, formatAmount, shortAddress, type TokenMeta } from "../lib/format";
import { useLifecycleState } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ErrorBox, Field, Loading, NoticeBox, Row, inputClass } from "../components/ui";

export function FeesView() {
  const wallet = useWallet();
  const { state: saved, update } = useLifecycleState();
  const [curveInput, setCurveInput] = useState(saved.curve ?? "");
  const [curve, setCurve] = useState<Address | undefined>(
    saved.curve ? (saved.curve as Address) : undefined,
  );
  const [busyToken, setBusyToken] = useState<Address | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [claimed, setClaimed] = useState<{ token: Address; hash: string; amount: bigint } | undefined>();

  const curveQuery = useAsync(async () => {
    if (!curve) return undefined;
    const block = await finalizedHead();
    const { state } = await openAuthenticatedCurve(publicClient, launchContracts, curve, block);
    return state as CurveState;
  }, [curve]);

  const curveState = curveQuery.data;

  const feesQuery = useAsync(async () => {
    if (!curveState || !wallet.address) return undefined;
    const block = await finalizedHead();
    const feeVault = (await publicClient.readContract({
      address: launchContracts.factory,
      abi: ammoraLaunchFactoryV4Abi,
      functionName: "feeVault",
      blockNumber: block,
    })) as Address;
    if (feeVault === zeroAddress) throw new Error("factory records no fee vault");
    const assets = [curveState.quoteToken, curveState.baseToken] as Address[];
    const rows = [];
    for (const feeToken of assets) {
      const claimable = (await publicClient.readContract({
        address: feeVault,
        abi: feeVaultAbi,
        functionName: "claimable",
        args: [feeToken, wallet.address],
        blockNumber: block,
      })) as bigint;
      const meta = await fetchTokenMeta(publicClient, feeToken);
      rows.push({ feeToken, claimable, meta: meta as TokenMeta });
    }
    return { feeVault, rows };
  }, [curveState, wallet.address]);

  const loadCurve = () => {
    setError(undefined);
    setClaimed(undefined);
    if (!/^0x[0-9a-fA-F]{40}$/.test(curveInput.trim())) {
      setError("Enter a valid 0x curve address");
      return;
    }
    const normalized = curveInput.trim().toLowerCase() as Address;
    setCurve(normalized);
    update({ curve: normalized });
  };

  const claim = async (feeToken: Address) => {
    setError(undefined);
    setClaimed(undefined);
    setBusyToken(feeToken);
    try {
      if (!wallet.address) throw new Error("Connect a wallet first");
      // Own-beneficiary claim: the connected account owns the entitlement.
      const transaction = buildClaimFeeVaultFor(feeToken, wallet.address, wallet.address);
      const feeVault = feesQuery.data?.feeVault as Address;
      const before = (await publicClient.readContract({
        address: feeVault,
        abi: feeVaultAbi,
        functionName: "claimable",
        args: [feeToken, wallet.address],
      })) as bigint;
      if (before === 0n) throw new Error("nothing owed for this token, no transaction sent");
      const { hash, status } = await wallet.sendTransaction({ to: feeVault, data: transaction.data });
      if (status !== "success") throw new Error("Claim transaction reverted");
      const receiptBlock = (await publicClient.getTransactionReceipt({ hash })).blockNumber;
      const after = (await publicClient.readContract({
        address: feeVault,
        abi: feeVaultAbi,
        functionName: "claimable",
        args: [feeToken, wallet.address],
        blockNumber: receiptBlock,
      })) as bigint;
      if (after >= before) {
        throw new Error("claimable did not decrease; reconcile the receipt before resending");
      }
      setClaimed({ token: feeToken, hash, amount: before - after });
      feesQuery.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyToken(undefined);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Beneficiary" subtitle="Creator and Partner fees for every launch settle in the factory's FeeVault">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Curve address (identifies the launch assets)">
              <input className={inputClass} value={curveInput} onChange={(event) => setCurveInput(event.target.value)} placeholder="0x…" />
            </Field>
          </div>
          <Button variant="ghost" onClick={loadCurve}>
            Load
          </Button>
        </div>
        <div className="mt-4">
          <Row label="Connected wallet">{wallet.address ?? "not connected"}</Row>
          {curveState && <Row label="Launch token">{shortAddress(curveState.baseToken)}</Row>}
        </div>
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
        {claimed && (
          <div className="mt-4">
            <NoticeBox>
              Claimed {claimed.amount.toString()} raw ✓ —{" "}
              <a className="text-sky-400 hover:underline" href={explorerTx(claimed.hash)} target="_blank" rel="noreferrer">
                {shortAddress(claimed.hash)}
              </a>
            </NoticeBox>
          </div>
        )}
      </Card>

      <Card title="Claimable fees" right={feesQuery.loading && curveState ? <Loading /> : undefined}>
        {!wallet.address && (
          <p className="text-sm text-zinc-500">Connect a wallet to read and claim your own entitlement.</p>
        )}
        {wallet.address && !curve && <p className="text-sm text-zinc-500">Load a curve to identify the fee assets.</p>}
        {wallet.address && curveState && feesQuery.data && (
          <div className="grid gap-4">
            {feesQuery.data.rows.map((row) => (
              <div key={row.feeToken} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                <Row label="Asset">{row.meta.symbol}</Row>
                <Row label="Claimable">{formatAmount(row.claimable, row.meta)}</Row>
                <Row label="FeeVault">{shortAddress(feesQuery.data!.feeVault)}</Row>
                <div className="mt-3">
                  <Button
                    onClick={() => void claim(row.feeToken as Address)}
                    loading={busyToken === row.feeToken}
                    disabled={row.claimable === 0n}
                  >
                    {row.claimable === 0n ? "Nothing owed" : "Claim"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}