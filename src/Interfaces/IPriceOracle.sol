//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IPriceOracle {
    /**
     * @notice Get the price of a underlying asset
     * @param _iToken The iToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18).
     *  Zero means the price is unavailable and whether the price is valid.
     */
    function getUnderlyingPriceAndStatus(
        address _iToken
    ) external returns (uint256, bool);
}
