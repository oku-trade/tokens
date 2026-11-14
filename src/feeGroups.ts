import * as path from "path";
import { S3 } from "@aws-sdk/client-s3";
import * as fs from "fs/promises";
import { z } from "zod";
import { actuallyStrictIsAddress } from "./isAddress";
import { UploadManifest } from "./uploadManifest";

// A fee group lists assets that are economically interchangeable (USD
// stablecoins, ETH and its wrappers, ...). Swaps between two assets of the same
// group get the like-kind fee. The account service syncs the published file
// into its fee_like_kind_assets table.

const GROUP_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EVM_CHAIN = /^eip155:[1-9]\d*$/;
const SOLANA_CHAIN = /^solana:[1-9A-HJ-NP-Za-km-z]{32}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const FeeGroupAsset = z
  .object({
    chain: z.string().refine((c) => EVM_CHAIN.test(c) || SOLANA_CHAIN.test(c), {
      message: "chain must be a CAIP-2 id like eip155:1 or solana:<genesis>",
    }),
    address: z.string(),
    symbol: z.string().min(1),
    source: z.string().min(1),
  })
  .strict()
  .superRefine((asset, ctx) => {
    const ok = asset.chain.startsWith("eip155:")
      ? actuallyStrictIsAddress(asset.address)
      : SOLANA_ADDRESS.test(asset.address);
    if (!ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["address"],
        message: asset.chain.startsWith("eip155:")
          ? "EVM address must be checksummed (https://ethsum.netlify.app/)"
          : "Solana address must be base58",
      });
    }
  });

export type FeeGroupAsset = z.infer<typeof FeeGroupAsset>;

export const FeeGroupFile = z.array(FeeGroupAsset).min(1);

export interface FeeGroupList {
  name: string;
  timestamp: string;
  groups: Record<string, FeeGroupAsset[]>;
}

// assetKey identifies an asset across groups. EVM addresses are case-insensitive.
function assetKey(asset: FeeGroupAsset): string {
  const address = asset.chain.startsWith("eip155:") ? asset.address.toLowerCase() : asset.address;
  return `${asset.chain}/${address}`;
}

function compareAssets(a: FeeGroupAsset, b: FeeGroupAsset): number {
  return (
    a.chain.localeCompare(b.chain, "en", { numeric: true }) ||
    a.symbol.localeCompare(b.symbol) ||
    a.address.localeCompare(b.address)
  );
}

// loadFeeGroups reads and validates every <group>.json in directory. An asset
// may belong to only one group, because the fee policy treats any two assets in
// the same group as interchangeable.
export async function loadFeeGroups(directory: string): Promise<Record<string, FeeGroupAsset[]>> {
  const groups: Record<string, FeeGroupAsset[]> = {};
  const owners = new Map<string, string>();

  for (const file of (await fs.readdir(directory)).sort()) {
    const filePath = path.join(directory, file);
    if (path.extname(file) !== ".json") {
      throw new Error(`${filePath}: fee group files must be <group>.json`);
    }
    const group = path.basename(file, ".json");
    if (!GROUP_NAME.test(group)) {
      throw new Error(`${filePath}: group name must be lowercase kebab-case`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(filePath, "utf-8"));
    } catch (err) {
      throw new Error(`${filePath}: invalid JSON`, { cause: err });
    }
    const result = FeeGroupFile.safeParse(parsed);
    if (!result.success) {
      throw new Error(`${filePath} is invalid: ${JSON.stringify(result.error.errors, null, 2)}`);
    }

    for (const asset of result.data) {
      const key = assetKey(asset);
      const owner = owners.get(key);
      if (owner === group) {
        throw new Error(`${filePath}: duplicate asset ${key}`);
      }
      if (owner !== undefined) {
        throw new Error(`${filePath}: asset ${key} is already in group "${owner}". An asset can be in only one group.`);
      }
      owners.set(key, group);
    }
    groups[group] = [...result.data].sort(compareAssets);
  }
  return groups;
}

const s3Client = new S3({
  forcePathStyle: true,
  endpoint: "https://6f19dc20133dce480cc5b278c8964331.r2.cloudflarestorage.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.CF_KEY!,
    secretAccessKey: process.env.CF_SECRET!,
  },
});

// generateFeeGroupList writes feegroups.json and uploads it to the CDN when it changed.
export async function generateFeeGroupList(directory: string, outputFile: string) {
  const manifest = await UploadManifest.load();
  const groups = await loadFeeGroups(directory);

  let timestamp = new Date().toISOString();
  try {
    const previous: FeeGroupList = JSON.parse(await fs.readFile(outputFile, "utf-8"));
    // Keep the timestamp when nothing changed so CI does not commit a no-op.
    if (JSON.stringify(previous.groups) === JSON.stringify(groups)) {
      timestamp = previous.timestamp;
    }
  } catch {
    // First run.
  }

  const list: FeeGroupList = { name: "Oku Fee Groups", timestamp, groups };
  const body = JSON.stringify(list, null, 2);
  await fs.writeFile(outputFile, `${body}\n`, "utf-8");
  await manifest.upload("feegroups.json", Buffer.from(JSON.stringify(groups)), "json-v1", () =>
    s3Client.putObject({
      Bucket: "oku-cdn",
      Key: "feegroups.json",
      Body: body,
      ContentType: "application/json",
      ACL: "public-read",
    }),
  );
  await manifest.save();
  console.log(`Fee group list successfully written to ${outputFile}`);
}

if (require.main === module) {
  generateFeeGroupList("./feegroups", "./feegroups.json").catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
