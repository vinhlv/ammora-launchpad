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
  {
    id: "dashboard",
    label: "Dashboard",
    eyebrow: "Protocol overview",
    title: "Everything at a glance",
    description: "Check deployment health, indexed launches and your receipt-derived lifecycle state.",
  },
  {
    id: "launch",
    label: "Launch",
    eyebrow: "Token issuance",
    title: "Create a new launch",
    description: "Issue a token and its bonding curve with a previewed wallet transaction.",
  },
  {
    id: "trade",
    label: "Trade",
    eyebrow: "ALC market",
    title: "Trade the bonding curve",
    description: "Quote, approve and buy or sell tokens against a confirmed on-chain snapshot.",
  },
  {
    id: "graduate",
    label: "Graduate",
    eyebrow: "Canonical pool",
    title: "Graduate with confidence",
    description: "Complete the boundary buy and permissionless migration as separate steps.",
  },
  {
    id: "fees",
    label: "Fees",
    eyebrow: "Fee vault",
    title: "Claim creator fees",
    description: "Read and claim your own Creator and Partner entitlements from the FeeVault.",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.7 2.9 8 7 10 4.1-2 7-5.3 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const { state } = useLifecycleState();
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];

  const selectTab = (next: TabId) => {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="app-header">
        <div className="app-container app-header__inner">
          <a className="app-brand" href="#top" aria-label="Ammora Launchpad home">
            <img src="./ammora-logo.png" alt="Ammora" />
          </a>

          <nav className="app-tabs" aria-label="Launchpad navigation">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => selectTab(entry.id)}
                aria-current={tab === entry.id ? "page" : undefined}
                className={tab === entry.id ? "is-active" : undefined}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="app-header__actions">
            <span className="network-pill">
              <i aria-hidden="true" />
              GIWA
              <small>Testnet</small>
            </span>
            <WalletButton />
          </div>
        </div>
      </header>

      <main id="top" className="app-main">
        <div className="app-container">
          <section className="launch-hero" aria-labelledby="launch-hero-title">
            <div className="launch-hero__copy">
              <span className="hero-kicker">Token launchpad · SDK 0.3.9</span>
              <h1 id="launch-hero-title">
                Launch markets.<br />
                <span>Own the flow.</span>
              </h1>
              <p>
                A complete onchain launch path for programmable liquidity — issue, trade,
                graduate and collect fees without surrendering custody to a private key.
              </p>
              <div className="hero-actions">
                <button type="button" className="ui-button ui-button--primary" onClick={() => selectTab("launch")}>
                  Start a launch
                  <ArrowIcon />
                </button>
                <button type="button" className="ui-button ui-button--secondary" onClick={() => selectTab("dashboard")}>
                  View protocol
                </button>
              </div>
              <div className="hero-facts" aria-label="Platform facts">
                <span>Browser wallet</span>
                <span>Confirmed snapshots</span>
                <span>Testnet only</span>
              </div>
            </div>

            <div className="hero-flow-card" aria-label="Launch lifecycle">
              <div className="hero-flow-card__head">
                <div>
                  <span>Launch lifecycle</span>
                  <strong>From idea to canonical pool</strong>
                </div>
                <span className="flow-status"><i /> Live</span>
              </div>
              <ol className="hero-flow-list">
                {TABS.map((entry, index) => (
                  <li key={entry.id} className={tab === entry.id ? "is-active" : undefined}>
                    <button type="button" onClick={() => selectTab(entry.id)}>
                      <i>{String(index + 1).padStart(2, "0")}</i>
                      <span>{entry.label}</span>
                      <ArrowIcon />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="hero-flow-card__foot">
                <ShieldIcon />
                <span>Every write is previewed and signed in your wallet.</span>
              </div>
            </div>
          </section>

          {(state.token || state.curve || state.pool) && (
            <div className="session-strip" aria-label="Current lifecycle session">
              <span className="session-strip__label">Active session</span>
              {state.configId && <span>Config <strong>#{state.configId}</strong></span>}
              {state.token && <span>Token <strong>{shortAddress(state.token)}</strong></span>}
              {state.curve && <span>Curve <strong>{shortAddress(state.curve)}</strong></span>}
              {state.pool && <span>Pool <strong>{shortAddress(state.pool)}</strong></span>}
            </div>
          )}

          <div className="content-layout">
            <section className="content-main" aria-labelledby="page-title">
              <header className="page-heading">
                <div>
                  <span className="page-heading__eyebrow">{activeTab.eyebrow}</span>
                  <h2 id="page-title">{activeTab.title}</h2>
                  <p>{activeTab.description}</p>
                </div>
                <span className="page-heading__step">0{TABS.findIndex((entry) => entry.id === tab) + 1} / 0{TABS.length}</span>
              </header>

              {tab === "dashboard" && <DashboardView />}
              {tab === "launch" && <LaunchView />}
              {tab === "trade" && <TradeView />}
              {tab === "graduate" && <GraduateView />}
              {tab === "fees" && <FeesView />}
            </section>

            <aside className="content-aside" aria-label="Protocol information">
              <section className="aside-card aside-card--accent">
                <span className="aside-card__eyebrow">Network status</span>
                <div className="network-status">
                  <span><i /> GIWA Sepolia</span>
                  <strong>Chain 91342</strong>
                </div>
                <dl className="compact-list">
                  <div><dt>SDK</dt><dd>0.3.9</dd></div>
                  <div><dt>Mode</dt><dd>Testnet beta</dd></div>
                  <div><dt>Audit</dt><dd>Not audited</dd></div>
                </dl>
              </section>

              <section className="aside-card">
                <span className="aside-card__eyebrow">Lifecycle state</span>
                <h3>{state.token ? "Launch in progress" : "Ready to launch"}</h3>
                <p>
                  {state.token
                    ? "Receipt-derived addresses are saved in this browser. Continue with trade, graduation or fees."
                    : "Start from the Launch tab. Addresses are added only after a confirmed transaction receipt."}
                </p>
                <button type="button" className="aside-link" onClick={() => selectTab(state.token ? "trade" : "launch")}>
                  {state.token ? "Open trade" : "Create launch"}
                  <ArrowIcon />
                </button>
              </section>

              <section className="aside-card aside-card--note">
                <ShieldIcon />
                <div>
                  <strong>Built for safe testing</strong>
                  <p>Use a throwaway wallet. Native ETH pays gas; WETH is a separate quote balance.</p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <div className="app-container app-footer__inner">
          <a className="app-brand app-brand--footer" href="#top" aria-label="Ammora home">
            <img src="./ammora-logo.png" alt="Ammora" />
          </a>
          <p>Built on @ammora-protocol/sdk. Receipts are the canonical source of truth.</p>
          <a href="https://docs.ammora.org/" target="_blank" rel="noreferrer">Documentation <ArrowIcon /></a>
        </div>
      </footer>
    </div>
  );
}
