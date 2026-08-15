// VAKED regression spec — cold-start deadlock fix (nft/VAKED.sol, main)
// In-process hardhat tests (hardhat_setStorageAt plays the role of forge vm.store).
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

// Exact params mirrored from nft/VAKED.sol
const MAX_SUPPLY          = 21_000_000n * 10n ** 18n;
const INITIAL_REWARD      = 50n * 10n ** 18n;
const HALVING_INTERVAL    = 210_000n;
const ADJUSTMENT_EPOCH    = 1024n;
const EXPECTED_BLOCKS     = ADJUSTMENT_EPOCH * 60n; // 61_440
const MIN_ACTUAL          = EXPECTED_BLOCKS / 4n;   // 15_360
const MAX_ACTUAL          = EXPECTED_BLOCKS * 4n;   // 245_760
const INITIAL_TARGET      = 1n << 232n;
const MIN_TARGET          = 1n << 200n;
const MAX_TARGET          = 1n << 232n;

// storage slots (empirically verified): 0=_balances(mapping) 1=_allowances(mapping)
// 2=_totalSupply 3=_name 4=_symbol 5=_owner 6=epochCount 7=challengeNumber
// 8=miningTarget 9=lastAdjustmentBlock
const SLOT = { totalSupply: 2, owner: 5, epochCount: 6, challengeNumber: 7, miningTarget: 8, lastAdjustment: 9 };

async function setSlot(addr, slot, value) {
  await network.provider.send('hardhat_setStorageAt', [
    addr,
    '0x' + slot.toString(16).padStart(64, '0'),
    '0x' + value.toString(16).padStart(64, '0'),
  ]);
}
async function getSlot(addr, slot) {
  const v = await network.provider.send('eth_getStorageAt', [
    addr,
    '0x' + slot.toString(16).padStart(64, '0'),
    'latest',
  ]);
  return BigInt(v);
}
async function mineTo(targetBlock) {
  const cur = await ethers.provider.getBlockNumber();
  if (cur < targetBlock) {
    await network.provider.send('hardhat_mine', ['0x' + (targetBlock - cur).toString(16)]);
  }
}
async function deployVaked() {
  const f = await ethers.getContractFactory('VAKED');
  const c = await f.deploy();
  await c.waitForDeployment();
  return c;
}
async function deployHarness() {
  const f = await ethers.getContractFactory('VAKEDHarness');
  const c = await f.deploy();
  await c.waitForDeployment();
  return c;
}
// Backdate lastAdjustmentBlock so the NEXT forceAdjust()/mint() tx (mined one
// block after the current head) observes exactly `actualBlocks` elapsed blocks.
async function backdate(c, actualBlocks) {
  const head = await ethers.provider.getBlockNumber();
  await setSlot(await c.getAddress(), SLOT.lastAdjustment, BigInt(head) + 1n - actualBlocks);
}
// verify the slot layout we assume (probe miningTarget slot by value)
async function verifySlotLayout(c) {
  const addr = await c.getAddress();
  const t = await getSlot(addr, SLOT.miningTarget);
  if (t !== INITIAL_TARGET) {
    throw new Error(`slot layout assumption broken: slot ${SLOT.miningTarget} = ${t}, expected ${INITIAL_TARGET}`);
  }
  const owner = await getSlot(addr, SLOT.owner);
  const signers = await ethers.getSigners();
  if (owner !== BigInt(signers[0].address)) {
    throw new Error(`slot layout assumption broken: slot ${SLOT.owner} owner = ${owner}`);
  }
}

// find a valid PoW nonce against (challenge, miner, target) — offline JS loop
function findNonce(challenge, miner, target) {
  for (let n = 0n; ; n++) {
    const d = BigInt(ethers.solidityPackedKeccak256(['bytes32', 'address', 'uint256'], [challenge, miner, n]));
    if (d < target) return { nonce: n, digest: d };
    if (n > 100_000n) throw new Error('nonce search runaway');
  }
}

