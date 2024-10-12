//SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../Interfaces/Errors.sol";
import "../Interfaces/IBLPStakingPool.sol";
import "../Libraries/Ownable.sol";
import "../Libraries/Initializable.sol";

contract BLPReward is Initializable, Ownable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IBLPStakingPool public stakingPool;
    IERC20Upgradeable public rewardToken;
    address public treasury;

    uint256 public rewardRate = 0;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    uint256 public lastRateUpdateTime;
    uint256 public rewardDistributedStored;

    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    event RewardRateUpdated(uint256 oldRewardRate, uint256 newRewardRate);
    event RewardPaid(address indexed user, uint256 indexed reward);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    modifier updateRewardDistributed() {
        rewardDistributedStored = rewardDistributed();
        lastRateUpdateTime = block.timestamp;
        _;
    }

    constructor(
        IBLPStakingPool _stakingPool,
        IERC20Upgradeable _rewardToken,
        address _treasury
    ) {
        initialize(_stakingPool, _rewardToken, _treasury);
    }

    function initialize(
        IBLPStakingPool _stakingPool,
        IERC20Upgradeable _rewardToken,
        address _treasury
    ) public initializer {
        if (address(_stakingPool) == address(0)) {
            revert BLPReward_initialize__StakingTokenIsZeroAddress();
        }
        if (address(_rewardToken) == address(0)) {
            revert BLPReward_initialize__RewardTokenIsZeroAddress();
        }
        if (_treasury == address(0)) {
            revert BLPReward_initialize__TreasuryIsZeroAddress();
        }

        __Ownable_init();

        stakingPool = _stakingPool;
        rewardToken = _rewardToken;
        treasury = _treasury;

        lastUpdateTime = block.timestamp;
        lastRateUpdateTime = block.timestamp;

        emit TreasuryUpdated(address(0), _treasury);
    }

    function _setTreasury(address _newTreasury) external onlyOwner {
        address _oldTreasury = treasury;

        if (_newTreasury == address(0)) {
            revert BLPReward_setTreasury__TreasuryIsZeroAddress();
        }
        if (_oldTreasury == _newTreasury) {
            revert BLPReward_setTreasury__SameTreasuryAddress();
        }

        treasury = _newTreasury;

        emit TreasuryUpdated(_oldTreasury, _newTreasury);
    }

    function updateReward(address _account) public {
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = block.timestamp;
        if (_account != address(0)) {
            rewards[_account] = earned(_account);
            userRewardPerTokenPaid[_account] = rewardPerTokenStored;
        }
    }

    function rewardPerToken() public view returns (uint256) {
        if (stakingPool.totalSupply() == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored.add(
                block.timestamp.sub(lastUpdateTime).mul(rewardRate).mul(1e18).div(
                    stakingPool.totalSupply()
                )
            );
    }

    function rewardDistributed() public view returns (uint256) {
        return
            rewardDistributedStored.add(
                block.timestamp.sub(lastRateUpdateTime).mul(
                    rewardRate
                )
            );
    }

    function earned(address _account) public view returns (uint256) {
        return
            stakingPool.balanceOf(_account)
                .mul(rewardPerToken().sub(userRewardPerTokenPaid[_account]))
                .div(1e18)
                .add(rewards[_account]);
    }

    function getReward(address _account) public {
        updateReward(_account);

        uint256 _reward = rewards[_account];
        if (_reward > 0) {
            rewards[_account] = 0;
            rewardToken.safeTransferFrom(owner, _account, _reward);
            emit RewardPaid(_account, _reward);
        }
    }

    function setRewardRate(uint256 _rewardRate)
        external
        onlyOwner
        updateRewardDistributed
    {
        updateReward(address(0));

        uint256 _oldRewardRate = rewardRate;
        rewardRate = _rewardRate;

        emit RewardRateUpdated(_oldRewardRate, _rewardRate);
    }

    // This function allows governance to take unsupported tokens out of the
    // contract, since this one exists longer than the other pools.
    // This is in an effort to make someone whole, should they seriously
    // mess up. There is no guarantee governance will vote to return these.
    // It also allows for removal of airdropped tokens.
    function rescueTokens(
        IERC20Upgradeable _token,
        uint256 _amount,
        address _to
    ) external onlyOwner {
        // transfer _to
        _token.safeTransfer(_to, _amount);
    }
}
