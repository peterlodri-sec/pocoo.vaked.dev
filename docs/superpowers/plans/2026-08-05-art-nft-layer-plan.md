# NFT Layer on art.vaked.dev — Plan

Date: 2026-08-05
Status: Phase 0  + Phase 1  done — see `docs/superpowers/specs/2026-08-05-art-nft-layer-design.md`

## Decisions (confirmed)

- Chain: **Polygon** (test: Amoy)
- Mint price: **0.001 POL** fee, collected in contract, owner withdraws to treasury
- Treasury: **placeholder** — set real address at deploy / via setTreasury
- Contract name: **PaintingsForSecrets** (PFS)

## Phase 1 deliverables (done)

- `nft/PaintingsForSecrets.sol` — compiles clean (solc 0.8.33 + OZ 5.6.1), bytecode 12,596 B
- `nft/strokeToSVG.js` — deterministic strokes→SVG encoder (ESM), spray seeded
- `nft/test-stroke-to-svg.js` — ALL PASS

## Phase 2 onward — see spec + original todo below

## Context

art.vaked.dev = single static `index.html` at `pocoo.vaked.dev/art/`, zero build
step, served from GitHub Pages. A painting is `strokes[]` (x, y, tool, color,
size) + `secret` + colors — compact, deterministic, re-renderable. Gallery is
client-side (localStorage, 42 cap) + 2 seeded works (MELTING / NECTAR for Chlo).

Site ethos: "the oldest economy · art for truth". Library-wide frame:
attestation tokens on Ethereum L2, proof-of-presence, sponsor = mesh node, no
platform / no extraction.

Goal: extend the economy of secrets on-chain without bolting on a marketplace.

## Brainstorm (ideas)

1. **The painting IS the seed.** Mint the stroke data, not a PNG. Token URI is a
   self-rendering SVG built from `strokes[]`, fully on-chain. No IPFS, no CDN,
   nothing to extract. Renderable by anyone, anywhere, forever.
2. **A secret in custody.** Minting = taking custody of a truth. Optional reveal
   mechanic: secret hidden in URI until first transfer/purchase.
