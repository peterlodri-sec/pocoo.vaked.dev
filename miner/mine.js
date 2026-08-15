#!/usr/bin/env node
/**
 * VAKED PoW miner (EIP-918 style) — matches nft/VAKED.sol on main.
 *
 * The on-chain predicate is exactly:
 *
 *     uint256(keccak256(abi.encodePacked(challenge, msg.sender, nonce))) < miningTarget
 *
 * where challenge = getChallengeNumber() = challengeNumber (the stored base seed,
 *                      rotated after every successful mint — NOT per-block).
 *
 * VAKED.mint takes ONLY (uint256 nonce) — there is NO challenge_digest argument
 * (unlike classic EIP-918). The digest is computed inside the contract from the
 * live challenge + msg.sender. The challenge persists across blocks, so a
 * solution stays valid from fetch until the next mint. This miner mirrors that.
 *
 * Deps: ethers v6 + @noble/hashes/sha3 (the keccak backend ethers itself bundles —
 * no extra install). Hash loop is a hand-rolled single-block keccak using
 * @noble's keccakP permutation so the constant 52-byte prefix (challenge +
 * miner address) is absorbed once and only the 32-byte nonce is XORed in per try.
 *
 * Usage:
 *   node mine.js --dry-run                      # offline: find a nonce, no chain needed
 *   node mine.js --dry-run --target 2^240       # fast smoke test (raise the bound)
 *   node mine.js --rpc <url> --contract <addr> --key <privkey>   # submit mint(nonce)
 */
'use strict';

const { parseArgs } = require('node:util');
const { availableParallelism } = require('node:os');
const { Worker } = require('node:worker_threads');

const ethers = require('ethers');

// ---- keccakP: use @noble/hashes (ethers' own bundled keccak backend), fall back
// to ethers.keccak256 per-hash if it cannot be resolved. -------------------------
let keccakP = null;
try {
  ({ keccakP } = require('@noble/hashes/sha3'));
} catch {
  keccakP = null; // slow path: ethers.keccak256, ~40k H/s, still correct
}

// ---- Exact numeric params extracted from nft/VAKED.sol (main)
const MAX_SUPPLY             = 21_000_000n * 10n ** 18n;
const INITIAL_REWARD         = 50n * 10n ** 18n;
const REWARD_HALVING_INTERVAL= 210_000n;
const ADJUSTMENT_EPOCH       = 1024n;
const TARGET_BLOCK_INTERVAL  = 60n;
const EXPECTED_BLOCKS_PER_EPOCH = ADJUSTMENT_EPOCH * TARGET_BLOCK_INTERVAL; // 61_440
const MIN_ACTUAL_BLOCKS      = EXPECTED_BLOCKS_PER_EPOCH / 4n;              // 15_360
const MAX_ACTUAL_BLOCKS      = EXPECTED_BLOCKS_PER_EPOCH * 4n;              // 245_760
const INITIAL_MINING_TARGET  = 1n << 232n;
const MIN_MINING_TARGET      = 1n << 200n;
const MAX_MINING_TARGET      = 1n << 232n;

// ---- Difficulty adjustment — mirrors _adjustDifficulty() exactly ---------------
function adjustDifficulty(currentTarget, actualBlocks) {
  let ab = actualBlocks;
  if (ab > MAX_ACTUAL_BLOCKS) ab = MAX_ACTUAL_BLOCKS;
  if (ab < MIN_ACTUAL_BLOCKS) ab = MIN_ACTUAL_BLOCKS;
  const idealTarget = (currentTarget * ab) / EXPECTED_BLOCKS_PER_EPOCH; // integer div, overflow-safe
  let newTarget = (currentTarget + idealTarget) / 2n;            // move halfway
  if (newTarget < MIN_MINING_TARGET) newTarget = MIN_MINING_TARGET;
  if (newTarget > MAX_MINING_TARGET) newTarget = MAX_MINING_TARGET;
  return newTarget;
}

// ---- Reward schedule — mirrors getMiningReward() exactly -----------------------
function miningReward(epochCount) {
  const halvings = epochCount / REWARD_HALVING_INTERVAL;
  if (halvings >= 255n) return 0n;
  return INITIAL_REWARD >> halvings;
}

