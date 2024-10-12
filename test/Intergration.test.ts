import chai, {expect, use} from "chai";
import hre, {
  network,
  ethers,
  deployments,
  getNamedAccounts,
  getUnnamedAccounts,
} from "hardhat";
import {
  EligibilityManager,
  RewardDistributor,
  IController,
  IiToken,
  IEligibilityManager,
  BLPStakingPool,
  RewardDistributorManager,
  ERC20,
  MockERC20Token,
  BLPReward,
} from "../typechain-types";
import {
  setupUser,
  loadAllDeployedContracts,
  ContractsType,
  impersonateAccount,
  colorLog,
} from "./utils";
import {BigNumber, constants, Contract, Signer, utils} from "ethers";
import {deploy, getContract} from "../utils/utils";
import {printEligibleBalances, printDistributionReward} from "./utils/log";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {increaseTo} from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";

// The account to run the cases
const account = "0x95E111E87847Cdb3E3e9Bf16607A36099115dEC7";
// The iToken to interact with
let iTokenSymbol = "iUSX";
// The reward Token of Lending
let rewardTokenSymbol = "UTS";

const setupBase = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    // Load all deployed contracts
    const contracts = await loadAllDeployedContracts();

    // Impersonate an account
    const account = options.account;
    await impersonateAccount(account);

    const user = await setupUser(account, contracts);

    return {contracts, user};
  },
  "Base"
);

const setUpEligible = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    const {contracts, user} = await setupBase(options);

    const account = user.address;

    // Stake some BLP
    const dfUtsLPBal = await contracts.DF_UTS_LP.balanceOf(account);
    const utsUsxLPBal = await contracts.UTS_USX_LP.balanceOf(account);

    await user.DF_UTS_LP.approve(
      user.dfUtsStakingPool.address,
      constants.MaxUint256
    );
    await user.dfUtsStakingPool.stake(user.address, dfUtsLPBal);

    await user.UTS_USX_LP.approve(
      user.utsUsxStakingPool.address,
      constants.MaxUint256
    );
    await contracts.utsUsxStakingPool.stake(user.address, utsUsxLPBal);

    const isRewardEligible =
      await contracts.rewardDistributorManager.isEligible(account);

    expect(
      isRewardEligible,
      "setUpEligible: User does not have enough BLP"
    ).to.eq(true);

    return {
      contracts,
      user,
    };
  },
  "Eligible"
);

const setUpEligibleIToken = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    const {contracts, user} = await setUpEligible(options);

    const iTokenSymbol = options.iTokenSymbol;
    const account = user.address;

    const underlyingAddr = await contracts[iTokenSymbol].underlying();
    const underlying = (await ethers.getContractAt(
      "MockERC20Token",
      underlyingAddr,
      await ethers.getSigner(account)
    )) as MockERC20Token;

    // TODO: the deployments abi is not updated to contain new interfaces
    // To use MockIToken to call these new interfaces
    const iToken = (await ethers.getContractAt(
      "IiToken",
      contracts[iTokenSymbol].address,
      await ethers.getSigner(account)
    )) as IiToken;

    // Should have some underlying token
    const underlyingBal = await underlying.balanceOf(account);
    colorLog.info(
      "\tUnderlying balance:\t" +
        utils.formatUnits(underlyingBal, await iToken.decimals())
    );

    expect(underlyingBal).to.gt(0);

    return {
      contracts,
      user,
      underlying,
      iToken,
    };
  },
  "EligibleIToken"
);

const setUpRedeemable = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    const {contracts, user, underlying, iToken} = await setUpEligibleIToken(
      options
    );

    const account = user.address;
    const underlyingBal = await underlying.balanceOf(account);

    await underlying.approve(iToken.address, constants.MaxUint256);
    await iToken.mint(account, underlyingBal, false);
    // await contracts.controller.enterMarkets([iToken.address]);

    const isRewardEligible =
      await contracts.rewardDistributorManager.isEligible(account);

    expect(
      isRewardEligible,
      "setUpEligible: User does not have enough BLP"
    ).to.eq(true);

    return {
      contracts,
      user,
      underlying,
      iToken,
    };
  },
  "Redeemable"
);

const setUpBorrowable = setUpRedeemable;

