//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "./Interfaces/IiToken.sol";
import "./Interfaces/IRewardDistributor.sol";
import "./Interfaces/IController.sol";
import "./Interfaces/IPriceOracle.sol";
import "./Interfaces/IBLPStakingPool.sol";
import "./Interfaces/Errors.sol";
import "./Libraries/RatioMath.sol";
import "./Libraries/Ownable.sol";
import "./Libraries/Initializable.sol";

/**
 * @title dForce's lending reward distributor Contract
 * @author dForce
 */
contract EligibilityManager is Initializable, Ownable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;
    using RatioMath for uint256;

    /// @notice the controller
    address public controller;

    /// @notice the oracle
    address public oracle;

    uint256 public thresholdRatio;
    event NewThresholdRatio(uint256 thresholdRatio);

    /// @dev EnumerableMap of all BLP Staking Pools
    EnumerableSetUpgradeable.AddressSet internal BLPStakingPools;
    event AddBLPStakingPool(address stakingPool, address BLP);
    event RemoveBLPStakingPool(address stakingPool);

    /// @notice the blp token of each blp staking pool
    mapping(address => address) public BLPs;

    /// @dev Eligible supplied iToken
    EnumerableSetUpgradeable.AddressSet internal validSupplies;

    event AddValidSupply(address iToken);
    event RemoveValidSupply(address iToken);

    constructor(address _controller, uint256 _ratio) {
        initialize(_controller, _ratio);
    }

    /**
     * @notice Ensure this is a EligibilityManager contract.
     */
    function isEligibilityManager() external pure returns (bool) {
        return true;
    }

    /**
     * @notice Initializes the contract.
     */
    function initialize(
        address _controller,
        uint256 _ratio
    ) public initializer {
        if (!IController(_controller).isController()) {
            revert EligibilityManager_initialize__InvalidController();
        }

        __Ownable_init();
        controller = _controller;
        oracle = IController(controller).priceOracle();

        thresholdRatio = _ratio;
        emit NewThresholdRatio(_ratio);
    }

    function _addBLPStakingPoolInternal(address _stakingPool) internal {
        if (!IBLPStakingPool(_stakingPool).isStakingPool()) {
            revert EligibilityManager_addBLPStakingPoolInternal__InvalidStakingPool(
                _stakingPool
            );
        }

        if (BLPStakingPools.add(_stakingPool)) {
            address _blp = IBLPStakingPool(_stakingPool).stakingToken();

            BLPs[_stakingPool] = _blp;

            emit AddBLPStakingPool(_stakingPool, _blp);
        } else {
            revert EligibilityManager_addBLPStakingPoolInternal__StakingPoolAlreadyExist(
                _stakingPool
            );
        }
    }

    function _addBLPStakingPool(address _stakingPool) external onlyOwner {
        _addBLPStakingPoolInternal(_stakingPool);
    }

    function _addBLPStakingPools(
        address[] calldata _stakingPools
    ) external onlyOwner {
        uint256 _length = _stakingPools.length;
        for (uint256 _i; _i < _length; ) {
            _addBLPStakingPoolInternal(_stakingPools[_i]);

            unchecked {
                ++_i;
            }
        }
    }

    function _removeBLPStakingPoolInternal(address _stakingPool) internal {
        if (BLPStakingPools.remove(_stakingPool)) {
            delete BLPs[_stakingPool];

            emit RemoveBLPStakingPool(_stakingPool);
        } else {
            revert EligibilityManager_removeBLPStakingPoolInternal__StakingPoolDoesNotExist(
                _stakingPool
            );
        }
    }

    function _removeBLPStakingPool(address _stakingPool) external onlyOwner {
        _removeBLPStakingPoolInternal(_stakingPool);
    }

    function _removeBLPStakingPools(
        address[] calldata _stakingPools
    ) external onlyOwner {
        uint256 _length = _stakingPools.length;
        for (uint256 _i; _i < _length; ) {
            _removeBLPStakingPoolInternal(_stakingPools[_i]);

            unchecked {
                ++_i;
            }
        }
    }

    function _addValidSupplyInternal(address _iToken) internal {
        if (!IController(controller).hasiToken(_iToken)) {
            revert EligibilityManager_addValidSupplyInternal__InvalidSupply(
                _iToken
            );
        }

        if (validSupplies.add(_iToken)) {
            emit AddValidSupply(_iToken);
        } else {
            revert EligibilityManager_addValidSupplyInternal__ValidSupplyAlreadyExist(
                _iToken
            );
        }
    }

    function _addValidSupply(address _iToken) external onlyOwner {
        _addValidSupplyInternal(_iToken);
    }

    function _addValidSupplies(address[] calldata _iTokens) external onlyOwner {
        uint256 _length = _iTokens.length;
        for (uint256 _i; _i < _length; ) {
            _addValidSupplyInternal(_iTokens[_i]);

            unchecked {
                ++_i;
            }
        }
    }

    function _removeValidSupplyInternal(address _iToken) internal {
        if (validSupplies.remove(_iToken)) {
            emit RemoveValidSupply(_iToken);
        } else {
            revert EligibilityManager_removeValidSupplyInternal__ValidSupplyDoesNotExist(
                _iToken
            );
        }
    }

    function _removeValidSupply(address _iToken) external onlyOwner {
        _removeValidSupplyInternal(_iToken);
    }

    function _removeValidSupplies(
        address[] calldata _iTokens
    ) external onlyOwner {
        uint256 _length = _iTokens.length;
        for (uint256 _i; _i < _length; ) {
            _removeValidSupplyInternal(_iTokens[_i]);

            unchecked {
                ++_i;
            }
        }
    }

    function _setThresholdRatio(uint256 _ratio) external onlyOwner {
        thresholdRatio = _ratio;
        emit NewThresholdRatio(_ratio);
    }

    function hasBLPStakingPool(address _stakingPool)
        external
        view
        returns (bool)
    {
        return BLPStakingPools.contains(_stakingPool);
    }

    function getBLPStakingPools() external view returns (address[] memory) {
        return BLPStakingPools.values();
    }

    function getValidSupplies() external view returns (address[] memory) {
        return validSupplies.values();
    }

    function _getBLPValue(
        address _account
    ) internal returns (uint256 value, bool status) {
        address[] memory _BLPStakingPools = BLPStakingPools.values();
        uint256 _len = _BLPStakingPools.length;
        status = true;

        for (uint256 _i = 0; _i < _len; ) {
            address _blpStaking = _BLPStakingPools[_i];
            address _blp = BLPs[_blpStaking];

            uint256 _staked = IERC20Upgradeable(_blpStaking).balanceOf(
                _account
            );
            if (_staked != 0) {
                (uint256 _price, bool _priceStatus) = IPriceOracle(oracle)
                    .getUnderlyingPriceAndStatus(_blp);

                if (!_priceStatus) {
                    return (0, false);
                }

                value = value + _staked * _price;
            }

            unchecked {
                ++_i;
            }
        }
    }

    function _getSupplyValue(
        address _account
    ) internal returns (uint256 value, bool status) {
        address[] memory _iTokens = validSupplies.values();
        uint256 _len = _iTokens.length;
        status = true;

        for (uint256 _i = 0; _i < _len; ) {
            address _iToken = _iTokens[_i];

            uint256 _supply = IiToken(_iToken).balanceOf(_account);
            if (_supply != 0) {
                uint256 _exchangeRate = IiToken(_iToken).exchangeRateStored();
                (uint256 _price, bool _priceStatus) = IPriceOracle(oracle)
                    .getUnderlyingPriceAndStatus(_iToken);

                if (!_priceStatus) {
                    return (0, false);
                }

                value = value + _supply.rmul(_exchangeRate) * _price;
            }

            unchecked {
                ++_i;
            }
        }
    }

    function isEligible(address _account) external returns (bool, bool) {
        if (thresholdRatio == 0) {
            return (true, true);
        }

        (uint256 _BLPValue, bool _BLPStatus) = _getBLPValue(_account);
        if (!_BLPStatus) {
            return (false, false);
        }

        (uint256 _supplyValue, bool _supplyStatus) = _getSupplyValue(_account);
        if (!_supplyStatus) {
            return (false, false);
        }

        return (_BLPValue > _supplyValue.rmul(thresholdRatio), true);
    }

    /**
     * @dev For external query value and status
     */
    function getBLPValue(
        address _account
    ) external returns (uint256 value, bool status) {
        address[] memory _BLPStakingPools = BLPStakingPools.values();
        uint256 _len = _BLPStakingPools.length;
        status = true;

        for (uint256 _i = 0; _i < _len; ) {
            address _blpStaking = _BLPStakingPools[_i];
            address _blp = BLPs[_blpStaking];

            uint256 _staked = IERC20Upgradeable(_blpStaking).balanceOf(
                _account
            );
            if (_staked != 0) {
                (uint256 _price, bool _priceStatus) = IPriceOracle(oracle)
                    .getUnderlyingPriceAndStatus(_blp);

                if (!_priceStatus && status) {
                    status = false;
                }

                value = value + _staked * _price;
            }

            unchecked {
                ++_i;
            }
        }
    }

    /**
     * @dev For external query value and status
     */
    function getSupplyValue(
        address _account
    ) external returns (uint256 value, bool status) {
        address[] memory _iTokens = validSupplies.values();
        uint256 _len = _iTokens.length;
        status = true;

        for (uint256 _i = 0; _i < _len; ) {
            address _iToken = _iTokens[_i];

            uint256 _supply = IiToken(_iToken).balanceOf(_account);
            if (_supply != 0) {
                uint256 _exchangeRate = IiToken(_iToken).exchangeRateStored();
                (uint256 _price, bool _priceStatus) = IPriceOracle(oracle)
                    .getUnderlyingPriceAndStatus(_iToken);

                if (!_priceStatus && status) {
                    status = false;
                }

                value = value + _supply.rmul(_exchangeRate) * _price;
            }

            unchecked {
                ++_i;
            }
        }
    }
}
