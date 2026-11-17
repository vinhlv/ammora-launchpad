// Graduate — terminal boundary buy (when still Active) and the separate
// permissionless migration to the ARL pool. ReadyToMigrate resumes migration
// only; a Migrated curve shows its canonical pool and post-graduation trading.
import { useState } from "react";
import {
  AmmoraSwapClient,
  AmmoraV4LaunchCurveClient,
  classifyAmmoraV4ExactInputFill,
  parseAmmoraV4MigratedReceipt,
  parseAmmoraV4SwapReceipt,
  type AmmoraSwapModel,
} from "@ammora-protocol/sdk";
import { encodeFunctionData, erc20Abi } from "viem";
import type { Address } from "viem";
import {
  deployment,
  factoryProfiles,
  explorerTx,
  finalizedHead,
  launchContracts,
  publicClient,
} from "../lib/chain";
import { useWallet } from "../lib/wallet";
import {
  curveStatusName,
  openAuthenticatedCurve,
  planCurveAtBlock,
  type CurveState,
} from "../lib/curve";
import { fetchTokenMeta, parseHumanAmount, shortAddress, formatAmount } from "../lib/format";
import { useLifecycleState } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { Badge, Button, Card, ErrorBox, Field, Loading, NoticeBox, Row, inputClass } from "../components/ui";

const encodeApprove = (spender: Address, amount: bigint): `0x${string}` =>
  encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });

