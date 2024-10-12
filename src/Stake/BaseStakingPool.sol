//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "../Interfaces/Errors.sol";
import "../Interfaces/IBLPReward.sol";
import "../Libraries/Initializable.sol";
import "../Libraries/Ownable.sol";


contract BaseStakingPool is Initializable, Ownable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    IERC20Upgradeable public stakingToken;
    uint256 private _totalSupply;
    mapping(address => uint256) private _balances;
    EnumerableSetUpgradeable.AddressSet internal _rewardDistributors;

    event AddRewardDistributor(address _newRewardDistributor);
    event RemoveRewardDistributor(address _oldRewardDistributor);
    event Staked(address spender, address indexed recipient, uint256 indexed stakeAmount, uint256 indexed stakedAmount);
    event Withdrawn(address indexed user, uint256 indexed stakeAmount, uint256 indexed stakedAmount);

    modifier updateReward(address _account) {
        uint256 _length = _rewardDistributors.length();
        for (uint256 _i; _i < _length; ) {
            IBLPReward(_rewardDistributors.at(_i)).updateReward(_account);

            unchecked {
                ++_i;
            }
        }
        _;
    }

    constructor(IERC20Upgradeable _stakingToken) {
        initialize(_stakingToken);
    }

    /*********************************/
    /******** Security Check *********/
    /*********************************/

    /**
     * @notice Ensure this is a Staking Pool contract.
     */
    function isStakingPool() external pure returns (bool) {
        return true;
    }

    function initialize(IERC20Upgradeable _stakingToken) public virtual initializer {
        if (address(_stakingToken) == address(0)) {
            revert BaseStakingPool_initialize__StakingTokenIsZeroAddress();
        }

        __Ownable_init();

        stakingToken = _stakingToken;
    }

    function _addRewardDistributor(
        address _newRewardDistributor
    ) external onlyOwner {
        if (_newRewardDistributor == address(0)) {
            revert BaseStakingPool_addRewardDistributor__RewardDistributorIsZeroAddress();
        }

        if (_rewardDistributors.add(_newRewardDistributor)) {
            emit AddRewardDistributor(_newRewardDistributor);
        } else {
            revert BaseStakingPool_addRewardDistributor__RewardDistributorAlreadyExist();
        }
    }

    function _removeRewardDistributor(
        address _oldRewardDistributor
    ) external onlyOwner {
        if (_rewardDistributors.remove(_oldRewardDistributor)) {
            emit RemoveRewardDistributor(_oldRewardDistributor);
        } else {
            revert BaseStakingPool_removeRewardDistributor__RewardDistributorDoesNotExist();
        }
    }

    function getRewardDistributors() external view returns (address[] memory) {
        return _rewardDistributors.values();
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return _balances[account];
    }

    function stake(address _recipient, uint256 amount) public virtual updateReward(_recipient) {
        if (amount == 0) {
            revert BaseStakingPool_stake__StakeAmountIsZero();
        }

        _totalSupply = _totalSupply + amount;
        _balances[_recipient] = _balances[_recipient] + amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, _recipient, amount, _balances[_recipient]);
    }

    function withdraw(uint256 amount) public virtual updateReward(msg.sender) {
        if (amount == 0) {
            revert BaseStakingPool_withdraw__WithdrawAmountIsZero();
        }

        _totalSupply = _totalSupply - amount;
        _balances[msg.sender] = _balances[msg.sender] - amount;
        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, _balances[msg.sender]);
    }
}
