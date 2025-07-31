import { join } from "path";
import { MAINNET_CHAINS as chains } from "@gfxlabs/oku-chains";
import { mkdir, writeFile } from "fs/promises";
import { http, type Address, createPublicClient, erc20Abi, getContract } from "viem";
import { mainnet } from "viem/chains";

type TokenType = {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  website?: string;
  description?: string;
  explorer?: string;
};

interface TokenInfoInput {
  address: Address;
  chainName: string;
  rpcUrl?: string;
  website?: string;
  description?: string;
  explorer?: string;
}

interface CreateTokenInfoOptions {
  outputDir?: string;
}

export async function createTokenInfo(input: TokenInfoInput, options: CreateTokenInfoOptions = {}): Promise<void> {
  const { address, chainName, rpcUrl, website, description, explorer } = input;
  const { outputDir = "./chains/evm" } = options;

  function getChainByInternalName(internalName: string) {
    const chainEntries = Object.entries(chains);
    for (const [_, chain] of chainEntries) {
      if (chain.internalName === internalName) {
        return chain;
      }
    }
    return null;
  }

  const chainInfo = getChainByInternalName(chainName);
  if (!chainInfo) {
    throw new Error(`Chain with internal name '${chainName}' not found`);
  }

  const chainId = chainInfo.id;
  const defaultRpcUrl = `https://venn.staging.gfx.town/${chainName}`;
  const effectiveRpcUrl = rpcUrl || defaultRpcUrl;

  // Create public client with configurable RPC URL
  const client = createPublicClient({
    chain: chainId === 1 ? mainnet : { ...mainnet, id: chainId },
    transport: http(effectiveRpcUrl),
  });

  // Get contract instance
  const contract = getContract({
    address,
    abi: erc20Abi,
    client,
  });

  try {
    // Fetch token information from contract
    const [name, symbol, decimals] = await Promise.all([
      contract.read.name(),
      contract.read.symbol(),
      contract.read.decimals(),
    ]);

    // Create token info object
    const tokenInfo: TokenType = {
      address,
      name,
      symbol,
      decimals: Number(decimals),
    };

    // Add optional fields if provided
    if (website) tokenInfo.website = website;
    if (description) tokenInfo.description = description;
    if (explorer) tokenInfo.explorer = explorer;

    // Create directory structure
    const tokenDir = join(outputDir, chainId.toString(), address);
    await mkdir(tokenDir, { recursive: true });

    // Write token info file
    const infoPath = join(tokenDir, "info.json");
    await writeFile(infoPath, JSON.stringify(tokenInfo, null, 2));

    console.log(`Token info created successfully at: ${infoPath}`);
    console.log(`Token: ${name} (${symbol}) - ${decimals} decimals`);
  } catch (error) {
    console.error("Error fetching token information:", error);
    throw error;
  }
}

// CLI usage example
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error("Usage: node createTokenInfo.js <address> <chainName> [rpcUrl] [website] [description] [explorer]");
    console.error(
      "Example: node createTokenInfo.js 0x1234...5678 ethereum https://eth-mainnet.alchemyapi.io/v2/your-key",
    );
    process.exit(1);
  }

  const [addressArg, chainNameArg, rpcUrlArg, websiteArg, descriptionArg, explorerArg] = args;

  createTokenInfo({
    address: addressArg as Address,
    chainName: chainNameArg,
    rpcUrl: rpcUrlArg,
    website: websiteArg,
    description: descriptionArg,
    explorer: explorerArg,
  }).catch((error) => {
    console.error("Failed to create token info:", error);
    process.exit(1);
  });
}
