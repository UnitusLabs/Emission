// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IPenaltyStrategy {
    /// Calculate the penalty factor based on `_remainingVestingTime` and `_vestingPeriod`.
    function getPenaltyFactor(uint256 _remainingVestingTime, uint256 _vestingPeriod) external view returns (uint256 _penaltyFactor);
    /// Check if the current contract is the Penalty Strategy contract.
    function isPenaltyStrategy() external pure returns (bool);
}
