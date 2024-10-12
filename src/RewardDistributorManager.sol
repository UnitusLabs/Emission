//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./Libraries/RatioMath.sol";

import "./Libraries/Ownable.sol";
import "./Libraries/Initializable.sol";
import "./Interfaces/IRewardDistributor.sol";
import "./Interfaces/IController.sol";
import "./Interfaces/IEligibilityManager.sol";
import "./Interfaces/IiToken.sol";
import "./Interfaces/Errors.sol";

contract RewardDistributorManager is Initializable, Ownable {
    using RatioMath for uint256;
    using SafeCast for uint256;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    EnumerableSetUpgradeable.AddressSet internal rewardDistributors;
    IController public controller;

    /// @notice the Eligibility Manager address where to query the eligibility of accounts
    IEligibilityManager public eligibilityManager;

    /// @notice the Elibility of each accounts
    mapping(address => bool) public isEligible;

    /// @notice the Eligible Total Supply of each iToken
    mapping(address => uint256) public eligibleTotalSupply;

    /// @notice the Eligible Total Borrow Balance of each iToken
    mapping(address => uint256) public eligibleTotalBorrow;

    /// @notice Emitted Eligible Total Supply changed
    event EligibleTotalSupplyChanged(address indexed iToken, int256 amount);
    /// @notice Emitted Eligible Total Borrow changed
    event EligibleTotalBorrowChanged(address indexed iToken, int256 amount);

    /// @notice Emitted Eligibility Manager address is changed by admin
    event NewEligibilityManager(
        address oldEligibilityManager,
        address newEligibilityManager
    );

    event AddRewardDistributor(address indexed _newRewardDistributor);
    event RemoveRewardDistributor(address indexed _oldRewardDistributor);

    /// @notice Emitted Eligibility is changed
    event EligibilityChanged(address indexed account, bool eligibility);

    constructor(IController _controller) {
        initialize(_controller);
    }

    function initialize(IController _controller) public initializer {
        __Ownable_init();

        if (!_controller.isController()) {
            revert RewardDistributorManager_initialize__InvalidController();
        }
        controller = _controller;
    }

    /**
     * @dev Throws if called by any account other than the controller.
     */
    modifier onlyController() {
        if (msg.sender != address(controller)) {
            revert RewardDistributorManager__NotController();
        }
        _;
    }

    /*********************************/
    /******** Security Check *********/
    /*********************************/

    /**
     * @notice Ensure this is a RewardDistributorManager contract.
     */
    function isRewardDistributorManager() external pure returns (bool) {
        return true;
    }

    /**
     * @notice set new eligibility manager address
     * @dev Admin function, only owner can call this
     * @param _newEligibilityManager the address of treasury
     */
    function _setEligibilityManager(
        IEligibilityManager _newEligibilityManager
    ) external onlyOwner {
        address _oldEligibilityManager = address(eligibilityManager);
        if (
            !IEligibilityManager(_newEligibilityManager)
                .isEligibilityManager() ||
            address(_newEligibilityManager) == _oldEligibilityManager
        ) {
            revert RewardDistributorManager_setEligibilityManager_InvalidEligibilityManager();
        }

        eligibilityManager = IEligibilityManager(_newEligibilityManager);
        emit NewEligibilityManager(
            _oldEligibilityManager,
            address(_newEligibilityManager)
        );
    }

    function _addRewardDistributorInternal(
        address _rewardDistributor
    ) internal {
        if (!IRewardDistributor(_rewardDistributor).isRewardDistributor()) {
            revert RewardDistributorManager_addRewardDistributorInternal__InvalidRewardDistributor();
        }

        if (rewardDistributors.add(_rewardDistributor)) {
            emit AddRewardDistributor(_rewardDistributor);
        } else {
            revert RewardDistributorManager_addRewardDistributorInternal__RewardDistributorAlreadyExist(
                _rewardDistributor
            );
        }
    }

    function _addRewardDistributor(
        address _rewardDistributor
    ) external onlyOwner {
        _addRewardDistributorInternal(_rewardDistributor);
    }

    function _addRewardDistributors(
        address[] calldata _rewardDistributors
    ) external onlyOwner {
        uint256 _length = _rewardDistributors.length;
        for (uint256 _i; _i < _length; ) {
            _addRewardDistributorInternal(_rewardDistributors[_i]);

            unchecked {
                ++_i;
            }
        }
    }

    function _removeRewardDistributorInternal(
        address _rewardDistributor
    ) internal {
        if (rewardDistributors.remove(_rewardDistributor)) {
            emit RemoveRewardDistributor(_rewardDistributor);
        } else {
            revert RewardDistributorManager_removeRewardDistributorInternal__RewardDistributorDoesNotExist(
                _rewardDistributor
            );
        }
    }

    function _removeRewardDistributor(
        address _rewardDistributor
    ) external onlyOwner {
        _removeRewardDistributorInternal(_rewardDistributor);
    }

    function _removeRewardDistributors(
        address[] calldata _rewardDistributors
    ) external onlyOwner {
        uint256 _length = _rewardDistributors.length;
        for (uint256 _i; _i < _length; ) {
            _removeRewardDistributorInternal(_rewardDistributors[_i]);

            unchecked {
                ++_i;
            }
        }
    }

    function getRewardDistributors() external view returns (address[] memory) {
        return rewardDistributors.values();
    }

    function getRewardDistributorsLength() external view returns (uint256) {
        return rewardDistributors.length();
    }

    function updateReward(
        address _iToken,
        address _account,
        bool _isBorrow
    ) public {
        uint256 _length = rewardDistributors.length();

        for (uint256 _i; _i < _length; ) {
            IRewardDistributor(rewardDistributors.at(_i)).updateReward(
                _iToken,
                _account,
                _isBorrow
            );

            unchecked {
                ++_i;
            }
        }
    }

    function updateDistributionState(address _iToken, bool _isBorrow) public {
        uint256 _length = rewardDistributors.length();
        for (uint256 _i; _i < _length; ) {
            IRewardDistributor(rewardDistributors.at(_i))
                .updateDistributionState(_iToken, _isBorrow);

            unchecked {
                ++_i;
            }
        }
    }

    function claimReward(
        address[] memory _holders,
        address[] memory _iTokens
    ) external {
        uint256 _length = rewardDistributors.length();
        for (uint256 _i; _i < _length; ) {
            IRewardDistributor(rewardDistributors.at(_i)).claimReward(
                _holders,
                _iTokens
            );

            unchecked {
                ++_i;
            }
        }

        updateEligibleBalances(_holders);
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
    ) external {
        uint256 _length = rewardDistributors.length();
        for (uint256 _i; _i < _length; ) {
            IRewardDistributor(rewardDistributors.at(_i)).claimRewards(
                _holders,
                _suppliediTokens,
                _borrowediTokens
            );

            unchecked {
                ++_i;
            }
        }

        updateEligibleBalances(_holders);
    }

    /**
     * @notice Claim reward accrued in all iTokens by the holders
     * @param _holders The account to claim for
     */
    function claimAllReward(address[] memory _holders) external {
        uint256 _length = rewardDistributors.length();
        for (uint256 _i; _i < _length; ) {
            IRewardDistributor(rewardDistributors.at(_i)).claimAllReward(
                _holders
            );

            unchecked {
                ++_i;
            }
        }

        updateEligibleBalances(_holders);
    }

    function _addRecipient(
        address /* _iToken */,
        uint256 /* _distributionFactor*/
    ) external onlyController {}

    function eligibleSupply(
        address _iToken,
        address _account
    ) public view returns (uint256 _eligibleSupply) {
        if (isEligible[_account]) {
            _eligibleSupply = IiToken(_iToken).balanceOf(_account);
        }
    }

    function eligibleBorrow(
        address _iToken,
        address _account
    ) public view returns (uint256 _eligibleBorrow) {
        if (isEligible[_account]) {
            (uint256 _borrowBalance, uint256 _borrowIndex) = IiToken(_iToken)
                .borrowSnapshot(_account);
            _eligibleBorrow = _borrowIndex > 0
                ? _borrowBalance.rdiv(_borrowIndex)
                : 0;
        }
    }

    /**
     * @notice Hook function after iToken `mint()`
     * Will `revert()` if any operation fails
     * @param _iToken The iToken being minted
     * @param _minter The account which would get the minted tokens
     * @param _mintedAmount The amount of iToken being minted
     */
    function afterMint(
        address _iToken,
        address _minter,
        uint256 /* _mintAmount */,
        uint256 _mintedAmount
    ) external onlyController {
        if (isEligible[_minter]) {
            eligibleTotalSupply[_iToken] += _mintedAmount;
            emit EligibleTotalSupplyChanged(_iToken, _mintedAmount.toInt256());
        }
    }

    /**
     * @notice Hook function after iToken `redeem()`
     * Will `revert()` if any operation fails
     * @param _iToken The iToken being redeemed
     * @param _redeemer The account which redeemed iToken
     * @param _redeemAmount  The amount of iToken being redeemed
     */
    function afterRedeem(
        address _iToken,
        address _redeemer,
        uint256 _redeemAmount,
        uint256 /* _redeemedUnderlying */
    ) external onlyController {
        if (isEligible[_redeemer]) {
            eligibleTotalSupply[_iToken] -= _redeemAmount;
            emit EligibleTotalSupplyChanged(
                _iToken,
                -(_redeemAmount.toInt256())
            );
        }
    }

    /**
     * @notice Hook function after iToken `borrow()`
     * Will `revert()` if any operation fails
     * @param _iToken The iToken being borrewd
     * @param _borrower The account which borrowed iToken
     * @param _borrowedAmount  The amount of underlying being borrowed
     */
    function afterBorrow(
        address _iToken,
        address _borrower,
        uint256 _borrowedAmount
    ) external onlyController {
        if (isEligible[_borrower]) {
            uint256 _borrowed = _borrowedAmount.rdiv(
                IiToken(_iToken).borrowIndex()
            );

            eligibleTotalBorrow[_iToken] += _borrowed;
            emit EligibleTotalBorrowChanged(_iToken, _borrowed.toInt256());
        }
    }

    /**
     * @notice Hook function after iToken `repayBorrow()`
     * Will `revert()` if any operation fails
     * @param _iToken The iToken being repaid
     * #param _payer The account which would repay
     * @param _borrower The account which has borrowed
     * @param _repayAmount  The amount of underlying being repaied
     */
    function afterRepayBorrow(
        address _iToken,
        address /* _payer */,
        address _borrower,
        uint256 _repayAmount
    ) external onlyController {
        if (isEligible[_borrower]) {
            uint256 _repaid = _repayAmount.rdiv(IiToken(_iToken).borrowIndex());

            if (eligibleTotalBorrow[_iToken] > _repaid) {
                eligibleTotalBorrow[_iToken] -= _repaid;
            } else {
                // Rounding errors could leading to mismatch to sum(borrow) and totalBorrow
                // Just reset eligibleTotalBorrow
                _repaid = eligibleTotalBorrow[_iToken];
                eligibleTotalBorrow[_iToken] = 0;
            }

            emit EligibleTotalBorrowChanged(_iToken, -(_repaid.toInt256()));
        }
    }

    /**
     * @notice Hook function after iToken `liquidateBorrow()`
     * Will `revert()` if any operation fails
     * #param _iTokenBorrowed The iToken was borrowed
     * #param _iTokenCollateral The collateral iToken to be seized
     * #param _liquidator The account which would repay and seize
     * #param _borrower The account which has borrowed
     * #param _repaidAmount  The amount of underlying being repaied
     * #param _seizedAmount  The amount of collateral being seized
     */
    function afterLiquidateBorrow(
        address /* _iTokenBorrowed */,
        address /* _iTokenCollateral */,
        address /* _liquidator */,
        address /* _borrower */,
        uint256 /* _repaidAmount */,
        uint256 /* _seizedAmount */
    ) external onlyController {}

    /**
     * @notice Hook function after iToken `seize()`
     * Will `revert()` if any operation fails
     * @param _iTokenCollateral The collateral iToken to be seized
     * #param _iTokenBorrowed The iToken was borrowed
     * @param _liquidator The account which has repaid and seized
     * @param _borrower The account which has borrowed
     * @param _seizedAmount  The amount of collateral being seized
     */
    function afterSeize(
        address _iTokenCollateral,
        address /* _iTokenBorrowed */,
        address _liquidator,
        address _borrower,
        uint256 _seizedAmount
    ) external onlyController {
        if (isEligible[_borrower]) {
            eligibleTotalSupply[_iTokenCollateral] -= _seizedAmount;
            emit EligibleTotalSupplyChanged(
                _iTokenCollateral,
                -(_seizedAmount.toInt256())
            );
        }

        if (isEligible[_liquidator]) {
            eligibleTotalSupply[_iTokenCollateral] += _seizedAmount;
            emit EligibleTotalSupplyChanged(
                _iTokenCollateral,
                (_seizedAmount.toInt256())
            );
        }
    }

    /**
     * @notice Hook function after iToken `transfer()`
     * Will `revert()` if any operation fails
     * @param _iToken The iToken was transfered
     * @param _from The account was transfer from
     * @param _to The account was transfer to
     * @param _amount  The amount was transfered
     */
    function afterTransfer(
        address _iToken,
        address _from,
        address _to,
        uint256 _amount
    ) external onlyController {
        if (isEligible[_from]) {
            eligibleTotalSupply[_iToken] -= _amount;
            emit EligibleTotalSupplyChanged(_iToken, -(_amount.toInt256()));
        }

        if (isEligible[_to]) {
            eligibleTotalSupply[_iToken] += _amount;
            emit EligibleTotalSupplyChanged(_iToken, (_amount.toInt256()));
        }
    }

    /**
     * @notice Hook function after iToken `flashloan()`
     * Will `revert()` if any operation fails
     * #param _iToken The iToken was flashloaned
     * #param _to The account flashloan transfer to
     * #param _amount  The amount was flashloaned
     */
    function afterFlashloan(
        address /* _iToken */,
        address /* _to */,
        uint256 /* _amount */
    ) external onlyController {}

    function _claimBounty(address _account, address _hunter) internal {
        uint256 _length = rewardDistributors.length();
        for (uint256 _i; _i < _length; ) {
            IRewardDistributor(rewardDistributors.at(_i)).claimBounty(
                _account,
                _hunter
            );

            unchecked {
                ++_i;
            }
        }
    }

    /**
     * @notice Internal function for updateEligibleBalance(s)
     * @param _account The _account whose Eligibity will be updated
     * @param _iTokens The list of iTokens of which eligible balances will be updated
     */
    function _updateEligibleBalance(
        address _account,
        address[] memory _iTokens,
        address _hunter
    ) internal {
        (bool _currentEligibility, bool status) = IEligibilityManager(
            eligibilityManager
        ).isEligible(_account);

        if (!status) {
            revert RewardDistributorManager_updateEligibleBalance__InvalidEligibility();
        }

        if (_currentEligibility == isEligible[_account]) return;

        uint256 _length = _iTokens.length;
        for (uint256 _i; _i < _length; ) {
            address _iToken = _iTokens[_i];

            uint256 _supply = IiToken(_iToken).balanceOf(_account);
            (uint256 _borrowBalance, uint256 _borrowIndex) = IiToken(_iToken)
                .borrowSnapshot(_account);
            uint256 _borrow = _borrowIndex > 0
                ? _borrowBalance.rdiv(_borrowIndex)
                : 0;

            if (_supply != 0) {
                updateDistributionState(_iToken, false);
                updateReward(_iToken, _account, false);
            }

            if (_borrow != 0) {
                updateDistributionState(_iToken, true);
                updateReward(_iToken, _account, true);
            }

            if (_currentEligibility) {
                // Ineligible => Eligible
                if (_supply != 0) {
                    eligibleTotalSupply[_iToken] += _supply;

                    emit EligibleTotalSupplyChanged(
                        _iToken,
                        _supply.toInt256()
                    );
                }

                if (_borrow != 0) {
                    eligibleTotalBorrow[_iToken] += _borrow;
                    emit EligibleTotalBorrowChanged(
                        _iToken,
                        _borrow.toInt256()
                    );
                }
            } else {
                // Eligible => Ineligible
                if (_supply != 0) {
                    eligibleTotalSupply[_iToken] -= _supply;
                    emit EligibleTotalSupplyChanged(
                        _iToken,
                        -(_supply.toInt256())
                    );
                }

                if (_borrow != 0) {
                    if (eligibleTotalBorrow[_iToken] > _borrow) {
                        eligibleTotalBorrow[_iToken] -= _borrow;
                    } else {
                        // Rounding errors could leading to mismatch to sum(borrow) and totalBorrow
                        // Just reset eligibleTotalBorrow
                        _borrow = eligibleTotalBorrow[_iToken];
                        eligibleTotalBorrow[_iToken] = 0;
                    }
                    emit EligibleTotalBorrowChanged(
                        _iToken,
                        -(_borrow.toInt256())
                    );
                }
            }

            unchecked {
                ++_i;
            }
        }

        isEligible[_account] = _currentEligibility;
        emit EligibilityChanged(_account, _currentEligibility);

        if (!_currentEligibility && _hunter != address(0)) {
            _claimBounty(_account, _hunter);
        }
    }

    function updateEligibleBalance(address _account) external {
        _updateEligibleBalance(
            _account,
            controller.getAlliTokens(),
            address(0)
        );
    }

    function updateEligibleBalances(address[] memory _accounts) public {
        address[] memory _iTokens = controller.getAlliTokens();

        uint256 _len = _accounts.length;
        for (uint256 j = 0; j < _len; j++) {
            _updateEligibleBalance(_accounts[j], _iTokens, address(0));
        }
    }

    function claimBounty(address[] calldata _accounts) external {
        address[] memory _iTokens = controller.getAlliTokens();

        uint256 _len = _accounts.length;
        for (uint256 j = 0; j < _len; j++) {
            _updateEligibleBalance(_accounts[j], _iTokens, msg.sender);
        }
    }
}