const setUpRepayable = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    console.log("setUpRepayable 00000");

    const {contracts, user, underlying, iToken} = await setUpBorrowable(
      options
    );

    console.log("setUpRepayable NNNN");

    const account = user.address;
    // Don't borrow too much as there will be delay
    const borrowAmount = utils.parseUnits("100", await iToken.decimals());

    await iToken.borrow(borrowAmount, false);

    const underlyingBal = await underlying.balanceOf(account);

    // colorLog.info(
    //   "\tUnderlying Balance:\t",
    //   utils.formatUnits(underlyingBal, await underlying.decimals())
    // );

    expect(underlyingBal, "Borrow too much resulting delaying").to.gte(
      borrowAmount
    );

    return {
      contracts,
      user,
      underlying,
      iToken,
    };
  },
  "Repayable"
);

const setUpRewardable = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    console.log("0000");

    const {contracts, user, underlying, iToken} = await setUpRepayable(options);

    console.log("NNNN");

    const rewardToken = contracts[rewardTokenSymbol] as ERC20;

    // Get the list of distributors from the reward manager
    const distributorAddresses =
      await contracts.rewardDistributorManager.getRewardDistributors();
    let distributor;

    console.log("1111");

    // Find the distributor with the matching reward token
    for (const distributorAddress of distributorAddresses) {
      const currentDistributor = (await ethers.getContractAt(
        "RewardDistributor",
        distributorAddress
      )) as RewardDistributor;
      const currentRewardToken = await currentDistributor.rewardToken();

      if (currentRewardToken === rewardToken.address) {
        distributor = currentDistributor;
        break;
      }
    }

    console.log("222");

    if (!distributor) {
      throw new Error("Distributor not found for the given reward token");
    }

    const paused = await distributor.paused();
    expect(paused).to.eq(false, "Reward Distribution is paused!");
    const bspeed = await distributor.distributionSpeed(iToken.address);
    const sspeed = await distributor.distributionSupplySpeed(iToken.address);

    expect(bspeed.gt(0) || sspeed.gt(0)).to.eq(
      true,
      `Distribution speed of ${iTokenSymbol} is 0!`
    );

    const treasury = await distributor.treasury();
    const alllowance = await rewardToken.allowance(
      treasury,
      distributor.address
    );
    expect(alllowance).to.gt(0, `Treasury has no allowance for distributor`);

    return {
      contracts,
      user,
      underlying,
      iToken,
      rewardToken,
      distributor,
    };
  },
  "Rewardable"
);

const setUpBountiable = deployments.createFixture(
  async ({deployments, ethers}, options) => {
    const {contracts, user, underlying, iToken, rewardToken, distributor} =
      await setUpRewardable(options);

    const isRewardEligible =
      await contracts.rewardDistributorManager.isEligible(account);

    expect(isRewardEligible).to.eq(true, "Account should be Reward Eligible!");

    const [isEligible] =
      await contracts.eligibilityManager.callStatic.isEligible(account);

    expect(isEligible).to.eq(false, "Account is Still Eligible!");

    return {
      contracts,
      user,
      underlying,
      iToken,
      rewardToken,
      distributor,
    };
  },
  "Bountiable"
);

