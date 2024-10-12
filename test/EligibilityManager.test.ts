import chai, {expect} from "chai";
import hre, {
  ethers,
  deployments,
  getNamedAccounts,
  getUnnamedAccounts,
} from "hardhat";
import {ERC20, EligibilityManager, IBLPStakingPool} from "../typechain-types";
import {setupMockLending, setupMockBLPStaking} from "./utils";
import {FakeContract, smock} from "@defi-wonderland/smock";
import {utils} from "ethers";
import {getContract} from "../utils/utils";

chai.use(smock.matchers);

describe("EligibilityManager", async function () {
  let lending: any;
  let BLPStaking: any;
  let eligibilityManager: EligibilityManager;
  let controller: any;
  let iTokens: string[];
  let accounts: string[];
  let mockBLPStakingPool1: FakeContract<IBLPStakingPool>;
  let mockBLPStakingPool2: FakeContract<IBLPStakingPool>;
  let mockLp1: FakeContract<ERC20>;
  let mockLp2: FakeContract<ERC20>;

  before(async () => {
    const {deployer} = await getNamedAccounts();

    lending = await setupMockLending();
    BLPStaking = await setupMockBLPStaking();

    await deployments.fixture("EligibilityManager", {
      keepExistingDeployments: true,
    });

    eligibilityManager = await getContract(hre, "eligibilityManager", deployer);
    controller = await getContract(hre, "controller", deployer);

    iTokens = await lending.controller.getAlliTokens();
    accounts = (await getUnnamedAccounts()).splice(0, 2);

    // Mock two new BLP staking pools
    mockBLPStakingPool1 = await smock.fake<IBLPStakingPool>("BLPStakingPool");
    mockLp1 = await smock.fake<ERC20>("ERC20");
    mockBLPStakingPool1.isStakingPool.returns(true);
    mockBLPStakingPool1.stakingToken.returns(mockLp1.address);

    mockBLPStakingPool2 = await smock.fake<IBLPStakingPool>("BLPStakingPool");
    mockLp2 = await smock.fake<ERC20>("ERC20");
    mockBLPStakingPool2.isStakingPool.returns(true);
    mockBLPStakingPool2.stakingToken.returns(mockLp2.address);
  });

  describe("getSupplyValue", async function () {
    let supplied = utils.parseEther("10");
    let price = utils.parseEther("2533");
    let status = true;

    it("valid", async () => {
      lending.iTokens.iETH.balanceOf.returns(supplied);
      lending.iTokens.iETH.exchangeRateStored.returns(utils.parseEther("1"));
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(lending.iTokens.iETH.address)
        .returns([price, status]);

      const supplyValue = await eligibilityManager.callStatic.getSupplyValue(
        accounts[0]
      );

      // console.log(supplyValue.toString());

      expect(supplyValue[0]).to.eq(supplied.mul(price));
      expect(supplyValue[1]).to.eq(true);
    });

    it("invalid", async () => {
      status = false;
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(lending.iTokens.iETH.address)
        .returns([price, status]);

      const supplyValue = await eligibilityManager.callStatic.getSupplyValue(
        accounts[0]
      );

      // console.log(supplyValue.toString());

      expect(supplyValue[0]).to.eq(supplied.mul(price));
      expect(supplyValue[1]).to.eq(false);
    });
  });

  describe("getBLPValue", async function () {
    let staked = utils.parseEther("10000");
    let price = utils.parseEther("14919437706257265");
    let status = true;

    it("should return BLP value and valid", async () => {
      BLPStaking.utsUsxStakingPool.balanceOf.returns(staked);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(BLPStaking.uts_usx_lp.address)
        .returns([price, status]);

      const BLPValue = await eligibilityManager.callStatic.getBLPValue(
        accounts[0]
      );

      // console.log(BLPValue.toString());

      expect(BLPValue[0]).to.eq(staked.mul(price));
      expect(BLPValue[1]).to.eq(true);
    });

    it("should return BLP value and invalid", async () => {
      status = false;
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(BLPStaking.uts_usx_lp.address)
        .returns([price, status]);

      const BLPValue = await eligibilityManager.callStatic.getBLPValue(
        accounts[0]
      );

      // console.log(BLPValue.toString());

      expect(BLPValue[0]).to.eq(staked.mul(price));
      expect(BLPValue[1]).to.eq(false);
    });
  });

  describe("isEligible", async function () {
    let supplied = utils.parseEther("10");
    let suppliedPrice = utils.parseEther("2533");
    let suppliedStatus = true;
    let staked = utils.parseEther("10000");
    let stakedPrice = utils.parseEther("14919437706257265");
    let stakedStatus = true;

    it("Eligible, valid", async () => {
      // Supply
      lending.iTokens.iETH.balanceOf.returns(supplied);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(lending.iTokens.iETH.address)
        .returns([suppliedPrice, suppliedStatus]);

      // BLP
      BLPStaking.utsUsxStakingPool.balanceOf.returns(staked);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(BLPStaking.uts_usx_lp.address)
        .returns([stakedPrice, stakedStatus]);

      const isEligible = await eligibilityManager.callStatic.isEligible(
        accounts[0]
      );

      // console.log(isEligible.toString());

      expect(isEligible[0]).to.eq(true);
      expect(isEligible[1]).to.eq(true);
    });
    it("Ineligible, valid", async () => {
      BLPStaking.utsUsxStakingPool.balanceOf.returns(0);

      const isEligible = await eligibilityManager.callStatic.isEligible(
        accounts[0]
      );

      // console.log(isEligible.toString());

      expect(isEligible[0]).to.eq(false);
      expect(isEligible[1]).to.eq(true);
    });
    it("Should return invalid if BLP price Invalid", async () => {
      // Supply
      lending.iTokens.iETH.balanceOf.returns(supplied);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(lending.iTokens.iETH.address)
        .returns([suppliedPrice, suppliedStatus]);

      // BLP
      stakedStatus = false;
      BLPStaking.utsUsxStakingPool.balanceOf.returns(staked);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(BLPStaking.uts_usx_lp.address)
        .returns([stakedPrice, stakedStatus]);

      const isEligible = await eligibilityManager.callStatic.isEligible(
        accounts[0]
      );

      expect(isEligible[1]).to.eq(false);
    });
    it("Should return invalid if supply price Invalid", async () => {
      // Supply
      suppliedStatus = false;
      lending.iTokens.iETH.balanceOf.returns(supplied);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(lending.iTokens.iETH.address)
        .returns([suppliedPrice, suppliedStatus]);

      // BLP
      stakedStatus = true;
      BLPStaking.utsUsxStakingPool.balanceOf.returns(staked);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(BLPStaking.uts_usx_lp.address)
        .returns([stakedPrice, stakedStatus]);

      const isEligible = await eligibilityManager.callStatic.isEligible(
        accounts[0]
      );

      expect(isEligible[1]).to.eq(false);
    });

    it("should return true, valid if thresholdRatio is 0", async () => {
      // Supply
      suppliedStatus = false;
      lending.iTokens.iETH.balanceOf.returns(supplied);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(lending.iTokens.iETH.address)
        .returns([0, suppliedStatus]);

      // BLP
      stakedStatus = true;
      BLPStaking.utsUsxStakingPool.balanceOf.returns(staked);
      lending.oracle.getUnderlyingPriceAndStatus
        .whenCalledWith(BLPStaking.uts_usx_lp.address)
        .returns([0, stakedStatus]);

      await eligibilityManager._setThresholdRatio(0);
      const isEligible = await eligibilityManager.callStatic.isEligible(
        accounts[0]
      );

      // console.log(isEligible.toString());

      expect(isEligible[0]).to.eq(true);
      expect(isEligible[1]).to.eq(true);
    });
  });

  it("Should revert when initialize twice", async () => {
    await expect(
      eligibilityManager.initialize(
        controller.address,
        utils.parseEther("0.001")
      )
    ).to.be.revertedWith("Initializable: contract is already initialized");
  });

  describe("Add One BLP Staking Pool", async function () {
    it("Should Add one non-exist BLP staking pool", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let beforeBLPStakingPoolsLength = allBLPStakingPools.length;

      // Mock a new BLP staking pool
      let mockBLPStakingPool: FakeContract<IBLPStakingPool>;
      let mockLp: FakeContract<ERC20>;
      mockBLPStakingPool = await smock.fake<IBLPStakingPool>("BLPStakingPool");
      mockLp = await smock.fake<ERC20>("ERC20");
      mockBLPStakingPool.isStakingPool.returns(true);
      mockBLPStakingPool.stakingToken.returns(mockLp.address);

      // BLPs mapping should be zero
      let underlying = await eligibilityManager.BLPs(
        mockBLPStakingPool.address
      );
      await expect(underlying).to.eq(ethers.constants.AddressZero);

      // Add BLP staking pool
      await expect(
        eligibilityManager._addBLPStakingPool(mockBLPStakingPool.address)
      )
        .to.emit(eligibilityManager, "AddBLPStakingPool")
        .withArgs(mockBLPStakingPool.address, mockLp.address);

      // Now BLP staking pools increases
      allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let afterBLPStakingPoolsLength = allBLPStakingPools.length;
      await expect(
        afterBLPStakingPoolsLength - beforeBLPStakingPoolsLength
      ).to.eq(1);

      // BLPs mapping should be the underlying
      underlying = await eligibilityManager.BLPs(mockBLPStakingPool.address);
      await expect(underlying).to.eq(mockLp.address);
    });

    it("Should revert when add an exist BLP staking pool", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      // Has at least one BLP staking pool
      expect(allBLPStakingPools.length).to.gt(0);

      // Add the same BLP staking pool again will revert
      await expect(
        eligibilityManager._addBLPStakingPool(allBLPStakingPools[0])
      ).to.revertedWithCustomError(
        eligibilityManager,
        "EligibilityManager_addBLPStakingPoolInternal__StakingPoolAlreadyExist"
      );

      let afterBLPStakingPoolsLength = (
        await eligibilityManager.getBLPStakingPools()
      ).length;
      // The length of the staking pool will not be changed
      await expect(allBLPStakingPools.length).to.eq(afterBLPStakingPoolsLength);
    });

    it("Should revert when user adds BLP staking pool", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      // Has at least one BLP staking pool
      expect(allBLPStakingPools.length).to.gt(0);

      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to add BLP staking pool
      await expect(
        eligibilityManager
          .connect(user)
          ._addBLPStakingPool(allBLPStakingPools[0])
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });

    it("Should revert when add a non BLP staking pool", async () => {
      // Add non BLP staking pool will revert
      let mockStakingPool: FakeContract<IBLPStakingPool>;
      mockStakingPool = await smock.fake<IBLPStakingPool>("BLPStakingPool");
      mockStakingPool.isStakingPool.returns(false);

      await expect(
        eligibilityManager._addBLPStakingPool(mockStakingPool.address)
      ).to.revertedWithCustomError(
        eligibilityManager,
        "EligibilityManager_addBLPStakingPoolInternal__InvalidStakingPool"
      );
    });
  });

  describe("Add Multiple BLP Staking Pools", async function () {
    it("Should Add some non-exist BLP staking pools", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let beforeBLPStakingPoolsLength = allBLPStakingPools.length;

      // BLPs mapping should be zero
      let underlying1 = await eligibilityManager.BLPs(
        mockBLPStakingPool1.address
      );
      await expect(underlying1).to.eq(ethers.constants.AddressZero);
      let underlying2 = await eligibilityManager.BLPs(
        mockBLPStakingPool2.address
      );
      await expect(underlying2).to.eq(ethers.constants.AddressZero);

      // Add BLP staking pools
      await expect(
        eligibilityManager._addBLPStakingPools([
          mockBLPStakingPool1.address,
          mockBLPStakingPool2.address,
        ])
      );

      // Now BLP staking pools increases
      allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let afterBLPStakingPoolsLength = allBLPStakingPools.length;
      await expect(
        afterBLPStakingPoolsLength - beforeBLPStakingPoolsLength
      ).to.eq(2);

      // BLPs mapping should be the underlying
      underlying1 = await eligibilityManager.BLPs(mockBLPStakingPool1.address);
      await expect(underlying1).to.eq(mockLp1.address);
      underlying2 = await eligibilityManager.BLPs(mockBLPStakingPool2.address);
      await expect(underlying2).to.eq(mockLp2.address);
    });

    it("Should revert when user adds BLP staking pools", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      // Has at least two BLP staking pool
      expect(allBLPStakingPools.length).to.gt(1);

      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to add BLP staking pools
      await expect(
        eligibilityManager
          .connect(user)
          ._addBLPStakingPools([allBLPStakingPools[0], allBLPStakingPools[1]])
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Remove One BLP Staking Pool", async function () {
    it("Should Remove one existingBLP staking pool", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let beforeBLPStakingPoolsLength = allBLPStakingPools.length;

      let toRemoveBLPStakingPool = mockBLPStakingPool2.address;
      let toRemoveBLPStakingPoolUnderlying = await eligibilityManager.BLPs(
        toRemoveBLPStakingPool
      );
      // BLPs mapping should be the underlying
      await expect(toRemoveBLPStakingPoolUnderlying).to.eq(mockLp2.address);

      // Remove BLP staking pool
      await expect(
        eligibilityManager._removeBLPStakingPool(toRemoveBLPStakingPool)
      )
        .to.emit(eligibilityManager, "RemoveBLPStakingPool")
        .withArgs(toRemoveBLPStakingPool);

      // Now BLP staking pools decreases
      allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let afterBLPStakingPoolsLength = allBLPStakingPools.length;
      await expect(
        beforeBLPStakingPoolsLength - afterBLPStakingPoolsLength
      ).to.eq(1);

      // BLP has removed, so underlying should be zero.
      toRemoveBLPStakingPoolUnderlying = await eligibilityManager.BLPs(
        toRemoveBLPStakingPool
      );
      await expect(toRemoveBLPStakingPoolUnderlying).to.eq(
        ethers.constants.AddressZero
      );
    });

    it("Should revert when remove a non-exist BLP staking pool", async () => {
      await expect(
        eligibilityManager._removeBLPStakingPool(accounts[0])
      ).to.revertedWithCustomError(
        eligibilityManager,
        "EligibilityManager_removeBLPStakingPoolInternal__StakingPoolDoesNotExist"
      );
    });

    it("Should revert when user removes BLP staking pool", async () => {
      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to remove BLP staking pool
      await expect(
        eligibilityManager.connect(user)._removeBLPStakingPool(accounts[0])
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Remove Multiple BLP Staking Pools", async function () {
    it("Should Remove some existing BLP staking pools", async () => {
      let allBLPStakingPools = await eligibilityManager.getBLPStakingPools();
      let beforeBLPStakingPoolsLength = allBLPStakingPools.length;

      // BLPs mapping should not be zero address
      for (let i = 0; i < beforeBLPStakingPoolsLength; i++) {
        let toRemoveBLPStakingPoolUnderlying = await eligibilityManager.BLPs(
          allBLPStakingPools[0]
        );
        await expect(toRemoveBLPStakingPoolUnderlying).to.not.eq(
          ethers.constants.AddressZero
        );
      }

      // Remove BLP staking pools
      await expect(
        eligibilityManager._removeBLPStakingPools(allBLPStakingPools)
      );

      // Now BLP staking pools decreases
      let afterBLPStakingPoolsLength = (
        await eligibilityManager.getBLPStakingPools()
      ).length;
      await expect(afterBLPStakingPoolsLength).to.eq(0);

      // BLP has removed, so underlying should be zero.
      for (let i = 0; i < beforeBLPStakingPoolsLength; i++) {
        let toRemoveBLPStakingPoolUnderlying = await eligibilityManager.BLPs(
          allBLPStakingPools[0]
        );
        await expect(toRemoveBLPStakingPoolUnderlying).to.eq(
          ethers.constants.AddressZero
        );
      }

      // Reverse the removal
      await eligibilityManager._addBLPStakingPools(allBLPStakingPools);
    });

    it("Should revert when user removes BLP staking pools", async () => {});
  });

  describe("Remove One Valid Supply", async function () {
    it("Should remove one valid supply", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      let beforeValidSuppliesLength = allValidSupplies.length;

      // Has at least one valid supply
      expect(beforeValidSuppliesLength).to.gt(0);

      // Remove the valid supply
      await expect(eligibilityManager._removeValidSupply(allValidSupplies[0]))
        .to.emit(eligibilityManager, "RemoveValidSupply")
        .withArgs(allValidSupplies[0]);

      // Now valid supplies decreases
      let afterValidSuppliesLength = (
        await eligibilityManager.getValidSupplies()
      ).length;
      await expect(beforeValidSuppliesLength - afterValidSuppliesLength).to.eq(
        1
      );

      // Reverse the removal
      await eligibilityManager._addValidSupply(allValidSupplies[0]);
    });

    it("Should revert when remove a non-exist valid supply", async () => {
      await expect(
        eligibilityManager._removeValidSupply(accounts[0])
      ).to.revertedWithCustomError(
        eligibilityManager,
        "EligibilityManager_removeValidSupplyInternal__ValidSupplyDoesNotExist"
      );
    });

    it("Should revert when user removes valid supply", async () => {
      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to remove valid supply
      await expect(
        eligibilityManager.connect(user)._removeValidSupply(accounts[0])
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Remove Multiple Valid Supplies", async function () {
    it("Should remove some valid supplies", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      let beforeValidSuppliesLength = allValidSupplies.length;

      // Has at least one valid supply
      expect(beforeValidSuppliesLength).to.gt(0);

      // Remove the valid supplies
      await expect(eligibilityManager._removeValidSupplies(allValidSupplies));

      // Now valid supplies decreases
      let afterValidSuppliesLength = (
        await eligibilityManager.getValidSupplies()
      ).length;
      await expect(afterValidSuppliesLength).to.eq(0);

      // Reverse the removal
      await eligibilityManager._addValidSupplies(allValidSupplies);
    });

    it("Should revert when user removes valid supplies", async () => {
      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to remove valid supplies
      await expect(
        eligibilityManager.connect(user)._removeValidSupplies([accounts[0]])
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Add One Valid Supply", async function () {
    it("Should add new valid supply", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      // Remove at first
      let toRemoveSupply = allValidSupplies[0];
      await eligibilityManager._removeValidSupply(toRemoveSupply);
      let beforeValidSuppliesLength = (
        await eligibilityManager.getValidSupplies()
      ).length;

      // Add new valid supply
      await expect(eligibilityManager._addValidSupply(toRemoveSupply))
        .to.emit(eligibilityManager, "AddValidSupply")
        .withArgs(toRemoveSupply);

      // Now valid supplies increases
      let afterValidSuppliesLength = (
        await eligibilityManager.getValidSupplies()
      ).length;
      await expect(afterValidSuppliesLength - beforeValidSuppliesLength).to.eq(
        1
      );
    });

    it("Should revert when add an invalid supply", async () => {
      await expect(
        eligibilityManager._addValidSupply(accounts[0])
      ).to.revertedWithCustomError(
        eligibilityManager,
        "EligibilityManager_addValidSupplyInternal__InvalidSupply"
      );
    });

    it("Should revert when add an exist valid supply", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      // Has at least one valid supply
      expect(allValidSupplies.length).to.gt(0);

      // Add the same valid supply again will revert
      await expect(
        eligibilityManager._addValidSupply(allValidSupplies[0])
      ).to.revertedWithCustomError(
        eligibilityManager,
        "EligibilityManager_addValidSupplyInternal__ValidSupplyAlreadyExist"
      );
    });

    it("Should revert when user adds valid supply", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      // Has at least one valid supply
      expect(allValidSupplies.length).to.gt(0);

      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to add valid supply
      await expect(
        eligibilityManager.connect(user)._addValidSupply(allValidSupplies[0])
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Add Multiple Valid Supplies", async function () {
    it("Should add new valid supplies", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      let beforeValidSuppliesLength = (
        await eligibilityManager.getValidSupplies()
      ).length;
      // Remove at first
      await eligibilityManager._removeValidSupplies(allValidSupplies);

      // Add new valid supplies
      await expect(eligibilityManager._addValidSupplies(allValidSupplies));

      // Now valid supplies increases
      let afterValidSuppliesLength = (
        await eligibilityManager.getValidSupplies()
      ).length;
      await expect(afterValidSuppliesLength).to.eq(beforeValidSuppliesLength);
    });

    it("Should revert when user adds valid supplies", async () => {
      let allValidSupplies = await eligibilityManager.getValidSupplies();
      // Has at least one valid supply
      expect(allValidSupplies.length).to.gt(0);

      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to add valid supplies
      await expect(
        eligibilityManager.connect(user)._addValidSupplies(allValidSupplies)
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Set Threshold Ratio", async function () {
    it("Should set threshold ratio", async () => {
      let newThresholdRatio = utils.parseEther("0.123");

      // Set new threshold ratio
      await expect(eligibilityManager._setThresholdRatio(newThresholdRatio))
        .to.emit(eligibilityManager, "NewThresholdRatio")
        .withArgs(newThresholdRatio);

      // Now threshold ratio should be the new one
      let thresholdRatio = await eligibilityManager.thresholdRatio();
      await expect(thresholdRatio).to.eq(newThresholdRatio);
    });

    it("Should revert when user sets threshold ratio", async () => {
      // Get general account
      let user = await ethers.getSigner(accounts[0]);
      let owner = await eligibilityManager.owner();
      // User is not the owner
      await expect(owner).to.not.eq(user.address);

      // User tries to set threshold ratio
      await expect(
        eligibilityManager
          .connect(user)
          ._setThresholdRatio(utils.parseEther("0.123"))
      ).to.revertedWith("onlyOwner: caller is not the owner");
    });
  });
});
