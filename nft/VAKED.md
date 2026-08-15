# VAKED — a mineable ERC-20 (EIP-918 / 0xBitcoin pattern)

**Lane B · token rollout · Polygon mainnet (EVM)** · contract: `nft/VAKED.sol`

VAKED is a fair-launched, proof-of-work-mined ERC-20 token on Polygon,
following the canonical EIP-918 / 0xBitcoin pattern: solve a keccak256
challenge, mint a block reward, and let an on-chain difficulty adjustment
converge the mint cadence toward a fixed block interval. It is **not**
staking-marketing, not an NFT, and not an investment (see disclosure below).

## Token

| Field | Value |
|-------|-------|
| Name | VAKED |
| Symbol | `VAKED` |
| Standard | ERC-20 (OpenZeppelin 5.x, `^0.8.24`) |
| Chain | Polygon mainnet (EVM) |
| Max supply | **21,000,000 VAKED** (`MAX_SUPPLY = 21_000_000 * 1e18`), compile-time constant |
| Initial supply | **0** — grows only via `mint(uint256 nonce)` |
| Mint cost | Gas only — no fee, no payment, no treasury |

## Reward schedule (halving)

- Per-mint reward starts at **50 VAKED** (`INITIAL_REWARD = 50 * 1e18`).
- Halved once per **210,000 successful mints** (`REWARD_HALVING_INTERVAL`),
  Bitcoin-style: 50 → 25 → 12.5 → 6.25 → …
- Reward decays to zero after ~66 halvings (~13.9M mints); issuance then ends
  naturally. Because each halving is a floor division, cumulative supply
  approaches but never exceeds 21,000,000; `MAX_SUPPLY` is the hard cap.
  Floor-division loss leaves issuance ~5.46e-12 VAKED short of the cap, so the
  top-up guard (which would clamp an overshooting final mint to the cap
  exactly) never actually fires in practice.
- Total issuance is capped at the 21M constant — there is no infinite mint.

## Difficulty algorithm

- PoW check: `uint256(keccak256(challenge, msg.sender, nonce)) < miningTarget`.
  Binding to `msg.sender` blocks man-in-the-middle relay of solutions; binding
  to the round challenge blocks pre-mining.
- **Challenge**: `getChallengeNumber() = challengeNumber` — the stored base seed,
  rotated after every successful mint. The challenge persists across blocks, so
  a solution stays valid from fetch until the next mint (no per-block race).
- **Target**: `miningTarget`, initialized to `2^232` (~1 winning hash in 2^24,
  ≈ 16.8M hashes — a modest CPU mints in minutes at launch).
- **Adjustment epoch**: every **1,024 mints** (`ADJUSTMENT_EPOCH`), toward a
  fixed **60-block average interval** between mints (`TARGET_BLOCK_INTERVAL`;
  expected span per epoch = 1,024 × 60 = 61,440 blocks).
- **Smooth**: each adjustment moves the target *halfway* toward the ideal for
  the observed interval, and the observed interval is clamped to
  [15,360, 245,760] blocks so one epoch can never change difficulty by more
  than 4× — never an all-or-nothing jump.
- **Safety rails**: `miningTarget ∈ [2^200, 2^232]` (also keeps every
  adjustment step overflow-safe).

Informational views for whitepaper/frontend: `getChallengeNumber()`,
`getMiningDifficulty()` (`type(uint256).max / miningTarget`), `getMiningReward()`,
`getMiningTarget()`, `getMintableSupply()`, plus `epochCount()`, `miningTarget()`,
`maxSupply()`.

## Fair-launch checklist

Verifiable on-chain, in the source, and on PolygonScan:

- [x] **No premine** — total supply starts at 0 and grows only through the
      proof-of-work `mint()`.
- [x] **No team allocation, no presale, no airdrop, no marketing reserve** —
      there is no balance seeded anywhere and no constructor argument that
      could create one.
- [x] **Single mint entry point** — `mint(uint256 nonce)` is the only mint;
      ERC-20's internal `_mint` is called from nowhere else.
- [x] **Fixed max supply** — 21,000,000 VAKED, a compile-time constant.
- [x] **Ownership renounced to the zero address** — after `renounceOwnership()`
      (the only privileged function, inherited from OpenZeppelin `Ownable`),
      `owner() == address(0)` and the contract is fully permissionless: no
      admin, no parameters, no upgrade path.
- [x] **No tax, no pause, no blacklist, no proxy/upgrade, no burn-for-price-
      support** — the token surface is ERC-20 transfers + the PoW mint.
- [x] **Verified source** — deploy, then verify on PolygonScan so the live
      bytecode is publicly matched to this source before the first mint; the
      only constructor inputs are the public name/symbol.

Deployment steps (one-off, public): deploy `VAKED` → verify source on
PolygonScan → run several live mints and confirm the first difficulty
adjustment (mint #1024) succeeds → then call `renounceOwnership()`. Do not
renounce in the same transaction as deployment — there is no rescue path once
ownership is gone. No other setup exists; the contract is usable immediately.

## Mining

1. Call `getChallengeNumber()` to fetch the current round challenge and
   `getMiningTarget()` for the bound.
2. Search nonces: increment `nonce` until
   `uint256(keccak256(challenge, <your address>, nonce)) < miningTarget`.
3. Submit `mint(nonce)` (gas only). The round rotates after every successful
   mint, so re-fetch the challenge before mining again.

##  Not an investment

VAKED is a proof-of-work experiment, not a security and not an investment.
Holding VAKED grants **no financial rights, no ownership, no dividends, no
governance, and no claim against any person or entity**. The token has no
backing, no revenue, and no promised utility beyond being transferable by
whoever holds it. Market value may go to zero at any time, and there is no
mechanism, promise, or party that can prevent that. Mine it because the
mechanics interest you — not because you expect it to be worth anything.
