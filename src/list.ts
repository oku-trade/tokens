import * as path from "path";
import { S3 } from "@aws-sdk/client-s3";
import * as fs from "fs/promises";
import sharp from "sharp";

const GITHUB_RAW_BASE_URL = "https://raw.githubusercontent.com/oku-trade/tokens/main";

interface Token {
  chainId: number;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  website?: string;
  description?: string;
  explorer?: string;
  logoURI?: string;
}

interface TokenList {
  name: string;
  timestamp: string;
  version: {
    major: number;
    minor: number;
    patch: number;
  };
  tokens: Token[];
}

// Initialize R2 (Cloudflare) S3 client.
const s3Client = new S3({
  forcePathStyle: true,
  endpoint: "https://6f19dc20133dce480cc5b278c8964331.r2.cloudflarestorage.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.CF_KEY!,
    secretAccessKey: process.env.CF_SECRET!,
  },
});

// Helper to upload and process a logo image.
async function uploadLogoToR2(logoPath: string, chainId: number, tokenAddress: string): Promise<string> {
  console.log(`Uploading logo for ${chainId}/${tokenAddress}`);
  const imageBuffer = await fs.readFile(logoPath);
  const processedBuffer = await sharp(imageBuffer).resize(64, 64, { withoutEnlargement: true }).png().toBuffer();
  const key = `logos/${chainId}/${tokenAddress.toLowerCase()}.png`;
  try {
    await s3Client.putObject({
      Bucket: "oku-cdn",
      Key: key,
      Body: processedBuffer,
      ContentType: "image/png",
      ACL: "public-read",
    });
    console.log(`Uploaded logo for ${chainId}/${tokenAddress}`);
    // Return the CDN URL.
    return `https://cdn.oku.trade/${key}`;
  } catch (e) {
    console.error(e);
    return "";
  }
}

async function generateTokenList(baseDirectory: string, outputFile: string) {
  const tokens: Token[] = [];
  const chainFolders = await fs.readdir(baseDirectory);

  for (const chainFolder of chainFolders) {
    const chainId = Number(chainFolder);
    const chainFolderPath = path.join(baseDirectory, chainFolder);
    const tokenFolders = await fs.readdir(chainFolderPath);
    for (const tokenFolder of tokenFolders) {
      const tokenFolderPath = path.join(chainFolderPath, tokenFolder);
      const infoFilePath = path.join(tokenFolderPath, "info.json");
      try {
        const fileContent = await fs.readFile(infoFilePath, "utf-8");
        const tokenData: Token = JSON.parse(fileContent);
        tokenData.chainId = chainId;

        const logoFilePath = path.join(tokenFolderPath, "logo.png");
        try {
          await fs.access(logoFilePath);
          tokenData.logoURI = await uploadLogoToR2(logoFilePath, chainId, tokenFolder);
        } catch {
          // Fallback: use the GitHub raw URL if no logo.png is found.
          tokenData.logoURI = `${GITHUB_RAW_BASE_URL}/chains/${chainFolder}/${tokenFolder}/logo.png`;
        }
        tokens.push(tokenData);
      } catch (err) {
        console.error(`Error reading ${infoFilePath}:`, err);
      }
    }
  }

  let oldTokenList: TokenList | null = null;
  try {
    const existing = await fs.readFile(outputFile, "utf-8");
    oldTokenList = JSON.parse(existing);
  } catch {
    // File doesn't exist; start with default version.
  }

  let oldVersion = { major: 0, minor: 0, patch: 0 };
  let oldTokens: Token[] = [];
  if (oldTokenList) {
    oldVersion = oldTokenList.version;
    oldTokens = oldTokenList.tokens || [];
  }

  // Compute version increments based on changes.
  const oldTokenMap = new Map<string, Token>();
  for (const t of oldTokens) {
    const key = `${t.chainId}-${t.address.toLowerCase()}`;
    oldTokenMap.set(key, t);
  }
  const oldChainIds = new Set(oldTokens.map((t) => t.chainId));
  let newChainCount = 0;
  let newTokenCount = 0;
  let updatedTokenCount = 0;
  const newChainIdsCounted = new Set<number>();

  for (const token of tokens) {
    const key = `${token.chainId}-${token.address.toLowerCase()}`;
    if (!oldTokenMap.has(key)) {
      if (!oldChainIds.has(token.chainId)) {
        if (!newChainIdsCounted.has(token.chainId)) {
          newChainCount++;
          newChainIdsCounted.add(token.chainId);
        }
      } else {
        newTokenCount++;
      }
    } else {
      const oldToken = oldTokenMap.get(key);
      const fields: (keyof Token)[] = ["name", "symbol", "decimals", "website", "description", "explorer", "logoURI"];
      let changed = false;
      for (const field of fields) {
        if ((oldToken as any)[field] !== (token as any)[field]) {
          changed = true;
          break;
        }
      }
      if (changed) {
        updatedTokenCount++;
      }
    }
  }

  const newVersion = {
    major: oldVersion.major + newChainCount,
    minor: oldVersion.minor + newTokenCount,
    patch: oldVersion.patch + updatedTokenCount,
  };

  const tokenList: TokenList = {
    name: "Oku Token List",
    timestamp: new Date().toISOString(),
    version: newVersion,
    tokens,
  };

  await fs.writeFile(outputFile, JSON.stringify(tokenList, null, 2), "utf-8");
  console.log(`Token list successfully written to ${outputFile}`);
}

if (require.main === module) {
  const chainsDirectory = "./chains/evm";
  const outputFile = "./tokenlist.json";
  generateTokenList(chainsDirectory, outputFile).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
