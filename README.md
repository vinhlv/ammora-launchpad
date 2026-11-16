# Ammora Launchpad

A complete token launchpad CLI built on [`@ammora-protocol/sdk@0.3.9`](https://www.npmjs.com/package/@ammora-protocol/sdk), running on the **GIWA Sepolia testnet** (chain 91342). The project implements the shared path from the [LAUNCHPAD guide](https://github.com/AmmoraLabs/ammora-examples/blob/main/LAUNCHPAD.md):

```text
Launchpad creates a Config (reused across many tokens)
           ↓
Creator issues a token → new token + ALC curve (pre-graduation)
           ↓
Buy / sell on the ALC curve
           ↓
Final buy (terminal boundary) → ReadyToMigrate
           ↓  (migration is a separate, permissionless transaction)
Post-graduation ARL pool + Config-defined LP positions
           ↓
Trade on the ARL pool / claim Creator & Partner FeeVault fees
```

> **Warning:** this is beta testnet software. It has no independent audit; do not use real funds.

---

## Requirements

- **Node.js 22+**
- A GIWA Sepolia RPC (the SDK catalog's public endpoint is used by default; override with `AMMORA_RPC_URL`)
- A testnet wallet funded with **ETH (gas)** and **WETH (the quote token for buys)** — the two balances are separate
- No key is needed for any read/preview command. Only transaction-sending commands require `AMMORA_PRIVATE_KEY`

### Use a clean test wallet

Generate a fresh throwaway key locally (printed once, never stored or committed):

```bash
npm run new-wallet
```

Keep real wallets out of this project entirely: put the test key only in your
local `.env` (CLI) or import it into a fresh MetaMask profile (web UI), and
fund it from the GIWA Sepolia faucet.

## Installation

```bash
npm install
npm run typecheck
cp .env.example .env    # configure as described below
```

## Web UI (browser wallet) 🖥️

The repository also ships a full web app with browser-wallet signing (MetaMask):

```bash
cd web
npm install
npm run dev          # http://localhost:5183
```

| Tab | What it does |
| --- | --- |
| **Dashboard** | Deployment health (V4 Core verified at a confirmed snapshot), indexed launches via the Data API, local lifecycle state |
| **Launch** | Issue a new token + ALC curve on an existing Config, signed by your wallet |
| **Trade** | Buy/sell on the ALC curve — confirmed-snapshot quotes, strict fills, exact approvals |
| **Graduate** | Final boundary buy → separate permissionless migration → trade the canonical pool |
| **Fees** | Read claimable Creator/Partner fees and claim your own entitlement |

Signing happens entirely inside the browser wallet extension; reads follow the
same reviewed confirmed-snapshot policy as the CLI. A private key never leaves
the wallet. Production build: `npm run build` (static output in `web/dist/`).

## `.env` configuration

| Variable | Meaning |
| --- | --- |
| `AMMORA_CHAIN_ID` | `91342` (GIWA Sepolia) |
| `AMMORA_GIWA_GENERATION` | `auto-route` (the reviewed generation; **never mix** with `legacy`) |
| `AMMORA_RPC_URL` | RPC override (optional) |
| `AMMORA_RPC_INTERVAL_MS` | Delay between JSON-RPC calls (default 600 ms) |
| `AMMORA_SEND` | Send gate: must be `1` before any command signs or submits |
| `AMMORA_READ_RECEIPT` | A transaction hash: binds dependent reads to that receipt's canonical block (use right after a creation) |
| `AMMORA_ACCOUNT` | Caller address for unsigned previews and read commands |
| `AMMORA_PRIVATE_KEY` | Signing key for send commands — **never commit** |
| `AMMORA_SLIPPAGE_BPS` | Slippage for ALC trades (100 = 1%, max 1000) |
| `AMMORA_STATE_FILE` | Lifecycle state file (default `.ammora-launchpad-state.json`) |

## Lifecycle walkthrough

All examples use the `./lp.sh` helper (equivalent to `npm run lp -- <command>`).

### 1. Verify connection and deployment (read-only)

```bash
./lp.sh verify
```

Verifies the V4 Core (Registry, Factory, GraduationAdapter, FeePolicy) at a confirmed snapshot and prints the template Config #6 summary.

### 2. Create the launchpad Config

Copy `recipients.example.json` and replace the four role addresses:

```bash
./lp.sh config preview recipients.json 1000000000000000 1000000000000000
# Review the complete Config + recipients + the printed reviewHash
AMMORA_SEND=1 ./lp.sh config create recipients.json 1000000000000000 1000000000000000 <reviewHash>
```

- `saleSupplyRaw` / `quoteThresholdRaw` are **raw-unit integers** (base with 9 decimals: 1,000,000 tokens = `1000000000000000`; WETH with 18 decimals: 0.001 WETH = `1000000000000000`)
- `create` requires the exact `reviewHash` printed by the preview — the hash binds chain, Registry, amounts, calldata and recipients
- The signing wallet must equal `configOwner`
- ConfigID/hash/token/curve always come **from receipts**, never from predictions

### 3. Issue a token (reuse the Config)

```bash
AMMORA_SEND=1 ./lp.sh create-launch <configId> "Launchpad Token" "LPT" "https://example.com/metadata.json"
```

Creates a token + ALC curve in one transaction. The new token reads `poolCreationFee` from the Config. Keep the `configId` to reuse across tokens — a new Config is not required per token.

### 4. Quote the ALC curve (read-only)

```bash
./lp.sh quote                       # curve state
./lp.sh quote buy 1000000000000     # quote in raw units
./lp.sh quote sell 500000000
```

Fill classification: `full` (ordinary trade), `graduation-boundary` (final buy); partial sells / dust → **stop**, never display as executable success.

### 5. Fund WETH and trade on the ALC curve

```bash
AMMORA_SEND=1 ./lp.sh fund 0.5              # wrap ETH → WETH (wrap only what is needed)
AMMORA_SEND=1 ./lp.sh swap buy 0.01         # WETH → token (human decimal amount)
AMMORA_SEND=1 ./lp.sh swap sell 100         # token → WETH
```

### 6. Graduation — final buy and migration are two separate transactions

```bash
# Final buy to the terminal boundary + migration (double confirmation):
AMMORA_GRADUATION_CONFIRM=1 AMMORA_SEND=1 ./lp.sh graduate 100000000000000

# If already ReadyToMigrate (status=2) — resume with migration only:
./lp.sh migrate                    # unsigned preview
AMMORA_SEND=1 ./lp.sh migrate
```

- The final-buy input is a **maximum**; the curve consumes only the fillable remainder and the unused input **stays in the wallet** (it is not a refund)
- `amountLeft` is unused input — do not count it as a payout
- Migration runs only after a confirmed snapshot includes the final-fill receipt; **never repeat** a successful final buy

### 7. Verify the post-graduation pool

```bash
./lp.sh pool
AMMORA_SEND=1 ./lp.sh swap-pool <tokenIn> 0.01 [concentrated|compounding|almm|dbc] [pool]
```

After graduation, trades target the **canonical pool**, no longer the curve. Keep every LP NFT (Creator, Partner, rounding dust) for fee claims.

### 8. Creator/Partner fees

```bash
./lp.sh fees <owner>                    # read claimable for both quote token + launch token
AMMORA_SEND=1 ./lp.sh claim <feeToken> [payout]
```

- Creator and Partner each **sign for their own entitlement** in the same FeeVault; `payout` only changes the destination, never the beneficiary
- Zero claimable sends no transaction (a no-op is not a successful payment)
- Quote claims do not claim token fees — claim each asset separately

### 9. Discovery via the Data API (optional)

```bash
./lp.sh discover                # indexed launches for chain 91342
./lp.sh discover <token>
```

Launches and pools are dynamic data — the Data API indexes events from Ammora-reviewed factories, so every SDK consumer sees the same typed result. (Override the endpoint with `AMMORA_DATA_API_URL`.)

### 10. Lifecycle state

```bash
./lp.sh state   # prints .ammora-launchpad-state.json
```

Each step saves its receipt-derived addresses to the state file so later steps can find them automatically.

---

## Safety boundaries implemented

| Mechanism | Description |
| --- | --- |
| Send gate | Signing commands require `AMMORA_SEND=1`; everything else runs keyless |
| reviewHash binding | Config create must match the preview's hash (chain, calldata, recipients) |
| Canonical receipts | Token/curve/ConfigID/pool come from receipts, never from lag-prone latest reads |
| Reviewed snapshots | State is read at a confirmed block (`resolveAmmoraFinalizedHead`) or a receipt's block |
| Curve authentication | A curve must be bound to the reviewed Factory + FeePolicy version at the same block |
| Strict fills | Ordinary orders must fill `full`; only the final buy may reach `graduation-boundary` |
| Core verification | `verifyAmmoraV4CoreAtBlock` before every launch-path operation |
| Own-beneficiary claim | `buildClaimFeeVaultFor` preserves `claimFor` semantics |

## Project layout

```text
src/
├── index.ts              CLI dispatcher + help
├── lib/
│   ├── env.ts            Deployment catalog, clients, reviewed snapshots, signer
│   ├── tx.ts             Transaction submission, confirmed receipts, approvals
│   ├── curve.ts          Curve authentication, quotes, explicit-block planning
│   ├── state.ts          Lifecycle state file
│   └── format.ts         Raw/human formatting, bigint-safe JSON
└── commands/
    ├── verify.ts         Step 1 — connection + Core + template
    ├── config.ts         Step 2 — Config preview/create from a template
    ├── create-launch.ts  Step 3 — token issuance + ALC
    ├── quote.ts          Step 4 — state + quotes
    ├── fund.ts           Wrap ETH → WETH
    ├── swap.ts           Step 5 — ALC trading
    ├── graduate.ts       Step 6 — final fill + migration
    ├── migrate.ts        Step 6b — migration only (resume)
    ├── pool.ts           Step 7 — canonical pool
    ├── swap-pool.ts      Step 7 — ARL trading (SDK swap client)
    ├── fees.ts           Step 8 — read claimable
    ├── claim.ts          Step 8 — claim fees
    ├── discover.ts       Data API discovery
    └── state.ts          Print the state file
```

## SDK surfaces used

- Deployment: `giwaSepoliaAutoRouteDeployment`, `resolveAmmoraFinalizedHead`, `createAmmoraDeploymentSource`
- Launch V4: `getAmmoraV4ConfigAtBlock`, `buildCreateAmmoraV4Config`, `buildCreateAmmoraV4Launch`, `parseAmmoraV4ConfigCreatedReceipt`, `parseAmmoraV4LaunchCreatedReceipt`, `parseAmmoraV4SwapReceipt`, `parseAmmoraV4MigratedReceipt`, `verifyAmmoraV4CoreAtBlock`
- Curve: `AmmoraV4LaunchCurveClient` (`getStateAtBlock`, `quoteExactInputAtBlock`, `planMigrateAtBlock`), `classifyAmmoraV4ExactInputFill`
- Swaps: `AmmoraSwapClient` / `prepareExactIn` / `execute` for post-graduation pools
- Fees: `feeVaultAbi` (`claimable`), `buildClaimFeeVaultFor`
- Discovery: `AmmoraDataApiClient`

## References

- [npm: @ammora-protocol/sdk](https://www.npmjs.com/package/@ammora-protocol/sdk)
- [LAUNCHPAD.md — the shared launchpad path](https://github.com/AmmoraLabs/ammora-examples/blob/main/LAUNCHPAD.md)
- [ammora-examples repository](https://github.com/AmmoraLabs/ammora-examples)
- [docs.ammora.org](https://docs.ammora.org/)

## License

MIT
