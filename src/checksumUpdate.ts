import { getAddress } from "viem";
import { readdir, rename, readFile, writeFile } from "fs/promises";
import * as path from "path";

async function updateTokenFolders(baseDir: string) {
  const evmDir = path.join(baseDir, "chains", "evm");
  const chainDirs = await readdir(evmDir, { withFileTypes: true });

  for (const chainDir of chainDirs) {
    if (!chainDir.isDirectory()) continue;
    const chainPath = path.join(evmDir, chainDir.name);
    const tokenDirs = await readdir(chainPath, { withFileTypes: true });

    for (const tokenDir of tokenDirs) {
      if (!tokenDir.isDirectory()) continue;

      const oldName = tokenDir.name;
      let checksummed: string;
      try {
        checksummed = getAddress(oldName);
      } catch (error) {
        console.error(
          `Skipping "${oldName}" in chain "${chainDir.name}": invalid Ethereum address`,
        );
        continue;
      }

      const tokenDirPath = path.join(chainPath, oldName);
      const infoPath = path.join(tokenDirPath, "info.json");

      try {
        const fileContent = await readFile(infoPath, "utf-8");
        const json = JSON.parse(fileContent);
        if (json.address !== checksummed) {
          json.address = checksummed;
          await writeFile(infoPath, JSON.stringify(json, null, 2), "utf-8");
          console.log(
            `Updated info.json in "${oldName}" in chain "${chainDir.name}"`,
          );
        }
      } catch (err: any) {
        console.error(
          `Error processing info.json in "${oldName}" in chain "${chainDir.name}": ${err.message}`,
        );
      }

      if (oldName !== checksummed) {
        const newPath = path.join(chainPath, checksummed);
        console.log(
          `Renaming folder "${oldName}" -> "${checksummed}" in chain "${chainDir.name}"`,
        );
        await rename(tokenDirPath, newPath);
      }
    }
  }
}

updateTokenFolders("./")
  .then(() => console.log("All done"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
