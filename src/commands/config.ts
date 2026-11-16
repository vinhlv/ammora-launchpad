// Step 2 — derive, preview and create the launchpad Config from a reviewed
// template. Config creation needs no per-launchpad approval; the direct caller
// must equal configOwner.
//
//   config preview <recipients.json> <saleSupplyRaw> <quoteThresholdRaw>
//   config create  <recipients.json> <saleSupplyRaw> <quoteThresholdRaw> <reviewHash>
import { readFile } from "node:fs/promises";
import {
  AmmoraV4MigrationMode,
  assertAmmoraV4Config,
  buildCreateAmmoraV4Config,
  buildSingleSegmentCurve,
  concentratedDepositQuote,
  getAmmoraV4ConfigAtBlock,
  parseAmmoraV4ConfigCreatedReceipt,
  verifyAmmoraV4CoreAtBlock,
  type AmmoraV4Config,
  type AmmoraV4ConfigSnapshot,
  type AmmoraV4Segment,
} from "@ammora-protocol/sdk";
import {
  encodeAbiParameters,
  getAddress,
  isAddress,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { printJson, rawAmount } from "../lib/format.js";
import { readBlock, reader, signer, v4Deployment } from "../lib/env.js";
import { sendTransaction } from "../lib/tx.js";
import { saveState } from "../lib/state.js";

export type RecipientPolicy = {
  schemaVersion: 1;
  chainId: number;
  registry: Address;
  templateId: string;
  templateHash: Hex;
  configOwner: Address;
  partnerRecipient: Address;
  liquidityPartner: Address;
  leftoverReceiver: Address;
};

/** Explicit identities for a NEW Config. This never edits an existing Config. */
export const parseRecipientPolicy = (input: unknown): RecipientPolicy => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("recipient policy must be an object");
  }
  const value = input as Record<string, unknown>;
  const fields = [
    "schemaVersion",
    "chainId",
    "registry",
    "templateId",
    "templateHash",
    "configOwner",
    "partnerRecipient",
    "liquidityPartner",
    "leftoverReceiver",
  ];
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !(field in value))
  ) {
    throw new Error(
      `recipient policy requires exactly: ${fields.join(", ")}`,
    );
  }
  if (
    value.schemaVersion !== 1 ||
    !Number.isSafeInteger(value.chainId) ||
    Number(value.chainId) <= 0
  ) {
    throw new Error("unsupported schemaVersion or chainId");
  }
  if (
    typeof value.templateId !== "string" ||
    !/^[1-9]\d*$/.test(value.templateId)
  ) {
    throw new Error("templateId must be a positive integer string");
  }
  if (
    typeof value.templateHash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(value.templateHash)
  ) {
    throw new Error("templateHash must be bytes32");
  }
  const recipient = (field: string): Address => {
    const candidate = value[field];
    if (
      typeof candidate !== "string" ||
      !isAddress(candidate) ||
      candidate.toLowerCase() === zeroAddress
    ) {
      throw new Error(
        `${field} must be a nonzero address (checksummed or all lowercase)`,
      );
    }
    return getAddress(candidate.toLowerCase());
  };
  return {
    schemaVersion: 1,
    chainId: Number(value.chainId),
    registry: recipient("registry"),
    templateId: value.templateId,
    templateHash: value.templateHash as Hex,
    configOwner: recipient("configOwner"),
    partnerRecipient: recipient("partnerRecipient"),
    liquidityPartner: recipient("liquidityPartner"),
    leftoverReceiver: recipient("leftoverReceiver"),
  };
};

/**
 * Derives a complete, registry-valid Config from a reviewed template. A launch
 * Config has dozens of coupled fields; the policy editor only selects
 * recipients, sale supply and threshold, and the rest is derived from the
 * template's reviewed economics.
 */
