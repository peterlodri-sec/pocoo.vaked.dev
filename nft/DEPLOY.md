# Deploying Sovereign Contracts to Polygon Mainnet

Zero-dependency runbook — no Hardhat, no Foundry, no heavy frameworks in the shipped
site. Everything below is dev-time tooling (`node` + `solc`) run in a scratch
directory; the browser site (`art/` & `demos/`) never loads any of it.

---

## Contract Inventory & Network

| Target | Contract | Standard | Key Parameters |
| :--- | :--- | :--- | :--- |
| **Lane A (NFT)** | `nft/PaintingsForSecrets.sol` | ERC-721 + IERC-2981 | `initialTreasury` (`0x4f584F6fd3a0a8C807aF2F00571c172603600578`) · 0.5 POL mint |
| **Lane B (Token)** | `nft/VAKED.sol` | Mineable ERC-20 (EIP-918) | 21,000,000 hard cap · 50 VAKED initial reward · 210,000 halving interval · 60-block target · 100% fair launch |
| **Network** | **Polygon Mainnet** | Chain ID **137** (`0x89`) | **Do not deploy to testnets** (Amoy `0x13882`) |
| **RPC** | `https://polygon.drpc.org` | Keyless dRPC | Matches `POLYGON_RPC` in `art/chain.js` |
| **Explorer** | [Polygonscan](https://polygonscan.com) · [Sourcify](https://sourcify.dev) | EVM Cancun | Optimizer: Runs 200 |

**Prerequisites**: Node.js ≥ 18, npm.

---

## Step 1 — Compile (`solc 0.8.28` + `OpenZeppelin 5.0.2`)

Both contracts import `@openzeppelin/contracts/...`. To keep the repository clean, compilation runs in a scratch directory:

```bash
mkdir -p /tmp/sovereign-deploy && cd /tmp/sovereign-deploy
npm init -y >/dev/null 2>&1
npm i --save-dev solc@0.8.28 @openzeppelin/contracts@5.0.2

# Copy contracts from repository
cp /path/to/repo/pocoo.vaked.dev/nft/PaintingsForSecrets.sol .
cp /path/to/repo/pocoo.vaked.dev/nft/VAKED.sol .

# Compile via solcjs
npx solc --base-path . --include-path node_modules \
  --optimize --optimize-runs 200 --bin --abi -o build \
  PaintingsForSecrets.sol VAKED.sol

ls -lh build/
```

### Compiler Output & Staging
`solcjs` outputs artifacts named `<File>_sol_<Contract>.bin`:
- `build/PaintingsForSecrets_sol_PaintingsForSecrets.bin` (28.5 KB hex)
- `build/VAKED_sol_VAKED.bin` (8.5 KB hex)

Stage the compiled bytecode into the `nft/` directory:
```bash
cp /tmp/sovereign-deploy/build/PaintingsForSecrets_sol_PaintingsForSecrets.bin /path/to/repo/pocoo.vaked.dev/nft/PaintingsForSecrets.bin
cp /tmp/sovereign-deploy/build/VAKED_sol_VAKED.bin /path/to/repo/pocoo.vaked.dev/nft/VAKED.bin
```

### Compiler Notes & Invariants
- **OpenZeppelin 5.x API**: Uses `Ownable(msg.sender)`, `_update`, `_ownerOf`, `_isAuthorized`. (OZ 4.x is incompatible).
- **Optimizer Settings**: Must remain `--optimize --optimize-runs 200` to guarantee exact bytecode match during Polygonscan verification.
- **EVM Target**: Solc 0.8.28 defaults to Cancun, supporting the `mcopy` opcode used in OpenZeppelin 5.x strings and base64 encoders.

---

## Step 2 — Deploy via `nft/deploy.js` (Zero-Dependency EIP-155 Signing)

`nft/deploy.js` constructs the deployment payload, derives the deterministic contract address (`keccak256(rlp([sender, nonce]))`), signs an EIP-155 legacy transaction via the repo's native cryptography (`art/chain.js` / noble-curves secp256k1 + js-sha3 keccak), and broadcasts it.

### 2A. Deploy Lane A — `PaintingsForSecrets` (Generative Art NFT)

```bash
# 1. Dry run (verifies parameters, gas, predicted contract address — no funds sent)
PRIVATE_KEY=0x... node nft/deploy.js

# 2. Broadcast to Polygon mainnet
PRIVATE_KEY=0x... node nft/deploy.js --broadcast
```

### 2B. Deploy Lane B — `VAKED` (Fair-Launch Mineable ERC-20)

```bash
# 1. Dry run
PRIVATE_KEY=0x... node nft/deploy.js --vaked

# 2. Broadcast to Polygon mainnet
PRIVATE_KEY=0x... node nft/deploy.js --vaked --broadcast
```

### Configuration Environment Variables

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PRIVATE_KEY` | *(Required)* | 32-byte hex private key. Never logged, never stored. |
| `TREASURY` | `0x4f584F6fd3a0a8C807aF2F00571c172603600578` | Constructor treasury for `PaintingsForSecrets`. |
| `RPC_URL` | `https://polygon.drpc.org` | Polygon JSON-RPC endpoint override. |
| `GAS_LIMIT_MULT` | `2` | Safety multiplier over `eth_estimateGas`. |
| `NONCE` | Dynamic `pending` | Manual nonce override (hex string). |
| `GAS_PRICE_WEI` | Dynamic `eth_gasPrice` | Manual gas price override (hex string). |

---

## Step 3 — Verify On-Chain State

### 3A. Verify `PaintingsForSecrets`
```bash
node -e "
import('./art/chain.js').then(async ({ chain }) => {
  const addr = '0x<PFS_CONTRACT_ADDRESS>';
  console.log('Name:    ', await chain.call(addr, '0x06fdde03')); // name()
  console.log('Treasury:', await chain.call(addr, '0x3b19e17a')); // treasury()
  console.log('MintFee: ', await chain.call(addr, '0x13966db5')); // mintFee()
});"
```

### 3B. Verify `VAKED` Token
```bash
node -e "
import('./art/chain.js').then(async ({ chain }) => {
  const addr = '0x<VAKED_CONTRACT_ADDRESS>';
  console.log('Name:       ', await chain.call(addr, '0x06fdde03')); // name()
  console.log('Symbol:     ', await chain.call(addr, '0x95d89b41')); // symbol()
  console.log('MaxSupply:  ', await chain.call(addr, '0xd5abeb01')); // maxSupply()
  console.log('Challenge:  ', await chain.call(addr, '0x3b66bc94')); // getChallengeNumber()
  console.log('Difficulty: ', await chain.call(addr, '0x2f9435b6')); // getMiningDifficulty()
});"
```

---

## Step 4 — Contract Source Verification

### Option A — Sourcify (Automated, No Flattening Required)
1. Navigate to [sourcify.dev](https://sourcify.dev).
2. Choose **Polygon Mainnet** (Chain ID 137).
3. Paste the deployed contract address.
4. Sourcify resolves the OpenZeppelin 5.0.2 metadata directly from IPFS/npm.

### Option B — Polygonscan (Single-File Flattening)
1. Install `sol-merger` in the compile directory:
   ```bash
   cd /tmp/sovereign-deploy && npm i -D sol-merger
   npx sol-merger ./PaintingsForSecrets.sol ./Flattened_PFS.sol
   npx sol-merger ./VAKED.sol ./Flattened_VAKED.sol
   ```
2. Navigate to `https://polygonscan.com/address/<CONTRACT>#code` → **Verify and Publish**:
   - Compiler Type: **Solidity (Single file)**
   - Compiler Version: **v0.8.28**
   - Open Source License Type: **MIT**
   - Optimization: **Yes** (Runs: **200**)
   - EVM Version: **cancun** (or default)
   - Paste flattened source and submit.

---

## Step 5 — Fair-Launch Governance: Renounce `VAKED` Ownership

To complete the 100% permissionless fair launch of the `VAKED` token, the deployer renounces ownership, permanently eliminating any administrative privileges:

```bash
node -e "
import('./art/chain.js').then(async ({ chain }) => {
  const priv = process.env.PRIVATE_KEY;
  const vakedAddr = '0x<VAKED_CONTRACT_ADDRESS>';
  const from = chain.privateToAddress(priv);
  const nonce = await chain.getTransactionCount(from, 'pending');
  const gasPrice = await chain.getGasPrice();
  
  // renounceOwnership() selector: 0x715018a6
  const tx = chain.signLegacyTx({
    nonce,
    gasPrice,
    gasLimit: '0x186a0', // 100k gas
    to: vakedAddr,
    value: '0x0',
    data: '0x715018a6',
    priv
  });
  
  const txHash = await chain.sendRawTransaction(tx);
  console.log('Ownership renounced! Tx:', txHash);
});"
```

Once mined, `owner()` returns `0x0000000000000000000000000000000000000000`.

---

## Step 6 — Frontend Wiring

### 1. Generative Art NFT (`art/index.html`)
Update the contract address constant:
```javascript
const PFS_ADDRESS = '0x<DEPLOYED_PFS_CONTRACT_ADDRESS>';
```
The status chip flips from yellow (`"not deployed"`) to green (`"live"`), enabling Web3 minting and secret gifting.

### 2. Sovereign Library & Whitepaper Attestation (`demos/whitepaper.html`)
Reference the live Polygonscan token contract:
```html
<dd><a href="https://polygonscan.com/token/0x<VAKED_CONTRACT_ADDRESS>" target="_blank">0x<VAKED_CONTRACT_ADDRESS></a></dd>
```

---

## Security & Operational Safeguards
1. **Isolated Deployer Key**: Use a dedicated deployment wallet funded with ~1–2 POL for gas. Never use vault or custody keys.
2. **Deterministic Nonces**: Always verify the predicted address output in dry-run mode before broadcasting.
3. **No Upgrade Proxies**: Both contracts are immutable, non-custodial, and non-upgradeable by design.
