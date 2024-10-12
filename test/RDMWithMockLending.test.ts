import chai, {expect, use} from "chai";
import {
  ethers,
} from "hardhat";
import {setupBLPEnv} from "./utils";
import {BigNumber, Contract, Signer, utils} from "ethers";


describe("RewardDistributorManager - Mock Lending", function () {
  let owner: any;
  let accounts: any;
  const ZERO = BigNumber.from(0);
  const BASE = BigNumber.from(10).pow(18);
  const MAX = ethers.constants.MaxUint256;

  beforeEach(async () => {
    const {deployer, users} = await setupBLPEnv();
    owner = deployer;
    accounts = users;

    // Make user0 is not eligible
    let user0 = accounts[0];
    // Approve to BLP staking pool
    let stakeAmount = utils.parseEther("100");
    await user0.dfUtsLp.approve(user0.dfUtsStakingPool.address, MAX);
    // Stake to BLP staking pool
    await user0.dfUtsStakingPool.stake(user0.address, stakeAmount);

    let eligibleThresholdRatio = await user0.eligibilityManager.thresholdRatio();
    // Deposit to iToken
    let depositAmount = stakeAmount.mul(utils.parseEther("1")).mul(2).div(eligibleThresholdRatio);
    await user0.mockUSX.approve(user0.iUSX.address, MAX);
    await user0.iUSX.mint(user0.address, depositAmount, true);
    
    let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
    expect(isEligible).to.be.false;
  });

  async function makeAccountEligible(account: any, blp: Contract) {
    let accountBLPBalance = await blp.balanceOf(account.address);
    expect(accountBLPBalance).to.be.gt(0);

    // Increase BLP price
    let blpPrice = utils.parseEther("1");
    let newBLpPrice = blpPrice.mul(blpPrice); // New price is squared.
    // Set new price to make user eligible
    await owner.oracle.setPrice(blp.address, newBLpPrice);

    let result = await account.eligibilityManager.callStatic.isEligible(account.address);
    expect(result[0]).to.be.true;
  }

  async function makeAccountIneligible(account: any, blp: Contract) {
    let accountBLPBalance = await blp.balanceOf(account.address);
    expect(accountBLPBalance).to.be.gt(0);

    // Decrease BLP price
    let newBlpPrice = 1;   // New price is 1(wei).
    // Set new price to make user ineligible
    await owner.oracle.setPrice(blp.address, newBlpPrice);

    let result = await account.eligibilityManager.callStatic.isEligible(account.address);
    expect(result[0]).to.be.false;
  }

  async function rewardManagerData(account: any, iToken: Contract) {
    let res = await Promise.all([
      account.rewardDistributorManager.isEligible(account.address),
      account.rewardDistributorManager.eligibleTotalSupply(iToken.address),
      account.rewardDistributorManager.eligibleTotalBorrow(iToken.address),
      account.rewardDistributorManager.eligibleSupply(iToken.address, account.address),
      account.rewardDistributorManager.eligibleBorrow(iToken.address, account.address),
    ]);

    return {
      isEligible: res[0],
      eligibleTotalSupply: res[1],
      eligibleTotalBorrow: res[2],
      eligibleSupply: res[3],
      eligibleBorrow: res[4],
    };
  }

  type ExecuteParams = {
    operator: any,  // The caller
    iToken: Contract, // Operate iToken
    borrower?: any,
    seizeAsset?: Contract, // Borrower supplied asset
    action: string,
    params: any,
    diff: {
      isEligible: boolean,
      eligibleTotalSupply: BigNumber,
      eligibleTotalBorrow: BigNumber,
      eligibleSupply: BigNumber,
      eligibleBorrow: BigNumber,
      borrowerIsEligible?: boolean,
      borrowerEligibleSupply?: BigNumber,
      borrowerEligibleBorrow?: BigNumber,
    },
  }

  async function executeInRDM(executeParams: ExecuteParams) {
    let operator = executeParams.operator;
    let borrower = executeParams.borrower;
    let borrowerDataBefore: any;
    let seizeAsset = executeParams.seizeAsset;

    let operatorDataBefore = await rewardManagerData(operator, executeParams.iToken);
    if (borrower && seizeAsset) {
      operatorDataBefore = await rewardManagerData(operator, seizeAsset);
      borrowerDataBefore = await rewardManagerData(borrower, seizeAsset);
    }

    let iToken = executeParams.operator[`${await executeParams.iToken.symbol()}`];

    if (executeParams.action == "mint") {
      await iToken.mint(...executeParams.params);
    } else if (executeParams.action == "redeem" || executeParams.action == "redeemUnderlying") {
      await iToken.redeem(...executeParams.params);
    } else if (executeParams.action == "borrow") {
      await iToken.borrow(...executeParams.params);
    } else if (executeParams.action == "repayBorrow") {
      await iToken.repayBorrow(...executeParams.params);
    } else if (executeParams.action == "liquidateBorrow") {
      await iToken.liquidateBorrow(...executeParams.params);
    }

    let operatorDataAfter =  await rewardManagerData(operator, iToken);
    if (borrower && seizeAsset) {
      let borrowerDataAfter = await rewardManagerData(borrower, seizeAsset);
      operatorDataAfter =  await rewardManagerData(operator, seizeAsset);
      expect(executeParams.diff.borrowerIsEligible).to.eq(borrowerDataAfter.isEligible);
      expect(borrowerDataAfter.eligibleSupply).to.eq(borrowerDataBefore.eligibleSupply.add(executeParams.diff.borrowerEligibleSupply));
      expect(borrowerDataAfter.eligibleBorrow).to.eq(borrowerDataBefore.eligibleBorrow.add(executeParams.diff.borrowerEligibleBorrow));
    }

    expect(executeParams.diff.isEligible).to.eq(operatorDataAfter.isEligible);
    expect(operatorDataAfter.eligibleTotalSupply).to.eq(operatorDataBefore.eligibleTotalSupply.add(executeParams.diff.eligibleTotalSupply));
    expect(operatorDataAfter.eligibleTotalBorrow).to.eq(operatorDataBefore.eligibleTotalBorrow.add(executeParams.diff.eligibleTotalBorrow));
    expect(operatorDataAfter.eligibleSupply).to.eq(operatorDataBefore.eligibleSupply.add(executeParams.diff.eligibleSupply));
    expect(operatorDataAfter.eligibleBorrow).to.eq(operatorDataBefore.eligibleBorrow.add(executeParams.diff.eligibleBorrow));

  }

  describe("Deposit iToken", async () => {
    let user0: any;
    let depositAmount: any;

    beforeEach(async () => {
      user0 = accounts[0];
      depositAmount = utils.parseEther("100");
    });

    it("Ineligible When does not refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;
      
      // Case 1: user is ineligible, and does not refresh eligibility,
      // so eligible supply and borrow amount will not be changed. 
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: user becomes eligible form ineligible, but does not refresh eligibility,
      // so user will still be ineligible.
      // And eligible supply and borrow amount will not be changed. 
      await makeAccountEligible(user0, user0.dfUtsLp);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });
    });
    it("Ineligible When refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;
      
      // User deposits to iToken and refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible after refreshing eligibility,
      // So eligible supply and borrow amount will not be changed. 
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      await makeAccountEligible(user0, user0.dfUtsLp);
      
      // Case 2: User becomes eligible from ineligible, and refresh eligibility,
      // The first time to be eligible, 
      // so eligible supply balance will be the current supplied adds new supply amount,
      // and eligible borrow balance will be the current borrowed amount.
      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore.add(depositAmount),
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore.add(depositAmount),
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });
    });
    it("Eligible When does not refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      // Update user's eligibility
      await user0.rewardDistributorManager.updateEligibleBalance(user0.address);
      
      // User deposits to iToken and does not refresh eligibility when user is eligible,
      // Case 1: User is still eligible when does not refresh eligibility,
      // Not the first time to be eligible,
      // So eligible supply balance will increase by deposit amount,
      // and eligible borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: depositAmount,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: depositAmount,
          eligibleBorrow: ZERO,
        },
      });

      await makeAccountIneligible(user0, user0.dfUtsLp);
      
      // Case 2: User will be ineligible but does not refresh eligibility,
      // Not the first time to be eligible,
      // eligible balance will still increase by deposit amount,
      // and eligible borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, false],
        diff: {
          isEligible: true,
          eligibleTotalSupply: depositAmount,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: depositAmount,
          eligibleBorrow: ZERO,
        },
      });
    });
    it("Eligible When refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      
      // User deposits to iToken and refresh eligibility when user is eligible,
      // Case 1: User is still eligible after refreshing eligibility,
      // The first time to be eligible,
      // so eligible supply balance will increase by current supplied adds deposit amount,
      // and eligible borrow balance will be the current borrowed amount.
      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore.add(depositAmount),
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore.add(depositAmount),
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });

      // Case 2: User is ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will be updated to 0.
      user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await makeAccountIneligible(user0, user0.dfUtsLp);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "mint",
        params: [user0.address, depositAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleTotalBorrow: user0iUSXBorrowedBalance.mul(-1),
          eligibleSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleBorrow: user0iUSXBorrowedBalance.mul(-1),
        },
      });
    });
  });

  describe("Withdraw iToken", async () => {
    let user0: any;
    let redeemAmount: any;

    beforeEach(async () => {
      user0 = accounts[0];
      redeemAmount = (await user0.iUSX.balanceOf(user0.address)).div(100);
    });

    it("Ineligible When does not refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;

      // User withdraws from iToken and does not refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible when does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: User becomes eligible from ineligible but does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await makeAccountIneligible(user0, user0.dfUtsLp);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });
    });
    it("Ineligible When refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;
      
      // User withdraws from iToken and refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      await makeAccountEligible(user0, user0.dfUtsLp);
      
      // Case 2: User becomes eligible from ineligible, and refresh eligibility,
      // The fist time to be eligible, 
      // so eligible supply balance will be updated to current supplied minus withdraw amount,
      // and eligible borrow balance will be current borrowed amount.
      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore.sub(redeemAmount),
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore.sub(redeemAmount),
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });
    });
    it("Eligible When does not refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      // Update user's eligibility
      await user0.rewardDistributorManager.updateEligibleBalance(user0.address);

      // User withdraws to iToken and does not refresh eligibility when user is eligible,
      // Case 1: User is still eligible when does not refresh eligibility,
      // Not the first time to be eligible,
      // So eligible supply balance will still decrease by withdraw amount,
      // and eligible borrow balance will not be changed
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: redeemAmount.mul(-1),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: redeemAmount.mul(-1),
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: User will be ineligible but does not refresh eligibility,
      // Not the first time to be eligible,
      // so eligible supply balance will still decrease by withdraw amount,
      // and eligible borrow balance will not be changed.
      await makeAccountIneligible(user0, user0.dfUtsLp);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, false],
        diff: {
          isEligible: true,
          eligibleTotalSupply: redeemAmount.mul(-1),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: redeemAmount.mul(-1),
          eligibleBorrow: ZERO,
        },
      });
    });
    it("Eligible When refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      
      // User withdraws from iToken and refresh eligibility when user is eligible,
      // Case 1: User is still eligible after refreshing eligibility,
      // The first time to be eligible,
      // so eligible supply balance will current supplied minus withdraw amount,
      // and eligible borrow balance will be the current borrowed amount.
      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore.sub(redeemAmount),
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore.sub(redeemAmount),
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });

      await makeAccountIneligible(user0, user0.dfUtsLp);
      // Case 2: User is ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will be updated to 0.
      user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "redeem",
        params: [user0.address, redeemAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleTotalBorrow: user0iUSXBorrowedBalance.mul(-1),
          eligibleSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleBorrow: user0iUSXBorrowedBalance.mul(-1),
        },
      });
    });
  });

  describe("Borrow iToken", async () => {
    let user0: any;
    let borrowAmount: any;

    beforeEach(async () => {
      user0 = accounts[0];
      borrowAmount = (await user0.iUSX.balanceOf(user0.address)).div(100);
    });

    it("Ineligible When does not refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;

      // User repayBorrows from iToken and does not refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible when does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: User becomes eligible from ineligible but does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await makeAccountIneligible(user0, user0.dfUtsLp);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });
    });
    it("Ineligible When refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;
      
      // User borrows from iToken and refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: User becomes eligible from ineligible, and refresh eligibility,
      // The fist time to be eligible,
      // so eligible supply balance will be updated to current supplied amount,
      // and eligible borrow balance will be increased by current borrowed adds new borrow amount.
      await makeAccountEligible(user0, user0.dfUtsLp);

      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0].add(borrowAmount)).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore,
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore,
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });
    });
    it("Eligible When does not refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      // Update user's eligibility
      await user0.rewardDistributorManager.updateEligibleBalance(user0.address);

      // User borrows from iToken and does not refresh eligibility when user is eligible,
      // Case 1: User is still eligible when does not refresh eligibility,
      // Not the first time to be eligible,
      // So eligible borrow balance will increase by new borrow amount,
      // eligible supply balance will not be changed.
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (borrowAmount).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: ZERO,
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });

      // Case 2: User will be ineligible but does not refresh eligibility,
      // Not the first time to be eligible,
      // so eligible borrow balance will still increase by borrow amount,
      // but eligible supply balance will not be changed.
      await makeAccountIneligible(user0, user0.dfUtsLp);
      user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      user0iUSXBorrowedBalance = (borrowAmount).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, false],
        diff: {
          isEligible: true,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: ZERO,
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });
    });
    it("Eligible When refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      
      // User borrows from iToken and refresh eligibility when user is eligible,
      // Case 1: User is still eligible after refreshing eligibility,
      // The first time to be eligible, 
      // eligible borrow balance will increase by current borrowed and new borrow amount,
      // and eligible supply balance will be current supplied amount.
      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0].add(borrowAmount)).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore,
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore,
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });

      // Case 2: User is ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will be updated to 0.
      await makeAccountIneligible(user0, user0.dfUtsLp);
      
      user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "borrow",
        params: [borrowAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleTotalBorrow: user0iUSXBorrowedBalance.mul(-1),
          eligibleSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleBorrow: user0iUSXBorrowedBalance.mul(-1),
        },
      });
    });
  });

  describe("RepayBorrow iToken", async () => {
    let user0: any;
    let repayAmount: any;

    beforeEach(async () => {
      user0 = accounts[0];
      let borrowAmount = (await user0.iUSX.balanceOf(user0.address)).div(100);
      await user0.iUSX.borrow(borrowAmount, false);
      repayAmount = borrowAmount.div(2);
    });

    it("Ineligible When does not refresh eligibility", async () => {
      // User repayBorrows to iToken and does not refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible when does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: User becomes eligible from ineligible but does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await makeAccountIneligible(user0, user0.dfUtsLp);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });
    });
    it("Ineligible When refresh eligibility", async () => {
      let isEligible = await user0.rewardDistributorManager.isEligible(user0.address);
      expect(isEligible).to.be.false;
      
      // User repayBorrows to iToken and refresh eligibility when user is ineligible,
      // Case 1: User is still ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
        },
      });

      // Case 2: User becomes eligible from ineligible, and refresh eligibility,
      // The fist time to be eligible, so eligible supply balance will be updated to current supplied amount,
      // and eligible borrow balance will be decreased by repayBorrow amount.
      await makeAccountEligible(user0, user0.dfUtsLp);

      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0].sub(repayAmount)).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore,
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore,
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });
    });
    it("Eligible When does not refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      // Update user's eligibility
      await user0.rewardDistributorManager.updateEligibleBalance(user0.address);

      // User repayBorrows to iToken and does not refresh eligibility when user is eligible,
      // Case 1: User is still eligible when does not refresh eligibility,
      // Not the first time to be eligible, so eligible borrow balance will decrease by repayBorrow amount,
      // and eligible supply balance will not be changed.
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0].sub(repayAmount)).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: user0iUSXBorrowedBalance.mul(-1),
          eligibleSupply: ZERO,
          eligibleBorrow: user0iUSXBorrowedBalance.mul(-1),
        },
      });

      // Case 2: User will be ineligible but does not refresh eligibility,
      // So eligible borrow balance will still decrease by repayBorrow amount,
      // but eligible supply balance will not be changed.
      await makeAccountIneligible(user0, user0.dfUtsLp);
      user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      user0iUSXBorrowedBalance = (repayAmount).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, false],
        diff: {
          isEligible: true,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: user0iUSXBorrowedBalance.mul(-1),
          eligibleSupply: ZERO,
          eligibleBorrow: user0iUSXBorrowedBalance.mul(-1),
        },
      });
    });
    it("Eligible When refresh eligibility", async () => {
      await makeAccountEligible(user0, user0.dfUtsLp);
      
      // User repayBorrows to iToken and refresh eligibility when user is eligible,
      // Case 1: User is still eligible after refreshing eligibility,
      // The first time to be eligible,
      // eligible borrow balance will increase by current borrowed minus new repayBorrow amount,
      // and eligible supply balance will be current supplied amount.
      let user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      let user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      let user0iUSXBorrowedBalance = (user0BorrowedData[0].sub(repayAmount)).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: user0iUSXBalanceBefore,
          eligibleTotalBorrow: user0iUSXBorrowedBalance,
          eligibleSupply: user0iUSXBalanceBefore,
          eligibleBorrow: user0iUSXBorrowedBalance,
        },
      });

      // Case 2: User is ineligible after refreshing eligibility,
      // So eligible supply and borrow balance will be updated to 0.
      await makeAccountIneligible(user0, user0.dfUtsLp);
      
      user0iUSXBalanceBefore = await user0.iUSX.balanceOf(user0.address);
      user0BorrowedData = await user0.iUSX.borrowSnapshot(user0.address);
      user0iUSXBorrowedBalance = (user0BorrowedData[0]).mul(BASE).div(user0BorrowedData[1]);

      await executeInRDM({
        operator: user0,
        iToken: user0.iUSX,
        action: "repayBorrow",
        params: [repayAmount, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleTotalBorrow: user0iUSXBorrowedBalance.mul(-1),
          eligibleSupply: user0iUSXBalanceBefore.mul(-1),
          eligibleBorrow: user0iUSXBorrowedBalance.mul(-1),
        },
      });
    });
  });

  describe("Liquidate iToken", async () => {
    let borrower: any;
    let liquidator: any;
    let liquidateAmount: any;

    beforeEach(async () => {
      borrower = accounts[0];
      liquidator = accounts[1];

      // Liquidator approves to BLP staking pool
      let stakeAmount = utils.parseEther("100");
      await liquidator.utsUsxLp.approve(liquidator.utsUsxStakingPool.address, MAX);
      // Liquidator stakes to BLP staking pool
      await liquidator.utsUsxStakingPool.stake(liquidator.address, stakeAmount);

      // Liquidator deposits some WBTC
      await liquidator.mockWBTC.approve(liquidator.iWBTC.address, MAX);
      await liquidator.iWBTC.mint(liquidator.address, utils.parseEther("1"), true);

      // Borrower borrows some WBTC
      // Borrower supplied usx 20k, wbtc price is 60k.
      let borrowWBTCAmount = utils.parseEther("0.1");
      await borrower.iWBTC.borrow(borrowWBTCAmount, false);

      // Increase WBTC price to double to liquidate borrow
      let wbtcPrice = await owner.oracle.callStatic.getUnderlyingPrice(borrower.iWBTC.address);
      await owner.oracle.setPrice(borrower.iWBTC.address, wbtcPrice.mul(2));

      // Liquidate amount is one twentieth of the supplied amount
      liquidateAmount = borrowWBTCAmount.div(20);
      // Liquidator approved WBTC to iWBTC to liquidate

      // Liquidator is not eligible
      let isEligible = await liquidator.rewardDistributorManager.isEligible(liquidator.address);
      expect(isEligible).to.be.false;
    });

    async function ineligibleButNotRefresh(liquidator: any, borrower: any, liquidateAmount: any) {
      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
          borrowerIsEligible: false,
          borrowerEligibleSupply: ZERO,
          borrowerEligibleBorrow: ZERO,
        },
      });
    }

    async function eligibleButNotRefresh(liquidator: any, borrower: any, liquidateAmount: any) {
      let borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      let borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      let borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      let liquidatoriUSXSeizedBalance = await liquidator.controller.callStatic.liquidateCalculateSeizeTokens(
        liquidator.iWBTC.address,
        liquidator.iUSX.address,
        liquidateAmount
      );

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, false],
        diff: {
          isEligible: true,
          // Liquidator and borrower are both eligible, liquidate does not change eligible total supply.
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXSeizedBalance,
          eligibleBorrow: ZERO,
          borrowerIsEligible: true,
          borrowerEligibleSupply: liquidatoriUSXSeizedBalance.mul(-1),
          borrowerEligibleBorrow: ZERO,
        },
      });

      let borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(borrowerRewardDataBefore.eligibleTotalBorrow.sub(liquidateAmount));
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(borrowerRewardDataBefore.eligibleBorrow.sub(liquidateAmount));
    }

    it("Ineligible When does not refresh eligibility", async () => {
      // Liquidator liquidates borrower and does not refresh eligibility,
      // Case 1: liquidator and borrower are still ineligible when does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await ineligibleButNotRefresh(liquidator, borrower, liquidateAmount);

      // Case 2: Liquidator becomes eligible from ineligible and borrower is still ineligible,
      // but does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);

      await ineligibleButNotRefresh(liquidator, borrower, liquidateAmount);

      // Case 3: Borrower becomes eligible from ineligible and liquidator is still ineligible,
      // but does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await makeAccountIneligible(liquidator, liquidator.utsUsxLp);
      await makeAccountEligible(borrower, borrower.dfUtsLp);

      await ineligibleButNotRefresh(liquidator, borrower, liquidateAmount);

      // Case 4: Borrower and liquidator become eligible from ineligible,
      // but does not refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);
      await makeAccountEligible(borrower, borrower.dfUtsLp);

      await ineligibleButNotRefresh(liquidator, borrower, liquidateAmount);
    });
    it("Ineligible When refresh eligibility", async () => {
      // Liquidator liquidates borrower and refresh eligibility,
      // Case 1: liquidator and borrower are still ineligible when refresh eligibility,
      // So eligible supply and borrow balance will not be changed.
      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, false],
        diff: {
          isEligible: false,
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: ZERO,
          eligibleBorrow: ZERO,
          borrowerIsEligible: false,
          borrowerEligibleSupply: ZERO,
          borrowerEligibleBorrow: ZERO,
        },
      });

      // Case 2: Liquidator becomes eligible from ineligible and borrower is still ineligible,
      // when refresh eligibility,
      // Liquidator is the first time to be eligible,
      // So liquidator's eligible supply is equal to current supplied adds seized amount,
      // liquidator's eligible borrow is current borrowed amount.
      // Borrower is still ineligible, so borrower's eligible supply and borrow balance will not be changed.
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);

      let liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      let borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);
      let liquidatoriUSXSeizedBalance = await liquidator.controller.callStatic.liquidateCalculateSeizeTokens(
        liquidator.iWBTC.address,
        liquidator.iUSX.address,
        liquidateAmount
      );

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: liquidatoriUSXBalance.add(liquidatoriUSXSeizedBalance),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXBalance.add(liquidatoriUSXSeizedBalance),
          eligibleBorrow: ZERO,
          borrowerIsEligible: false,
          borrowerEligibleSupply: ZERO,
          borrowerEligibleBorrow: ZERO,
        },
      });

      // Case 3: Borrower becomes eligible from ineligible and liquidator is still ineligible,
      // when refresh eligibility,
      // Borrower is the first time to be eligible,
      // So borrower's eligible supply is equal to current supplied minus seized amount,
      // borrower's eligible borrow is current borrowed amount.
      // Liquidator becomes ineligible from eligible, so liquidator's eligible supply and borrow becomes to zero.
      await makeAccountIneligible(liquidator, liquidator.utsUsxLp);
      await makeAccountEligible(borrower, borrower.dfUtsLp);

      liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);
      // Borrower does not borrow any usx, but borrow some wbtc
      let borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      let borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      let borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: liquidatoriUSXBalance.mul(-1).add(borroweriUSXBalance).sub(liquidatoriUSXSeizedBalance),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXBalance.mul(-1),
          eligibleBorrow: ZERO,
          borrowerIsEligible: true,
          borrowerEligibleSupply: borroweriUSXBalance.sub(liquidatoriUSXSeizedBalance),
          borrowerEligibleBorrow: ZERO,
        },
      });

      let borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(borrowerRewardDataBefore.eligibleTotalBorrow.add(borroweriWBTCBorrowedBalance.sub(liquidateAmount)));
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(borrowerRewardDataBefore.eligibleBorrow.add(borroweriWBTCBorrowedBalance.sub(liquidateAmount)));

      // Case 4: Borrower and liquidator become eligible from ineligible,
      // when refresh eligibility,
      // Liquidator and borrower are not the first time to be eligible,
      // So liquidator's eligible supply will increase by seized amount,
      // borrower's eligible supply will decrease by seized amount,
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);
      // Update liquidator's eligibility
      await liquidator.rewardDistributorManager.updateEligibleBalance(liquidator.address);

      liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);

      // Borrower does not borrow any usx, but borrow some wbtc
      borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: true,
          // Liquidator and borrower are both eligible, liquidate does not change eligible total supply.
          eligibleTotalSupply: ZERO,
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXSeizedBalance,
          eligibleBorrow: ZERO,
          borrowerIsEligible: true,
          borrowerEligibleSupply: liquidatoriUSXSeizedBalance.mul(-1),
          borrowerEligibleBorrow: ZERO,
        },
      });

      borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(borrowerRewardDataBefore.eligibleTotalBorrow.sub(liquidateAmount));
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(borrowerRewardDataBefore.eligibleBorrow.sub(liquidateAmount));
    });
    it("Eligible When does not refresh eligibility", async () => {
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);
      await makeAccountEligible(borrower, borrower.dfUtsLp);
      // Update user's eligibility
      await liquidator.rewardDistributorManager.updateEligibleBalance(liquidator.address);
      await borrower.rewardDistributorManager.updateEligibleBalance(borrower.address);

      await eligibleButNotRefresh(liquidator, borrower, liquidateAmount);

      // Case 2: Liquidator will be ineligible but does not refresh eligibility,
      // So liquidator's eligible supply balance will increase by seized amount,
      // eligible borrow balance will not be changed.
      // and borrower's eligible supply balance will decrease by seized amount,
      // eligible borrow balance will decrease by liquidate amount.
      // Borrower does not borrow any usx, but borrow some wbtc
      await makeAccountIneligible(liquidator, liquidator.utsUsxLp);
      await eligibleButNotRefresh(liquidator, borrower, liquidateAmount);

      // Case 3: Borrower will be ineligible but does not refresh eligibility,
      // So borrower's eligible supply balance will decrease by seized amount,
      // borrower does not borrow any usx, but borrow some wbtc
      // eligible borrow balance will decrease by liquidate amount.
      // and liquidator's eligible supply balance will increase by seized amount,
      // eligible borrow balance will not be changed.
      await makeAccountIneligible(borrower, borrower.dfUtsLp);
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);

      await eligibleButNotRefresh(liquidator, borrower, liquidateAmount);

      // Case 4: Borrower and liquidator will be both ineligible but does not refresh eligibility,
      // So borrower's eligible supply balance will decrease by seized amount,
      // borrower does not borrow any usx, but borrow some wbtc
      // eligible borrow balance will decrease by liquidate amount.
      // and liquidator's eligible supply balance will increase by seized amount,
      // eligible borrow balance will not be changed.
      await makeAccountIneligible(liquidator, liquidator.utsUsxLp);

      await eligibleButNotRefresh(liquidator, borrower, liquidateAmount);
    });
    it("Eligible When refresh eligibility", async () => {
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);
      await makeAccountEligible(borrower, borrower.dfUtsLp);

      // Liquidator liquidates borrower and refresh eligibility when they are both eligible,
      // Case 1: liquidator and borrower are still eligible after refreshing eligibility,
      // The first time to be eligible,
      // So liquidator's eligible supply balance will be current supplied adds seized amount,
      // eligible borrow balance will not be changed due to no borrowed
      // and borrower's eligible supply balance will be current supplied minus seized amount,
      // eligible borrow balance will decrease by liquidate amount.
      let liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      let borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);
      let liquidatoriUSXSeizedBalance = await liquidator.controller.callStatic.liquidateCalculateSeizeTokens(
        liquidator.iWBTC.address,
        liquidator.iUSX.address,
        liquidateAmount
      );

      let borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      let borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      let borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: liquidatoriUSXBalance.add(borroweriUSXBalance),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXBalance.add(liquidatoriUSXSeizedBalance),
          eligibleBorrow: ZERO,
          borrowerIsEligible: true,
          borrowerEligibleSupply: borroweriUSXBalance.sub(liquidatoriUSXSeizedBalance),
          borrowerEligibleBorrow: ZERO,
        },
      });

      let borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(borroweriWBTCBorrowedBalance.sub(liquidateAmount));
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(borroweriWBTCBorrowedBalance.sub(liquidateAmount));
      
      // Case 2: liquidator becomes ineligible from eligible and borrower is still eligible when refresh eligibility,
      // Not the first time to be eligible,
      // So liquidator's eligible supply balance will be zero,
      // eligible borrow balance will not be changed due to no borrowed
      // and borrower's eligible supply balance will decrease by seized amount,
      // eligible borrow balance will decrease by liquidate amount.
      await makeAccountIneligible(liquidator, liquidator.utsUsxLp);

      liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);

      borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: liquidatoriUSXBalance.add(liquidatoriUSXSeizedBalance).mul(-1),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXBalance.mul(-1),
          eligibleBorrow: ZERO,
          borrowerIsEligible: true,
          borrowerEligibleSupply: liquidatoriUSXSeizedBalance.mul(-1),
          borrowerEligibleBorrow: ZERO,
        },
      });

      borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(borroweriWBTCBorrowedBalance.sub(liquidateAmount));
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(borroweriWBTCBorrowedBalance.sub(liquidateAmount));
 
      // Case 3: borrower becomes ineligible from eligible and liquidator is still eligible when refresh eligibility,
      // Not the first time to be eligible,
      // So borrower's eligible supply balance will decrease by seized amount,
      // eligible borrow balance will decrease by liquidate amount,
      // and liquidator's eligible supply balance will increase by seized amount,
      // eligible borrow balance will not be changed due to no borrowed.
      await makeAccountEligible(liquidator, liquidator.utsUsxLp);
      // Update liquidator's eligibility
      await liquidator.rewardDistributorManager.updateEligibleBalance(liquidator.address);
      await makeAccountIneligible(borrower, borrower.dfUtsLp);

      liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);

      borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: true,
          eligibleTotalSupply: borroweriUSXBalance.mul(-1).add(liquidatoriUSXSeizedBalance),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXSeizedBalance,
          eligibleBorrow: ZERO,
          borrowerIsEligible: false,
          borrowerEligibleSupply: borroweriUSXBalance.mul(-1),
          borrowerEligibleBorrow: ZERO,
        },
      });

      borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(borrowerRewardDataBefore.eligibleTotalBorrow.sub(borroweriWBTCBorrowedBalance));
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(borrowerRewardDataBefore.eligibleBorrow.sub(borroweriWBTCBorrowedBalance));
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(0);
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(0);

      // Case 4: borrower and liquidator becomes ineligible from eligible,
      // Not the first time to be eligible,
      // So eligible supply and borrow balance will change to zero.
      await makeAccountIneligible(liquidator, liquidator.utsUsxLp);
      await makeAccountEligible(borrower, borrower.dfUtsLp);
      // Update borrower's eligibility
      await borrower.rewardDistributorManager.updateEligibleBalance(borrower.address);
      await makeAccountIneligible(borrower, borrower.dfUtsLp);

      liquidatoriUSXBalance = await liquidator.iUSX.balanceOf(liquidator.address);
      borroweriUSXBalance = await borrower.iUSX.balanceOf(borrower.address);

      borrowerBorrowedData = await borrower.iWBTC.borrowSnapshot(borrower.address);
      borroweriWBTCBorrowedBalance = (borrowerBorrowedData[0]).mul(BASE).div(borrowerBorrowedData[1]);
      borrowerRewardDataBefore = await rewardManagerData(borrower, borrower.iWBTC);

      await executeInRDM({
        operator: liquidator,
        iToken: liquidator.iWBTC,
        borrower: borrower,
        seizeAsset: borrower.iUSX,
        action: "liquidateBorrow",
        params: [borrower.address, liquidateAmount, liquidator.iUSX.address, true],
        diff: {
          isEligible: false,
          eligibleTotalSupply: liquidatoriUSXBalance.add(borroweriUSXBalance).mul(-1),
          eligibleTotalBorrow: ZERO,
          eligibleSupply: liquidatoriUSXBalance.mul(-1),
          eligibleBorrow: ZERO,
          borrowerIsEligible: false,
          borrowerEligibleSupply: borroweriUSXBalance.mul(-1),
          borrowerEligibleBorrow: ZERO,
        },
      });

      borrowerRewardDataAfter = await rewardManagerData(borrower, borrower.iWBTC);
      expect(borrowerRewardDataAfter.eligibleTotalBorrow).to.eq(0);
      expect(borrowerRewardDataAfter.eligibleBorrow).to.eq(0);
    });
  });
});
