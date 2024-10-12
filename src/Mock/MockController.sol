// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "../RewardDistributorManager.sol";
import "./MockOracle.sol";
import "./MockiToken.sol";

// NOTICE: Only for test, no permission
contract MockController {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    EnumerableSetUpgradeable.AddressSet internal iTokens;
    // Reward Distributor Manager
    RewardDistributorManager public rewardDistributor;

    MockOracle public priceOracle;

    constructor(address _oracle, address _rewardDistributor) {
        priceOracle = MockOracle(_oracle);
        rewardDistributor = RewardDistributorManager(_rewardDistributor);
    }

    function isController() external pure returns (bool) {
        return true;
    }

    function beforeMint(
        address _iToken,
        address _minter,
        uint256 _mintAmount
    ) external {
        // Update the Reward Distribution Supply state and distribute reward to suppplier
        rewardDistributor.updateDistributionState(
            _iToken,
            false
        );
        rewardDistributor.updateReward(
            _iToken,
            _minter,
            false
        );
    }

    function afterMint(
        address _iToken,
        address _minter,
        uint256 _mintAmount,
        uint256 _mintedAmount
    ) public {
        if (msg.sender == _iToken) {
            rewardDistributor.afterMint(
                _iToken,
                _minter,
                _mintAmount,
                _mintedAmount
            );
        }
    }

    function beforeRedeem(
        address _iToken,
        address _redeemer,
        uint256 _redeemAmount
    ) external {
        // Update the Reward Distribution Supply state and distribute reward to suppplier
        rewardDistributor.updateDistributionState(
            _iToken,
            false
        );
        rewardDistributor.updateReward(
            _iToken,
            _redeemer,
            false
        );
    }

    function afterRedeem(
        address _iToken,
        address _redeemer,
        uint256 _redeemAmount,
        uint256 _redeemedUnderlying
    ) public {
        if (msg.sender == _iToken) {
            rewardDistributor.afterRedeem(
                _iToken,
                _redeemer,
                _redeemAmount,
                _redeemedUnderlying
            );
        }
    }

    function beforeBorrow(
        address _iToken,
        address _borrower,
        uint256 _borrowAmount
    ) external {
        // Update the Reward Distribution Supply state and distribute reward to suppplier
        rewardDistributor.updateDistributionState(
            _iToken,
            false
        );
        rewardDistributor.updateReward(
            _iToken,
            _borrower,
            false
        );
    }

    function afterBorrow(
        address _iToken,
        address _borrower,
        uint256 _borrowedAmount
    ) public {
        if (msg.sender == _iToken) {
            rewardDistributor.afterBorrow(
                _iToken,
                _borrower,
                _borrowedAmount
            );
        }
    }

    function beforeRepayBorrow(
        address _iToken,
        address _payer,
        address _borrower,
        uint256 _repayAmount
    ) public {
        // Update the Reward Distribution Borrow state and distribute reward to borrower
        rewardDistributor.updateDistributionState(
            _iToken,
            true
        );
        rewardDistributor.updateReward(
            _iToken,
            _borrower,
            true
        );
    }

    function afterRepayBorrow(
        address _iToken,
        address _payer,
        address _borrower,
        uint256 _repayAmount
    ) public  {
        if (msg.sender == _iToken) {
            rewardDistributor.afterRepayBorrow(
                _iToken,
                _payer,
                _borrower,
                _repayAmount
            );
        }
    }

    function beforeLiquidateBorrow(
        address _iTokenBorrowed,
        address _iTokenCollateral,
        address _liquidator,
        address _borrower,
        uint256 _repayAmount
    ) external {
        // When test, do nothing
        _iTokenBorrowed;
    }

    function afterLiquidateBorrow(
        address _iTokenBorrowed,
        address _iTokenCollateral,
        address _liquidator,
        address _borrower,
        uint256 _repaidAmount,
        uint256 _seizedAmount
    ) external {
        if (msg.sender == _iTokenBorrowed) {
            rewardDistributor.afterLiquidateBorrow(
                _iTokenBorrowed,
                _iTokenCollateral,
                _liquidator,
                _borrower,
                _repaidAmount,
                _seizedAmount
            );
        }
    }

    function liquidateCalculateSeizeTokens(
        address _iTokenBorrowed,
        address _iTokenCollateral,
        uint256 _actualRepayAmount
    ) external /*view*/ returns (uint256 _seizedTokenCollateral) {
        uint256 _liquidationIncentiveMantissa = 7e16; // 7%
        /* Read oracle prices for borrowed and collateral assets */
        uint256 _priceBorrowed =
            priceOracle.getUnderlyingPrice(_iTokenBorrowed);
        uint256 _priceCollateral =
            priceOracle.getUnderlyingPrice(_iTokenCollateral);


        uint256 _valueRepayPlusIncentive =
            _actualRepayAmount * (_priceBorrowed) * (
                _liquidationIncentiveMantissa
            ) / 1e18;

        // Use stored value here as it is view function
        uint256 _exchangeRateMantissa =
            MockiToken(_iTokenCollateral).exchangeRateStored();

        // seizedTokenCollateral = valueRepayPlusIncentive / valuePerTokenCollateral
        // valuePerTokenCollateral = exchangeRateMantissa * priceCollateral
        _seizedTokenCollateral = _valueRepayPlusIncentive
            * 1e18 / _exchangeRateMantissa / _priceCollateral;
    }

    function beforeSeize(
        address _iTokenCollateral,
        address _iTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint256 _seizeAmount
    ) external {
        // Update the Reward Distribution Supply state on collateral
        rewardDistributor.updateDistributionState(
            _iTokenCollateral,
            false
        );

        // Update reward of liquidator and borrower on collateral
        rewardDistributor.updateReward(
            _iTokenCollateral,
            _liquidator,
            false
        );
        rewardDistributor.updateReward(
            _iTokenCollateral,
            _borrower,
            false
        );

        _seizeAmount;
    }

    function afterSeize(
        address _iTokenCollateral,
        address _iTokenBorrowed,
        address _liquidator,
        address _borrower,
        uint256 _seizedAmount
    ) public {
        if (msg.sender == _iTokenCollateral) {
            rewardDistributor.afterSeize(
                _iTokenCollateral,
                _iTokenBorrowed,
                _liquidator,
                _borrower,
                _seizedAmount
            );
        }
    }

    function beforeTransfer(
        address _iToken,
        address _from,
        address _to,
        uint256 _amount
    ) external {
        // Update the Reward Distribution supply state
        rewardDistributor.updateDistributionState(
            _iToken,
            false
        );

        // Update reward of from and to
        rewardDistributor.updateReward(
            _iToken,
            _from,
            false
        );
        rewardDistributor.updateReward(_iToken, _to, false);
    }

    function afterTransfer(
        address _iToken,
        address _from,
        address _to,
        uint256 _amount
    ) public {
        if (msg.sender == _iToken) {
            rewardDistributor.afterTransfer(
                _iToken,
                _from,
                _to,
                _amount
            );
        }
    }

    function _setRewardDistributor(address _rewardDistributor) external {
        rewardDistributor = RewardDistributorManager(_rewardDistributor);
    }

    function refreshEligibility(address _account) public {
        rewardDistributor.updateEligibleBalance(
            _account
        );
    }

    function refreshEligibilities(address[] memory _accounts) public {
        rewardDistributor.updateEligibleBalances(
            _accounts
        );
    }

    function _addMarket(
        address _iToken,
        uint256 /*_collateralFactor*/,
        uint256 /*_borrowFactor*/,
        uint256 /*_supplyCapacity*/,
        uint256 /*_borrowCapacity*/,
        uint256 _distributionFactor
    ) external {
        // Market must not have been listed, EnumerableSet.add() will return false if it exsits
        require(iTokens.add(_iToken), "Token has already been listed");

        rewardDistributor._addRecipient(
            _iToken,
            _distributionFactor
        );
    }

    function hasiToken(address _iToken) external view returns (bool) {
        return iTokens.contains(_iToken);
    }

    function getAlliTokens() external view returns (address[] memory _alliTokens) {
        EnumerableSetUpgradeable.AddressSet storage _iTokens = iTokens;

        uint256 _len = _iTokens.length();
        _alliTokens = new address[](_len);
        for (uint256 i = 0; i < _len; i++) {
            _alliTokens[i] = _iTokens.at(i);
        }
    }
}
