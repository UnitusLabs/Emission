//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IEligibilityManager {
    function isEligibilityManager() external pure returns (bool);
    function isEligible(address _account) external returns (bool, bool);
    function hasBLPStakingPool(address _stakingPool) external view returns (bool);
}