// ---- Challenge synthesis for dry-run (mirrors constructor + getChallengeNumber)
//   constructor:     challengeNumber = keccak256("VAKED genesis", block.number,
//                    blockhash(block.number-1), msg.sender)
//   getChallengeNumber() = challengeNumber (the seed itself; not per-block)
function genesisChallengeNumber() {
  // replicate the constructor at block 1, prev hash zero, deployer 0x..0001
  return ethers.keccak256(
    ethers.solidityPacked(
      ['string', 'uint256', 'bytes32', 'address'],
      ['VAKED genesis', 1n, '0x' + '00'.repeat(32), '0x0000000000000000000000000000000000000001']
    )
  );
}
function synthesizeChallenge({ seed }) {
  // getChallengeNumber() view: returns challengeNumber directly
  return seed;
}

// ---- Target parsing (hex, decimal, or 2^N / 1<<N) -------------------------------
function parseTarget(s) {
  const m = /^(?:2\^|1\s*<<\s*)(\d+)$/.exec(s.trim());
  if (m) return 1n << BigInt(m[1]);
  if (/^0x[0-9a-fA-F]+$/.test(s.trim())) return BigInt(s.trim());
  if (/^\d+$/.test(s.trim())) return BigInt(s.trim());
  throw new Error(`invalid target: ${s} (use hex, decimal, or 2^N)`);
}

// ---- Core digest builder: build the 200-byte keccak state for a challenge+address
// Input = abi.encodePacked(challenge[32], address[20], nonce[32]) = 84 bytes, which
// fits in ONE keccak-256 block (rate 136 bytes) with padding 0x01..0x80.
// We pre-absorb the constant prefix (challenge+address) + padding once; per nonce we
// copy the state and XOR the 32 nonce bytes at offset 52, then run one permutation.
function buildBaseState(challengeHex, addressHex) {
  const ch = ethers.getBytes(challengeHex);          // 32 bytes
  const ad = ethers.getBytes(addressHex);            // 20 bytes
  const state = new Uint8Array(200);                 // 1600-bit keccak state
  state.set(ch, 0);
  state.set(ad, 32);
  state[84] ^= 0x01;                                 // keccak padding
  state[135] ^= 0x80;                                // final 0x80
  return state;
}

// Target as four big-endian u64 words (for the worker's lexicographic compare).
function targetToWords(target) {
  const t = ethers.toBeHex(target, 32);
  const b = ethers.getBytes(t);
  const dv = new DataView(b.buffer, b.byteOffset, 32);
  return [0, 1, 2, 3].map((w) => dv.getBigUint64(w * 8, false));
}

// ---- Worker source (runs with eval:true so the whole miner stays one file) ------
function workerSource() {
  return `
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { keccakP } = require(workerData.keccakPath);

const base = new Uint8Array(workerData.baseBytes);
const scratch = new Uint8Array(200);
const s32 = new Uint32Array(scratch.buffer, scratch.byteOffset, 50);
const dv = new DataView(scratch.buffer);
const targetWords = workerData.targetWords;
const stride = BigInt(workerData.stride);
const batchSize = workerData.batchSize;
let stop = false;
parentPort.on('message', () => { stop = true; });

function writeNonce(nonceBig) {
  if (nonceBig < (1n << 64n)) {
    // fast path: only the low 8 bytes (offset 76..83) differ from base (zeros)
    dv.setBigUint64(76, nonceBig, false);
  } else {
    // general path: all 32 nonce bytes, big-endian at offset 52
    for (let i = 0; i < 4; i++) {
      dv.setBigUint64(52 + i * 8, (nonceBig >> BigInt((3 - i) * 64)) & 0xffffffffffffffffn, false);
    }
  }
}

function belowTarget() {
  for (let w = 0; w < 4; w++) {
    const d = dv.getBigUint64(w * 8, false);
    if (d < targetWords[w]) return true;
    if (d > targetWords[w]) return false;
  }
  return false;
}

let nonce = BigInt(workerData.startNonce);
let hashed = 0;

// warmup: let JIT compile keccakP before the clock starts (short runs otherwise
// report startup noise as "hashrate")
for (let w = 0; w < 2000; w++) {
  scratch.set(base);
  writeNonce(nonce);
  keccakP(s32, 24);
  hashed++;
  nonce += stride;
}

const t0 = Date.now();
let hashedTimed = 0;
while (!stop) {
  scratch.set(base);
  writeNonce(nonce);
  keccakP(s32, 24);
  hashed++;
  hashedTimed++;
  if (belowTarget()) {
    parentPort.postMessage({ type: 'found', nonce: nonce.toString(), hashed: hashedTimed, elapsedMs: Date.now() - t0 });
    break;
  }
  nonce += stride;
  if (hashed >= batchSize) {
    parentPort.postMessage({ type: 'hashes', hashed });
    hashed = 0;
  }
}
`;
}

