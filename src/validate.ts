import * as fs from "fs/promises";
import * as path from "path";
import { MAINNET_CHAINS as chains } from "@gfxlabs/oku-chains";
import { Token } from "./types";
import { actuallyStrictIsAddress } from "./isAddress";

const SUPPORTED_CHAINS: number[] = chains.map(
  (chain: { id: number }) => chain.id,
);

function isChainSupported(chainId: number): boolean {
  return SUPPORTED_CHAINS.includes(chainId);
}

async function validateJsonFiles(baseDirectory: string) {
  const chainFolders = await fs.readdir(baseDirectory);

  for (const chainFolder of chainFolders) {
    // Check that the chain folder name is an integer.
    if (!/^\d+$/.test(chainFolder)) {
      throw new Error(`Chain folder "${chainFolder}" is not a valid integer.`);
    }

    if (!isChainSupported(Number(chainFolder))) {
      throw new Error(`Chain "${chainFolder}" is not supported.`);
    }

    const chainFolderPath = path.join(baseDirectory, chainFolder);
    const chainFolderStats = await fs.stat(chainFolderPath);
    if (!chainFolderStats.isDirectory()) {
      throw new Error(`Chain folder "${chainFolder}" is not a directory.`);
    }

    const tokenFolders = await fs.readdir(chainFolderPath);

    for (const tokenFolder of tokenFolders) {
      if (!actuallyStrictIsAddress(tokenFolder)) {
        throw new Error(
          `Token folder "${tokenFolder}" is not a valid address. Please use the checksummed address. Go to https://ethsum.netlify.app/ to check your address.`,
        );
      }

      const tokenFolderPath = path.join(chainFolderPath, tokenFolder);
      const tokenFolderStats = await fs.stat(tokenFolderPath);
      if (!tokenFolderStats.isDirectory()) {
        throw new Error(`Token folder "${tokenFolder}" is not a directory.`);
      }

      const logoFilePath = path.join(tokenFolderPath, "logo.png");
      try {
        const logoStats = await fs.stat(logoFilePath);
        if (!logoStats.isFile()) {
          throw new Error(`Logo file "${logoFilePath}" is not a file.`);
        }
      } catch (err) {
        throw new Error(`Logo file "${logoFilePath}" does not exist.`);
      }

      const infoFilePath = path.join(tokenFolderPath, "info.json");
      try {
        const fileContent = await fs.readFile(infoFilePath, "utf-8");
        const jsonData = JSON.parse(fileContent);
        const validationResult = Token.safeParse(jsonData);

        if (!validationResult.success) {
          throw new Error(
            `File ${infoFilePath} is invalid: ${JSON.stringify(
              validationResult.error.errors,
              null,
              2,
            )}`,
          );
        }

        // Ensure the token folder name matches the address in the JSON.
        if (validationResult.data.address !== tokenFolder) {
          throw new Error(
            `Mismatch in token folder "${tokenFolder}" and address in JSON: ${validationResult.data.address}`,
          );
        }

        console.log(`File ${infoFilePath} is valid.`);
      } catch (parseError) {
        throw new Error(
          `Error processing JSON in file ${infoFilePath}: ${parseError}`,
        );
      }
    }
  }
}

const chainsDirectory = "./chains/evm";
validateJsonFiles(chainsDirectory).catch((error) => {
  console.error(error);
  process.exit(1);
});
