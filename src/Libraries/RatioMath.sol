//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

library RatioMath {
    uint256 private constant BASE = 10 ** 18;
    uint256 private constant DOUBLE = 10 ** 36;

    function divup(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = (x + (y - 1)) / y;
    }

    function rmul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = (x * y) / BASE;
    }

    function rdiv(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = (x * BASE) / y;
    }

    function rdivup(uint256 x, uint256 y) internal pure returns (uint256 z) {
        z = (x * (BASE) + (y - 1)) / y;
    }
}
