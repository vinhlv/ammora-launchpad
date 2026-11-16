# Ammora Launchpad

Token launchpad CLI hoàn chỉnh xây trên [`@ammora-protocol/sdk@0.3.9`](https://www.npmjs.com/package/@ammora-protocol/sdk), chạy trên **GIWA Sepolia testnet** (chain 91342). Dự án hiện thực hóa đúng shared path trong [LAUNCHPAD guide](https://github.com/AmmoraLabs/ammora-examples/blob/main/LAUNCHPAD.md):

```text
Launchpad tạo Config (dùng lại cho nhiều token)
           ↓
Creator phát hành token → token mới + ALC curve (pre-graduation)
           ↓
Mua / bán trên ALC
           ↓
Final buy (terminal boundary) → ReadyToMigrate
           ↓  (migration là transaction riêng, permissionless)
ARL pool sau graduation + LP positions theo Config
           ↓
Giao dịch trên ARL / claim Creator & Partner FeeVault fees
```

> **Cảnh báo:** đây là phần mềm beta testnet. Chưa có audit độc lập; không dùng tiền thật.

---

## Yêu cầu

- **Node.js 22+**
- RPC GIWA Sepolia (mặc định dùng public RPC trong catalog của SDK, có thể override bằng `AMMORA_RPC_URL`)
- Ví testnet với: **ETH (gas)** và **WETH (quote token cho giao dịch mua)** — hai số dư này tách biệt
- Không cần key cho mọi lệnh đọc/preview. Chỉ lệnh gửi transaction mới cần `AMMORA_PRIVATE_KEY`

## Cài đặt

```bash
npm install
npm run typecheck
cp .env.example .env    # cấu hình theo hướng dẫn bên dưới
```

## Cấu hình `.env`

| Biến | Ý nghĩa |
| --- | --- |
| `AMMORA_CHAIN_ID` | `91342` (GIWA Sepolia) |
| `AMMORA_GIWA_GENERATION` | `auto-route` (generation đã review; **không trộn lẫn** với `legacy`) |
| `AMMORA_RPC_URL` | Override RPC (tùy chọn) |
| `AMMORA_RPC_INTERVAL_MS` | Giãn cách gọi JSON-RPC (mặc định 600ms) |
| `AMMORA_SEND` | Cổng gửi: phải là `1` mới ký/gửi transaction |
| `AMMORA_READ_RECEIPT` | Hash transaction: gán các lần đọc phụ thuộc vào block của receipt đó (dùng ngay sau khi tạo) |
| `AMMORA_ACCOUNT` | Địa chỉ caller cho preview unsigned và lệnh đọc |
| `AMMORA_PRIVATE_KEY` | Key ký cho lệnh send — **không bao giờ commit** |
| `AMMORA_SLIPPAGE_BPS` | Slippage cho giao dịch ALC (100 = 1%, tối đa 1000) |
| `AMMORA_STATE_FILE` | File trạng thái lifecycle (mặc định `.ammora-launchpad-state.json`) |

## Quy trình lifecycle

Trình helper: `./lp.sh <lệnh>` (tương đương `npm run lp -- <lệnh>`).

### 1. Kiểm tra kết nối và deployment (read-only)

```bash
./lp.sh verify
```

Xác minh V4 Core (Registry, Factory, GraduationAdapter, FeePolicy) tại snapshot đã confirm, và in tóm tắt template Config #6.

### 2. Tạo launchpad Config

Sao chép `recipients.example.json` và thay 4 địa chỉ vai trò của bạn:

```bash
./lp.sh config preview recipients.json 1000000000000000 1000000000000000
# Review toàn bộ Config + recipients + reviewHash in ra
AMMORA_SEND=1 ./lp.sh config create recipients.json 1000000000000000 1000000000000000 <reviewHash>
```

- `saleSupplyRaw` / `quoteThresholdRaw` là **số nguyên raw units** (base 9 decimals: 1.000.000 token = `1000000000000000`; WETH 18 decimals: 0.001 WETH = `1000000000000000`)
- `create` yêu cầu đúng `reviewHash` từ preview — hash này bind chain, Registry, amounts, calldata và recipients
- Ví ký phải trùng `configOwner`
- ConfigID/hash/token/curve **luôn lấy từ receipt**, không bao giờ từ prediction

### 3. Phát hành token (dùng lại Config)

```bash
AMMORA_SEND=1 ./lp.sh create-launch <configId> "Launchpad Token" "LPT" "https://example.com/metadata.json"
```

Tạo token + ALC curve trong 1 transaction. Token mới đọc `poolCreationFee` từ Config. Lưu `configId` để tái sử dụng cho các token sau — mỗi token không cần Config mới.

### 4. Quote trên ALC (read-only)

```bash
./lp.sh quote                       # trạng thái curve
./lp.sh quote buy 1000000000000     # quote raw units
./lp.sh quote sell 500000000
```

Phân loại fill: `full` (giao dịch thường), `graduation-boundary` (final buy), partial sell / dust → **dừng**, không hiển thị như thành công.

### 5. Fund WETH và giao dịch trên ALC

```bash
AMMORA_SEND=1 ./lp.sh fund 0.5              # wrap ETH → WETH (chỉ wrap số cần thiết)
AMMORA_SEND=1 ./lp.sh swap buy 0.01         # WETH → token (số thập phân hệ thập phân)
AMMORA_SEND=1 ./lp.sh swap sell 100         # token → WETH
```

### 6. Graduation — final buy và migration là 2 transaction riêng

```bash
# Final buy đến terminal boundary + migration (xác nhận kép):
AMMORA_GRADUATION_CONFIRM=1 AMMORA_SEND=1 ./lp.sh graduate 100000000000000

# Nếu đã ở ReadyToMigrate (status=2) — resume migration only:
./lp.sh migrate                    # unsigned preview
AMMORA_SEND=1 ./lp.sh migrate
```

- Input của final buy là **tối đa**, curve chỉ tiêu phần consumable; phần thừa **ở lại ví** (không phải refund)
- Curve chỉ tiêu `consumed`; `amountLeft` là unused input — đừng tính vào payout
- Migration chỉ chạy khi snapshot đã confirm chứa receipt của final fill; **không bao giờ lặp lại** final buy thành công

### 7. Xác minh pool sau graduation

```bash
./lp.sh pool
AMMORA_SEND=1 ./lp.sh swap-pool <tokenIn> 0.01 [concentrated|compounding|almm|dbc] [pool]
```

Sau graduation, giao dịch nhắm vào **canonical pool**, không còn là curve. Giữ mọi LP NFT (Creator, Partner, rounding dust) để claim phí.

### 8. Phí Creator/Partner

```bash
./lp.sh fees <owner>                    # xem claimable cho cả quote token + launch token
AMMORA_SEND=1 ./lp.sh claim <feeToken> [payout]
```

- Creator và Partner **tự ký claim quyền của mình** trong cùng FeeVault; `payout` chỉ đổi đích nhận, không đổi beneficiary
- Zero claimable → không gửi transaction (no-op không phải payment thành công)
- Quote claims không tự claim token fees — claim từng asset riêng

### 9. Discovery qua Data API (tùy chọn)

```bash
./lp.sh discover                # các launch đã index cho chain 91342
./lp.sh discover <token>
```

Launches/pools là dữ liệu động — Data API index event từ factory đã review, mọi SDK consumer thấy cùng kết quả typed. (Có thể đổi endpoint qua `AMMORA_DATA_API_URL`.)

### 10. Trạng thái lifecycle

```bash
./lp.sh state   # in .ammora-launchpad-state.json
```

Các bước tự lưu receipt-derived addresses vào state file để bước sau tự động tìm thấy.

---

## Ranh giới an toàn đã hiện thực hóa

| Cơ chế | Mô tả |
| --- | --- |
| Send gate | Lệnh ký yêu cầu `AMMORA_SEND=1`; mọi lệnh còn lại chạy keyless |
| reviewHash binding | Config create phải khớp hash của preview (chain, calldata, recipients) |
| Receipt canonical | Token/curve/ConfigID/pool lấy từ receipt, không từ read-latest có thể lag |
| Reviewed snapshot | Đọc state tại block đã confirm (`resolveAmmoraFinalizedHead`) hoặc block của receipt |
| Curve authentication | Curve phải bind đúng Factory + FeePolicy version tại cùng block |
| Strict fills | Lệnh thường phải `full`; chỉ final buy mới được `graduation-boundary` |
| Core verification | `verifyAmmoraV4CoreAtBlock` trước mọi thao tác launch |
| Own-beneficiary claim | `buildClaimFeeVaultFor` giữ nguyên semantics `claimFor` |

## Cấu trúc thư mục

```text
src/
├── index.ts              CLI dispatcher + help
├── lib/
│   ├── env.ts            Deployment catalog, client, reviewed snapshot, signer
│   ├── tx.ts             Gửi transaction, receipt confirmations, approvals
│   ├── curve.ts          Curve authentication, quotes, explicit-block planning
│   ├── state.ts          State file lifecycle
│   └── format.ts         Định dạng raw/human, JSON bigint-safe
└── commands/
    ├── verify.ts         Bước 1 — kết nối + Core + template
    ├── config.ts         Bước 2 — Config preview/create từ template
    ├── create-launch.ts  Bước 3 — phát hành token + ALC
    ├── quote.ts          Bước 4 — state + quote
    ├── fund.ts           Wrap ETH → WETH
    ├── swap.ts           Bước 5 — giao dịch ALC
    ├── graduate.ts       Bước 6 — final fill + migration
    ├── migrate.ts        Bước 6b — migration only (resume)
    ├── pool.ts           Bước 7 — canonical pool
    ├── swap-pool.ts      Bước 7 — giao dịch ARL (SDK swap client)
    ├── fees.ts           Bước 8 — đọc claimable
    ├── claim.ts          Bước 8 — claim phí
    ├── discover.ts       Data API discovery
    └── state.ts          In state file
```

## SDK surfaces sử dụng

- Deployment: `giwaSepoliaAutoRouteDeployment`, `resolveAmmoraFinalizedHead`, `createAmmoraDeploymentSource`
- Launch V4: `getAmmoraV4ConfigAtBlock`, `buildCreateAmmoraV4Config`, `buildCreateAmmoraV4Launch`, `parseAmmoraV4ConfigCreatedReceipt`, `parseAmmoraV4LaunchCreatedReceipt`, `parseAmmoraV4SwapReceipt`, `parseAmmoraV4MigratedReceipt`, `verifyAmmoraV4CoreAtBlock`
- Curve: `AmmoraV4LaunchCurveClient` (`getStateAtBlock`, `quoteExactInputAtBlock`, `planMigrateAtBlock`), `classifyAmmoraV4ExactInputFill`
- Swap: `AmmoraSwapClient` / `prepareExactIn` / `execute` cho pool sau graduation
- Fees: `feeVaultAbi` (`claimable`), `buildClaimFeeVaultFor`
- Discovery: `AmmoraDataApiClient`

## Tài liệu tham khảo

- [npm: @ammora-protocol/sdk](https://www.npmjs.com/package/@ammora-protocol/sdk)
- [LAUNCHPAD.md — shared launchpad path](https://github.com/AmmoraLabs/ammora-examples/blob/main/LAUNCHPAD.md)
- [ammora-examples repository](https://github.com/AmmoraLabs/ammora-examples)
- [docs.ammora.org](https://docs.ammora.org/)

## License

MIT
