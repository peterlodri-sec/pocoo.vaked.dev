# Deploying PaintingsForSecrets to Polygon mainnet

Zero-dependency runbook — no Hardhat, no Foundry, no ethers in the shipped
site. Everything below is dev-time tooling (node + solc) run in a scratch
directory; the browser site (`art/`) never loads any of it.

| | |
|---|---|
| Contract | `nft/PaintingsForSecrets.sol` (ERC-721 + IERC2981, OZ 5.x) |
| Network | **Polygon mainnet, chain id 137** (`0x89`) — do **not** target Amoy/testnet |
| Constructor | `PaintingsForSecrets(address initialTreasury)` |
| Default treasury | `0x4f584F6fd3a0a8C807aF2F00571c172603600578` (constellation payment wallet — changeable via the `TREASURY` env below, or later via `setTreasury`) |
| Explorer | https://polygonscan.com |
| RPC | `https://polygon.drpc.org` (dRPC keyless public, verified live on mainnet; the legacy public endpoint was deprecated 31 Jul 2026) — single named constant `POLYGON_RPC` in `art/chain.js`, mirrored by `TARGET_RPC` in `art/index.html` |

Prereqs: Node ≥ 18 (global `fetch`), npm. That's it.

---

## Step 1 — Compile (solc 0.8.x + OpenZeppelin 5.x)

The contract imports `@openzeppelin/contracts/...`; the repo has no
`node_modules` for that, so compile in a **scratch dir** (the repo itself stays
untouched):

```bash
mkdir -p /tmp/pfs-deploy && cd /tmp/pfs-deploy
npm init -y >/dev/null 2>&1
npm i --save-dev solc@0.8.28 @openzeppelin/contracts@5.0.2
cp /path/to/repo/pocoo.vaked.dev/nft/PaintingsForSecrets.sol .
npx solc --base-path . --include-path node_modules \
  --evm-version cancun --optimize --optimize-runs=200 --bin --abi -o build PaintingsForSecrets.sol
ls -l build/
```

Output: `build/PaintingsForSecrets.bin` (creation bytecode) + `.abi`.

**Version gotchas (this is the part that bites):**

