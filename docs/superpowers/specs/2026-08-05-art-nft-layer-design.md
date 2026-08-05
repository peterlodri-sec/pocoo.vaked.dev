# NFT Layer on art.vaked.dev — Design Spec

Date: 2026-08-05
Status: Implementation-ready (Phase 0 + Phase 1 done)

## Decisions (Phase 0, confirmed)

| Decision | Value |
|---|---|
| Chain | Polygon (test: Polygon Amoy) |
| Standard | ERC-721 + EIP-2981 |
| Mint price | Tiny fee — 0.001 POL (`mintFee`), collected in contract, `withdraw()` to treasury |
| Treasury | Placeholder — set real address at deploy (`constructor` arg, or `setTreasury()` post-deploy) |
| Contract name | `PaintingsForSecrets` (symbol `PFS`) |
| Art storage | Fully on-chain data-URI SVG built from painter's strokes. No IPFS, no platform. |
| Secret | Sealed in metadata until first transfer or `reveal()` |
| Gift layer | `giftMint()` → token locked at contract, claimable only by intended recipient |

## Files

| Path | Purpose |
|---|---|
| `nft/PaintingsForSecrets.sol` | The contract (source of truth). |
| `nft/strokeToSVG.js` | Deterministic strokes → SVG encoder (ESM). Port of `redraw()`; spray uses seeded PRNG. |
| `nft/test-stroke-to-svg.js` | Node test for the encoder — run `node test-stroke-to-svg.js` (ALL PASS). |

Verified: compiles clean on solc 0.8.33 + OpenZeppelin 5.6.1; bytecode 12,596 B (< 24 KB EVM / 32 KB Polygon limits).

## Contract

Source: `nft/PaintingsForSecrets.sol`. Key surface:

```
mint(svgBody, strokes, title, secret) payable          → tokenId  (1-of-1, fee)
giftMint(svgBody, strokes, title, secret, recipient) payable → tokenId (locked)
claim(tokenId)                                          → recipient takes custody, secret reveals
reveal(tokenId)                                         → owner reveals secret early
tokenURI(tokenId)      view                             → data:application/json;base64 (image = on-chain SVG, secret field only when revealed)
strokesOf(tokenId)     view                             → raw stroke seed (the truth)
secretOf(tokenId)      view                             → secret (reverts while sealed)
royaltyInfo(tokenId, salePrice) view                    → (treasury, salePrice * 5%)
withdraw() onlyOwner                                    → sends accumulated fees to treasury
setTreasury(address) / setMintFee(uint) onlyOwner
```

On-chain artwork: metadata `image` is `data:image/svg+xml;base64,<svg 600x500>` where the SVG
body is assembled from `svgBody` passed at mint (produced by the encoder). The raw stroke
seed is stored and exposed via `strokesOf()` — anyone can reproduce the render from the chain.

Security posture:
- Fees accumulate in the contract; owner `withdraw()`s to treasury (no per-mint transfer → no reentrancy vector on payouts).
- Gift tokens are locked at the contract; `claim()` checks `sealedFor == msg.sender` then transfers via `_update` with self-auth.
- Secret reveal is one-way (no un-reveal). `_update` override reveals on any transfer of an existing token.
- Known limits (accepted): titles/secrets with `"` or backslash will break the JSON metadata (Sol → byte encoding is raw); keep them plain text. No reentrancy guard on `mint`/`giftMint` beyond state-before-call ordering (fine for this scope; add `nonReentrant` if it ever grows hooks).
- `royaltyInfo` multiplication: fine for POL-scale prices; guard against astronomic `salePrice` overflow not needed at 5%.

## Encoder contract (strokeToSVG.js)

Input shape = the exact in-app `strokes` array (each stroke = list of `{x, y, tool, color, size}`).
Canvas is 600×500, background `#0a0410`.

- `strokeToSVGBody(strokes)` → inner SVG elements (what goes into `mint(svgBody=...)`)
- `strokeToSVG(strokes)` → full `<svg>` (preview / local render)
- `mintPayload(strokes, title, secret)` → `{ svgBody, strokes, title, secret }` ready to ABI-encode

Rendering rules (faithful port):
- brush/eraser multi-point → one `<path>` per stroke, `stroke-linecap="round" stroke-linejoin="round"`, width = `size`, color = point color (eraser → `#0a0410`)
- single point → `<circle cx cy r=size/2 fill=color>`
- spray → seeded mulberry32 per stroke (`hashSeed(x*1000, y*1000, strokeIndex+1)`); `size*3` dots at ±2·size offset, radius `rand()*2`, opacity `0.3+rand()*0.4` — identical every render
- Note: the in-app canvas spray uses `Math.random()` (non-reproducible); the minted canonical render is the seeded one.

