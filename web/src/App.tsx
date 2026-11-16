import { useState } from "react";
import { WalletButton } from "./components/WalletButton";
import { DashboardView } from "./views/DashboardView";
import { LaunchView } from "./views/LaunchView";
import { TradeView } from "./views/TradeView";
import { GraduateView } from "./views/GraduateView";
import { FeesView } from "./views/FeesView";
import { useLifecycleState } from "./lib/state";
import { shortAddress } from "./lib/format";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "launch", label: "Launch" },
  { id: "trade", label: "Trade" },
  { id: "graduate", label: "Graduate" },
  { id: "fees", label: "Fees" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const { state } = useLifecycleState();

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Ammora Launchpad
            <span className="ml-2 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 align-middle text-xs font-normal text-zinc-400">
              GIWA Sepolia · SDK 0.3.9
            </span>
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Testnet beta — no audit. Native ETH pays gas; WETH is a separate quote balance.
          </p>
        </div>
        <WalletButton />
      </header>

      {(state.token || state.curve || state.pool) && (
        <div className="mono mb-5 flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-400">
          {state.configId && <span>config #{state.configId}</span>}
          {state.token && <span>token {shortAddress(state.token)}</span>}
          {state.curve && <span>curve {shortAddress(state.curve)}</span>}
          {state.pool && <span>pool {shortAddress(state.pool)}</span>}
        </div>
      )}

      <nav className="mb-6 flex gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-1">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === entry.id
                ? "bg-emerald-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <DashboardView />}
      {tab === "launch" && <LaunchView />}
      {tab === "trade" && <TradeView />}
      {tab === "graduate" && <GraduateView />}
      {tab === "fees" && <FeesView />}

      <footer className="mt-10 border-t border-zinc-900 pt-4 text-xs text-zinc-600">
        Built on @ammora-protocol/sdk — receipts are the canonical source of truth. Never repeat a
        successful final buy or migration.
      </footer>
    </div>
  );
}
