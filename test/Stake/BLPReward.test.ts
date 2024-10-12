import chai, {expect} from "chai";
import {ethers} from "hardhat";
import {
  currentTime,
  increaseTime,
  mine,
  setNextBlockTime,
  setupBLPEnv,
} from "../utils";

describe("BLPReward", async function () {
  let owner: any;
  let accounts: any;

  before(async () => {
    const {deployer, users} = await setupBLPEnv();
    owner = deployer;
    accounts = users;

    // Approve to BLP reward distributor to distribute reward
    await owner.ARB.approve(
      owner.dfUtsBLPRewardDistributor.address,
      ethers.constants.MaxUint256
    );

    await owner.UTS.approve(
      owner.utsUsxBLPRewardDistributor.address,
      ethers.constants.MaxUint256
    );
  });

  describe("Initialize", async function () {
    it("Should revert when initialize twice", async () => {
      await expect(
        owner.dfUtsBLPRewardDistributor.initialize(
          owner.dfUtsStakingPool.address,
          owner.UTS.address,
          owner.address
        )
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("_setTreasury", async function () {
    it("Should set a new treasury", async () => {
      let oldTreasury = await owner.dfUtsBLPRewardDistributor.treasury();
      let newTreasury = accounts[0].address;
      // New treasury is not equal to current treasury
      expect(newTreasury).to.not.eq(oldTreasury);
      // Set new treasury
      await expect(owner.dfUtsBLPRewardDistributor._setTreasury(newTreasury))
        .to.emit(owner.dfUtsBLPRewardDistributor, "TreasuryUpdated")
        .withArgs(oldTreasury, newTreasury);
      // Check the new treasury
      expect(newTreasury).to.eq(
        await owner.dfUtsBLPRewardDistributor.treasury()
      );
      // Revert to old treasury
      await owner.dfUtsBLPRewardDistributor._setTreasury(oldTreasury);
    });
    it("Should revert when treasury is zero address", async () => {
      let zeroAddress = ethers.constants.AddressZero;
      await expect(
        owner.dfUtsBLPRewardDistributor._setTreasury(zeroAddress)
      ).to.be.revertedWithCustomError(
        owner.dfUtsBLPRewardDistributor,
        "BLPReward_setTreasury__TreasuryIsZeroAddress"
      );
    });
    it("Should revert when set the same treasury", async () => {
      let treasury = await owner.dfUtsBLPRewardDistributor.treasury();
      await expect(
        owner.dfUtsBLPRewardDistributor._setTreasury(treasury)
      ).to.be.revertedWithCustomError(
        owner.dfUtsBLPRewardDistributor,
        "BLPReward_setTreasury__SameTreasuryAddress"
      );
    });
    it("Should revert when set treasury by non-owner", async () => {
      let user0 = accounts[0];
      let blpRewardDistributorOwner =
        await owner.dfUtsBLPRewardDistributor.owner();
      // User0 is not owner
      expect(user0).to.not.eq(blpRewardDistributorOwner);
      await expect(
        user0.dfUtsBLPRewardDistributor._setTreasury(user0.address)
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("setRewardRate", async function () {
    it("Should set a new reward rate", async () => {
      let oldRewardRate = await owner.dfUtsBLPRewardDistributor.rewardRate();
      let newRewardRate = ethers.utils.parseEther("0.1");
      // New reward is not equal to current reward
      expect(newRewardRate).to.not.eq(oldRewardRate);
      // Set new reward rate
      await expect(owner.dfUtsBLPRewardDistributor.setRewardRate(newRewardRate))
        .to.emit(owner.dfUtsBLPRewardDistributor, "RewardRateUpdated")
        .withArgs(oldRewardRate, newRewardRate);
      // Revert to old reward rate
      await owner.dfUtsBLPRewardDistributor.setRewardRate(oldRewardRate);
    });
    it("Should revert when set reward rate by non-owner", async () => {
      let user0 = accounts[0];
      let blpRewardDistributorOwner =
        await owner.dfUtsBLPRewardDistributor.owner();
      // User0 is not owner
      expect(user0).to.not.eq(blpRewardDistributorOwner);
      await expect(
        user0.dfUtsBLPRewardDistributor.setRewardRate(
          ethers.utils.parseEther("0.1")
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("rescueTokens", async function () {
    it("Should rescue tokens", async () => {
      let token = owner.UTS;
      let amount = ethers.utils.parseEther("100");
      // Check the reward distributor balance
      let balanceBefore = await token.balanceOf(
        owner.dfUtsBLPRewardDistributor.address
      );
      // Transfer some tokens to the reward distributor
      await token.transfer(owner.dfUtsBLPRewardDistributor.address, amount);
      expect(balanceBefore).to.lt(
        await token.balanceOf(owner.dfUtsBLPRewardDistributor.address)
      );
      balanceBefore = await token.balanceOf(
        owner.dfUtsBLPRewardDistributor.address
      );
      // Check the owner balance
      let ownerBalanceBefore = await token.balanceOf(owner.address);
      // Rescue tokens
      await owner.dfUtsBLPRewardDistributor.rescueTokens(
        token.address,
        amount,
        owner.address
      );
      // Check the reward distributor balance
      let balanceAfter = await token.balanceOf(
        owner.dfUtsBLPRewardDistributor.address
      );
      expect(balanceBefore).to.eq(balanceAfter.add(amount));
      // Check the owner balance
      let ownerBalanceAfter = await token.balanceOf(owner.address);
      expect(ownerBalanceBefore).to.eq(ownerBalanceAfter.sub(amount));
    });
    it("Should revert when rescue tokens by non-owner", async () => {
      let user0 = accounts[0];
      let token = owner.UTS;
      let amount = ethers.utils.parseEther("100");
      let blpRewardDistributorOwner =
        await owner.dfUtsBLPRewardDistributor.owner();
      // User0 is not owner
      expect(user0).to.not.eq(blpRewardDistributorOwner);
      await expect(
        user0.dfUtsBLPRewardDistributor.rescueTokens(
          token.address,
          amount,
          user0.address
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("getReward", async function () {
    it("Should get reward", async () => {
      let user0 = accounts[0];
      let newRewardRate = ethers.utils.parseEther("0.01");
      let stakeAmount = ethers.utils.parseEther("100");
      let rewardDistributor = owner.dfUtsBLPRewardDistributor;
      let rewardPerTokenBefore = await rewardDistributor.rewardPerToken();

      // Get free stake token
      await owner.dfUtsLp.mint(user0.address, stakeAmount);
      // Approve to stake
      await user0.dfUtsLp.approve(user0.dfUtsStakingPool.address, stakeAmount);
      // Stake to get reward
      await user0.dfUtsStakingPool.stake(user0.address, stakeAmount);

      let rewardAmountBefore = await rewardDistributor.earned(user0.address);
      // Set reward rate
      await rewardDistributor.setRewardRate(newRewardRate);
      let rewardDistributedBefore = await rewardDistributor.rewardDistributed();

      // Increase time
      await increaseTime(60 * 60 * 24); // 1 day
      // await setNextBlockTime(await currentTime() + 60*60*24); // 1 day
      let rewardDistributedAfter = await rewardDistributor.rewardDistributed();

      // All distributed reward: 0.01 per second * 86400 seconds = 864
      let expectedRewardDistributed = ethers.utils.parseEther("864");
      expect(rewardDistributedAfter).to.eq(
        rewardDistributedBefore.add(expectedRewardDistributed)
      );
      let rewardAmountAfter = await rewardDistributor.earned(user0.address);
      expect(rewardAmountBefore).to.lt(rewardAmountAfter);

      let rewardPerTokenAfter = await rewardDistributor.rewardPerToken();
      expect(rewardPerTokenBefore).to.lt(rewardPerTokenAfter);

      let user0RewardBalanceBefore = await owner.ARB.balanceOf(user0.address);
      await rewardDistributor.getReward(user0.address);
      let user0RewardBalanceAfter = await owner.ARB.balanceOf(user0.address);
      // Only one user stake, so all reward should be distributed to this user
      // Mine a new block, so reward increase: 0.01 per second * 1 second = 0.01
      let oneSecondReward = ethers.utils.parseEther("0.01");
      expect(user0RewardBalanceAfter).to.eq(
        user0RewardBalanceBefore
          .add(expectedRewardDistributed)
          .add(oneSecondReward)
      );
    });
  });
});