export const deriveConfigFromTemplate = (
  template: Pick<AmmoraV4ConfigSnapshot, "config">,
  saleSupply: bigint,
  migrationQuoteThreshold: bigint,
): {
  config: AmmoraV4Config;
  curve: readonly AmmoraV4Segment[];
  economics: {
    saleAllocationRaw: bigint;
    grossMigrationBaseRaw: bigint;
    grossMigrationQuoteRaw: bigint;
    migrationQuoteFeeRaw: bigint;
    quoteSurplusToProtocolRaw: bigint;
    lockedBaseRaw: bigint;
    totalSupplyRaw: bigint;
  };
} => {
  if (saleSupply <= 0n || migrationQuoteThreshold <= 0n) {
    throw new RangeError("sale supply and quote threshold must be positive");
  }
  if (template.config.migrationMode !== AmmoraV4MigrationMode.Concentrated) {
    throw new RangeError(
      "this template helper supports concentrated graduation only",
    );
  }
  const curve = buildSingleSegmentCurve(
    template.config.startSqrtPrice,
    saleSupply,
    migrationQuoteThreshold,
  );
  const segment = curve[0];
  if (!segment) {
    throw new Error("single-segment curve construction returned no segment");
  }
  const range = {
    sqrtPriceX64: segment.upperSqrtPrice,
    sqrtMinPriceX64: segment.lowerSqrtPrice,
    sqrtMaxPriceX64: segment.upperSqrtPrice * 2n,
  };
  const quoteFee =
    (migrationQuoteThreshold * BigInt(template.config.migrationQuoteFeeBps)) /
    10_000n;
  const quoteAfterFee = migrationQuoteThreshold - quoteFee;
  const destination = concentratedDepositQuote(range, {
    quoteAmount: quoteAfterFee,
  });
  const vesting = template.config.lockedBaseVesting;
  const lockedBase =
    vesting.cliffUnlockAmount + vesting.amountPerPeriod * BigInt(vesting.numberOfPeriods);
  const config: AmmoraV4Config = {
    ...template.config,
    totalSupply: saleSupply + destination.baseAmount + lockedBase,
    migrationQuoteThreshold,
    migrationBaseThreshold: destination.baseAmount,
    postMigrationSqrtMinPrice: range.sqrtMinPriceX64,
    postMigrationSqrtMaxPrice: range.sqrtMaxPriceX64,
    postMigrationLiquidity: destination.liquidity,
  };
  assertAmmoraV4Config(config, curve);
  return {
    config,
    curve,
    economics: {
      saleAllocationRaw: saleSupply,
      grossMigrationBaseRaw: destination.baseAmount,
      grossMigrationQuoteRaw: destination.quoteAmount,
      migrationQuoteFeeRaw: quoteFee,
      quoteSurplusToProtocolRaw: quoteAfterFee - destination.quoteAmount,
      lockedBaseRaw: lockedBase,
      totalSupplyRaw: config.totalSupply,
    },
  };
};

const planTeamConfig = (
  template: AmmoraV4ConfigSnapshot,
  policy: RecipientPolicy,
  target: { chainId: number; registry: Address },
  saleSupply: bigint,
  quoteThreshold: bigint,
) => {
  if (
    target.chainId !== policy.chainId ||
    target.registry.toLowerCase() !== policy.registry.toLowerCase()
  ) {
    throw new Error(
      "recipient policy chain/registry does not match the selected deployment",
    );
  }
  if (
    template.configId !== BigInt(policy.templateId) ||
    template.configHash.toLowerCase() !== policy.templateHash.toLowerCase()
  ) {
    throw new Error(
      "template identity/hash does not match the reviewed recipient policy",
    );
  }
  if (!template.enabled) throw new Error("template Config is disabled");
  const derived = deriveConfigFromTemplate(template, saleSupply, quoteThreshold);
  const config = {
    ...derived.config,
    partnerRecipient: policy.partnerRecipient,
    leftoverReceiver: policy.leftoverReceiver,
    liquidityDistribution: {
      ...derived.config.liquidityDistribution,
      partner: policy.liquidityPartner,
    },
  };
  assertAmmoraV4Config(config, derived.curve);
  const transaction = {
    to: policy.registry,
    ...buildCreateAmmoraV4Config(config, derived.curve, policy.configOwner),
  };
  // Bind the review to chain, target, value and exact calldata; a changed
  // recipient, supply, threshold, template or owner requires another preview.
  const reviewHash = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [BigInt(policy.chainId), transaction.to, 0n, transaction.data],
    ),
  );
  return {
    ...derived,
    config,
    transaction,
    reviewHash,
    recipients: {
      configOwner: policy.configOwner,
      partnerRecipient: {
        inherited: template.config.partnerRecipient,
        selected: config.partnerRecipient,
      },
      liquidityPartner: {
        inherited: template.config.liquidityDistribution.partner,
        selected: config.liquidityDistribution.partner,
      },
      leftoverReceiver: {
        inherited: template.config.leftoverReceiver,
        selected: config.leftoverReceiver,
      },
      creator:
        "Chosen by the separate token-creation flow; Config owner does not become every token's creator.",
      protocol: "Fixed by the deployment fee policy; this file cannot redirect protocol fees.",
    },
  };
};

