# NFT Layer on art.vaked.dev — Plan

Date: 2026-08-05
Status: Draft (Phase 0 decisions open)

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

### Phase 2 — Deploy + verify
- [ ] Deploy to Base Sepolia; mint 1 test token; verify render
- [ ] Deploy to Base mainnet; verify on Basescan
- [ ] Add contract address + ABI to `art/index.html`

### Phase 3 — Frontend integration
- [ ] `connect wallet` + chain-switch logic (window.ethereum)
- [ ] `⛓ mint current` — encode strokes[], send tx, show explorer link
- [ ] `✉️ gift to address` (sealed claim)
- [ ] Mark minted works in gallery (✓ + token ID)
- [ ] Keep dependency-free (no build step)

### Phase 4 — Test end-to-end
- [ ] Mint a real painting on Base Sepolia; render from tokenURI alone (fresh browser)
- [ ] Confirm reveal mechanic (secret readable only after transfer)
- [ ] Fresh-browser test (no localStorage): seeded works + gallery still work

### Phase 5 — Ship
- [ ] Deploy to Base mainnet; first real mint (candidate: MELTING for Chlo)
- [ ] OpenSea collection auto-lists — verify
- [ ] Update footer + index copy ("the oldest economy, now on-chain")
- [ ] Push + publish (Pages auto-builds; .nojekyll in place)

### Phase 6 — Follow-on (optional)
- [ ] ERC-1155 "mesh node" sponsor badge
- [ ] Proof-of-presence visit stamp
- [ ] Royalty flow check after first secondary sale

## Open questions (Phase 0)

1. Chain: Base vs Polygon vs other?
2. Treasury wallet address?
3. Mint fee: free + gas, or priced?
4. Contract name?
