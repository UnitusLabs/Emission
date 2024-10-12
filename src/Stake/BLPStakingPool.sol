//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;



import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "./BaseStakingPool.sol";
import "../Interfaces/Errors.sol";
import "../Interfaces/IRewardDistributorManager.sol";
import "../Interfaces/IEligibilityManager.sol";
import "../Libraries/Initializable.sol";

contract BLPStakingPool is Initializable, BaseStakingPool {
    IRewardDistributorManager public rewardDistributorManager;

    event NewRewardDistributorManager(address newRewardDistributorManager);

    constructor(
        IERC20Upgradeable _stakingToken
    ) BaseStakingPool(_stakingToken) {}

    function _setRewardDistributorManager(
        IRewardDistributorManager _rewardDistributorManager
    ) external onlyOwner {
        if (!_rewardDistributorManager.isRewardDistributorManager()) {
            revert BLPStakingPool_setRewardDistributorManager__InvalidRewardDistributorManager();
        }

        rewardDistributorManager = _rewardDistributorManager;
        emit NewRewardDistributorManager(address(_rewardDistributorManager));
    }

    function stake(address _recipient, uint256 _amount) public virtual override {
        super.stake(_recipient, _amount);

        IEligibilityManager _eligibilityManager = rewardDistributorManager.eligibilityManager();
        bool _hasBLPStakingPool = _eligibilityManager.hasBLPStakingPool(address(this));
        if (_hasBLPStakingPool) {
            rewardDistributorManager.updateEligibleBalance(_recipient);
        }
    }

    function withdraw(uint256 _amount) public virtual override {
        super.withdraw(_amount);

        IEligibilityManager _eligibilityManager = rewardDistributorManager.eligibilityManager();
        bool _hasBLPStakingPool = _eligibilityManager.hasBLPStakingPool(address(this));
        if (_hasBLPStakingPool) {
            rewardDistributorManager.updateEligibleBalance(msg.sender);
        }
    }
}
