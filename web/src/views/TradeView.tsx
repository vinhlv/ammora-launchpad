// Trade — buy/sell on the pre-graduation ALC curve with a connected wallet.
// Quotes at the reviewed confirmed snapshot; ordinary orders must fill in full;
// approvals are exact-input; outputs are reconciled from the receipt.
import { useState } from "react";
import { parseAmmoraV4SwapReceipt } from "@ammora-protocol/sdk";
import { erc20Abi } from "viem";
import type { Address } from "viem";
import {
  core,
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
  type CurvePlan,
  type CurveState,
} from "../lib/curve";
import { fetchTokenMeta, formatAmount, parseHumanAmount, shortAddress, type TokenMeta } from "../lib/format";
import { useLifecycleState } from "../lib/state";
import { useAsync } from "../lib/useAsync";
import { Badge, Button, Card, ErrorBox, Field, Loading, NoticeBox, Row, inputClass } from "../components/ui";

const DEADLINE_SECONDS = 20n * 60n;

export function TradeView() {
  const wallet = useWallet();
  const { state: saved, update } = useLifecycleState();
  const [curveInput, setCurveInput] = useState(saved.curve ?? "");
  const [curve, setCurve] = useState<Address | undefined>(
    saved.curve ? (saved.curve as Address) : undefined,
  );
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amountText, setAmountText] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);

  const [meta, setMeta] = useState<{ in: TokenMeta; out: TokenMeta } | undefined>();
  const [plan, setPlan] = useState<CurvePlan | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "quote" | "approve" | "swap">("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<
    { hash: string; consumed: bigint; unused: bigint; tokenOut: Address } | undefined
  >(undefined);

  const stateQuery = useAsync(async () => {
    if (!curve) return undefined;
    const block = await finalizedHead();
    const { state } = await openAuthenticatedCurve(publicClient, launchContracts, curve, block);
    return state as CurveState;
  }, [curve]);

  const curveState = stateQuery.data;

  const loadCurve = () => {
    setError(undefined);
    setPlan(undefined);
    setResult(undefined);
    if (!/^0x[0-9a-fA-F]{40}$/.test(curveInput.trim())) {
      setError("Enter a valid 0x curve address");
      return;
    }
    const normalized = curveInput.trim().toLowerCase() as Address;
    setCurve(normalized);
    update({ curve: normalized });
  };

  const quote = async () => {
    setError(undefined);
    setPlan(undefined);
    setResult(undefined);
    setBusy("quote");
    try {
      if (!curveState) throw new Error("Load the curve first");
      if (!wallet.address) throw new Error("Connect a wallet first");
      const tokenIn = (direction === "buy" ? curveState.quoteToken : curveState.baseToken) as Address;
      const tokenOut = (direction === "buy" ? curveState.baseToken : curveState.quoteToken) as Address;
      const [metaIn, metaOut] = await Promise.all([
        fetchTokenMeta(publicClient, tokenIn),
        fetchTokenMeta(publicClient, tokenOut),
      ]);
      const amountIn = parseHumanAmount(amountText, metaIn);
      const block = await finalizedHead();
      const built = await planCurveAtBlock(publicClient, launchContracts, curve as Address, {
        blockNumber: block,
        tokenIn,
        amountIn,
        recipient: wallet.address,
        deadline: BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_SECONDS,
        slippageBps,
      });
      setMeta({ in: metaIn, out: metaOut });
      setPlan(built);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const approveAndSwap = async () => {
    if (!plan || !curveState) return;
    setBusy("approve");
    setError(undefined);
    try {
      const tokenIn = (direction === "buy" ? curveState.quoteToken : curveState.baseToken) as Address;
      const requirement = plan.approvalRequirement;
      const allowance = (await publicClient.readContract({
        address: tokenIn,
        abi: erc20Abi,
        functionName: "allowance",
        args: [wallet.address as Address, requirement.spender],
      })) as bigint;
      if (allowance < requirement.amount) {
        const approval = await wallet.sendTransaction({
          to: tokenIn,
          data: encodeApprove(requirement.spender, requirement.amount),
        });
        if (approval.status !== "success") throw new Error("Approval reverted");
      }
      setBusy("swap");
      const { hash, status } = await wallet.sendTransaction({
        to: plan.transaction.to,
        data: plan.transaction.data,
      });
      if (status !== "success") throw new Error("Swap transaction reverted");
      const receipt = await publicClient.getTransactionReceipt({ hash });
      const confirmed = parseAmmoraV4SwapReceipt(receipt, curve as Address, {
        trader: wallet.address as Address,
        recipient: wallet.address as Address,
        baseForQuote: plan.baseForQuote,
        requestedAmountIn: plan.approvalRequirement.amount,
        minimumAmountOut: plan.quote.minimumAmountOut,
      });
      setResult({
        hash,
        consumed: confirmed.consumedAmountIn,
        unused: confirmed.amountLeft,
        tokenOut: plan.tokenOut,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy("");
    }
  };

  const statusTone = (status: number | undefined) =>
    status === 1 ? "green" : status === 2 ? "amber" : status === 3 ? "blue" : "neutral";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="ALC curve" subtitle="Pre-graduation bonding curve, authenticated against the reviewed factory">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label="Curve address">
              <input
                className={inputClass}
                value={curveInput}
                onChange={(event) => setCurveInput(event.target.value)}
                placeholder="0x… (from the Launch tab or CLI state)"
              />
            </Field>
          </div>
          <Button variant="ghost" onClick={loadCurve}>
            Load
          </Button>
        </div>

        <div className="mt-4">
          {stateQuery.loading && curve && <Loading label="Reading curve at confirmed snapshot" />}
          {stateQuery.error && <ErrorBox message={stateQuery.error} />}
          {curveState && (
            <div>
              <div className="mb-2 flex gap-2">
                <Badge tone={statusTone(curveState.status)}>
                  {curveStatusName(curveState.status)}
                </Badge>
                {curveState.status === 2 && <Badge tone="amber">run Graduate tab</Badge>}
                {curveState.status === 3 && <Badge tone="blue">trade the pool instead</Badge>}
              </div>
              <Row label="Base token">
                {shortAddress(curveState.baseToken)}
              </Row>
              <Row label="Quote token">
                {shortAddress(curveState.quoteToken)}
              </Row>
              {curveState.canonicalPool !== "0x0000000000000000000000000000000000000000" && (
                <Row label="Canonical pool">{shortAddress(curveState.canonicalPool)}</Row>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title={direction === "buy" ? "Buy launch token" : "Sell launch token"}>
        {curveState?.status === 1 ? (
          <div className="grid gap-4">
            <div className="flex gap-2">
              {(["buy", "sell"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setDirection(option);
                    setPlan(undefined);
                    setResult(undefined);
                  }}
                  className={`flex-1 rounded-xl border px-4 py-2 text-sm font-medium capitalize ${
                    direction === option
                      ? "border-emerald-600 bg-emerald-950 text-emerald-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <Field
              label={`Amount (${direction === "buy" ? "quote token, human" : "launch token, human"})`}
              hint="Human decimal amount — parsed against the input token's decimals"
            >
              <input className={inputClass} value={amountText} onChange={(event) => setAmountText(event.target.value)} placeholder="0.01" />
            </Field>
            <Field label="Slippage (bps)" hint="Maximum 1000 for ALC curve trades">
              <input
                className={inputClass}
                value={slippageBps}
                onChange={(event) => setSlippageBps(Number(event.target.value.replace(/\D/g, "")) || 0)}
              />
            </Field>
            <div>
              <Button onClick={() => void quote()} loading={busy === "quote"}>
                Get quote
              </Button>
            </div>

            {plan && meta && (
              <div>
                <Row label="Expected out">{formatAmount(plan.quote.amountOut, meta.out)}</Row>
                <Row label="Minimum out">{formatAmount(plan.quote.minimumAmountOut, meta.out)}</Row>
                <Row label="Fill">{plan.fill.kind}</Row>
                <div className="mt-3">
                  {plan.fill.kind === "graduation-boundary" ? (
                    <NoticeBox tone="amber">
                      This amount reaches the graduation boundary. Use the <b>Graduate</b> tab for the
                      final buy — an ordinary trade here would not execute.
                    </NoticeBox>
                  ) : (
                    <Button onClick={() => void approveAndSwap()} loading={busy !== ""} disabled={!wallet.address}>
                      {busy === "approve" ? "Approving…" : busy === "swap" ? "Swapping…" : "Approve & swap"}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {error && <ErrorBox message={error} />}
            {result && (
              <NoticeBox>
                Swapped ✓ &nbsp;
                <a className="text-sky-400 hover:underline" href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
                  {shortAddress(result.hash)}
                </a>
                {result.unused > 0n && (
                  <span> — unused input {result.unused.toString()} raw stayed in your wallet</span>
                )}
              </NoticeBox>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            {curveState
              ? "Curve is not active — trading unavailable. ReadyToMigrate (2) needs the Graduate tab; Migrated (3) trades on the canonical pool."
              : "Load an authenticated curve to trade."}
          </p>
        )}
      </Card>
    </div>
  );
}

const encodeApprove = (spender: Address, amount: bigint): `0x${string}` => {
  const { encodeFunctionData } = require("viem") as typeof import("viem");
  return encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount] });
};