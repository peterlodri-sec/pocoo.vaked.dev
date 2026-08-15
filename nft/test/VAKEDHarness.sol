// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./VAKED.sol";

/// @title VAKEDHarness — test-only harness exposing internal VAKED functions.
/// @dev New test file (regression harness), NOT part of the shipped contract
///      surface. Used to exercise _adjustDifficulty() directly without needing
///      a valid PoW solution, and to expose storage slots to tests.
contract VAKEDHarness is VAKED {
    /// Direct entry into the internal difficulty adjustment. Production call
    /// sites (mint at epoch % 1024 == 0) call the same function.
    function forceAdjust() external {
        _adjustDifficulty();
    }

    /// Expose the adjustment math for on-chain assertion of clamp behavior.
    function adjustPreview(uint256 currentTarget, uint256 actualBlocks) external pure returns (uint256) {
        uint256 MIN_ACTUAL_BLOCKS = EXPECTED_BLOCKS_PER_EPOCH / 4; // 15_360
        uint256 MAX_ACTUAL_BLOCKS = EXPECTED_BLOCKS_PER_EPOCH * 4; // 245_760
        uint256 ab = actualBlocks;
        if (ab > MAX_ACTUAL_BLOCKS) ab = MAX_ACTUAL_BLOCKS;
        if (ab < MIN_ACTUAL_BLOCKS) ab = MIN_ACTUAL_BLOCKS;
        uint256 idealTarget = (currentTarget * ab) / EXPECTED_BLOCKS_PER_EPOCH;
        uint256 newTarget = (currentTarget + idealTarget) / 2;
        if (newTarget < MIN_MINING_TARGET) newTarget = MIN_MINING_TARGET;
        if (newTarget > MAX_MINING_TARGET) newTarget = MAX_MINING_TARGET;
        return newTarget;
    }
}
