//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IiToken {
    function name() external view returns (string calldata);

    function decimals() external view returns (uint8);

    function balanceOf(address _user) external view returns (uint256);

    function totalSupply() external view returns (uint256);

    function isiToken() external returns (bool);

    function borrowBalanceStored(address _user) external view returns (uint256);

    function borrowIndex() external view returns (uint256);

    function totalBorrows() external view returns (uint256);

    function balanceOfUnderlying(address _account) external returns (uint256);

    function exchangeRateStored() external view returns (uint256);

    function borrowSnapshot(
        address _account
    ) external view returns (uint256, uint256);

    function mint(
        address _to,
        uint256 _amount,
        bool _refreshEligibility
    ) external;

    function redeem(
        address _from,
        uint256 _redeemiToken,
        bool refreshEligibility
    ) external;

    function redeemUnderlying(
        address _from,
        uint256 _redeemiToken,
        bool refreshEligibility
    ) external;

    function borrow(uint256 _borrowAmount, bool refreshEligibility) external;

    function repayBorrow(
        uint256 _repayAmount,
        bool refreshEligibility
    ) external;

    function repayBorrowBehalf(
        address _borrower,
        uint256 _repayAmount,
        bool refreshEligibility
    ) external;

    function liquidateBorrow(
        address _borrower,
        uint256 _repayAmount,
        address _assetCollateral,
        bool refreshEligibility
    ) external;

    function transfer(address recipient, uint256 amount) external;

    function mintForSelfAndEnterMarket(
        uint256 _mintAmount,
        bool refreshEligibility
    ) external;

    function redeemFromSelfAndExitMarket(
        uint256 _redeemiToken,
        bool refreshEligibility
    ) external;
}
