import * as path from "path";
import { S3 } from "@aws-sdk/client-s3";
import * as fs from "fs/promises";
import { z } from "zod";
import { actuallyStrictIsAddress } from "./isAddress";
import { UploadManifest } from "./uploadManifest";

// Fee groups list assets on one chain that are versions of the same underlying
// asset: a chain's native token with its wrapped and staked forms, USD
// stablecoins, ETH and its wrappers, and so on. A swap between two assets in
// the same group on the same chain is charged the like-kind fee.
//
// Layout: feegroups/<caip2 namespace>/<caip2 reference>/<group>.json
// e.g. feegroups/eip155/1/usd.json or feegroups/solana/<genesis>/usd.json.
// Swaps are single chain, so groups are scoped to their chain directory.

const GROUP_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

interface Namespace {
  reference: RegExp;
  validAddress: (address: string) => boolean;
  addressHint: string;
  // Key used to detect the same asset listed twice.
  addressKey: (address: string) => string;
}

const NAMESPACES: Record<string, Namespace> = {
  eip155: {
    reference: /^[1-9]\d*$/,
    validAddress: actuallyStrictIsAddress,
    addressHint: "EVM addresses must be checksummed (https://ethsum.netlify.app/)",
    addressKey: (address) => address.toLowerCase(),
  },
  solana: {
    reference: /^[1-9A-HJ-NP-Za-km-z]{32}$/,
    validAddress: (address) => BASE58.test(address) && address.length >= 32 && address.length <= 44,
    addressHint: "Solana addresses must be base58",
    addressKey: (address) => address,
  },
};

export const FeeGroupAsset = z
  .object({
    address: z.string(),
    symbol: z.string().min(1),
    source: z.string().min(1),
  })
  .strict();

export type FeeGroupAsset = z.infer<typeof FeeGroupAsset>;

export const FeeGroupFile = z.array(FeeGroupAsset).min(1);

// FeeGroups maps a CAIP-2 chain id to its groups, each a list of assets.
export type FeeGroups = Record<string, Record<string, FeeGroupAsset[]>>;

export interface FeeGroupList {
  name: string;
  timestamp: string;
  chains: FeeGroups;
}

async function readDirectories(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      throw new Error(`${path.join(directory, entry.name)}: expected a directory`);
    }
  }
  return entries.map((entry) => entry.name).sort();
}

function compareAssets(a: FeeGroupAsset, b: FeeGroupAsset): number {
  return a.symbol.localeCompare(b.symbol) || a.address.localeCompare(b.address);
}

// loadChainGroups validates every <group>.json in one chain directory. An asset
// may belong to only one group on its chain.
async function loadChainGroups(directory: string, namespace: Namespace): Promise<Record<string, FeeGroupAsset[]>> {
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
      if (!namespace.validAddress(asset.address)) {
        throw new Error(`${filePath}: invalid address ${asset.address}. ${namespace.addressHint}`);
      }
      const key = namespace.addressKey(asset.address);
      const owner = owners.get(key);
      if (owner === group) {
        throw new Error(`${filePath}: duplicate asset ${asset.address}`);
      }
      if (owner !== undefined) {
        throw new Error(
          `${filePath}: asset ${asset.address} is already in group "${owner}". An asset can be in only one group per chain.`,
        );
      }
      owners.set(key, group);
    }
    groups[group] = [...result.data].sort(compareAssets);
  }

  if (Object.keys(groups).length === 0) {
    throw new Error(`${directory}: chain directory has no fee group files`);
  }
  return groups;
}

// loadFeeGroups reads and validates feegroups/<namespace>/<reference>/<group>.json.
export async function loadFeeGroups(directory: string): Promise<FeeGroups> {
  const chains: FeeGroups = {};
  for (const namespaceName of await readDirectories(directory)) {
    const namespace = NAMESPACES[namespaceName];
    if (!namespace) {
      throw new Error(
        `${path.join(directory, namespaceName)}: unsupported CAIP-2 namespace (expected one of ${Object.keys(NAMESPACES).join(", ")})`,
      );
    }
    const namespaceDirectory = path.join(directory, namespaceName);
    for (const reference of await readDirectories(namespaceDirectory)) {
      const chainDirectory = path.join(namespaceDirectory, reference);
      if (!namespace.reference.test(reference)) {
        throw new Error(`${chainDirectory}: invalid ${namespaceName} chain reference`);
      }
      chains[`${namespaceName}:${reference}`] = await loadChainGroups(chainDirectory, namespace);
    }
  }
  return chains;
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
  const chains = await loadFeeGroups(directory);

  let timestamp = new Date().toISOString();
  try {
    const previous: FeeGroupList = JSON.parse(await fs.readFile(outputFile, "utf-8"));
    // Keep the timestamp when nothing changed so CI does not commit a no-op.
    if (JSON.stringify(previous.chains) === JSON.stringify(chains)) {
      timestamp = previous.timestamp;
    }
  } catch {
    // First run.
  }

  const list: FeeGroupList = { name: "Oku Fee Groups", timestamp, chains };
  const body = JSON.stringify(list, null, 2);
  await fs.writeFile(outputFile, `${body}\n`, "utf-8");
  await manifest.upload("feegroups.json", Buffer.from(JSON.stringify(chains)), "json-v1", () =>
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