export function GraduateView() {
  const wallet = useWallet();
  const { state: saved, update } = useLifecycleState();
  const [curveInput, setCurveInput] = useState(saved.curve ?? "");
  const [curve, setCurve] = useState<Address | undefined>(
    saved.curve ? (saved.curve as Address) : undefined,
  );

  const [maxQuoteRaw, setMaxQuoteRaw] = useState("");
  const [boundary, setBoundary] = useState<
    { requested: bigint; consumed: bigint; unused: bigint } | undefined
  >(undefined);
  const [busy, setBusy] = useState<"" | "check" | "fill" | "migrate" | "poolSwap">("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [filled, setFilled] = useState<{ hash: string; consumed: bigint; unused: bigint } | undefined>();
  const [poolResult, setPoolResult] = useState<{ hash: string; received: bigint } | undefined>(undefined);

  const [poolAmount, setPoolAmount] = useState("");
  const [poolDirection, setPoolDirection] = useState<"buy" | "sell">("buy");

  const stateQuery = useAsync(async () => {
    if (!curve) return undefined;
    const block = await finalizedHead();
    const { state } = await openAuthenticatedCurve(publicClient, launchContracts, curve, block);
    return state as CurveState;
  }, [curve]);

  const curveState = stateQuery.data;

  const loadCurve = () => {
    setError(undefined);
    setBoundary(undefined);
    setFilled(undefined);
    setPoolResult(undefined);
    if (!/^0x[0-9a-fA-F]{40}$/.test(curveInput.trim())) {
      setError("Enter a valid 0x curve address");
      return;
    }
    const normalized = curveInput.trim().toLowerCase() as Address;
    setCurve(normalized);
    update({ curve: normalized });
  };

  const checkBoundary = async () => {
    setError(undefined);
    setBoundary(undefined);
    setBusy("check");
    try {
      if (!curveState || !curve) throw new Error("Load the curve first");
      const block = await finalizedHead();
      const sdk = new AmmoraV4LaunchCurveClient(publicClient, curve, {
        launchFactory: launchContracts.factory,
        feePolicy: launchContracts.feePolicy,
      });
      const quote = await sdk.quoteExactInputAtBlock(BigInt(maxQuoteRaw), false, block);
      const fill = classifyAmmoraV4ExactInputFill(quote, false);
      if (fill.kind !== "graduation-boundary") {
        throw new Error(
          `this buy is ${fill.kind}, not an executable Graduation boundary — ordinary orders must fill in full without reaching the boundary`,
        );
      }
      setBoundary({
        requested: fill.requestedAmountIn,
        consumed: fill.consumedAmountIn,
        unused: fill.refundableAmountIn,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const finalBuy = async () => {
    if (!curve || !curveState || !boundary) return;
    setBusy("fill");
    setError(undefined);
    try {
      if (!wallet.address) throw new Error("Connect a wallet first");
      const block = await finalizedHead();
      const plan = await planCurveAtBlock(publicClient, launchContracts, curve, {
        blockNumber: block,
        tokenIn: curveState.quoteToken as Address,
        amountIn: boundary.requested,
        recipient: wallet.address,
        deadline: BigInt(Math.floor(Date.now() / 1000)) + 20n * 60n,
        slippageBps: 100,
        graduationBoundary: true,
      });
      const allowance = (await publicClient.readContract({
        address: plan.approvalRequirement.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet.address, plan.approvalRequirement.spender],
      })) as bigint;
      if (allowance < plan.approvalRequirement.amount) {
        const approval = await wallet.sendTransaction({
          to: plan.approvalRequirement.token,
          data: encodeApprove(plan.approvalRequirement.spender, plan.approvalRequirement.amount),
        });
        if (approval.status !== "success") throw new Error("Approval reverted");
      }
      const { hash, status } = await wallet.sendTransaction({
        to: plan.transaction.to,
        data: plan.transaction.data,
      });
      if (status !== "success") throw new Error("Final-fill transaction reverted");
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const confirmed = parseAmmoraV4SwapReceipt(receipt, curve, {
        trader: wallet.address,
        recipient: wallet.address,
        baseForQuote: false,
        requestedAmountIn: boundary.requested,
        minimumAmountOut: plan.quote.minimumAmountOut,
      });
      setFilled({ hash, consumed: confirmed.consumedAmountIn, unused: confirmed.amountLeft });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const migrate = async () => {
    if (!curve) return;
    setBusy("migrate");
    setError(undefined);
    try {
      if (!wallet.address) throw new Error("Connect a wallet first");
      const block = await finalizedHead();
      const sdk = new AmmoraV4LaunchCurveClient(publicClient, curve, {
        launchFactory: launchContracts.factory,
        feePolicy: launchContracts.feePolicy,
      });
      const migration = await sdk.planMigrateAtBlock(block);
      const { hash, status } = await wallet.sendTransaction({
        to: migration.transaction.to,
        data: migration.transaction.data,
      });
      if (status !== "success") throw new Error("Migration transaction reverted");
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const graduated = parseAmmoraV4MigratedReceipt(receipt, curve);
      update({ pool: graduated.canonicalPool });
      stateQuery.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const poolSwap = async () => {
    const pool = curveState?.canonicalPool as Address | undefined;
    if (!pool || !curveState) return;
    setBusy("poolSwap");
    setError(undefined);
    try {
      if (!wallet.address) throw new Error("Connect a wallet first");
      const tokenIn = (poolDirection === "buy" ? curveState.quoteToken : curveState.baseToken) as Address;
      const meta = await fetchTokenMeta(publicClient, tokenIn);
      const amountIn = parseHumanAmount(poolAmount, meta);
      const quoteBlock = await finalizedHead();
      const swaps = await AmmoraSwapClient.create(publicClient, {
        deploymentCatalog: { [91342]: deployment },
        factoryProfiles,
      });
      const prepared = await swaps.prepareExactIn({
        model: "concentrated" as AmmoraSwapModel,
        pool,
        tokenIn,
        inputAsset: "erc20",
        amountIn,
        payer: wallet.address,
        recipient: wallet.address,
        slippageBps: 50,
        executionMode: "direct-wallet",
        quoteBlockNumber: quoteBlock,
      });
      const signer = await wallet.getSigner();
      const execution = await prepared.execute(signer, {
        onStatus: (entry: unknown) => {
          const label = typeof entry === "object" && entry !== null ? (entry as { status?: string }).status : "";
          if (label) console.log("pool swap status", label);
        },
      });
      if (execution.amountReceived === null) {
        throw new Error("Swap succeeded but receipt-block output reconciliation was unavailable");
      }
      setPoolResult({ hash: execution.hash, received: execution.amountReceived });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const statusTone = (status: number) =>
    status === 1 ? "green" : status === 2 ? "amber" : status === 3 ? "blue" : "neutral";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Curve status" subtitle="Final buy and migration are separate transactions">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Curve address">
              <input className={inputClass} value={curveInput} onChange={(event) => setCurveInput(event.target.value)} placeholder="0x…" />
            </Field>
          </div>
          <Button variant="ghost" onClick={loadCurve}>
            Load
          </Button>
        </div>
        <div className="mt-4">
          {stateQuery.error && <ErrorBox message={error as string} />}
          {curveState && (
            <div>
              <div className="mb-2 flex gap-2">
                <Badge tone={statusTone(Number(curveState.status as number ?? 0))}>{curveStatusName(Number(curveState.status as number ?? 0))}</Badge>
              </div>
              <Row label="Base token">{shortAddress(curveState.baseToken)}</Row>
              <Row label="Quote token">{shortAddress(curveState.quoteToken)}</Row>
              {curveState.status === 3 && <Row label="Canonical pool">{shortAddress(curveState.canonicalPool)}</Row>}
            </div>
          )}
        </div>

        {error && <div className="mt-4"><ErrorBox message={error} /></div>}
      </Card>

      <div className="grid gap-5">
        {curveState?.status === 1 && (
          <Card title="1 — Final boundary buy" subtitle="Maximum raw quote input; the curve consumes only the fillable remainder">
            <div className="grid gap-4">
              <Field label="Maximum quote input (raw units)" hint="Raw integers, not human decimals. Unused input stays in your wallet.">
                <input className={inputClass} value={maxQuoteRaw} onChange={(event) => setMaxQuoteRaw(event.target.value.replace(/\D/g, ""))} placeholder="100000000000000" />
              </Field>
              <Button onClick={() => void checkBoundary()} loading={busy === "check"}>
                Check boundary
              </Button>
              {boundary && (
                <div>
                  <Row label="Requested">{boundary.requested.toString()}</Row>
                  <Row label="Consumed">{boundary.consumed.toString()}</Row>
                  <Row label="Unused input">{boundary.unused.toString()}</Row>
                  <div className="mt-3">
                    <Button variant="danger" onClick={() => void finalBuy()} loading={busy === "fill"} disabled={!wallet.address}>
                      Send final buy
                    </Button>
                  </div>
                </div>
              )}
              {filled && (
                <NoticeBox>
                  Final fill confirmed ✓&nbsp;
                  <a className="text-sky-400 hover:underline" href={explorerTx(filled.hash)} target="_blank" rel="noreferrer">
                    {shortAddress(filled.hash)}
                  </a>
                  <br />
                  Wait for the confirmed snapshot to include this block, then run migration below
                  (the Migrate button re-checks the snapshot automatically).
                </NoticeBox>
              )}
            </div>
          </Card>
        )}

        {(curveState?.status === 2 || filled) && (
          <Card title="2 — Migration" subtitle="Permissionless; creates the ARL pool from Config-defined liquidity">
            <Button onClick={() => void migrate()} loading={busy === "migrate"} disabled={!wallet.address}>
              Migrate to ARL
            </Button>
          </Card>
        )}

        {curveState?.status === 3 && (
          <Card title="Graduated ✓" subtitle="Post-graduation trading on the canonical pool">
            <Row label="Canonical pool">{shortAddress(curveState.canonicalPool)}</Row>
            <div className="mt-4 grid gap-4">
              <div className="flex gap-2">
                {(["buy", "sell"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPoolDirection(option)}
                    className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium capitalize ${
                      poolDirection === option
                        ? "border-emerald-600 bg-emerald-950 text-emerald-300"
                        : "border-zinc-700 bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    {option} (pool)
                  </button>
                ))}
              </div>
              <Field label="Amount (human, input token)">
                <input className={inputClass} value={poolAmount} onChange={(event) => setPoolAmount(event.target.value)} placeholder="0.01" />
              </Field>
              <Button onClick={() => void poolSwap()} loading={busy === "poolSwap"} disabled={!wallet.address}>
                Swap on pool
              </Button>
              {poolResult && (
                <NoticeBox>
                  Pool swap ✓ received {poolResult.received.toString()} raw units —{" "}
                  <a className="text-sky-400 hover:underline" href={explorerTx(poolResult.hash)} target="_blank" rel="noreferrer">
                    {shortAddress(poolResult.hash)}
                  </a>
                </NoticeBox>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}