import { createPublicClient, http, getAddress, Address } from 'viem'
import fs from 'fs'
import path from 'path'
import minimist from 'minimist'
import { MAINNET_CHAINS } from '@gfxlabs/oku-chains'

const erc20Abi = [
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string', name: '' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string', name: '' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8', name: '' }],
  },
]

async function main() {
  const args = minimist(process.argv.slice(2), {
    string: ['chainId', 'tokenAddress', 'rpcUrl', 'logo'],
    alias: { c: 'chainId', t: 'tokenAddress', r: 'rpcUrl', l: 'logo' },
  })

  const { chainId, tokenAddress: tokenAddressArg, rpcUrl, logo } = args

  if (!chainId || !tokenAddressArg || !rpcUrl || !logo) {
    console.error(
      'Usage: ts-node generateTokenInfo.ts --chainId <chainId> --tokenAddress <address> --rpcUrl <rpcUrl> --logo <logoFilePath>'
    )
    process.exit(1)
  }

  const numericChainId = Number(chainId)
  if (isNaN(numericChainId)) {
    console.error('Invalid chainId provided.')
    process.exit(1)
  }

  if (!fs.existsSync(logo)) {
    console.error('Logo file does not exist.')
    process.exit(1)
  }

  // Get the properly checksummed token address using viem
  const tokenAddress: Address = getAddress(tokenAddressArg)

  const client = createPublicClient({
    chain: MAINNET_CHAINS[chainId],
    transport: http(rpcUrl),
  })

  // Retrieve token details via RPC calls
  const name = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'name',
  })

  const symbol = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'symbol',
  })

  const decimals = await client.readContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'decimals',
  })

  const tokenInfo = {
    address: tokenAddress,
    name,
    symbol,
    decimals,
  }

  // Create directory structure: <chainId>/<tokenAddress>/
  const baseDir = path.join(process.cwd(), 'chains/evm')
  const chainDir = path.join(baseDir, numericChainId.toString())
  const tokenDir = path.join(chainDir, tokenAddress)
  fs.mkdirSync(tokenDir, { recursive: true })

  // Write info.json
  const infoPath = path.join(tokenDir, 'info.json')
  fs.writeFileSync(infoPath, JSON.stringify(tokenInfo, null, 2))
  console.log(`Token info file created at ${infoPath}`)

  // Copy the logo file as logo.png into tokenDir
  const destLogoPath = path.join(tokenDir, 'logo.png')
  fs.copyFileSync(logo, destLogoPath)
  console.log(`Token logo copied to ${destLogoPath}`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
