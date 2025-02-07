import { createPublicClient, http, getAddress, Address } from 'viem'
import fs from 'fs'
import path from 'path'
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
  const [,, chainIdArg, tokenAddressArg, rpcUrl, logoPath] = process.argv
  if (!chainIdArg || !tokenAddressArg || !rpcUrl || !logoPath) {
    console.error('Usage: ts-node generateTokenInfo.ts <chainId> <tokenAddress> <rpcUrl> <logoFilePath>')
    process.exit(1)
  }

  const chainId = Number(chainIdArg)
  if (isNaN(chainId)) {
    console.error('Invalid chainId provided.')
    process.exit(1)
  }

  if (!fs.existsSync(logoPath)) {
    console.error('Logo file does not exist.')
    process.exit(1)
  }

  const tokenAddress: Address = getAddress(tokenAddressArg)

  const client = createPublicClient({
    chain: MAINNET_CHAINS[chainId],
    transport: http(rpcUrl),
  })

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

  const baseDir = path.join(process.cwd(), "chains/evm")
  const chainDir = path.join(baseDir, chainId.toString())
  const tokenDir = path.join(chainDir, tokenAddress)
  fs.mkdirSync(tokenDir, { recursive: true })

  const infoPath = path.join(tokenDir, 'info.json')
  fs.writeFileSync(infoPath, JSON.stringify(tokenInfo, null, 2))
  console.log(`Token info file created at ${infoPath}`)

  const destLogoPath = path.join(tokenDir, 'logo.png')
  fs.copyFileSync(logoPath, destLogoPath)
  console.log(`Token logo copied to ${destLogoPath}`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
