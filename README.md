# Oku Tokens

This repository contains token information that can be used by [Oku](https://oku.trade)

After cloning the repo run the following to get started:

```base
yarn install
yarn prepare
```

## Directory Structure

```plaintext
chains/
└── evm/
    └── <chain-id>/
        └── <checksummed-token-address>/
            ├── info.json
            └── logo.png

perps/
└── <provider>/
    └── <ASSET>/
        └── logo.svg
```

- **Chain ID Folders:**  
  Each chain folder must be named using a valid integer (representing the chain ID).  
  Example: `1`, `56`, `137`.

- **Token Address Folders:**  
  Inside each chain folder, create a folder for each token using its address. The folder name must be a valid checksummed address. Use https://ethsum.netlify.app/ if you are unsure how to do this.
  Example: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`.

- **Info File:**  
  Each token folder must contain an `info.json` file with the token details.

- **Logo File:**  
  Each token folder must contain a `logo.png` file representing the token's logo.

## `info.json` Format

The `info.json` file should adhere to the following schema:

- **name** (string): The token's name.
- **symbol** (string): The token's symbol.
- **decimals** (integer): The number of decimals.
- **website** (string, optional): A valid HTTPS URL to the token's website.
- **description** (string, optional): A short description of the token.
- **explorer** (string, optional): A valid HTTPS URL to the token's block explorer.
- **address** (string): The token's address. This must be a checksummed address and match the token folder name. use https://ethsum.netlify.app/ if you are unsure how to do this.

## Logo File

Each token folder must include a logo.png file. This file should be a valid PNG image representing the token's logo.
The image should be square and no larger than 256x256 pixels or smaller than 64x64 pixels.

## Perps

Perp logos may be named `logo.svg`, `logo.png`, or `logo.jpg`. Each asset directory must contain exactly one of these files. HIP-3 perp logos use paths such as `perps/xyz/COPPER/logo.svg`. Default perp logos without a dex prefix use paths such as `perps/default/BTC/logo.png`; the `default` directory is emitted under the empty provider key in `perpslist.json`. Running `make list` uploads the logos to R2 with the correct content type and generates `perpslist.json`.

## Fee Groups

Fee groups list assets on a single chain that are versions of the same underlying asset. A swap between two assets in the same group on the same chain is charged the like-kind fee instead of the normal tier. Swaps are single chain, so groups are defined per chain.

```plaintext
feegroups/
└── <caip2-namespace>/
    └── <caip2-reference>/
        ├── native.json
        ├── usd.json
        ├── eur.json
        ├── eth.json
        └── btc.json
```

For example `feegroups/eip155/42161/usd.json` holds Arbitrum USD assets and `feegroups/solana/5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/usd.json` holds Solana USD assets. The common groups are:

- **native**: the chain's native token with its wrapped and staked forms (for example MON, WMON, sMON on Monad).
- **usd**, **eur**: stablecoins for that currency and their staked or savings forms.
- **eth**, **btc**: ETH or BTC with their wrapped, bridged, and staked forms.

Other groups such as `pendle.json` or `ena.json` cover a non-native token and its staked form. Group names are lowercase kebab-case and only apply within their chain directory.

A token belongs in a group when it is a wrapped, bridged, staked, or yield-bearing version of the group's asset, including liquid staking and savings tokens whose price drifts above the base asset over time. Unrelated tokens that merely trade near the same price do not belong.

Each file is a JSON array of entries:

```json
[
  {
    "address": "0x004B506865409877C9fA29bfb1ebA929984B9bbC",
    "symbol": "USDG",
    "source": "coingecko:global-dollar"
  }
]
```

- **address** (string): checksummed EVM address, or base58 for Solana. Use `0x0000000000000000000000000000000000000000` for an EVM chain's native asset.
- **symbol** (string): the token symbol.
- **source** (string): evidence for the classification, such as `coingecko:<coin-id>` or an issuer docs URL.

An asset may appear in only one group per chain. Fee group assets do not need an entry under `chains/` or a logo. `yarn validate` checks the files, and `make list` publishes `feegroups.json` (keyed by CAIP-2 chain id, then group) to `https://cdn.oku.trade/feegroups.json`, which the account service syncs into its fee policy.

To add an asset, append it to the right file, run `yarn validate`, and open a PR that links the evidence.

## How to Submit a PR

1. **Fork the Repository:**  
   Create your fork and clone it locally.

2. **Setup the repo:**
   ```bash
   yarn install && yarn prepare
   ```

3. **Create a Branch:**  
   Create a new branch for your changes.
   ```bash
   git checkout -b add-token-<token-name>
   ```
4. **Add Token Information:**  
   Add the token information to the `info.json` file in the token folder.
5. **Commit and Push:**  
   Commit your changes and push them to your fork.
6. **Create a Pull Request:**  
   Create a pull request from your fork to the main repository.  
   Include a description of the changes you made.
7. **Wait for Review:**  
   Wait for the reviewer to review your changes. They will provide feedback and suggestions if necessary.

## Incremental CDN uploads

`make list` hashes each logo's contents and processing recipe, comparing them with
`.upload-manifest.json`. Only new or changed assets are resized (token PNGs) and
uploaded. Metadata-only edits still update the lists without uploading logos.
The generated `perpslist.json` is also uploaded only when its contents change.

The main-branch workflow commits the manifest alongside the generated lists.
The first run without a manifest uploads all assets to establish a verified
baseline. Upload failures fail the command and are not recorded as successful,
so the next run retries them. Runs are serialized to avoid overlapping uploads.
Deleted assets disappear from the lists but are not deleted from the CDN.

To force a full re-upload, remove `.upload-manifest.json` before running
`make list` with R2 credentials. To force one asset, remove its CDN key from the
manifest. When changing image processing settings, update the recipe string in
`src/list.ts` to invalidate the corresponding cached uploads.

Run `yarn test` for incremental-upload regression tests (no R2 credentials or
network uploads required).
