// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./MockController.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// NOTICE: Only for test, no permission
contract MockiToken is ERC20 {
    address public underlying;
    MockController public controller;

    struct BorrowSnapshot {
        uint256 principal;
        uint256 interestIndex;
    }

    mapping(address => BorrowSnapshot) internal accountBorrows;

    constructor(
        string memory _name,
        string memory _symbol,
        address _underlying,
        address _controller
    ) ERC20(_name, _symbol) {
        underlying = _underlying;
        controller = MockController(_controller);
    }

    function mint(address _to, uint256 _amount, bool _refreshEligibility) external {
        controller.beforeMint(address(this), _to, _amount);

        _mint(_to, _amount);
        ERC20(underlying).transferFrom(msg.sender, address(this), _amount);
        // Exchange rate is 1:1
        uint256 mintTokens = _amount;

        controller.afterMint(
            address(this),
            _to,
            _amount,
            mintTokens
        );

        if (_refreshEligibility) {
            controller.refreshEligibility(_to);
        }
    }

    function redeem(
        address _from,
        uint256 _redeemiToken,
        bool refreshEligibility
    ) external {
        controller.beforeRedeem(address(this), _from, _redeemiToken);

        _burn(msg.sender, _redeemiToken);
        // Exchange rate is 1:1
        uint256 _redeemTokens = _redeemiToken;
        ERC20(underlying).transfer(msg.sender, _redeemTokens);

        controller.afterRedeem(
            address(this),
            _from,
            _redeemiToken,
            _redeemTokens
        );

        if (refreshEligibility) {
            controller.refreshEligibility(_from);
        }
    }

    function borrow(uint256 _borrowAmount, bool refreshEligibility) external {
        controller.beforeBorrow(address(this), msg.sender, _borrowAmount);

        accountBorrows[msg.sender].principal += _borrowAmount;
        ERC20(underlying).transfer(msg.sender, _borrowAmount);

        controller.afterBorrow(address(this), msg.sender, _borrowAmount);

        if (refreshEligibility) {
            controller.refreshEligibility(msg.sender);
        }
    }

    function _repayInternal(
        address _payer,
        address _borrower,
        uint256 _repayAmount
    ) internal returns (uint256) {
       controller.beforeRepayBorrow(
            address(this),
            _payer,
            _borrower,
            _repayAmount
        );

        ERC20(underlying).transferFrom(_payer, address(this), _repayAmount);
        accountBorrows[_borrower].principal -= _repayAmount;

        // Defense hook.
        controller.afterRepayBorrow(
            address(this),
            _payer,
            _borrower,
            _repayAmount
        );

        return _repayAmount;
    }

    function repayBorrow(
        uint256 _repayAmount,
        bool refreshEligibility
    ) external {
        _repayInternal(msg.sender, msg.sender, _repayAmount);

        if (refreshEligibility) {
            controller.refreshEligibility(msg.sender);
        }
    }

    function _seizeInternal(
        address _seizerToken,
        address _liquidator,
        address _borrower,
        uint256 _seizeTokens
    ) internal {
        controller.beforeSeize(
            address(this),
            _seizerToken,
            _liquidator,
            _borrower,
            _seizeTokens
        );

        /**
         * Calculates the new _borrower and _liquidator token balances,
         * that is transfer `_seizeTokens` iToken from `_borrower` to `_liquidator`.
         */
        _transfer(_borrower, _liquidator, _seizeTokens);

        // Hook checks.
        controller.afterSeize(
            address(this),
            _seizerToken,
            _liquidator,
            _borrower,
            _seizeTokens
        );
    }

    function seize(
        address _liquidator,
        address _borrower,
        uint256 _seizeTokens
    ) external {
        _seizeInternal(msg.sender, _liquidator, _borrower, _seizeTokens);
    }

    function liquidateBorrow(
        address _borrower,
        uint256 _repayAmount,
        address _assetCollateral,
        bool refreshEligibility
    ) external {
        controller.beforeLiquidateBorrow(
            address(this),
            _assetCollateral,
            msg.sender,
            _borrower,
            _repayAmount
        );

        uint256 _actualRepayAmount =
            _repayInternal(msg.sender, _borrower, _repayAmount);

        // Calculates the number of collateral tokens that will be seized
        uint256 _seizeTokens =
            controller.liquidateCalculateSeizeTokens(
                address(this),
                _assetCollateral,
                _actualRepayAmount
            );

        // If this is also the collateral, calls seizeInternal to avoid re-entrancy,
        // otherwise make an external call.
        if (_assetCollateral == address(this)) {
            _seizeInternal(address(this), msg.sender, _borrower, _seizeTokens);
        } else {
            MockiToken(_assetCollateral).seize(msg.sender, _borrower, _seizeTokens);
        }

        controller.afterLiquidateBorrow(
            address(this),
            _assetCollateral,
            msg.sender,
            _borrower,
            _actualRepayAmount,
            _seizeTokens
        );

        if (refreshEligibility) {
            address[] memory accounts = new address[](2);
            accounts[0] = _borrower;
            accounts[1] = msg.sender;
            controller.refreshEligibilities(accounts);
        }
    }

    function borrowSnapshot(address _account) external view returns (uint256, uint256) {
        return (accountBorrows[_account].principal, 1e18);
    }

    function exchangeRateStored() external pure returns (uint256) {
        // Exchange rate is 1:1 when testing
        return 1e18;
    }

    function borrowIndex() external pure returns (uint256) {
        // Borrow index is 1e18 when testing
        return 1e18;
    }
}
