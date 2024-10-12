//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Interfaces/IRewardDistributor.sol";
import "./Interfaces/IController.sol";
import "./Interfaces/IRewardDistributorManager.sol";
import "./Libraries/RatioMath.sol";
import "./Libraries/Ownable.sol";
import "./Libraries/Initializable.sol";
import "./Interfaces/Errors.sol";

/**
 * @title dForce's lending reward distributor Contract
 * @author dForce
 */
contract RewardDistributor is Initializable, Ownable, IRewardDistributor {
    using RatioMath for uint256;
    using SafeERC20 for IERC20;

    /// @notice the controller
    IController public override controller;

    /// @notice the global Reward distribution speed
    uint256 public globalDistributionSpeed;

    /// @notice the Reward distribution speed of each iToken
    mapping(address => uint256) public distributionSpeed;

    /// @notice the Reward distribution factor of each iToken, 1.0 by default. stored as a mantissa
    mapping(address => uint256) public distributionFactorMantissa;

    struct DistributionState {
        // Token's last updated index, stored as a mantissa
        uint256 index;
        // The block number the index was last updated at
        uint256 block;
        // The block timestamp the index was last updated at
        uint256 timestamp;
    }

    /// @notice the Reward distribution supply state of each iToken
    mapping(address => DistributionState) public distributionSupplyState;
    /// @notice the Reward distribution borrow state of each iToken
    mapping(address => DistributionState) public distributionBorrowState;

    /// @notice the Reward distribution state of each account of each iToken
    mapping(address => mapping(address => uint256))
        public distributionSupplierIndex;
    /// @notice the Reward distribution state of each account of each iToken
    mapping(address => mapping(address => uint256))
        public distributionBorrowerIndex;

    /// @notice the Reward distributed into each account
    mapping(address => uint256) public reward;

    /// @notice the Reward token address
    address public override rewardToken;

    /// @notice whether the reward distribution is paused
    bool public paused;

    /// @notice the Reward distribution speed supply side of each iToken
    mapping(address => uint256) public distributionSupplySpeed;

    /// @notice the global Reward distribution speed for supply
    uint256 public globalDistributionSupplySpeed;

    /// @notice the treasury address where the reward is stored
    address public override treasury;

    /// @notice the reward distributor manager address where eligible balances is stored
    IRewardDistributorManager public manager;

    /// @notice the ratio of bounty hunter to collect from reward
    uint256 public bountyRatio;
    uint256 constant BOUNTY_RATIO_MAX = 1e17; // max 10%

    constructor(IController _controller, IRewardDistributorManager _manager) {
        initialize(_controller, _manager);
    }

    /**
     * @dev Throws if called by any account other than the controller.
     */
    modifier onlyManager() {
        if (msg.sender != address(manager)) {
            revert RewardDistributor__CallerIsNotRewardManager();
        }
        _;
    }

    modifier whenNotPaused() {
        if (paused) {
            revert RewardDistributor__ContractPaused();
        }
        _;
    }

    /**
     * @notice Initializes the contract.
     */
    function initialize(
        IController _controller,
        IRewardDistributorManager _manager
    ) public initializer {
        if (!_controller.isController()) {
            revert RewardDistributor_initialize__InvalidController();
        }
        if (!_manager.isRewardDistributorManager()) {
            revert RewardDistributor_initialize__InvalidRewardDistributorManager();
        }

        __Ownable_init();
        controller = _controller;
        manager = _manager;
        paused = true;
    }

    /*********************************/
    /******** Security Check *********/
    /*********************************/

    /**
     * @notice Ensure this is a RewardDistributor contract.
     */
    function isRewardDistributor() external pure override returns (bool) {
        return true;
    }

    /**
     * @notice set reward token address
     * @dev Admin function, only owner can call this
     * @param _newRewardToken the address of reward token
     */
    function _setRewardToken(
        address _newRewardToken
    ) external override onlyOwner {
        address _oldRewardToken = rewardToken;
        if (
            _newRewardToken == address(0) || _newRewardToken == _oldRewardToken
        ) {
            revert RewardDistributor_setRewardToken__InvalidRewardToken();
        }

        rewardToken = _newRewardToken;
        emit NewRewardToken(_oldRewardToken, _newRewardToken);
    }

    /**
     * @notice set new treasury address
     * @dev Admin function, only owner can call this
     * @param _newTreasury the address of treasury
     */
    function _setTreasury(address _newTreasury) external override onlyOwner {
        address _oldTreasury = treasury;
        if (_newTreasury == address(0) || _newTreasury == _oldTreasury) {
            revert RewardDistributor_setTreasury__InvalidTreasury();
        }

        treasury = _newTreasury;
        emit NewTreasury(_oldTreasury, _newTreasury);
    }

    /**
     * @notice Add the iToken as receipient
     * @dev Admin function, only controller can call this
     * @param _iToken the iToken to add as recipient
     * @param _distributionFactor the distribution factor of the recipient
     */
    function _addRecipient(
        address _iToken,
        uint256 _distributionFactor
    ) external override onlyManager {
        distributionFactorMantissa[_iToken] = _distributionFactor;
        distributionSupplyState[_iToken] = DistributionState({
            index: 0,
            block: block.number,
            timestamp: block.timestamp
        });
        distributionBorrowState[_iToken] = DistributionState({
            index: 0,
            block: block.number,
            timestamp: block.timestamp
        });

        emit NewRecipient(_iToken, _distributionFactor);
    }

    /**
     * @notice Pause the reward distribution
     * @dev Admin function, pause will set global speed to 0 to stop the accumulation
     */
    function _pause() external override onlyOwner {
        // Set the global distribution speed to 0 to stop accumulation
        address[] memory _iTokens = controller.getAlliTokens();
        uint256 _len = _iTokens.length;
        for (uint256 i = 0; i < _len; i++) {
            _setDistributionBorrowSpeed(_iTokens[i], 0);
            _setDistributionSupplySpeed(_iTokens[i], 0);
        }

        _refreshGlobalDistributionSpeeds();

        _setPaused(true);
    }

    /**
     * @notice Unpause and set distribution speeds
     * @dev Admin function
     * @param _borrowiTokens The borrow asset array
     * @param _borrowSpeeds  The borrow speed array
     * @param _supplyiTokens The supply asset array
     * @param _supplySpeeds  The supply speed array
     */
    function _unpause(
        address[] calldata _borrowiTokens,
        uint256[] calldata _borrowSpeeds,
        address[] calldata _supplyiTokens,
        uint256[] calldata _supplySpeeds
    ) external override onlyOwner {
        _setPaused(false);

        _setDistributionSpeedsInternal(
            _borrowiTokens,
            _borrowSpeeds,
            _supplyiTokens,
            _supplySpeeds
        );

        _refreshGlobalDistributionSpeeds();
    }

    /**
     * @notice Pause/Unpause the reward distribution
     * @dev Admin function
     * @param _paused whether to pause/unpause the distribution
     */
    function _setPaused(bool _paused) internal {
        paused = _paused;
        emit PausedChanged(_paused, block.timestamp);
    }

    /**
     * @notice Set distribution speeds
     * @dev Admin function, will fail when paused
     * @param _borrowiTokens The borrow asset array
     * @param _borrowSpeeds  The borrow speed array
     * @param _supplyiTokens The supply asset array
     * @param _supplySpeeds  The supply speed array
     */
    function _setDistributionSpeeds(
        address[] calldata _borrowiTokens,
        uint256[] calldata _borrowSpeeds,
        address[] calldata _supplyiTokens,
        uint256[] calldata _supplySpeeds
    ) external onlyOwner whenNotPaused {
        _setDistributionSpeedsInternal(
            _borrowiTokens,
            _borrowSpeeds,
            _supplyiTokens,
            _supplySpeeds
        );

        _refreshGlobalDistributionSpeeds();
    }

    function _setDistributionSpeedsInternal(
        address[] memory _borrowiTokens,
        uint256[] memory _borrowSpeeds,
        address[] memory _supplyiTokens,
        uint256[] memory _supplySpeeds
    ) internal {
        _setDistributionBorrowSpeedsInternal(_borrowiTokens, _borrowSpeeds);
        _setDistributionSupplySpeedsInternal(_supplyiTokens, _supplySpeeds);
    }

    /**
     * @notice Set borrow distribution speeds
     * @dev Admin function, will fail when paused
     * @param _iTokens The borrow asset array
     * @param _borrowSpeeds  The borrow speed array
     */
    function _setDistributionBorrowSpeeds(
        address[] calldata _iTokens,
        uint256[] calldata _borrowSpeeds
    ) external onlyOwner whenNotPaused {
        _setDistributionBorrowSpeedsInternal(_iTokens, _borrowSpeeds);

        _refreshGlobalDistributionSpeeds();
    }

    /**
     * @notice Set supply distribution speeds
     * @dev Admin function, will fail when paused
     * @param _iTokens The supply asset array
     * @param _supplySpeeds The supply speed array
     */
    function _setDistributionSupplySpeeds(
        address[] calldata _iTokens,
        uint256[] calldata _supplySpeeds
    ) external onlyOwner whenNotPaused {
        _setDistributionSupplySpeedsInternal(_iTokens, _supplySpeeds);

        _refreshGlobalDistributionSpeeds();
    }

    function _refreshGlobalDistributionSpeeds() internal {
        address[] memory _iTokens = controller.getAlliTokens();
        uint256 _len = _iTokens.length;
        uint256 _borrowSpeed;
        uint256 _supplySpeed;
        for (uint256 i = 0; i < _len; i++) {
            _borrowSpeed = _borrowSpeed + distributionSpeed[_iTokens[i]];
            _supplySpeed = _supplySpeed + distributionSupplySpeed[_iTokens[i]];
        }

        globalDistributionSpeed = _borrowSpeed;
        globalDistributionSupplySpeed = _supplySpeed;

        emit GlobalDistributionSpeedsChanged(
            _borrowSpeed,
            _supplySpeed,
            block.timestamp
        );
    }

    function _setDistributionBorrowSpeedsInternal(
        address[] memory _iTokens,
        uint256[] memory _borrowSpeeds
    ) internal {
        if (_iTokens.length != _borrowSpeeds.length) {
            revert RewardDistributor_setDistributionBorrowSpeedsInternal__ArrayLengthMismatch();
        }

        uint256 _len = _iTokens.length;
        for (uint256 i = 0; i < _len; i++) {
            _setDistributionBorrowSpeed(_iTokens[i], _borrowSpeeds[i]);
        }
    }

    function _setDistributionSupplySpeedsInternal(
        address[] memory _iTokens,
        uint256[] memory _supplySpeeds
    ) internal {
        if (_iTokens.length != _supplySpeeds.length) {
            revert RewardDistributor_setDistributionSupplySpeedsInternal__ArrayLengthMismatch();
        }

        uint256 _len = _iTokens.length;
        for (uint256 i = 0; i < _len; i++) {
            _setDistributionSupplySpeed(_iTokens[i], _supplySpeeds[i]);
        }
    }

    function _setDistributionBorrowSpeed(
        address _iToken,
        uint256 _borrowSpeed
    ) internal {
        // iToken must have been listed
        if (!controller.hasiToken(_iToken)) {
            revert RewardDistributor_setDistributionBorrowSpeed__TokenHasNotBeenListed(
                _iToken
            );
        }

        // Update borrow state before updating new speed
        _updateDistributionState(_iToken, true);

        distributionSpeed[_iToken] = _borrowSpeed;
        emit DistributionBorrowSpeedChanged(
            _iToken,
            _borrowSpeed,
            block.timestamp
        );
    }

    function _setDistributionSupplySpeed(
        address _iToken,
        uint256 _supplySpeed
    ) internal {
        // iToken must have been listed
        if (!controller.hasiToken(_iToken)) {
            revert RewardDistributor_setDistributionSupplySpeed__TokenHasNotBeenListed(
                _iToken
            );
        }

        // Update supply state before updating new speed
        _updateDistributionState(_iToken, false);

        distributionSupplySpeed[_iToken] = _supplySpeed;
        emit DistributionSupplySpeedChanged(
            _iToken,
            _supplySpeed,
            block.timestamp
        );
    }

    /**
     * @notice Update the iToken's  Reward distribution state
     * @dev Will be called every time when the iToken's supply/borrow changes
     * @param _iToken The iToken to be updated
     * @param _isBorrow whether to update the borrow state
     */
    function updateDistributionState(
        address _iToken,
        bool _isBorrow
    ) external override {
        // Skip all updates if it is paused
        if (paused) {
            return;
        }

        _updateDistributionState(_iToken, _isBorrow);
    }

    function _updateDistributionState(
        address _iToken,
        bool _isBorrow
    ) internal {
        if (!controller.hasiToken(_iToken)) {
            revert RewardDistributor_updateDistributionState__TokenHasNotBeenListed(
                _iToken
            );
        }

        DistributionState storage state = _isBorrow
            ? distributionBorrowState[_iToken]
            : distributionSupplyState[_iToken];

        uint256 _speed = _isBorrow
            ? distributionSpeed[_iToken]
            : distributionSupplySpeed[_iToken];

        uint256 _blockTimestamp = block.timestamp;
        uint256 _deltaSecs = _blockTimestamp - state.timestamp;

        if (_deltaSecs > 0 && _speed > 0) {
            uint256 _totalToken = _isBorrow
                ? manager.eligibleTotalBorrow(_iToken)
                : manager.eligibleTotalSupply(_iToken);
            uint256 _totalDistributed = _speed * _deltaSecs;

            // Reward distributed per token since last time
            uint256 _distributedPerToken = _totalToken > 0
                ? _totalDistributed.rdiv(_totalToken)
                : 0;

            state.index = state.index + _distributedPerToken;
        }

        state.timestamp = _blockTimestamp;
    }

    /**
     * @notice Update the account's Reward distribution state
     * @dev Will be called every time when the account's supply/borrow changes
     * @param _iToken The iToken to be updated
     * @param _account The account to be updated
     * @param _isBorrow whether to update the borrow state
     */
    function updateReward(
        address _iToken,
        address _account,
        bool _isBorrow
    ) external override {
        _updateReward(_iToken, _account, _isBorrow);
    }

    function _updateReward(
        address _iToken,
        address _account,
        bool _isBorrow
    ) internal {
        if (_account == address(0)) {
            revert RewardDistributor_updateReward__AccountIsZeroAddress();
        }
        if (!controller.hasiToken(_iToken)) {
            revert RewardDistributor_updateReward__TokenHasNotBeenListed(
                _iToken
            );
        }

        uint256 _iTokenIndex;
        uint256 _accountIndex;
        uint256 _accountBalance;
        if (_isBorrow) {
            _iTokenIndex = distributionBorrowState[_iToken].index;
            _accountIndex = distributionBorrowerIndex[_iToken][_account];
            _accountBalance = manager.eligibleBorrow(_iToken, _account);

            // Update the account state to date
            distributionBorrowerIndex[_iToken][_account] = _iTokenIndex;
        } else {
            _iTokenIndex = distributionSupplyState[_iToken].index;
            _accountIndex = distributionSupplierIndex[_iToken][_account];
            _accountBalance = manager.eligibleSupply(_iToken, _account);

            // Update the account state to date
            distributionSupplierIndex[_iToken][_account] = _iTokenIndex;
        }

        uint256 _deltaIndex = _iTokenIndex - _accountIndex;
        uint256 _amount = _accountBalance.rmul(_deltaIndex);

        if (_amount > 0) {
            reward[_account] = reward[_account] + _amount;

            emit RewardDistributed(_iToken, _account, _amount, _accountIndex);
        }
    }

    /**
     * @notice Update reward accrued in iTokens by the holders regardless of paused or not
     * @param _holders The account to update
     * @param _iTokens The _iTokens to update
     */
    function updateRewardBatch(
        address[] memory _holders,
        address[] memory _iTokens
    ) public override {
        // Update rewards for all _iTokens for holders
        for (uint256 i = 0; i < _iTokens.length; i++) {
            address _iToken = _iTokens[i];
            _updateDistributionState(_iToken, false);
            _updateDistributionState(_iToken, true);
            for (uint256 j = 0; j < _holders.length; j++) {
                _updateReward(_iToken, _holders[j], false);
                _updateReward(_iToken, _holders[j], true);
            }
        }
    }

    /**
     * @notice Update reward accrued in iTokens by the holders regardless of paused or not
     * @param _holders The account to update
     * @param _iTokens The _iTokens to update
     * @param _isBorrow whether to update the borrow state
     */
    function _updateRewards(
        address[] memory _holders,
        address[] memory _iTokens,
        bool _isBorrow
    ) internal {
        // Update rewards for all _iTokens for holders
        for (uint256 i = 0; i < _iTokens.length; i++) {
            address _iToken = _iTokens[i];
            _updateDistributionState(_iToken, _isBorrow);
            for (uint256 j = 0; j < _holders.length; j++) {
                _updateReward(_iToken, _holders[j], _isBorrow);
            }
        }
    }

    /**
     * @notice Claim reward accrued in iTokens by the holders
     * @param _holders The account to claim for
     * @param _iTokens The _iTokens to claim from
     */
    function claimReward(
        address[] memory _holders,
        address[] memory _iTokens
    ) public override onlyManager {
        updateRewardBatch(_holders, _iTokens);

        // Withdraw all reward for all holders
        for (uint256 j = 0; j < _holders.length; j++) {
            address _account = _holders[j];
            uint256 _reward = reward[_account];
            if (_reward > 0) {
                reward[_account] = 0;
                IERC20(rewardToken).safeTransferFrom(
                    treasury,
                    _account,
                    _reward
                );
            }
        }
    }

    /**
     * @notice Claim reward accrued in iTokens by the holders
     * @param _holders The account to claim for
     * @param _suppliediTokens The _suppliediTokens to claim from
     * @param _borrowediTokens The _borrowediTokens to claim from
     */
    function claimRewards(
        address[] memory _holders,
        address[] memory _suppliediTokens,
        address[] memory _borrowediTokens
    ) external override onlyManager {
        _updateRewards(_holders, _suppliediTokens, false);
        _updateRewards(_holders, _borrowediTokens, true);

        // Withdraw all reward for all holders
        for (uint256 j = 0; j < _holders.length; j++) {
            address _account = _holders[j];
            uint256 _reward = reward[_account];
            if (_reward > 0) {
                reward[_account] = 0;
                IERC20(rewardToken).safeTransferFrom(
                    treasury,
                    _account,
                    _reward
                );
            }
        }
    }

    /**
     * @notice Claim reward accrued in all iTokens by the holders
     * @param _holders The account to claim for
     */
    function claimAllReward(
        address[] memory _holders
    ) external override onlyManager {
        claimReward(_holders, controller.getAlliTokens());
    }

    /**
     * @notice Rescue tokens, can only be called by treasury
     * @param _token The token to rescue
     * @param _amount The amount of token to rescue
     * @param _to The token to send to
     */
    function rescueTokens(
        address _token,
        uint256 _amount,
        address _to
    ) external {
        if (msg.sender != treasury) {
            revert RewardDistributor_rescueTokens__CallerIsNotTreasury();
        }

        // transfer _to
        IERC20(_token).safeTransfer(_to, _amount);
    }

    /**
     * @notice Set bounty ratio by admin
     * @param _bountyRatio the ratio in 1e18
     */
    function _setBountyRatio(uint256 _bountyRatio) external onlyOwner {
        if (_bountyRatio > BOUNTY_RATIO_MAX) {
            revert RewardDistributor_setBountyRatio__RatioTooHigh();
        }

        uint256 _oldBountyRatio = bountyRatio;
        bountyRatio = _bountyRatio;
        emit NewBountyRatio(_oldBountyRatio, _bountyRatio);
    }

    function claimBounty(
        address _account,
        address _hunter
    ) external onlyManager {
        uint256 _reward = reward[_account];

        if (_reward > 0) {
            reward[_account] = 0;
            uint256 _bounty = _reward.rmul(bountyRatio);

            IERC20(rewardToken).safeTransferFrom(treasury, _hunter, _bounty);
            IERC20(rewardToken).safeTransferFrom(
                treasury,
                _account,
                _reward - _bounty
            );

            emit BountyClaimed(
                rewardToken,
                _hunter,
                _account,
                _bounty,
                _reward
            );
        }
    }
}
