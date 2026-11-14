const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { loadFeeGroups } = require('../dist/feeGroups');

const USDC = { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', source: 'coingecko:usd-coin' };
const USDT = { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', source: 'coingecko:tether' };
const WETH = { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', source: 'coingecko:weth' };
const SOLANA = 'solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOL_USDC = { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', source: 'https://developers.circle.com/stablecoins/usdc-contract-addresses' };

// withGroups writes files keyed by path relative to a temporary feegroups directory.
async function withGroups(files, fn) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'feegroups-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      const file = path.join(directory, name);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, typeof body === 'string' ? body : JSON.stringify(body));
    }
    return await fn(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('loads fee groups keyed by CAIP-2 chain', async () => {
  const files = {
    'eip155/1/usd.json': [USDT, USDC],
    'eip155/1/eth.json': [WETH],
    'eip155/42161/usd.json': [USDC],
    [`${SOLANA}/usd.json`]: [SOL_USDC],
  };
  await withGroups(files, async (dir) => {
    const chains = await loadFeeGroups(dir);
    assert.deepEqual(Object.keys(chains), ['eip155:1', 'eip155:42161', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp']);
    assert.deepEqual(Object.keys(chains['eip155:1']), ['eth', 'usd']);
    assert.deepEqual(chains['eip155:1'].usd, [USDC, USDT]);
  });
});

test('allows the same address on different chains', async () => {
  await withGroups({ 'eip155/1/usd.json': [USDC], 'eip155/10/usd.json': [USDC] }, async (dir) => {
    await loadFeeGroups(dir);
  });
});

test('rejects invalid fee groups', async () => {
  const cases = {
    'lowercase EVM address': { 'eip155/1/usd.json': [{ ...USDC, address: USDC.address.toLowerCase() }] },
    'EVM address on solana': { [`${SOLANA}/usd.json`]: [USDC] },
    'unsupported namespace': { 'tron/1/usd.json': [USDC] },
    'bad EVM chain reference': { 'eip155/01/usd.json': [USDC] },
    'file outside chain directory': { 'eip155/usd.json': [USDC] },
    'missing source': { 'eip155/1/usd.json': [{ ...USDC, source: '' }] },
    'unknown field': { 'eip155/1/usd.json': [{ ...USDC, chain: 'eip155:1' }] },
    'empty group': { 'eip155/1/usd.json': [] },
    'bad group name': { 'eip155/1/USD.json': [USDC] },
    'invalid JSON': { 'eip155/1/usd.json': '{' },
    'duplicate in group': { 'eip155/1/usd.json': [USDC, USDC] },
    'asset in two groups on a chain': { 'eip155/1/usd.json': [USDC], 'eip155/1/native.json': [USDC] },
  };
  for (const [name, files] of Object.entries(cases)) {
    await withGroups(files, async (dir) => {
      await assert.rejects(loadFeeGroups(dir), undefined, name);
    });
  }
});

test('repository fee groups are valid', async () => {
  const chains = await loadFeeGroups(path.join(__dirname, '..', 'feegroups'));
  assert.ok(chains['eip155:1'].usd.length > 0);
});
