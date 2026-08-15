// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VAKED
/// @notice A mineable ERC-20 on Polygon, fair-launched with an EIP-918-style
///         proof-of-work mint (the 0xBitcoin / ERC-918 pattern): solve a
///         keccak256 challenge, mint a block reward, and let difficulty adjust
///         toward a fixed block interval. No premine, no team allocation, no
///         presale — total supply starts at zero and grows only through
///         mint(). Ownership is renounceable via Ownable; after renunciation
///         the contract is fully permissionless and cannot be changed.
/// @dev    Polygon mainnet (EVM). Mint costs gas only — no fee, no tax, no
///         pause, no blacklist, no proxy, no upgrade, no burn mechanism.
///         Note: mint() is the proof-of-work mint. ERC-20's internal _mint is
///         only ever called from it; there is no other way to create supply.
contract VAKED is ERC20, Ownable {
    // -- constants --------------------------------------------------------------

    /// Fixed, permanent cap. Total supply never exceeds this.
    uint256 public constant MAX_SUPPLY = 21_000_000 * 1e18;

    /// Reward for the first mint (50 VAKED), halved once per
    /// REWARD_HALVING_INTERVAL successful mints (Bitcoin-style schedule).
    uint256 internal constant INITIAL_REWARD = 50 * 1e18;

    /// Number of successful mints between reward halvings.
    uint256 internal constant REWARD_HALVING_INTERVAL = 210_000;

    /// Mints per difficulty-adjustment epoch.
    uint256 internal constant ADJUSTMENT_EPOCH = 1024;

    /// Desired average block interval between mints (blocks, not seconds).
    uint256 internal constant TARGET_BLOCK_INTERVAL = 60;

    /// Expected block span of one adjustment epoch: 1024 mints * 60 blocks.
    uint256 internal constant EXPECTED_BLOCKS_PER_EPOCH =
        ADJUSTMENT_EPOCH * TARGET_BLOCK_INTERVAL; // 61_440

    /// Clamp window for the observed interval, so a single epoch can never
    /// swing the difficulty by more than 4x (smooth, not all-or-nothing).
    uint256 internal constant MIN_ACTUAL_BLOCKS = EXPECTED_BLOCKS_PER_EPOCH / 4; // 15_360
    uint256 internal constant MAX_ACTUAL_BLOCKS = EXPECTED_BLOCKS_PER_EPOCH * 4; // 245_760

    /// Initial PoW bound: the digest must be strictly below miningTarget. At
    /// launch the target is MAX_MINING_TARGET (2^232), roughly one winning
    /// hash in 2^24 (~16.8M) — a modest CPU finds a block in minutes, and the
    /// first epoch completes in ~2 days at ~100 kH/s. The adjustment mechanism
    /// then converges it toward the 60-block cadence.
    uint256 internal constant INITIAL_MINING_TARGET = 1 << 232;

    /// Absolute safety rails for miningTarget. Keeping the target inside
    /// [2^200, 2^232] also guarantees every adjustment step is overflow-safe.
    uint256 internal constant MIN_MINING_TARGET = 1 << 200;
    uint256 internal constant MAX_MINING_TARGET = 1 << 232;

    /// EIP-918 canonical mint event.
    event Mint(address indexed from, uint256 rewardAmount, uint256 epochCount, bytes32 newChallengeNumber);

    // -- state ------------------------------------------------------------------

    /// Number of successful mints so far (the issuance "epoch" counter).
    uint256 public epochCount;

    /// Base round seed, rotated after every successful mint. The live round
    /// returned by getChallengeNumber() is this seed; it persists across
    /// blocks, so a solution stays valid from fetch until the next mint.
    bytes32 public challengeNumber;

    /// Current PoW bound: mint() requires the digest to be strictly below this.
    uint256 public miningTarget;

    /// block.number at the last difficulty adjustment (or at deployment).
    uint256 public lastAdjustmentBlock;

    // -- constructor ---------------------------------------------------------------

    constructor() ERC20("VAKED", "VAKED") Ownable(msg.sender) {
        miningTarget = INITIAL_MINING_TARGET;
        lastAdjustmentBlock = block.number;
        challengeNumber = keccak256(
            abi.encodePacked("VAKED genesis", block.number, blockhash(block.number - 1), msg.sender)
        );
    }

    // -- proof of work --------------------------------------------------------------

    /// Solve the current round's PoW challenge and claim the block reward.
    /// The digest keccak256(challenge, msg.sender, nonce) must be below the
    /// current mining target. Binding the digest to msg.sender prevents
    /// man-in-the-middle relay of solutions; binding it to the round challenge
    /// (see getChallengeNumber) scopes the solution to the current round.
    /// @param nonce the nonce the miner searched off-chain
    function mint(uint256 nonce) external returns (uint256 rewardAmount) {
        bytes32 challenge = getChallengeNumber();
        require(
            uint256(keccak256(abi.encodePacked(challenge, msg.sender, nonce))) < miningTarget,
            "VAKED: digest does not meet target"
        );

        // Reward is capped by the fixed max supply; when the remaining supply
        // is smaller than the scheduled reward, the final mint tops up the cap
        // exactly. When the reward decays to zero, issuance ends.
        uint256 reward = getMiningReward();
        uint256 remaining = MAX_SUPPLY - totalSupply();
        if (reward > remaining) reward = remaining;
        require(reward > 0, "VAKED: reward exhausted");

        uint256 newEpoch = epochCount + 1;
        epochCount = newEpoch;
        _mint(msg.sender, reward);

        // Rotate the round seed: every successful mint opens a fresh challenge.
        challengeNumber = keccak256(abi.encodePacked(challenge, msg.sender, nonce));

        if (newEpoch % ADJUSTMENT_EPOCH == 0) {
            _adjustDifficulty();
        }

        emit Mint(msg.sender, reward, newEpoch, challengeNumber);
        return reward;
    }

    /// Recompute miningTarget toward the 60-block average mint interval.
    /// Called once per ADJUSTMENT_EPOCH mints. Smooth: each adjustment moves
    /// the target halfway toward the ideal for the observed interval, and the
    /// observed interval is clamped so one epoch can never change difficulty
    /// by more than 4x — never an all-or-nothing jump.
    function _adjustDifficulty() internal {
        uint256 actualBlocks = block.number - lastAdjustmentBlock;
        if (actualBlocks > MAX_ACTUAL_BLOCKS) actualBlocks = MAX_ACTUAL_BLOCKS;
        if (actualBlocks < MIN_ACTUAL_BLOCKS) actualBlocks = MIN_ACTUAL_BLOCKS;

        // Ideal target for the observed cadence, via integer division. Direct
        // multiply is overflow-safe: at most MAX_MINING_TARGET * MAX_ACTUAL_BLOCKS
        // = 2^232 * 245_760 < 2^256.
        uint256 idealTarget = (miningTarget * actualBlocks) / EXPECTED_BLOCKS_PER_EPOCH;

        // Move halfway toward the ideal, then clamp to the safety rails.
        uint256 newTarget = (miningTarget + idealTarget) / 2;
        if (newTarget < MIN_MINING_TARGET) newTarget = MIN_MINING_TARGET;
        if (newTarget > MAX_MINING_TARGET) newTarget = MAX_MINING_TARGET;

        miningTarget = newTarget;
        lastAdjustmentBlock = block.number;
    }

    // -- informational views ----------------------------------------------------------

    /// The live round challenge: the rotated base seed. It changes only on a
    /// successful mint (see mint), so a solution stays valid from fetch until
    /// the next mint — no per-block race. Miners should call this view, then
    /// search nonces for
    /// keccak256(challenge, minerAddress, nonce) < getMiningTarget().
    function getChallengeNumber() public view returns (bytes32) {
        return challengeNumber;
    }

    /// Current scheduled per-mint reward: INITIAL_REWARD, halved once per
    /// REWARD_HALVING_INTERVAL mints. Decays toward zero, which ends issuance.
    function getMiningReward() public view returns (uint256) {
        uint256 halvings = epochCount / REWARD_HALVING_INTERVAL;
        if (halvings >= 255) return 0;
        return INITIAL_REWARD >> halvings;
    }

    /// The current PoW bound the digest must clear (getMiningDifficulty()
    /// reports the same number in conventional difficulty terms).
    function getMiningTarget() public view returns (uint256) {
        return miningTarget;
    }

    /// Conventional difficulty: type(uint256).max / miningTarget — the
    /// expected number of hashes per mint at the current target.
    function getMiningDifficulty() public view returns (uint256) {
        return type(uint256).max / miningTarget;
    }

    /// EIP-918 canonical view: supply still available to be mined.
    function getMintableSupply() public view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}