- **OpenZeppelin must be `^5.0.0`.** The contract uses the OZ 5.x API:
  `Ownable(msg.sender)` (initial-owner constructor), `_update`,
  `_ownerOf`, `_isAuthorized`, `_safeMint(msg.sender, ...)`. OZ 4.x will **not**
  compile (`Ownable` has no constructor arg there; `_update`/`_isAuthorized`
  don't exist). Install `@openzeppelin/contracts@5.0.2` (or any 5.x).
- **solc ≥ 0.8.24** (pragma `^0.8.24`). 0.8.28/0.8.29 are fine.
- **No flattener is needed to compile**: `--include-path node_modules` makes
  solc resolve the `@openzeppelin/...` imports straight from npm. This flag
  needs solc ≥ 0.8.19 (any 0.8.24+ has it). A flattener is only needed for
  **Polygonscan** source verification — see Step 4.
- Keep the optimizer setting (`--optimize --optimize-runs=200`) — you must
  re-verify with **identical** settings later, or verification will fail with a
  bytecode mismatch.
- **`--evm-version cancun` is REQUIRED.** OpenZeppelin 5.x `Bytes.sol` uses the
  `mcopy` opcode (via `Strings`/`Base64`), which only exists on Cancun+. Without
  it solc errors with `DeclarationError: Function "mcopy" not found`. This is
  the single most likely first-compile failure.

No docker? `npx solc@0.8.28` above is solc-js, a plain node package — no
docker, no native toolchain. (If you prefer the native binary:
`docker run --rm -v "$PWD":/src -w /src ethereum/solc:0.8.28 --base-path . --include-path node_modules --evm-version cancun --optimize --optimize-runs=200 --bin --abi -o build PaintingsForSecrets.sol`.)

---

## Step 2 — Deploy with `nft/deploy.js` (repo's own signing)

`nft/deploy.js` builds the creation transaction (bytecode + ABI-encoded
treasury arg), signs it with the repo's hand-rolled EIP-155 code
(`art/chain.js` → `art/vendor/chain-crypto.js`, noble-curves secp256k1 +
js-sha3 keccak) and broadcasts it. No ethers, no framework.

```bash
# 2a. put the bytecode where deploy.js expects it
cp /tmp/pfs-deploy/build/PaintingsForSecrets.bin nft/PaintingsForSecrets.bin

# 2b. dry run — signs, prints everything, does NOT broadcast (default)
PRIVATE_KEY=0x... node nft/deploy.js

# 2c. broadcast (REAL FUNDS — verify the printed values first)
PRIVATE_KEY=0x... node nft/deploy.js --broadcast
```

The dry run prints: deploying address, treasury, nonce, gas price, gas limit,
data size, the **predicted contract address**
(`keccak256(rlp([sender, nonce]))` — so you know the contract address even
before the tx lands), and the fully-signed raw transaction.

Useful knobs (all optional):

| Env / flag | Default | Purpose |
|---|---|---|
| `PRIVATE_KEY` | — (required) | Deployer key. Never committed, never printed. |
| `TREASURY` | `0x4f584F6fd3a0a8C807aF2F00571c172603600578` | Constructor treasury (changeable). |
| `RPC_URL` | `POLYGON_RPC` from `art/chain.js` | RPC override. |
| `NONCE` | from chain (`pending`) | Force a nonce (hex). |
| `GAS_PRICE_WEI` | `eth_gasPrice` | Force gas price (hex wei). |
| `GAS_LIMIT_MULT` | `2` | Multiplier over `eth_estimateGas`. |
| `--bytecode <hex\|file>` | `nft/PaintingsForSecrets.bin` | Bytecode source override. |
| `--broadcast` | dry-run | Actually send the tx. |
| `--help` | — | Usage. |

> Safety: the script is **dry-run by default**. `--broadcast` sends real POL
> on mainnet — confirm the printed from/treasury/gasPrice/nonce before running
> it. Fund the deploying address with enough POL for ~5–8M gas × current price
> (typically a few cents' worth).

---

## Step 3 — Verify the deployment

```bash
# wait for the receipt (status 0x1 = success)
node -e "import('./art/chain.js').then(m => m.chain.getReceipt('0x<txhash>').then(r => console.log(JSON.stringify(r, null, 2))))"
```

Or check https://polygonscan.com/tx/`<txhash>` → "Success" (status green).

**Contract address:** use the *predicted* address from Step 2b's output, or
read it off polygonscan's "Contract" tab. Sanity-check with a read:

```bash
node -e "
import('./art/chain.js').then(async ({ chain }) => {
  const a = '0x<CONTRACT>';
  console.log('name:',     await chain.call(a, '0x06fdde03')); // name()
  console.log('treasury:', await chain.call(a, '0x3b19e17a')); // treasury()
  console.log('mintFee:',  await chain.call(a, '0x13966db5')); // mintFee()
});"
```

(`0x06fdde03` = `name()`, `0x3b19e17a` = `treasury()`, `0x13966db5` =
`mintFee()`; first two words of each `eth_call` result contain the length +
string/address — enough to eyeball `"PaintingsForSecrets"` and your treasury.)

---

## Step 4 — Source verification on Polygonscan

The contract's bytecode **must** match the verified source exactly: same
compiler version (0.8.28), same optimizer settings (`enabled: true, runs: 200`).

**Option A — Sourcify (easiest, no flattener):**
1. Go to https://sourcify.dev → **Verify**.
2. Chain: Polygon (chain id 137). Address: the deployed contract.
3. Sourcify reads the on-chain metadata and auto-fetches OpenZeppelin from the
   npm registry — nothing to flatten or upload manually.

**Option B — Polygonscan ("Verify & Publish"):**
1. Use a **flattener** — Polygonscan cannot resolve `node_modules` imports.
   The repo's own `solc` scratch dir can do it. Install
   `npm i -D sol-merger` in `/tmp/pfs-deploy`, then:
   ```bash
   cd /tmp/pfs-deploy && npx sol-merger ./PaintingsForSecrets.sol ./Flattened.sol
   ```
   (or any flattener you trust — the output is a single self-contained file).
2. Polygonscan → contract page → **Verify & Publish** → Solidity (Single File):
   - Compiler: `0.8.28` (exactly what you compiled with)
   - EVM version: default (`istanbul`)
   - Optimization: **yes, 200 runs**
   - Paste `Flattened.sol`.
3. Submit. If it says "Bytecode mismatch", the compiler/optimizer/EVM settings
   don't match Step 1 — fix those, not the source.

> Gotcha: `@openzeppelin/contracts@5.0.2` pulls `@openzeppelin/contracts`
> versions internally; a flattener resolves them at flatten time, so the
> flattened file is self-consistent. If a flattener ever fails on OZ, fall
> back to Option A (Sourcify) — it always handles OZ.

---

## Step 5 — Wire the frontend

In `art/index.html` (NFT layer constants):

```js
const PFS_ADDRESS = '0x<DEPLOYED_CONTRACT_ADDRESS>'; // TODO: set after deployment
```

- `TARGET_CHAIN_ID` stays `'0x89'` (Polygon mainnet) — **do not** change to
  Amoy (`0x13882`).
- `TARGET_RPC` stays `https://polygon.drpc.org` — must match
  `POLYGON_RPC` in `art/chain.js`.
- While `PFS_ADDRESS` is the zero placeholder the UI shows a yellow
  "PaintingsForSecrets: not deployed" chip and keeps the mint/gift buttons
  disabled — that's the intended deploy-readiness state; the chip flips to
  green "live" the moment the address is set.

Then deploy `art/` through the site's normal pipeline (the site is CSP-`self`;
`art/chain.js` and the vendored crypto are already self-hosted — no new
dependencies, no CDN).

---

## Rollback / ops notes

- Wrong treasury? Call `setTreasury(newAddress)` (owner-only) — no redeploy.
- `withdraw()` (owner-only) sweeps contract balance to the treasury; royalties
  (EIP-2981, 5%) flow directly to the treasury on each `buy`.
- The deployer key should be a fresh, dedicated account, funded only for this
  deployment — not the vault key, not a hot main wallet.
- `nft/deploy.js` and this runbook are dev-time tooling; they are **not**
  loaded by any browser page and add zero runtime dependencies.