// Skip this test if the network is hardhat or localhost
const networkName = getNetworkName(network);
const shouldSkip = networkName === "hardhat" || networkName === "localhost";
(shouldSkip ? describe.skip : describe)("Integration Test", async function () {
  let contracts: ContractsType;
  let user: {address: string} & ContractsType;
  let signer: Signer;
  // const account = "0x6b29b8af9AF126170513AE6524395E09025b214E";

  async function getEligibilityStatus(account: string) {
    const [supplyValue, supplyStatus] =
      await contracts.eligibilityManager.callStatic.getSupplyValue(account);
    const [blpValue, blpStatus] =
      await contracts.eligibilityManager.callStatic.getBLPValue(account);
    const [isEligible, isEligibleStatus] =
      await contracts.eligibilityManager.callStatic.isEligible(account);
    const isRewardEligible =
      await contracts.rewardDistributorManager.isEligible(account);

    colorLog.info("\n\t--- Eligibility Check ---");
    colorLog.info(
      `\tSupply Value:\t\t${utils.formatUnits(
        supplyValue,
        36
      )}\t${supplyStatus}`
    );
    colorLog.info(
      `\tBLP Value:\t\t${utils.formatUnits(blpValue, 36)}\t${blpStatus}`
    );
    colorLog.info(`\tIs Eligible:\t\t${isEligible}\t${isEligibleStatus}`);
    colorLog.info(`\tIs Reward Eligible:\t${isRewardEligible}`);
    colorLog.info("\t-------------------------\n");

    return {
      supply: {value: supplyValue, status: supplyStatus},
      blp: {value: blpValue, status: blpStatus},
      eligibility: {isEligible, status: isEligibleStatus},
      isRewardEligible,
    };
  }

  describe("BLP Staking", async function () {
    before(async () => {
      ({contracts, user} = await setupBase({account}));
      signer = await ethers.getSigner(account);
    });

    describe("Stake", async function () {
      let dfUtsLPBal: BigNumber = utils.parseEther("100");
      let utsUsxLPBal: BigNumber = utils.parseEther("100");

      it("Should have some BLP", async () => {
        dfUtsLPBal = await contracts.DF_UTS_LP.balanceOf(account);
        utsUsxLPBal = await contracts.UTS_USX_LP.balanceOf(account);

        colorLog.info("\tDF_UTS_LP balance:\t", utils.formatEther(dfUtsLPBal));
        colorLog.info(
          "\tUTS_USX_LP balance:\t",
          utils.formatEther(utsUsxLPBal)
        );

        expect(dfUtsLPBal).to.gt(0);
        expect(utsUsxLPBal).to.gt(0);
      });

      it("Should have some SupplyValue", async () => {
        const [supply, status] =
          await contracts.eligibilityManager.callStatic.getSupplyValue(account);

        colorLog.info("\tSupply Value:\t", utils.formatUnits(supply, 36));

        expect(supply).to.gt(0);
        expect(status).to.eq(true);
      });

      it("Should be able to stake BLP", async () => {
        await user.DF_UTS_LP.approve(
          contracts.dfUtsStakingPool.address,
          constants.MaxUint256
        );
        await user.UTS_USX_LP.approve(
          contracts.utsUsxStakingPool.address,
          constants.MaxUint256
        );
        await user.dfUtsStakingPool.stake(account, dfUtsLPBal);
        await user.utsUsxStakingPool.stake(account, utsUsxLPBal);

        await getEligibilityStatus(account);
      });
    });

    describe("Unstake", async function () {
      let dfUtsStakingBal: BigNumber;
      let utsUsxStakingBal: BigNumber;

      it("Should have some Staked", async () => {
        dfUtsStakingBal = await contracts.dfUtsStakingPool.balanceOf(account);
        utsUsxStakingBal = await contracts.utsUsxStakingPool.balanceOf(account);

        colorLog.info(
          "\tDF_UTS_LP staked:\t",
          utils.formatEther(dfUtsStakingBal)
        );
        colorLog.info(
          "\tUTS_USX_LP staked:\t",
          utils.formatEther(utsUsxStakingBal)
        );

        expect(dfUtsStakingBal).to.gt(0);
        expect(utsUsxStakingBal).to.gt(0);
      });

      it("Should be able to unstake BLP", async () => {
        await user.dfUtsStakingPool.withdraw(dfUtsStakingBal);
        await user.utsUsxStakingPool.withdraw(utsUsxStakingBal);

        await getEligibilityStatus(account);
      });
    });

    describe("Get Rewards from Staking Reward Distributors", async function () {
      let initialUTSBalance: BigNumber;
      let initialARBBalance: BigNumber;
      let dfUtsBLPRewardDistributor: BLPReward;
      let utsUsxBLPRewardDistributor: BLPReward;

      before(async () => {
        utsUsxBLPRewardDistributor = (
          contracts.utsUsxBLPRewardDistributor as BLPReward
        ).connect(signer);
        dfUtsBLPRewardDistributor = (
          contracts.dfUtsBLPRewardDistributor as BLPReward
        ).connect(signer);
      });

      it("Should have pending rewards in DF_UTS staking pool", async () => {
        const pendingRewards = await dfUtsBLPRewardDistributor.earned(account);

        colorLog.info("\tdfUtsBLPRewardDistributor earned:\t", pendingRewards);

        expect(pendingRewards).to.be.gt(0);
      });

      it("Should have pending rewards in UTS_USX staking pool", async () => {
        const pendingRewards = await utsUsxBLPRewardDistributor.earned(account);

        colorLog.info("\tutsUsxBLPRewardDistributor earned:\t", pendingRewards);

        expect(pendingRewards).to.be.gt(0);
      });

      it("Should be able to claim rewards from DF_UTS staking pool", async () => {
        const initialARBBalance = await contracts.ARB.balanceOf(account);

        await dfUtsBLPRewardDistributor.getReward(account);

        const newARBBalance = await contracts.ARB.balanceOf(account);

        colorLog.info(
          "\tARB rewards claimed:\t",
          utils.formatEther(newARBBalance.sub(initialARBBalance))
        );

        expect(newARBBalance).to.be.gt(initialARBBalance);
      });

      it("Should be able to claim rewards from UTS_USX staking pool", async () => {
        const initialUTSBalance = await contracts.UTS.balanceOf(account);

        await utsUsxBLPRewardDistributor.getReward(account);

        const newUTSBalance = await contracts.UTS.balanceOf(account);

        colorLog.info(
          "\tUTS rewards claimed:\t",
          utils.formatEther(newUTSBalance.sub(initialUTSBalance))
        );

        expect(newUTSBalance).to.be.gt(initialUTSBalance);
      });

      it("check eligibility", async () => {
        await getEligibilityStatus(account);
      });
    });
  });

  describe("Lending", async function () {
    let underlying: MockERC20Token;
    let iToken: IiToken;

    describe("Supply", async function () {
      let supplyAmount: BigNumber;

      beforeEach(async () => {
        ({contracts, user, underlying, iToken} = await setUpEligibleIToken({
          account,
          iTokenSymbol,
        }));

        supplyAmount = await underlying.balanceOf(account);
      });

      beforeEach(async () => {
        await deployments.fixture("EligibleIToken");
      });

      it("Should be able to supply some token without updating eligiblity", async () => {
        await underlying.approve(iToken.address, constants.MaxUint256);
        await iToken.mint(account, supplyAmount, false);

        // the case was setup with isRewardEligible == true
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to supply and update eligible balance", async () => {
        await iToken.mint(account, supplyAmount, true);

        await getEligibilityStatus(account);
      });
    });

    describe("MintForSelfAndEnterMarket", async function () {
      let mintAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpEligibleIToken({
          account,
          iTokenSymbol,
        }));

        mintAmount = await underlying.balanceOf(account);
      });

      beforeEach(async () => {
        await deployments.fixture("EligibleIToken");
      });

      it("Should be able to mintForSelfAndEnterMarket without updating eligibility", async () => {
        await underlying.approve(iToken.address, constants.MaxUint256);
        await iToken.mintForSelfAndEnterMarket(mintAmount, false);

        // Check eligibility status (should remain unchanged)
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to mintForSelfAndEnterMarket and update eligible balance", async () => {
        await iToken.mintForSelfAndEnterMarket(mintAmount, true);

        // Check updated eligibility status
        await getEligibilityStatus(account);
      });
    });

    describe("Redeem", async function () {
      let redeemAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpRedeemable({
          account,
          iTokenSymbol,
        }));

        redeemAmount = await iToken.balanceOf(account);
      });

      beforeEach(async () => {
        await deployments.fixture("Redeemable");
      });

      it("Should be able to redeem some token without updating eligiblity", async () => {
        await iToken.redeem(account, redeemAmount, false);

        // the case was setup with isRewardEligible == true
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to redeem and update eligible balance", async () => {
        await iToken.redeem(account, redeemAmount, true);

        await getEligibilityStatus(account);
      });
    });

    describe("RedeemUnderlying", async function () {
      let underlyingAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpRedeemable({
          account,
          iTokenSymbol,
        }));

        // Calculate the underlying amount to redeem (half of the user's balance)
        const iTokenBalance = await iToken.balanceOf(account);
        const exchangeRate = await iToken.exchangeRateStored();
        underlyingAmount = iTokenBalance
          .mul(exchangeRate)
          .div(utils.parseEther("1"));
      });

      beforeEach(async () => {
        await deployments.fixture("Redeemable");
      });

      it("Should be able to redeem underlying without updating eligibility", async () => {
        await iToken.redeemUnderlying(account, underlyingAmount, false);

        // the case was setup with isRewardEligible == true
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to redeem underlying and update eligible balance", async () => {
        await iToken.redeemUnderlying(account, underlyingAmount, true);

        await getEligibilityStatus(account);
      });
    });

    describe("RedeemFromSelfAndExitMarket", async function () {
      let redeemAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpRedeemable({
          account,
          iTokenSymbol,
        }));

        const iTokenBal = await iToken.balanceOf(account);
        redeemAmount = iTokenBal;
      });

      beforeEach(async () => {
        await deployments.fixture("Redeembale");
      });

      it("Should be able to redeemFromSelfAndExitMarket without updating eligibility", async () => {
        await iToken.redeemFromSelfAndExitMarket(redeemAmount, false);

        // Check eligibility status (should remain unchanged)
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to redeemFromSelfAndExitMarket and update eligible balance", async () => {
        await iToken.redeemFromSelfAndExitMarket(redeemAmount, true);

        // Check updated eligibility status
        await getEligibilityStatus(account);
      });
    });

    describe("Transfer iTokens", async function () {
      let transferAmount: BigNumber;
      let recipient: string;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpBorrowable({
          account,
          iTokenSymbol,
        }));

        [recipient] = await getUnnamedAccounts();

        const iTokenBal = await iToken.balanceOf(account);
        transferAmount = iTokenBal;
      });

      beforeEach(async () => {
        await deployments.fixture("Borrowable");
      });

      it("Should be able to transfer iTokens without updating eligibility", async () => {
        await iToken.transfer(recipient, transferAmount);

        // Check eligibility status (should remain unchanged)
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to update eligible balance", async () => {
        await contracts.rewardDistributorManager.updateEligibleBalance(account);

        // Check updated eligibility status
        await getEligibilityStatus(account);
      });
    });

    describe("Borrow", async function () {
      let borrowAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpBorrowable({
          account,
          iTokenSymbol,
        }));

        // Ensure the user has some collateral
        const iTokenBalance = await iToken.balanceOf(account);
        borrowAmount = iTokenBalance.div(10);
      });

      beforeEach(async () => {
        await deployments.fixture("Borrowable");
      });

      it("Should be able to borrow without updating eligibility", async () => {
        await iToken.borrow(borrowAmount, false);

        // the case was setup with isRewardEligible == true
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to borrow and update eligible balance", async () => {
        await iToken.borrow(borrowAmount, true);

        await getEligibilityStatus(account);
      });
    });

    describe("Repay", async function () {
      let repayAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpRepayable({
          account,
          iTokenSymbol,
        }));

        const [borrowBalance] = await iToken.borrowSnapshot(account);
        repayAmount = borrowBalance.div(2);
      });

      beforeEach(async () => {
        await deployments.fixture("Repayable");
      });

      it("Should be able to repay without updating eligibility", async () => {
        await iToken.repayBorrow(repayAmount, false);

        // the case was setup with isRewardEligible == true
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to repay and update eligible balance", async () => {
        await iToken.repayBorrow(repayAmount, true);

        await getEligibilityStatus(account);
      });
    });

    describe("RepayBorrowBehalf", async function () {
      let repayAmount: BigNumber;

      before(async () => {
        ({contracts, user, underlying, iToken} = await setUpRepayable({
          account,
          iTokenSymbol,
        }));

        const [borrowBalance] = await iToken.borrowSnapshot(account);
        repayAmount = borrowBalance;
      });

      beforeEach(async () => {
        await deployments.fixture("Repayable");
      });

      it("Should be able to repayBorrowBehalf without updating eligibility", async () => {
        await iToken.repayBorrowBehalf(account, repayAmount, false);

        // the case was setup with isRewardEligible == true
        const eligibility = await getEligibilityStatus(account);
        expect(eligibility.isRewardEligible).to.eq(true);
      });

      it("Should be able to repayBorrowBehalf and update eligible balance", async () => {
        await iToken.repayBorrowBehalf(account, repayAmount, true);

        await getEligibilityStatus(account);
      });
    });

    describe.skip("RewardDistributorManager", async function () {
      let distributor: RewardDistributor;
      let rewardToken: ERC20;

      beforeEach(async () => {
        ({contracts, user, underlying, iToken, rewardToken, distributor} =
          await setUpRewardable({
            account,
            iTokenSymbol,
            rewardTokenSymbol,
          }));
      });

      it("Should be able to accrue some rewards", async () => {
        const initialReward = await distributor.reward(account);

        await distributor.updateRewardBatch([account], [iToken.address]);

        const currentReward = await distributor.reward(account);

        // Check that rewards have increased
        expect(currentReward).to.be.gt(initialReward);
      });

      it("Should be able to claim some rewards", async () => {
        const initialBalance = await rewardToken.balanceOf(account);

        await contracts.rewardDistributorManager.claimAllReward([account]);

        const finalBalance = await rewardToken.balanceOf(account);

        // Check that reward token balance have increased
        expect(finalBalance).to.be.gt(initialBalance);
      });

      it("Should be able to claim some bounty", async () => {
        ({contracts, user, underlying, iToken, rewardToken, distributor} =
          await setUpBountiable({
            account,
            iTokenSymbol,
            rewardTokenSymbol,
          }));

        const [hunter] = await getUnnamedAccounts();

        const initialBalance = await rewardToken.balanceOf(account);
        const initialBalanceHunter = await rewardToken.balanceOf(hunter);

        await contracts.rewardDistributorManager
          .connect(await ethers.getSigner(hunter))
          .claimBounty([account]);

        const eligibility = await getEligibilityStatus(account);

        const finalBalance = await rewardToken.balanceOf(account);
        const finalBalanceHunter = await rewardToken.balanceOf(hunter);

        expect(finalBalance).to.be.gt(initialBalance);
        expect(finalBalanceHunter).to.be.gt(initialBalanceHunter);
        expect(eligibility.isRewardEligible).to.be.false;
      });
    });
  });
});