// ---- CLI ------------------------------------------------------------------------
const { values } = parseArgs({
  options: {
    'dry-run':        { type: 'boolean' },
    'rpc':            { type: 'string' },
    'contract':       { type: 'string' },
    'key':            { type: 'string' },
    'challenge':      { type: 'string' },   // bytes32 hex; default: synthesized
    'address':        { type: 'string' },   // miner address for dry-run digest binding
    'target':         { type: 'string' },   // override mining bound (hex / decimal / 2^N)
    'threads':        { type: 'string' },
    'max-nonces':     { type: 'string' },   // stop after N tries even if unsolved
    'timeout':        { type: 'string' },   // stop after N seconds even if unsolved
    'seed':           { type: 'string' },   // challengeNumber base seed for dry-run
    'help':           { type: 'boolean' },
  },
});

function usage() {
  console.log(`VAKED PoW miner (mirrors nft/VAKED.sol on main)

USAGE
  node mine.js --dry-run [options]
  node mine.js --rpc <url> --contract <addr> --key <privkey> [options]

DRY-RUN (no chain needed)
  --target <hex|dec|2^N>   mining bound (default: contract INITIAL_MINING_TARGET = 2^232)
  --challenge <hex32>      round challenge to mine against (default: genesis seed)
  --address <hex20>        miner address for digest binding (default: 0x00..01)
  --seed <hex32>           challengeNumber base seed for dry-run

LIVE (submits mint(nonce) — only if a chain is reachable)
  --rpc <url>              JSON-RPC endpoint
  --contract <addr>        deployed VAKED address
  --key <privkey>          signer private key (0x-prefixed hex)

COMMON
  --threads <N>            parallel workers (default: availableParallelism = ${availableParallelism()})
  --max-nonces <N>         stop after N total hashes even if unsolved
  --timeout <sec>          stop after N seconds even if unsolved
  --help                   this message

NOTE: at the launch target 2^232 the expected search is ~2^24 (~16.8M) hashes
(~2-3 min multi-thread). Use --target 2^240 or higher for a sub-second smoke
test.`);
}

if (values.help) { usage(); process.exit(0); }

const dryRun = !!values['dry-run'];
const live = !!(values.rpc && values.contract && values.key);
if (!dryRun && !live) { usage(); process.exit(1); }

const threads = values.threads ? Math.max(1, parseInt(values.threads, 10)) : availableParallelism();
const maxNonces = values['max-nonces'] ? BigInt(values['max-nonces']) : null;
const timeoutSec = values.timeout ? parseFloat(values.timeout) : null;

// ---- Resolve challenge + target ------------------------------------------------
if (dryRun) {
  const minerAddressHex = values.address || '0x0000000000000000000000000000000000000001';
  let challengeHex;
  if (values.challenge) {
    challengeHex = values.challenge;
  } else {
    // getChallengeNumber() returns the stored seed directly (no per-block mix).
    challengeHex = synthesizeChallenge({ seed: values.seed || genesisChallengeNumber() });
  }
  const targetBig = values.target ? parseTarget(values.target) : INITIAL_MINING_TARGET;
  runDryRun(challengeHex, minerAddressHex, targetBig).catch((e) => {
    console.error('error:', e.message);
    process.exit(1);
  });
} else {
  // live: fetch from chain
  runLive().catch((e) => { console.error('error:', e.message); process.exit(1); });
}

