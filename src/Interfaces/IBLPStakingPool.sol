//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IBLPStakingPool {
    function stakingToken() external view returns (address);

    function balanceOf(address _account) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function isStakingPool() external pure returns (bool);
}