## Frontend integration (Phase 3 — spec)

Keep `art/index.html` a single dependency-free file. Wallet/key crypto lives in
`art/chain.js` + `art/vendor/chain-crypto.js` (esbuild bundle of noble curves v2 +
js-sha3) — no CDN, respects the `_headers` CSP (`script-src 'self'`).

1. Embed the encoder functions (copy the bodies of `strokeToSVG.js` — the file is ESM for node tests; inline the plain functions in the page).
2. Toolbar additions: `⛓ mint` and `✉️ gift`, plus status chips (wallet / chain).
3. Wallet (hybrid, per decision): `<script type="module" src="./chain.js">` exposes `window.chain`. Create/unlock/lock buttons prompt for the passphrase (PBKDF2-SHA256 210k → AES-256-GCM vault in localStorage; session key is memory-only; any failed unlock wipes the session as defense-in-depth). In-page keys are mint-ready immediately; optional "export private key" → MetaMask manual import.
4. Mint flow: build ABI payload with the inline encoder + `window.chain.signLegacyTx`/`sendRawTx` (or MetaMask `eth_sendTransaction` if unlocked there) to `mint(svgBody, strokes, title, secret)` with `value: mintFee`, gas from `eth_gasPrice`, `estimateGas * 2`, then poll `eth_getTransactionReceipt` and show a PolygonScan link.
5. Gallery: minted items get a `⛓ #id` badge (track `minted[dataUrl]` in localStorage alongside the painting; contract ownerOf lookups optional).
6. Gift flow: prompt for recipient address → `giftMint(...)`; show "sealed — only <address> can claim".
7. Copy: footer "the oldest economy · art for truth — now on-chain".

Deployed contract address + ABI constants go at the top of the script; add the
fallback RPCs (`polygon-rpc.com`, `polygon-bor-rpc.publicnode.com`,
`rpc.ankr.com/polygon`) to `connect-src` in `_headers`.

### chain.js verification notes (test-vault.mjs — ALL PASS)

- noble v2.2.0 defaults `prehash: true` → **must pass `prehash: false`** when
  signing a 32-byte digest, or the tx signature is over sha256(digest) (invalid
  on-chain; does not recover to sender).
- v2 `sign(..., { format: 'recovered' })` returns `[recovery, r, s]` (recovery
  **first**, unlike v1/earlier assumptions). Low-s is applied internally and the
  recovery bit already accounts for the low-s flip — do not re-normalize.
- `keccak_256` (js-sha3) utf8-encodes *strings*; hash `Uint8Array` for tx
  digests, but keep strings for EIP-55 checksum + function selectors.
- `hexToBytes` must left-pad odd-length hex (else truncates silently).
- With `prehash:false` the serialized tx is **byte-identical** to ethers v6
  `Wallet.signTransaction` (EIP-155 chainId preimage `[..., chainId, 0, 0]`).

## Deploy + verify (human steps)

### Local / Remix
1. Paste `PaintingsForSecrets.sol` into Remix (Solidity 0.8.24+, auto-imports OZ).
2. Constructor arg: treasury address (real one). Compile → Deploy on Amoy.
3. Mint a test painting with a small `svgBody` (generate via `node` + `mintPayload`), transfer it, confirm secret appears in `tokenURI`.

### Polygon Amoy (testnet)
- RPC: `https://rpc-amoy.polygon.technology` · chainId `0x13882`
- Faucet: Polygon Faucet (search "Polygon Amoy faucet")
- Verify: `polygonscan.com` Amoy (verification via Remix "Verify" or hardhat)

### Polygon mainnet
- RPC: `https://polygon-rpc.com` (or your provider) · chainId `0x89`
- Deploy, then verify source on Polygonscan (Flatten + OZ 5.6.1, Solidity 0.8.24+).
- Set real treasury if constructor used a placeholder (`setTreasury`).

### Test checklist (Phase 4)
- [ ] Mint on Amoy → `tokenURI` opens in fresh browser, painting renders, secret hidden
- [ ] Transfer the test token to a second wallet → secret now visible
- [ ] `giftMint` to a second wallet → `claim()` from that wallet works; other wallet's `claim()` reverts
- [ ] Fresh-browser gallery test (no localStorage): seeded works + gallery still render
- [ ] OpenSea collection auto-detection on mainnet after first real mint

## First real mint (Phase 5 candidate)
MELTING (for Chlo) as token #1, sealed secret "melting — for Chlo". This makes the first
on-chain token a truth about her, in the oldest economy.