// ---- Mining engine ---------------------------------------------------------------
async function mineSearch({ challengeHex, minerAddressHex, targetBig }) {
  const base = buildBaseState(challengeHex, minerAddressHex);
  const targetWords = targetToWords(targetBig);
  const keccakPath = require.resolve('@noble/hashes/sha3');

  let totalHashed = 0n;
  const startTime = Date.now();
  let lastReport = startTime;
  const workers = [];

  return new Promise((resolve, reject) => {
    const stopWorkers = () => { for (const w of workers) w.postMessage({ stop: true }); };
    const terminateWorkers = () => { for (const w of workers) { try { w.terminate(); } catch {} } };

    const report = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = elapsed > 0 ? Math.round(Number(totalHashed) / elapsed) : 0;
      if (Date.now() - lastReport >= 1500) {
        process.stdout.write(`\r  searched ${totalHashed.toLocaleString()} nonces  @ ${rate.toLocaleString()} H/s  (${elapsed.toFixed(0)}s)`);
        lastReport = Date.now();
      }
    };

    if (keccakP === null) {
      // Fallback: no @noble/hashes — do it single-threaded with ethers.keccak256.
      console.log('  [fallback] @noble/hashes not resolvable; using ethers.keccak256 (slow)');
      let nonce = 0n;
      const searchLoop = setInterval(() => {
        const h = ethers.keccak256(
          ethers.solidityPacked(['bytes32', 'address', 'uint256'], [challengeHex, minerAddressHex, nonce])
        );
        totalHashed++;
        if (BigInt(h) < targetBig) {
          clearInterval(searchLoop);
          resolve({ nonce, digest: h, target: targetBig, hashed: totalHashed, elapsed: (Date.now() - startTime) / 1000 });
        } else {
          nonce++;
          if (maxNonces !== null && totalHashed >= maxNonces) { clearInterval(searchLoop); resolve(null); }
          if (timeoutSec !== null && (Date.now() - startTime) / 1000 >= timeoutSec) { clearInterval(searchLoop); resolve(null); }
          report();
        }
      }, 0);
      return;
    }

    // Fast path: N workers, each striding by N.
    for (let w = 0; w < threads; w++) {
      const worker = new Worker(workerSource(), {
        eval: true,
        workerData: {
          keccakPath,
          baseBytes: Array.from(base),
          startNonce: w,
          stride: threads,
          targetWords,
          batchSize: 65536,
        },
      });
      workers.push(worker);
      worker.on('message', (msg) => {
        if (msg.type === 'found') {
          const nonce = BigInt(msg.nonce);
          // verify independently with ethers before reporting
          const digest = ethers.keccak256(
            ethers.solidityPacked(['bytes32', 'address', 'uint256'], [challengeHex, minerAddressHex, nonce])
          );
          if (BigInt(digest) < targetBig) {
            terminateWorkers();
            resolve({ nonce, digest, target: targetBig, hashed: BigInt(msg.hashed), elapsed: msg.elapsedMs / 1000 });
          }
        } else if (msg.type === 'hashes') {
          totalHashed += BigInt(msg.hashed);
          // early stop checks
          if (maxNonces !== null && totalHashed >= maxNonces) { stopWorkers(); resolve(null); }
          if (timeoutSec !== null && (Date.now() - startTime) / 1000 >= timeoutSec) { stopWorkers(); resolve(null); }
          report();
        }
      });
      worker.on('error', reject);
    }
  });
}

