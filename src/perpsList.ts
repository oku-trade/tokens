import * as path from "path";
import { S3 } from "@aws-sdk/client-s3";
import * as fs from "fs/promises";

type PerpsList = Record<string, [string, string][]>;

const DEFAULT_PROVIDER_DIRECTORY = "default";
const LOGO_CONTENT_TYPES = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
} as const;

const s3Client = new S3({
  forcePathStyle: true,
  endpoint: "https://6f19dc20133dce480cc5b278c8964331.r2.cloudflarestorage.com",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.CF_KEY!,
    secretAccessKey: process.env.CF_SECRET!,
  },
});

async function generatePerpsList(baseDirectory: string, outputFile: string) {
  const perpsList: PerpsList = {};

  for (const provider of (await fs.readdir(baseDirectory)).sort()) {
    const providerPath = path.join(baseDirectory, provider);
    const assets: [string, string][] = [];

    for (const asset of (await fs.readdir(providerPath)).sort()) {
      const assetPath = path.join(providerPath, asset);
      const logoFiles = (await fs.readdir(assetPath)).filter((file) =>
        Object.hasOwn(LOGO_CONTENT_TYPES, path.extname(file).slice(1)),
      );

      if (logoFiles.length !== 1) {
        throw new Error(`${assetPath} must contain exactly one supported logo file (logo.svg, logo.png, or logo.jpg)`);
      }

      const logoFile = logoFiles[0];
      const extension = path.extname(logoFile).slice(1) as keyof typeof LOGO_CONTENT_TYPES;
      const logoPath = path.join(assetPath, logoFile);
      const key = `perps/${provider}/${asset}/${logoFile}`;

      await s3Client.putObject({
        Bucket: "oku-cdn",
        Key: key,
        Body: await fs.readFile(logoPath),
        ContentType: LOGO_CONTENT_TYPES[extension],
        ACL: "public-read",
      });

      assets.push([asset, `https://cdn.oku.trade/${key}`]);
    }

    perpsList[provider === DEFAULT_PROVIDER_DIRECTORY ? "" : provider] = assets;
  }

  const body = JSON.stringify(perpsList, null, 2);
  await fs.writeFile(outputFile, body, "utf-8");
  await s3Client.putObject({
    Bucket: "oku-cdn",
    Key: "perpslist.json",
    Body: body,
    ContentType: "application/json",
    ACL: "public-read",
  });
}

generatePerpsList("./perps", "./perpslist.json").catch((error) => {
  console.error(error);
  process.exit(1);
});