3. **1-of-1 vs editions.** Paintings → ERC-721 (unique). Parallel ERC-1155 layer
   for "mesh node" sponsor badges (ties to the library's sponsor promise).
4. **Gift mint (angelic layer).** Mint a painting *for someone*, sealed,
   claimable only by them. Home for the private/for-Chlo/for-family works.
5. **Proof-of-presence mint.** Free gas-only stamp: "I was here in the garden".
6. **Royalties feed the kingdom (EIP-2981).** Secondary sales flow to treasury.
7. **Zero-dependency frontend.** Keep it one file. Plain `window.ethereum`
   (MetaMask / Coinbase / Frame) + ABI-only embed. No build step.

## Design

| Decision | Recommendation | Why |
|---|---|---|
| Chain | Base L2 (alt: Polygon) | ~$0.01/mint, Coinbase-wallet friendly, full EVM. |
| Standard | ERC-721 (+ ERC-1155 badge later) | Paintings are unique. |
| Metadata/art | On-chain data-URI (SVG + JSON) | Zero external dependency. |
| Rendering | Client SVG → same canvas draw code | Deterministic, reuses redraw(). |
| Royalties | EIP-2981, 5% → treasury | Feeds the mesh. |
| Mint price | 0 + gas (paintings); optional badge fee | Secrets are free; badges are revenue. |
| Contract | `PaintingsForSecrets` (single-file Solidity) | Simple, auditable. |
| Wallets | window.ethereum injected | MetaMask / Coinbase / Frame. |
| Testnet | Base Sepolia | Free faucet, same code path. |

### Contract shape (sketch)

```
PaintingsForSecrets (ERC-721 + EIP-2981)
  mint(seedHash, secret, title, addressTo)
    → tokenId = counter++
    → _tokenURIs[tokenId] = buildURI(strokes, title)  // SVG + JSON, on-chain
    → secret sealed; revealed on first transfer/purchase
  tokenURI(id) → data-URI SVG + metadata (secret when revealed)
  royalties: 5% to treasury
  gift mint: mint(..., addressTo) → locked until claim
```

### Frontend shape (art/index.html)

- Toolbar: `⛓ mint` (mint current canvas), `✉️ gift` (mint to address), status
  chip (chain + wallet).
- Gallery: "on-chain" ✓ + token ID; minted work shows token URI / explorer link.
- `strokeToSVG()` converts `strokes[]` → `<path>`/`<circle>` SVG.

## Human todo

### Phase 0 — Decisions
- [ ] Chain (recommended: Base mainnet; Base Sepolia for tests)
- [ ] Treasury wallet address + royalty % (5%)
- [ ] Contract name (`PaintingsForSecrets`)
- [ ] Mint price (free + gas, or tiny fee)

### Phase 1 — Contract
- [ ] Write `PaintingsForSecrets.sol` (ERC-721 + EIP-2981 + sealed-secret + gift-mint)
- [ ] Write SVG encoder (strokes → SVG; port from redraw() logic)
- [ ] Unit-test locally (Foundry or Hardhat): mint → tokenURI → render → reveal

### Phase 2 — Deploy + verify (Polygon mainnet per confirmed decisions; Amoy testnet first)
- [x] Contract compiled + ABI selectors verified (solc 0.8.33 + OZ 5.6.1, bytecode 12,596 B)
- [ ] Deploy to Amoy; mint 1 test token; verify render
- [ ] Deploy to Polygon mainnet; verify on Polygonscan
- [ ] Set real treasury (`setTreasury`) + contract address into `art/index.html` (`PFS_ADDRESS`)

### Phase 3 — Frontend integration
- [x] `art/chain.js` vault (PBKDF2 210k → AES-256-GCM) + legacy EIP-155 signing + RPC fallbacks — ALL PASS (byte-identical to ethers v6, recovers signer, low-s)
- [x] `art/vendor/chain-crypto.js` vendored noble v2 + js-sha3 (no CDN; CSP-compliant)
- [x] Hybrid wallet UI in `index.html`: MetaMask path + in-page create/unlock/lock/export (jsdom page test ALL PASS)
- [x] `⛓ mint current` / `✉️ gift to address` — both paths (ethereum + in-page vault), explorer link
- [x] Gallery mint badges + `_headers` `connect-src` for Polygon RPC fallbacks
- [ ] Deploy contract, then flip `PFS_ADDRESS` placeholder (only remaining frontend gate)

### Phase 4 — Test end-to-end
- [ ] Mint a real painting on Amoy; render from tokenURI alone (fresh browser)
- [ ] Confirm reveal mechanic (secret readable only after transfer)
- [ ] Fresh-browser test (no localStorage): seeded works + gallery still work

### Phase 5 — Ship
- [ ] First real mint on Polygon mainnet (candidate: MELTING for Chlo, sealed secret "melting — for Chlo")
- [ ] OpenSea collection auto-lists — verify
- [ ] Push + publish (Pages auto-builds; .nojekyll in place)

### Phase 6 — Follow-on (optional)
- [ ] ERC-1155 "mesh node" sponsor badge
- [ ] Proof-of-presence visit stamp
- [ ] Royalty flow check after first secondary sale

## Decisions (Phase 0, confirmed — see design doc)

1. Chain: **Polygon mainnet** (test: Amoy `0x13882`). Reason: dirt-cheap gas, OpenSea auto-listing, 0.001 POL fee is human-scale for "oldest economy".
2. Treasury wallet: **not published yet** — constructor arg / `setTreasury()` post-deploy; EIP-2981 5% royalty to it (mirrors Chlo's 5% tip-back).
3. Mint fee: **0.001 POL** (`mintFee`).
4. Contract name: **PaintingsForSecrets (PFS)**.
