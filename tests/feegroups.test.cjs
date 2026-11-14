const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { loadFeeGroups } = require('../dist/feeGroups');

const USDC = { chain: 'eip155:1', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', source: 'coingecko:usd-coin' };
const WETH = { chain: 'eip155:1', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', source: 'coingecko:weth' };
const SOL_USDC = { chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', source: 'https://developers.circle.com/stablecoins/usdc-contract-addresses' };

async function withGroups(files, fn) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'feegroups-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      await fs.writeFile(path.join(directory, name), typeof body === 'string' ? body : JSON.stringify(body));
    }
    return await fn(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test('loads valid EVM and Solana fee groups', async () => {
  await withGroups({ 'fiat-usd.json': [SOL_USDC, USDC], 'ethereum-eth.json': [WETH] }, async (dir) => {
    const groups = await loadFeeGroups(dir);
    assert.deepEqual(Object.keys(groups), ['ethereum-eth', 'fiat-usd']);
    assert.deepEqual(groups['fiat-usd'], [USDC, SOL_USDC]);
  });
});

test('rejects invalid fee group entries', async () => {
  const cases = {
    'lowercase EVM address': { 'fiat-usd.json': [{ ...USDC, address: USDC.address.toLowerCase() }] },
    'unknown chain namespace': { 'fiat-usd.json': [{ ...USDC, chain: 'tron:1' }] },
    'missing source': { 'fiat-usd.json': [{ ...USDC, source: '' }] },
    'unknown field': { 'fiat-usd.json': [{ ...USDC, extra: true }] },
    'empty group': { 'fiat-usd.json': [] },
    'bad group name': { 'Fiat_USD.json': [USDC] },
    'invalid JSON': { 'fiat-usd.json': '{' },
    'duplicate in group': { 'fiat-usd.json': [USDC, USDC] },
    'asset in two groups': { 'fiat-usd.json': [USDC], 'other-usd.json': [USDC] },
  };
  for (const [name, files] of Object.entries(cases)) {
    await withGroups(files, async (dir) => {
      await assert.rejects(loadFeeGroups(dir), undefined, name);
    });
  }
});

test('repository fee groups are valid', async () => {
  const groups = await loadFeeGroups(path.join(__dirname, '..', 'feegroups'));
  assert.ok(groups['fiat-usd'].length > 0);
});
