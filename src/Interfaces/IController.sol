//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
pragma experimental ABIEncoderV2;

interface IController {
    /**
     * @notice Security checks when updating the comptroller of a market, always expect to return true.
     */
    function isController() external view returns (bool);

    /**
     * @notice Return all of the iTokens
     * @return The list of iToken addresses
     */
    function getAlliTokens() external view returns (address[] memory);

    /**
     * @notice Check whether a iToken is listed in controller
     * @param _iToken The iToken to check for
     * @return true if the iToken is listed otherwise false
     */
    function hasiToken(address _iToken) external view returns (bool);

    function priceOracle() external view returns (address);
    function rewardDistributor() external view returns (address);
}
