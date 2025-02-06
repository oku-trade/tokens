# Oku Tokens

This repository contains token information that can be used by [Oku](https://oku.trade)

## Directory Structure

- **Chain Folders:**  
  Each chain folder must be named using a valid integer (representing the chain ID).  
  Example: `1`, `56`, `137`.

- **Token Folders:**  
  Inside each chain folder, create a folder for each token using its address. The folder name must be a valid checksummed address. Use https://ethsum.netlify.app/ if you are unsure how to do this.
  Example: `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`.

- **Info File:**  
  Each token folder must contain an `info.json` file with the token details.

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

## How to Submit a PR

1. **Fork the Repository:**  
   Create your fork and clone it locally.

2. **Create a Branch:**  
   Create a new branch for your changes.
   ```bash
   git checkout -b add-token-<token-name>
   ```
3. **Add Token Information:**  
   Add the token information to the `info.json` file in the token folder.
4. **Commit and Push:**  
   Commit your changes and push them to your fork.
5. **Create a Pull Request:**  
   Create a pull request from your fork to the main repository.  
   Include a description of the changes you made.
6. **Wait for Review:**  
   Wait for the reviewer to review your changes. They will provide feedback and suggestions if necessary.
