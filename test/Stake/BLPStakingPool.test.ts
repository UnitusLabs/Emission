import chai, {expect} from "chai";
import {ethers} from "hardhat";
import {Contract} from "ethers";
import {setupBLPEnv} from "../utils";

describe("BLPStakingPool", async function () {
  let owner: any;
  let accounts: any;
  let newRewardDistributorManager: Contract;
  let newBLPRewardDistributor: Contract;

  before(async () => {
    const {deployer, users} = await setupBLPEnv();
    owner = deployer;
    accounts = users;

    // Get free LP tokens
    const mintAmount = ethers.utils.parseEther("1000000");
    for (let i = 0; i < accounts.length; i++) {
      await owner.dfUtsLp.mint(accounts[i].address, mintAmount);
      await owner.utsUsxLp.mint(accounts[i].address, mintAmount);
    }

    // Deploy a new reward distributor manager
    const rewardManagerFactory = await ethers.getContractFactory('RewardDistributorManager');
    newRewardDistributorManager = await rewardManagerFactory.deploy(
      owner.controller.address
    );
    await newRewardDistributorManager.deployed();
    // Deploy a new reward distributor for dfUtsStakingPool
    const rewardDistributorFactory = await ethers.getContractFactory('BLPReward');
    newBLPRewardDistributor = await rewardDistributorFactory.deploy(
      owner.dfUtsStakingPool.address,
      owner.ARB.address,
      owner.address
    );
    await newBLPRewardDistributor.deployed();
  });

  describe("Initialize", async function () {
    it("Should revert when initialize twice", async () => {
      await expect(
        owner.utsUsxStakingPool.initialize(owner.utsUsxLp.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("_setRewardDistributorManager", async function () {
    it("Should set a new reward distributor manager", async () => {
      let oldRewardDistributorManager = await owner.dfUtsStakingPool.rewardDistributorManager();
      // Set new reward distributor manager
      await expect(
        owner.dfUtsStakingPool._setRewardDistributorManager(
          newRewardDistributorManager.address
        )
      ).to.emit(owner.dfUtsStakingPool, "NewRewardDistributorManager")
        .withArgs(newRewardDistributorManager.address);

      // Revert to the old reward distributor manager
      await owner.dfUtsStakingPool._setRewardDistributorManager(oldRewardDistributorManager);
    });
    it("Should revert when set an invalid reward distributor manager", async () => {
      await expect(
        owner.dfUtsStakingPool._setRewardDistributorManager(owner.address)
      ).to.be.reverted;
    });
    it("Should revert when a non-owner set a new reward distributor manager", async () => {
      const dfUtsStakingPoolOwner = await owner.dfUtsStakingPool.owner();
      expect(dfUtsStakingPoolOwner).to.not.eq(accounts[0].address);

      await expect(
        accounts[0].dfUtsStakingPool._setRewardDistributorManager(
          newRewardDistributorManager.address
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("_addRewardDistributor", async function () {
    it("Should add a new BLP reward distributor", async () => {
      let beforeRewardDistributorsLength = (await owner.dfUtsStakingPool.getRewardDistributors()).length;
      // Add a new reward distributor
      await expect(
        owner.dfUtsStakingPool._addRewardDistributor(
          newBLPRewardDistributor.address
        )
      ).to.emit(owner.dfUtsStakingPool, "AddRewardDistributor")
        .withArgs(newBLPRewardDistributor.address);
      let afterRewardDistributorsLength = (await owner.dfUtsStakingPool.getRewardDistributors()).length;
      expect(afterRewardDistributorsLength).to.equal(beforeRewardDistributorsLength + 1);
    });
    it("Should revert when new BLP reward distributor address is zero", async () => {
      await expect(
        owner.dfUtsStakingPool._addRewardDistributor(
          ethers.constants.AddressZero
        )
      ).to.be.revertedWithCustomError(
        owner.dfUtsStakingPool,
        "BaseStakingPool_addRewardDistributor__RewardDistributorIsZeroAddress"
      );
    });
    it("Should revert when add an exist new BLP reward distributor", async () => {
      let blpRewardDistributors = await owner.dfUtsStakingPool.getRewardDistributors();
      // Has at least one BLP reward distributor
      expect(blpRewardDistributors.length).to.be.gt(0);

      await expect(
        owner.dfUtsStakingPool._addRewardDistributor(
          blpRewardDistributors[0]
        )
      ).to.be.revertedWithCustomError(
        owner.dfUtsStakingPool,
        "BaseStakingPool_addRewardDistributor__RewardDistributorAlreadyExist"
      );
    });
    it("Should revert when a non-owner add a new BLP reward distributor", async () => {
      const dfUtsStakingPoolOwner = await owner.dfUtsStakingPool.owner();
      expect(dfUtsStakingPoolOwner).to.not.eq(accounts[0].address);

      await expect(
        accounts[0].dfUtsStakingPool._addRewardDistributor(
          newBLPRewardDistributor.address
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("_removeRewardDistributor", async function () {
    it("Should remove a BLP reward distributor", async () => {
      let blpRewardDistributors = await owner.dfUtsStakingPool.getRewardDistributors();
      // Has at least one BLP reward distributor
      expect(blpRewardDistributors.length).to.be.gt(0);

      let beforeRewardDistributorsLength = blpRewardDistributors.length;
      // Remove a reward distributor
      await expect(
        owner.dfUtsStakingPool._removeRewardDistributor(
          blpRewardDistributors[0]
        )
      ).to.emit(owner.dfUtsStakingPool, "RemoveRewardDistributor")
        .withArgs(blpRewardDistributors[0]);
      let afterRewardDistributorsLength = (await owner.dfUtsStakingPool.getRewardDistributors()).length;
      expect(afterRewardDistributorsLength).to.equal(beforeRewardDistributorsLength - 1);

      // Revert to the old reward distributor
      await owner.dfUtsStakingPool._addRewardDistributor(blpRewardDistributors[0]);
    });
    it("Should revert when remove a non-existent BLP reward distributor", async () => {
      await expect(
        owner.dfUtsStakingPool._removeRewardDistributor(
          owner.address
        )
      ).to.be.revertedWithCustomError(
        owner.dfUtsStakingPool,
        "BaseStakingPool_removeRewardDistributor__RewardDistributorDoesNotExist"
      );
    });
    it("Should revert when a non-owner remove a BLP reward distributor", async () => {
      const dfUtsStakingPoolOwner = await owner.dfUtsStakingPool.owner();
      expect(dfUtsStakingPoolOwner).to.not.eq(accounts[0].address);

      let blpRewardDistributors = await owner.dfUtsStakingPool.getRewardDistributors();
      // Has at least one BLP reward distributor
      expect(blpRewardDistributors.length).to.be.gt(0);

      await expect(
        accounts[0].dfUtsStakingPool._removeRewardDistributor(
          blpRewardDistributors[0]
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("stake", async function () {
    it("Should stake successfully", async () => {
      let user0 = accounts[0];
      let stakeAmount = ethers.utils.parseEther("1000");
      let totalStakedBefore = await owner.dfUtsStakingPool.totalSupply();
      let userStakedBefore = await user0.dfUtsStakingPool.balanceOf(user0.address);

      // Stake
      // Approve at first
      await user0.dfUtsLp.approve(owner.dfUtsStakingPool.address, stakeAmount);
      await expect(
        user0.dfUtsStakingPool.stake(user0.address, stakeAmount)
      ).to.emit(owner.dfUtsStakingPool, "Staked")
        .withArgs(
          user0.address,  // spender
          user0.address,  // recipient
          stakeAmount,  // stakeAmount
          await user0.dfUtsStakingPool.balanceOf(user0.address) // totalStaked
        );

      let totalStakedAfter = await owner.dfUtsStakingPool.totalSupply();
      let userStakedAfter = await user0.dfUtsStakingPool.balanceOf(user0.address);

      expect(totalStakedAfter).to.eq(totalStakedBefore.add(stakeAmount));
      expect(userStakedAfter).to.eq(userStakedBefore.add(stakeAmount));
    });
    it("Should revert when stake amount is zero", async () => {
      let stakeAmount = ethers.constants.Zero;
      await expect(
        accounts[0].dfUtsStakingPool.stake(accounts[0].address, stakeAmount)
      ).to.be.revertedWithCustomError(
        owner.dfUtsStakingPool,
        "BaseStakingPool_stake__StakeAmountIsZero"
      );
    });
  });

  describe("withdraw", async function () {
    it("Should withdraw successfully", async () => {
      let user0 = accounts[0];
      let totalStakedBefore = await owner.dfUtsStakingPool.totalSupply();
      let userStakedBefore = await user0.dfUtsStakingPool.balanceOf(user0.address);
      let withdrawAmount = userStakedBefore.div(2);

      // Withdraw
      await expect(
        user0.dfUtsStakingPool.withdraw(withdrawAmount)
      ).to.emit(owner.dfUtsStakingPool, "Withdrawn")
        .withArgs(
          user0.address,  // recipient
          withdrawAmount,  // withdrawAmount
          await user0.dfUtsStakingPool.balanceOf(user0.address) // totalStaked
        );

      let totalStakedAfter = await owner.dfUtsStakingPool.totalSupply();
      let userStakedAfter = await user0.dfUtsStakingPool.balanceOf(user0.address);

      expect(totalStakedAfter).to.eq(totalStakedBefore.sub(withdrawAmount));
      expect(userStakedAfter).to.eq(userStakedBefore.sub(withdrawAmount));
    });
    it("Should revert when withdraw amount is zero", async () => {
      let withdrawAmount = ethers.constants.Zero;
      await expect(
        accounts[0].dfUtsStakingPool.withdraw(withdrawAmount)
      ).to.be.revertedWithCustomError(
        owner.dfUtsStakingPool,
        "BaseStakingPool_withdraw__WithdrawAmountIsZero"
      );
    });
  });
});