describe('VAKED — cold-start deadlock fix regression', () => {
  describe('1/2. compile-fidelity + initial state', () => {
    it('deploys clean and asserts genesis state', async () => {
      const c = await deployVaked();
      const addr = await c.getAddress();
      await verifySlotLayout(c);

      expect(await c.miningTarget()).to.equal(INITIAL_TARGET);
      expect(await c.getMiningReward()).to.equal(INITIAL_REWARD);
      expect(await c.totalSupply()).to.equal(0n);
      expect(await c.MAX_SUPPLY()).to.equal(MAX_SUPPLY);
      expect(await c.epochCount()).to.equal(0n);
      expect(await c.getMintableSupply()).to.equal(MAX_SUPPLY);
      expect(await c.name()).to.equal('VAKED');
      expect(await c.symbol()).to.equal('VAKED');
      expect(await c.decimals()).to.equal(18n);

      // seed-challenge fix: getChallengeNumber() returns the stored seed,
      // NOT a per-block value, and is identical across blocks.
      const seed = await c.challengeNumber();
      expect(seed).to.not.equal(ethers.ZeroHash);
      expect(await c.getChallengeNumber()).to.equal(seed);
      expect(await c.getChallengeNumber()).to.equal(await getSlot(addr, SLOT.challengeNumber));
      const b1 = await ethers.provider.getBlockNumber();
      await network.provider.send('evm_mine', []);
      expect(await ethers.provider.getBlockNumber()).to.be.greaterThan(b1);
      expect(await c.getChallengeNumber()).to.equal(seed); // no per-block rotation
    });
  });

  describe('4. _adjustDifficulty() overflow-safety regression (the original bug)', () => {
    it('harness: forceAdjust() never reverts at bootstrap target 2^232 (old code overflowed miningTarget * 1e18)', async () => {
      const h = await deployHarness();
      const addr = await h.getAddress();
      await verifySlotLayout(h);
      await mineTo(300_000); // room to backdate lastAdjustmentBlock without underflow

      // Case 1: neutral epoch (actualBlocks == EXPECTED) -> target unchanged
      await backdate(h, EXPECTED_BLOCKS);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.equal(INITIAL_TARGET);
      expect(await h.lastAdjustmentBlock()).to.equal(BigInt(await ethers.provider.getBlockNumber()));

      // Case 2: slow epoch, MAX clamp (actualBlocks = 245,760 = 4x expected)
      // worst-case intermediate: 2^232 * 245,760 ~ 2^249.9 < 2^256 -> safe
      await backdate(h, MAX_ACTUAL);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.equal(MAX_TARGET); // already at ceiling, stays clamped

      // Case 3: fast epoch, MIN clamp (actualBlocks = 15,360) -> target moves DOWN
      await backdate(h, MIN_ACTUAL);
      await (await h.forceAdjust()).wait();
      const expectedDown = (INITIAL_TARGET + (INITIAL_TARGET * MIN_ACTUAL) / EXPECTED_BLOCKS) / 2n;
      expect(await h.miningTarget()).to.equal(expectedDown);
      expect(await h.miningTarget()).to.be.lessThan(INITIAL_TARGET);

      // Case 4: extreme slow (actualBlocks > MAX -> clamped to MAX) -> up.
      // MAX_ACTUAL+1 saturates the clamp exactly like 1,000,000 would (the clamp
      // caps the observed span at MAX_ACTUAL before any arithmetic).
      await backdate(h, MAX_ACTUAL + 1n);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.equal(MAX_TARGET);

      // Case 5: extreme fast (actualBlocks = 10 -> clamped to MIN) -> down
      await backdate(h, 10n);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.equal(expectedDown);

      // Case 6: mid-range target 2^220, slow epoch -> target moves UP (direction proof)
      await setSlot(addr, SLOT.miningTarget, 1n << 220n);
      await backdate(h, MAX_ACTUAL);
      await (await h.forceAdjust()).wait();
      const upFromMid = (1n << 220n) * (1n + 4n) / 2n; // halfway toward 4x -> 2.5 * 2^220
      expect(await h.miningTarget()).to.equal(upFromMid);
      expect(await h.miningTarget()).to.be.greaterThan(1n << 220n);
      expect(await h.miningTarget()).to.be.at.most(MAX_TARGET);

      // Case 7: mid-range target 2^220, fast epoch -> target moves DOWN
      await setSlot(addr, SLOT.miningTarget, 1n << 220n);
      await backdate(h, MIN_ACTUAL);
      await (await h.forceAdjust()).wait();
      const downFromMid = (1n << 220n) + ((1n << 220n) * MIN_ACTUAL) / EXPECTED_BLOCKS;
      expect(await h.miningTarget()).to.equal(downFromMid / 2n);
      expect(await h.miningTarget()).to.be.lessThan(1n << 220n);

      // Case 8: below-rail target clamps UP to MIN (2^200): target=2^190, fast epoch
      await setSlot(addr, SLOT.miningTarget, 1n << 190n);
      await backdate(h, MIN_ACTUAL);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.equal(MIN_TARGET);

      // Case 9: target at MIN (2^200) + fast epoch stays clamped at MIN (never below 2^200)
      await setSlot(addr, SLOT.miningTarget, MIN_TARGET);
      await backdate(h, MIN_ACTUAL);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.equal(MIN_TARGET);

      // Case 10: target at MIN + slow epoch -> moves up
      await backdate(h, MAX_ACTUAL);
      await (await h.forceAdjust()).wait();
      expect(await h.miningTarget()).to.be.greaterThan(MIN_TARGET);
      expect(await h.miningTarget()).to.be.at.most(MAX_TARGET);
    });

    it('full mint path: mint #1024 (epochCount=1023 backdated) triggers _adjustDifficulty() without revert', async () => {
      const c = await deployVaked();
      const addr = await c.getAddress();
      const [signer] = await ethers.getSigners();
      await mineTo(300_000);

      // backdate epoch + lastAdjustment so the next mint is the epoch-1024 adjustment.
      // Neutral epoch (actualBlocks == EXPECTED) keeps the arithmetic exact.
      await setSlot(addr, SLOT.epochCount, 1023n);
      await backdate(c, EXPECTED_BLOCKS);

      // Bound slightly above the 2^232 rail so the PoW search is quick in-process
      // (expected ~2^16 tries) while keeping the adjustment multiply overflow-safe
      // (2^240 * 61_440 < 2^256). In production the target is always <= 2^232.
      const easyTarget = 1n << 240n;
      await setSlot(addr, SLOT.miningTarget, easyTarget);
      const challenge = await c.getChallengeNumber();
      const { nonce } = findNonce(challenge, signer.address, easyTarget);

      const tx = await c.mint(nonce);
      await tx.wait();

      expect(await c.epochCount()).to.equal(1024n);
      // adjustment ran without revert and clamped the out-of-rail target back to 2^232
      expect(await c.miningTarget()).to.equal(MAX_TARGET);
      expect(await c.lastAdjustmentBlock()).to.equal(BigInt(await ethers.provider.getBlockNumber()));
      // reward unchanged at epoch 1024
      expect(await c.getMiningReward()).to.equal(INITIAL_REWARD);
    });
  });

  describe('5. reward halving math + cumulative supply', () => {
    it('getMiningReward() halves 50 -> 25 -> 12.5 -> 6.25 ... and decays to 0', async () => {
      const c = await deployVaked();
      const addr = await c.getAddress();
      const cases = [
        [0n, INITIAL_REWARD],
        [1n, INITIAL_REWARD],
        [209_999n, INITIAL_REWARD],
        [210_000n, INITIAL_REWARD / 2n],
        [420_000n, INITIAL_REWARD / 4n],
        [630_000n, INITIAL_REWARD / 8n],
        [13_650_000n, INITIAL_REWARD >> 65n], // 1 wei
        [13_859_999n, INITIAL_REWARD >> 65n],
        [13_860_000n, 0n], // halving #66 -> 0, issuance ends
        [21_000_000n, 0n],
      ];
      for (const [epoch, expected] of cases) {
        await setSlot(addr, SLOT.epochCount, epoch);
        expect(await c.getMiningReward(), `epoch ${epoch}`).to.equal(expected);
      }
    });

    it('final-mint top-up never exceeds MAX_SUPPLY and the cap is exact', async () => {
      const c = await deployVaked();
      const addr = await c.getAddress();
      const [signer] = await ethers.getSigners();

      // make any low nonce pass: bound at 2^256-1
      const maxUint = (1n << 256n) - 1n;
      await setSlot(addr, SLOT.miningTarget, maxUint);

      // set totalSupply to 10 VAKED below the cap -> mint must top up exactly
      await setSlot(addr, SLOT.totalSupply, MAX_SUPPLY - 10n * 10n ** 18n);
      const challenge = await c.getChallengeNumber();
      const { nonce } = findNonce(challenge, signer.address, maxUint);
      const reward = await c.mint.staticCall(nonce);
      expect(reward).to.equal(10n * 10n ** 18n); // capped: min(50e18, 10e18)
      await (await c.mint(nonce)).wait();
      expect(await c.totalSupply()).to.equal(MAX_SUPPLY); // exactly at cap
      expect(await c.totalSupply()).to.be.at.most(MAX_SUPPLY);
      expect(await c.getMintableSupply()).to.equal(0n);

      // one more mint: remaining = 0 -> reward 0 -> must revert (no overshoot)
      await expect(c.mint(0n)).to.be.revertedWith('VAKED: reward exhausted');
      expect(await c.totalSupply()).to.equal(MAX_SUPPLY);

      // sub-wei edge: remaining = 1 wei -> top up exactly 1 wei
      const c2 = await deployVaked();
      const a2 = await c2.getAddress();
      await setSlot(a2, SLOT.miningTarget, maxUint);
      await setSlot(a2, SLOT.totalSupply, MAX_SUPPLY - 1n);
      const ch2 = await c2.getChallengeNumber();
      const n2 = findNonce(ch2, signer.address, maxUint).nonce;
      expect(await c2.mint.staticCall(n2)).to.equal(1n);
      await (await c2.mint(n2)).wait();
      expect(await c2.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it('off-chain full-schedule simulation: supply never exceeds MAX; converges to MAX minus floor loss', () => {
      // Exact contract schedule: 210_000 mints per halving, reward = 50e18 >> h
      // (floor division), until scheduled reward hits 0. The top-up branch
      // (reward = min(reward, remaining)) can only cap WITHIN a mint — it can
      // never add more than the scheduled reward — so if the accumulated
      // flooring loss exceeds the last scheduled reward (1 wei), issuance ends
      // just below MAX_SUPPLY. Computed floor loss: 5,460,000 wei.
      const FLOOR_LOSS = 5_460_000n;
      let supply = 0n;
      let mints = 0n;
      let safetyMax = 0n;
      for (let h = 0n; h < 255n; h++) {
        const scheduled = INITIAL_REWARD >> h;
        if (scheduled === 0n) break;
        for (let i = 0n; i < HALVING_INTERVAL; i++) {
          const remaining = MAX_SUPPLY - supply;
          const reward = scheduled > remaining ? remaining : scheduled;
          supply += reward;
          mints += 1n;
          if (supply > safetyMax) safetyMax = supply;
          if (supply >= MAX_SUPPLY) break;
        }
        if (supply >= MAX_SUPPLY) break;
      }
      expect(mints).to.equal(13_860_000n); // 66 halvings x 210_000
      expect(safetyMax).to.be.at.most(MAX_SUPPLY); // hard cap never exceeded
      expect(supply).to.equal(MAX_SUPPLY - FLOOR_LOSS); // exact: short by 5,460,000 wei
      expect(supply).to.be.lessThan(MAX_SUPPLY);
      // last scheduled reward is 1 wei < remaining at that point => the on-chain
      // top-up branch never fires in real operation (issuance ends via reward==0)
      expect(INITIAL_REWARD >> 65n).to.equal(1n);
      expect(FLOOR_LOSS).to.be.greaterThan(1n);
    });
  });
});