export const runConfig = async (args: string[]): Promise<void> => {
  const [mode, path, supplyArg, thresholdArg, expectedReview] = args;
  if (
    !path ||
    !["preview", "create"].includes(mode ?? "") ||
    (mode === "preview" && expectedReview) ||
    (mode === "create" && !expectedReview)
  ) {
    throw new Error(
      "usage: config preview <recipients.json> <saleSupplyRaw> <quoteThresholdRaw> " +
        "OR config create <recipients.json> <saleSupplyRaw> <quoteThresholdRaw> <reviewHash>",
    );
  }
  const policy = parseRecipientPolicy(
    JSON.parse(await readFile(path, "utf8")),
  );
  const saleSupply = rawAmount(supplyArg ?? "", "saleSupplyRaw");
  const threshold = rawAmount(thresholdArg ?? "", "quoteThresholdRaw");

  const client = await reader();
  const launch = v4Deployment().contracts.launch;
  const block = await readBlock(client);
  const core = {
    configRegistry: launch.configRegistry,
    launchFactory: launch.factory,
    graduationAdapter: launch.graduationAdapter,
    feePolicy: launch.feePolicy,
  };
  await verifyAmmoraV4CoreAtBlock(client, core, block.number);
  const template = await getAmmoraV4ConfigAtBlock(
    client,
    launch.configRegistry,
    BigInt(policy.templateId),
    block.number,
  );
  const plan = planTeamConfig(
    template,
    policy,
    { chainId: policy.chainId, registry: launch.configRegistry },
    saleSupply,
    threshold,
  );
  printJson({
    mode,
    blockNumber: block.number,
    blockHash: block.hash,
    ...plan,
    transaction: plan.transaction,
    note:
      "Creates a new immutable Config. All template fee rates, vesting and LP " +
      "ratios are preserved. Review every selected recipient and the complete " +
      "policy. A matching reviewHash is required before loading a signer. " +
      "No token is created by this command.",
  });
  if (mode === "preview") return;

  if (expectedReview.toLowerCase() !== plan.reviewHash.toLowerCase()) {
    throw new Error(
      "reviewHash mismatch: run preview, review its complete Config/recipients, " +
        "then supply that reviewHash to create",
    );
  }
  const { wallet, account } = signer();
  if (account.address.toLowerCase() !== policy.configOwner.toLowerCase()) {
    throw new Error(
      "the signing wallet must equal the policy configOwner: the direct caller must be the Config owner",
    );
  }
  const { hash, blockNumber: receiptBlock } = await sendTransaction(
    client,
    wallet,
    account,
    "create launchpad Config",
    plan.transaction,
  );
  const created = parseAmmoraV4ConfigCreatedReceipt(
    await client.getTransactionReceipt({ hash }),
    launch.configRegistry,
  );
  // Receipt-bound re-read at the creation block; a lagging replica never
  // changes what the receipt itself proved.
  const confirmed = await getAmmoraV4ConfigAtBlock(
    client,
    launch.configRegistry,
    created.configId,
    receiptBlock,
  );
  const actual = buildCreateAmmoraV4Config(
    confirmed.config,
    confirmed.segments,
    policy.configOwner,
  );
  if (
    actual.data !== plan.transaction.data ||
    confirmed.configHash !== created.configHash ||
    confirmed.identity.owner.toLowerCase() !== policy.configOwner.toLowerCase() ||
    confirmed.identity.feeClaimer.toLowerCase() !==
      policy.partnerRecipient.toLowerCase()
  ) {
    throw new Error(
      "receipt-bound team Config does not match the reviewed calldata policy",
    );
  }
  saveState("config", {
    id: created.configId.toString(),
    hash: created.configHash,
    creationHash: hash,
    creationBlock: receiptBlock.toString(),
  });
  printJson({
    hash,
    blockNumber: receiptBlock,
    configId: created.configId,
    configHash: created.configHash,
    recipients: plan.recipients,
  });
  console.log(`\nconfig    #${created.configId} — save it; create-launch reuses this Config across tokens`);
};
