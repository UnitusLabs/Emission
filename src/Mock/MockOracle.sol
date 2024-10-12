// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

// NOTICE: Only for test, no permission
contract MockOracle {
    mapping(address => uint256) internal _assetPrices;
    // For test
    mapping(address => bool) internal _assetStatus;

    function setPrice(address _asset, uint256 _price) external returns (uint256) {
        _assetPrices[_asset] = _price;
        if (!_assetStatus[_asset]) {
            _assetStatus[_asset] = true;
        }
        return _price;
    }

    // For test
    function setPriceAndStatus(address _asset, uint256 _price, bool _status) external returns (uint256, bool) {
        _assetPrices[_asset] = _price;
        _assetStatus[_asset] = _status;
        return (_price, _status);
    }

    function getUnderlyingPrice(address _asset) external returns (uint256) {
        return _assetPrices[_asset];
    }

    function getUnderlyingPriceAndStatus(address _asset) external returns (uint256 _price, bool _status) {
        return (_assetPrices[_asset], _assetStatus[_asset]);
    }
}
