//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./IController.sol";

interface IRewardDistributor {
    function isRewardDistributor() external view returns (bool);

    function controller() external view returns (IController);

    function rewardToken() external returns (address);

    function _setRewardToken(address newRewardToken) external;

    /// @notice Emitted reward token address is changed by admin
    event NewRewardToken(address oldRewardToken, address newRewardToken);

    function treasury() external returns (address);

    function _setTreasury(address newTreasury) external;

    /// @notice Emitted treasury address is changed by admin
    event NewTreasury(address oldTreasury, address newTreasury);

    function _addRecipient(
        address _iToken,
        uint256 _distributionFactor
    ) external;

    event NewRecipient(address iToken, uint256 distributionFactor);

    /// @notice Emitted when mint is paused/unpaused by admin
    event PausedChanged(bool paused, uint256 timestamp);

    function _pause() external;

    function _unpause(
        address[] calldata _borrowiTokens,
        uint256[] calldata _borrowSpeeds,
        address[] calldata _supplyiTokens,
        uint256[] calldata _supplySpeeds
    ) external;

    /// @notice Emitted when Global Distribution speed for both supply and borrow are updated
    event GlobalDistributionSpeedsChanged(
        uint256 borrowSpeed,
        uint256 supplySpeed,
        uint256 timestamp
    );

    /// @notice Emitted when iToken's Distribution borrow speed is updated
    event DistributionBorrowSpeedChanged(
        address iToken,
        uint256 borrowSpeed,
        uint256 timestamp
    );

    /// @notice Emitted when iToken's Distribution supply speed is updated
    event DistributionSupplySpeedChanged(
        address iToken,
        uint256 supplySpeed,
        uint256 timestamp
    );

    /// @notice Emitted when iToken's Distribution factor is changed by admin
    event NewDistributionFactor(
        address iToken,
        uint256 oldDistributionFactorMantissa,
        uint256 newDistributionFactorMantissa
    );

    /// @notice Emitted when bounty ratio is changed by admin
    event NewBountyRatio(uint256 oldBountyRatio, uint256 newBountyRatio);

    function updateDistributionState(address _iToken, bool _isBorrow) external;

    function updateReward(
        address _iToken,
        address _account,
        bool _isBorrow
    ) external;

    function updateRewardBatch(
        address[] memory _holders,
        address[] memory _iTokens
    ) external;

    function claimReward(
        address[] memory _holders,
        address[] memory _iTokens
    ) external;

    function claimAllReward(address[] memory _holders) external;

    function claimRewards(
        address[] memory _holders,
        address[] memory _suppliediTokens,
        address[] memory _borrowediTokens
    ) external;

    /// @notice Emitted when reward of amount is distributed into account
    event RewardDistributed(
        address iToken,
        address account,
        uint256 amount,
        uint256 accountIndex
    );

    function claimBounty(address _account, address _hunter) external;

    /// @notice Emitted when bounty is claimed by a hunter
    event BountyClaimed(
        address rewardToken,
        address hunter,
        address account,
        uint256 bounty,
        uint256 reward
    );
}
