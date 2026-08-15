# VAKED PoW miner

A proof-of-work mining client for the **VAKED** token — an EIP-918-style
mineable ERC-20 (`nft/VAKED.sol` on `main`). Pure
engineering: the default path is fully offline, and the live path only
submits a transaction if you point it at a reachable chain.

## Setup

```bash
cd miner
npm i ethers          # ethers v6 (only dependency)
```

`@noble/hashes/sha3` (the keccak backend ethers itself bundles) is used for
the hot loop when resolvable; if not, the miner falls back to
`ethers.keccak256` (slower, still correct).

## Usage

```bash
node mine.js --dry-run                          # find a nonce offline, no chain needed
node mine.js --dry-run --target 2^240           # fast smoke test (raise the bound)
node mine.js --rpc <url> --contract <addr> --key <privkey>   # actually submit mint(nonce)
```

Common options: `--threads N` (default: `os.availableParallelism()`),
`--max-nonces N`, `--timeout <sec>`, `--help`.

**Dry-run defaults.** With no flags, `--dry-run` mines against a synthesized
challenge at the contract's exact launch bound `INITIAL_MINING_TARGET =
2^232`. At that bound the expected search is ~2^24 (~16.8M) hashes — pure-JS
keccak on this machine does ~300k H/s across 8 threads, i.e. ~1 minute per
solution. That is the contract's real launch difficulty; use `--target 2^240`
(expected ~2^16 hashes) or higher for a quick end-to-end check. The
digest/target math is identical regardless of the bound.

## The exact PoW formula implemented

From `nft/VAKED.sol` (main), verbatim:

```solidity
// mint() — the ONLY mint; no challenge_digest argument (unlike classic EIP-918)
function mint(uint256 nonce) external returns (uint256 rewardAmount) {
    bytes32 challenge = getChallengeNumber();
    require(
        uint256(keccak256(abi.encodePacked(challenge, msg.sender, nonce))) < miningTarget,
        "VAKED: digest does not meet target"
    );
    ...
}

// the round challenge — the stored seed, rotated after each successful mint:
function getChallengeNumber() public view returns (bytes32) {
    return challengeNumber;
}
```

So the miner computes, for each `nonce` (uint256, big-endian):

```
digest = keccak256(abi.encodePacked(challenge, minerAddress, nonce))     # 32 + 20 + 32 = 84 bytes
valid  = uint256(digest) < miningTarget
```

where `challenge = getChallengeNumber()` as above.

**Important divergence from EIP-918:** `VAKED.mint(uint256 nonce)` takes
**only the nonce** — there is no `challenge_digest` parameter. The digest is
recomputed inside the contract from the *live* `getChallengeNumber()` (the
stored `challengeNumber` seed, which rotates only on a successful mint) plus
`msg.sender`. Consequences:

1. A solution stays valid from fetch until the next mint (the challenge does
   not change per block), so there is no per-block race.
2. The digest binds `msg.sender`, so nonces cannot be relayed between
   addresses.

### Target

`miningTarget` starts at `2^232` and is bounded to `[2^200, 2^232]`:

```solidity
uint256 internal constant INITIAL_MINING_TARGET = 1 << 232;
uint256 internal constant MIN_MINING_TARGET     = 1 << 200;
uint256 internal constant MAX_MINING_TARGET     = 1 << 232;
```

### Difficulty adjustment (every 1024 mints)

```solidity
uint256 internal constant ADJUSTMENT_EPOCH        = 1024;   // mints per epoch
uint256 internal constant TARGET_BLOCK_INTERVAL   = 60;     // blocks per mint
uint256 internal constant EXPECTED_BLOCKS_PER_EPOCH = ADJUSTMENT_EPOCH * TARGET_BLOCK_INTERVAL; // 61_440
uint256 internal constant MIN_ACTUAL_BLOCKS       = EXPECTED_BLOCKS_PER_EPOCH / 4;  // 15_360
uint256 internal constant MAX_ACTUAL_BLOCKS       = EXPECTED_BLOCKS_PER_EPOCH * 4;  // 245_760

function _adjustDifficulty() internal {
    uint256 actualBlocks = block.number - lastAdjustmentBlock;
    if (actualBlocks > MAX_ACTUAL_BLOCKS) actualBlocks = MAX_ACTUAL_BLOCKS;
    if (actualBlocks < MIN_ACTUAL_BLOCKS) actualBlocks = MIN_ACTUAL_BLOCKS;
    uint256 idealTarget = (miningTarget * actualBlocks) / EXPECTED_BLOCKS_PER_EPOCH; // integer div, overflow-safe
    uint256 newTarget = (miningTarget + idealTarget) / 2;              // halfway
    if (newTarget < MIN_MINING_TARGET) newTarget = MIN_MINING_TARGET;
    if (newTarget > MAX_MINING_TARGET) newTarget = MAX_MINING_TARGET;
    miningTarget = newTarget;
    lastAdjustmentBlock = block.number;
}
```

A miner only needs the current `miningTarget` (read via the `miningTarget()`
view) — the adjustment is applied by the contract after each 1024th mint.

### Reward / halving / cap

```solidity
uint256 public constant MAX_SUPPLY = 21_000_000 * 1e18;
uint256 internal constant INITIAL_REWARD = 50 * 1e18;
uint256 internal constant REWARD_HALVING_INTERVAL = 210_000;   // mints between halvings

function getMiningReward() public view returns (uint256) {
    uint256 halvings = epochCount / REWARD_HALVING_INTERVAL;
    if (halvings >= 255) return 0;
    return INITIAL_REWARD >> halvings;
}
```

50 VAKED per mint at epoch 0, halved every 210,000 mints (50 → 25 → 12.5 →
…), capped by `MAX_SUPPLY`.

## How the miner works

- The digest input is `challenge (32B) || minerAddress (20B) || nonce (32B)`
  = 84 bytes, which fits in a single keccak-256 block (rate 136 bytes) with
  padding. The constant 52-byte prefix (challenge + address) and the padding
  are absorbed once into a 200-byte keccak state; each attempt only copies the
  state, XORs the 32 nonce bytes at offset 52, and runs one keccak-f[1600]
  permutation (`@noble/hashes`' `keccakP`).
- The comparison `uint256(digest) < target` is done as a lexicographic
  big-endian byte compare against the target's four u64 words — no BigInt
  formatting in the hot loop.
- Workers (Node `worker_threads`, `eval:true` so the file stays single) each
  stride by `--threads`; the main thread independently re-verifies any found
  nonce with `ethers.solidityPackedKeccak256` before reporting it.

## Live submission

```bash
node mine.js --rpc https://polygon-rpc.com --contract <addr> --key <privkey>
```

Fetches `getChallengeNumber()` + `miningTarget()` from the contract, mines a
nonce for your address, then submits `mint(nonce)` and prints the `Mint`
event. Because the challenge persists until the next mint, submit promptly —
if someone else mints first, the challenge rotates and your nonce goes stale.
