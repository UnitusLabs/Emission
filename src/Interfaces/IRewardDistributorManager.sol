//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
import "./IEligibilityManager.sol";
interface IRewardDistributorManager {
    function isRewardDistributorManager() external pure returns (bool);

    function eligibilityManager() external view returns (IEligibilityManager);

    function _addRecipient(
        address _iToken,
        uint256 _distributionFactor
    ) external;

    function _setEligibilityManager(address _newEligibilityManager) external;

    function eligibleTotalSupply(
        address iToken
    ) external view returns (uint256);

    function eligibleTotalBorrow(
        address iToken
    ) external view returns (uint256);

    function eligibleSupply(
        address iToken,
        address account
    ) external view returns (uint256);

    function eligibleBorrow(
        address iToken,
        address account
    ) external view returns (uint256);

    function updateEligibleBalance(address _account) external;

    function updateEligibleBalances(address[] memory _accounts) external;
}
