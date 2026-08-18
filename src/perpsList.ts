import * as path from "path";
import { S3 } from "@aws-sdk/client-s3";
import * as fs from "fs/promises";

type PerpsList = Record<string, [string, string][]>;

const DEFAULT_PROVIDER_DIRECTORY = "default";

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
      const logoPath = path.join(providerPath, asset, "logo.svg");
      const key = `perps/${provider}/${asset}/logo.svg`;

      await s3Client.putObject({
        Bucket: "oku-cdn",
        Key: key,
        Body: await fs.readFile(logoPath),
        ContentType: "image/svg+xml",
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