// ---- Dry-run driver --------------------------------------------------------------
async function runDryRun(challengeHex, minerAddressHex, targetBig) {
  console.log('VAKED PoW dry-run (offline)');
  console.log(`  challenge : ${challengeHex}`);
  console.log(`  miner addr: ${minerAddressHex}`);
  console.log(`  target    : ${targetBig.toString()} = 2^${targetBig.toString(2).length - 1} (contract init: 2^232)`);
  console.log(`  threads   : ${threads}${keccakP === null ? ' [fallback: ethers.keccak256]' : ''}`);
  console.log('  solving   :');

  // If the bound is at/near launch difficulty, warn about expected wall time.
  const expectedHashes = (1n << 256n) / targetBig;
  if (expectedHashes > 100_000_000n) {
    console.log(`  NOTE: expected search at this bound ~${expectedHashes.toString()} hashes; pure-JS is ~1e5 H/s/thread,`);
    console.log('        so this can take hours. Use --target 2^240 (or higher) for a fast smoke test.');
  }

  const result = await mineSearch({ challengeHex, minerAddressHex, targetBig });
  process.stdout.write('\n');

  if (!result) {
    console.log('  -> no solution within budget (raise --target / --max-nonces / --timeout)');
    process.exit(1);
  }
  const rate = result.elapsed > 0 ? Math.round(Number(result.hashed) / result.elapsed) : 0;

  console.log('\nSOLUTION');
  console.log(`  nonce    : ${result.nonce}`);
  console.log(`  digest   : ${result.digest}`);
  console.log(`  hash     : ${result.digest}`);
  console.log(`  target   : ${result.target.toString()}  (digest < target: ${BigInt(result.digest) < result.target})`);
  console.log(`  searched : ${result.hashed.toLocaleString()} nonces in ${result.elapsed.toFixed(2)}s`);
  console.log(`  hashrate : ${rate.toLocaleString()} H/s`);

  // Feasibility math at the true launch target:
  const expectedLaunch = (1n << 256n) / INITIAL_MINING_TARGET; // ~2^24
  console.log(`\n  expected search at real launch target (2^232): ~${expectedLaunch.toString()} hashes`);
  if (rate > 0) {
    console.log(`  → ~${(Number(expectedLaunch) / rate / 3600).toFixed(1)} hours single-thread at ${rate.toLocaleString()} H/s`);
  }
  console.log(`  reward at epoch 0: ${ethers.formatEther(miningReward(0n))} VAKED (halves every ${REWARD_HALVING_INTERVAL} mints)`);
  process.exit(0);
}

// ---- Live driver ------------------------------------------------------------------
async function runLive() {
  const provider = new ethers.JsonRpcProvider(values.rpc);
  const wallet = new ethers.Wallet(values.key, provider);
  const addressHex = await wallet.getAddress();

  const abi = [
    'function getChallengeNumber() view returns (bytes32)',
    'function miningTarget() view returns (uint256)',
    'function mint(uint256) returns (uint256)',
    'function epochCount() view returns (uint256)',
    'function getMiningReward() view returns (uint256)',
    'event Mint(address indexed from, uint256 rewardAmount, uint256 epochCount, bytes32 newChallengeNumber)',
  ];
  const contract = new ethers.Contract(values.contract, abi, wallet);

  const challengeHex = await contract.getChallengeNumber();
  const targetBig = await contract.miningTarget();
  const epoch = await contract.epochCount();
  const reward = await contract.getMiningReward();

  console.log('VAKED PoW live');
  console.log(`  rpc       : ${values.rpc}`);
  console.log(`  contract  : ${values.contract}`);
  console.log(`  miner     : ${addressHex}`);
  console.log(`  challenge : ${challengeHex}`);
  console.log(`  target    : ${targetBig.toString()} = 2^${targetBig.toString(2).length - 1}`);
  console.log(`  epoch     : ${epoch.toString()}  (reward: ${ethers.formatEther(reward)} VAKED)`);
  console.log('  solving   :');

  const result = await mineSearch({ challengeHex, minerAddressHex: addressHex, targetBig });
  process.stdout.write('\n');
  if (!result) { console.log('  -> no solution within budget'); process.exit(1); }

  console.log(`  nonce     : ${result.nonce}`);
  console.log(`  digest    : ${result.digest}`);

  // NOTE: getChallengeNumber() returns the stored seed and persists across
  // blocks, so a solution stays valid from fetch until the next successful
  // mint. Submit promptly; if someone else mints first the challenge rotates.
  console.log('  submitting mint(nonce)...');
  const tx = await contract.mint(result.nonce);
  const receipt = await tx.wait();
  console.log(`  tx        : ${receipt.hash}`);
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === 'Mint') {
        console.log(`  Mint      : reward=${ethers.formatEther(parsed.args.rewardAmount)} VAKED, epoch=${parsed.args.epochCount.toString()}, newChallenge=${parsed.args.newChallengeNumber}`);
      }
    } catch { /* not our event */ }
  }
  process.exit(0);
}
