import chai, {expect} from "chai";
import {setupBLPEnv} from "./utils";
import {BigNumber, Contract, Signer, utils} from "ethers";
import hre, {ethers, getUnnamedAccounts} from "hardhat";
import {IiToken, RewardDistributorManager} from "../typechain-types";

async function getEligibleStates(
  RewardDistributorManager: RewardDistributorManager,
  accounts: string[],
  iTokens: MockiToken
) {
  let res: {
    isEligible: {[account: string]: boolean};
    iTokens: {
      [iTokenAddress: string]: {
        eligibleSupply: {[account: string]: BigNumber};
        eligibleBorrow: {[account: string]: BigNumber};
        eligibleTotalSupply: BigNumber;
        eligibleTotalBorrow: BigNumber;
      };
    };
  } = {
    isEligible: {},
    iTokens: {},
  };

  await Promise.all(
    accounts.map(async (account) => {
      res.isEligible[account] = await RewardDistributorManager.isEligible(
        account
      );
    })
  );

  await Promise.all(
    iTokens.map(async (iToken) => {
      const iTokenAddress = iToken.address;
      res.iTokens[iTokenAddress] = {
        eligibleSupply: {},
        eligibleBorrow: {},
        eligibleTotalSupply: await RewardDistributorManager.eligibleTotalSupply(
          iTokenAddress
        ),
        eligibleTotalBorrow: await RewardDistributorManager.eligibleTotalBorrow(
          iTokenAddress
        ),
      };

      await Promise.all(
        accounts.map(async (account) => {
          res.iTokens[iTokenAddress].eligibleSupply[account] =
            await RewardDistributorManager.eligibleSupply(
              iTokenAddress,
              account
            );
          res.iTokens[iTokenAddress].eligibleBorrow[account] =
            await RewardDistributorManager.eligibleBorrow(
              iTokenAddress,
              account
            );
        })
      );
    })
  );

  return res;
}

// Function to generate diff between after and before states
function generateDiff(before: any, after: any) {
  const diff: any = {};

  // Compare isEligible
  diff.isEligible = {};
  for (const account in after.isEligible) {
    if (before.isEligible[account] !== after.isEligible[account]) {
      diff.isEligible[account] = {
        from: before.isEligible[account],
        to: after.isEligible[account],
      };
    }
  }

  // Compare iTokens
  diff.iTokens = {};
  for (const iToken in after.iTokens) {
    diff.iTokens[iToken] = {};

    // Compare eligibleTotalSupply and eligibleTotalBorrow
    diff.iTokens[iToken].eligibleTotalSupply = after.iTokens[
      iToken
    ].eligibleTotalSupply.sub(before.iTokens[iToken].eligibleTotalSupply);
    diff.iTokens[iToken].eligibleTotalBorrow = after.iTokens[
      iToken
    ].eligibleTotalBorrow.sub(before.iTokens[iToken].eligibleTotalBorrow);

    // Compare eligibleSupply and eligibleBorrow for each account
    diff.iTokens[iToken].eligibleSupply = {};
    diff.iTokens[iToken].eligibleBorrow = {};
    for (const account in after.iTokens[iToken].eligibleSupply) {
      diff.iTokens[iToken].eligibleSupply[account] = after.iTokens[
        iToken
      ].eligibleSupply[account].sub(
        before.iTokens[iToken].eligibleSupply[account]
      );

      diff.iTokens[iToken].eligibleBorrow[account] = after.iTokens[
        iToken
      ].eligibleBorrow[account].sub(
        before.iTokens[iToken].eligibleBorrow[account]
      );
    }
  }

  return diff;
}

describe("Integration RewardDistributorManager with BLP Staking", function () {
  let deployer: any;
  let users: any[];
  let accounts: string[];
  let rewardDistributorManager: RewardDistributorManager;
  let iWBTC: MockiToken;
  let iUSX: MockiToken;
  let iTokens: MockiToken[];

  before(async () => {
    ({iUSX, iWBTC, rewardDistributorManager, users, deployer} =
      await setupBLPEnv());
    accounts = (await getUnnamedAccounts()).slice(0, 2);
    iTokens = [iUSX, iWBTC];
  });

  describe("No supply or borrow", async () => {
    it("Initial eligibility should be false", async () => {
      const states = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // console.log(JSON.stringify(states, null, 2));

      for (const account of accounts) {
        expect(states.isEligible[account]).to.be.false;
      }

      for (const iTokenAddress in states.iTokens) {
        const iToken = states.iTokens[iTokenAddress];
        expect(iToken.eligibleTotalSupply).to.equal(0);
        expect(iToken.eligibleTotalBorrow).to.equal(0);

        for (const account of accounts) {
          expect(iToken.eligibleSupply[account]).to.equal(0);
          expect(iToken.eligibleBorrow[account]).to.equal(0);
        }
      }
    });

    it("Stake BLP to become eligible", async () => {
      const beforeStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // Approve to BLP staking pool
      let stakeAmount = utils.parseEther("10000");
      await users[0].dfUtsLp.approve(
        users[0].dfUtsStakingPool.address,
        stakeAmount
      );
      // Stake to BLP staking pool
      await users[0].dfUtsStakingPool.stake(accounts[0], stakeAmount);

      const afterStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      const stateDiff = generateDiff(beforeStates, afterStates);
      // console.log("State differences after staking:");
      // console.log(JSON.stringify(stateDiff, null, 2));

      // Assertions based on the diff
      expect(stateDiff.isEligible[accounts[0]]).to.deep.equal({
        from: false,
        to: true,
      });
      expect(Object.keys(stateDiff.isEligible).length).to.equal(1);

      for (const iTokenKey in stateDiff.iTokens) {
        const iTokenDiff = stateDiff.iTokens[iTokenKey];
        expect(iTokenDiff.eligibleTotalSupply).to.equal(0);
        expect(iTokenDiff.eligibleTotalBorrow).to.equal(0);

        for (const account of accounts) {
          expect(iTokenDiff.eligibleSupply[account]).to.equal(0);
          expect(iTokenDiff.eligibleBorrow[account]).to.equal(0);
        }
      }
    });

    it("Stake more BLP, stays eligible", async () => {
      const beforeStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // Approve to BLP staking pool
      let stakeAmount = utils.parseEther("10000");
      await users[0].dfUtsLp.approve(
        users[0].dfUtsStakingPool.address,
        stakeAmount
      );
      // Stake to BLP staking pool
      await users[0].dfUtsStakingPool.stake(accounts[0], stakeAmount);

      const afterStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      const stateDiff = generateDiff(beforeStates, afterStates);
      // console.log("State differences after staking:");
      // console.log(JSON.stringify(stateDiff, null, 2));

      // Assertions based on the diff
      expect(Object.keys(stateDiff.isEligible).length).to.equal(0);

      for (const iTokenKey in stateDiff.iTokens) {
        const iTokenDiff = stateDiff.iTokens[iTokenKey];
        expect(iTokenDiff.eligibleTotalSupply).to.equal(0);
        expect(iTokenDiff.eligibleTotalBorrow).to.equal(0);

        for (const account of accounts) {
          expect(iTokenDiff.eligibleSupply[account]).to.equal(0);
          expect(iTokenDiff.eligibleBorrow[account]).to.equal(0);
        }
      }
    });

    it("unstake BLP to become ineligible", async () => {
      const beforeStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // Withdraw from BLP staking pool
      let balance = await users[0].dfUtsStakingPool.balanceOf(accounts[0]);
      await users[0].dfUtsStakingPool.withdraw(balance);

      const afterStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      const stateDiff = generateDiff(beforeStates, afterStates);

      // Assertions based on the diff
      expect(stateDiff.isEligible[accounts[0]]).to.deep.equal({
        from: true,
        to: false,
      });
      expect(Object.keys(stateDiff.isEligible).length).to.equal(1);

      for (const iTokenKey in stateDiff.iTokens) {
        const iTokenDiff = stateDiff.iTokens[iTokenKey];
        expect(iTokenDiff.eligibleTotalSupply).to.equal(0);
        expect(iTokenDiff.eligibleTotalBorrow).to.equal(0);

        for (const account of accounts) {
          expect(iTokenDiff.eligibleSupply[account]).to.equal(0);
          expect(iTokenDiff.eligibleBorrow[account]).to.equal(0);
        }
      }
    });
  });

  describe("Supplies/borrow some token", async () => {
    let stakeAmount = utils.parseEther("10000");
    let supplyAmount = utils.parseEther("200");
    let borrowAmount = utils.parseEther("100");
    let accountEligible: string;
    let accountIneligible: string;
    let eligibleiToken: string;

    before(async () => {
      // No need to use as collateral in mock lending
      accountIneligible = accounts[0];
      await users[0].mockWBTC.approve(
        iWBTC.address,
        ethers.constants.MaxUint256
      );
      await users[0].iWBTC.mint(accounts[0], supplyAmount, false);
      await users[0].iWBTC.borrow(supplyAmount, false);

      accountEligible = accounts[1];
      await users[1].mockUSX.approve(iUSX.address, ethers.constants.MaxUint256);
      await users[1].iUSX.mint(accounts[1], supplyAmount, false);
      await users[1].iUSX.borrow(borrowAmount, false);

      eligibleiToken = iUSX.address;
    });

    it("Initial eligibility should be false", async () => {
      const states = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // console.log(JSON.stringify(states, null, 2));

      for (const account of accounts) {
        expect(states.isEligible[account]).to.be.false;
      }

      for (const iTokenAddress in states.iTokens) {
        const iToken = states.iTokens[iTokenAddress];
        expect(iToken.eligibleTotalSupply).to.equal(0);
        expect(iToken.eligibleTotalBorrow).to.equal(0);

        for (const account of accounts) {
          expect(iToken.eligibleSupply[account]).to.equal(0);
          expect(iToken.eligibleBorrow[account]).to.equal(0);
        }
      }
    });

    it("Stake BLP to become eligible", async () => {
      const beforeStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // Approve to BLP staking pool
      await users[0].dfUtsLp.approve(
        users[0].dfUtsStakingPool.address,
        ethers.constants.MaxUint256
      );
      await users[1].dfUtsLp.approve(
        users[0].dfUtsStakingPool.address,
        ethers.constants.MaxUint256
      );

      // Stake to BLP staking pool
      await users[0].dfUtsStakingPool.stake(accounts[0], stakeAmount);
      await users[1].dfUtsStakingPool.stake(accounts[1], stakeAmount);

      const afterStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      const stateDiff = generateDiff(beforeStates, afterStates);
      // console.log("State differences after staking:");
      //   console.log(JSON.stringify(stateDiff, null, 2));

      // Assertions based on the diff
      expect(stateDiff.isEligible[accountEligible]).to.deep.equal({
        from: false,
        to: true,
      });
      expect(Object.keys(stateDiff.isEligible).length).to.equal(1);

      for (const iTokenKey in stateDiff.iTokens) {
        const iTokenDiff = stateDiff.iTokens[iTokenKey];

        if (eligibleiToken === iTokenKey) {
          expect(iTokenDiff.eligibleTotalSupply).to.equal(supplyAmount);
          expect(iTokenDiff.eligibleTotalBorrow).to.equal(borrowAmount);
        } else {
          expect(iTokenDiff.eligibleTotalSupply).to.equal(0);
          expect(iTokenDiff.eligibleTotalBorrow).to.equal(0);
        }

        for (const account of accounts) {
          if (account === accountEligible && eligibleiToken === iTokenKey) {
            expect(iTokenDiff.eligibleSupply[account]).to.equal(supplyAmount);
            expect(iTokenDiff.eligibleBorrow[account]).to.equal(borrowAmount);
          } else {
            expect(iTokenDiff.eligibleSupply[account]).to.equal(0);
            expect(iTokenDiff.eligibleBorrow[account]).to.equal(0);
          }
        }
      }
    });

    it("Stake more BLP, stays eligible", async () => {
      const beforeStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // Approve to BLP staking pool
      let stakeAmount = utils.parseEther("10000");
      await users[0].dfUtsLp.approve(
        users[0].dfUtsStakingPool.address,
        stakeAmount
      );
      // Stake to BLP staking pool
      await users[0].dfUtsStakingPool.stake(accounts[0], stakeAmount);
      await users[1].dfUtsStakingPool.stake(accounts[1], stakeAmount);

      const afterStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      const stateDiff = generateDiff(beforeStates, afterStates);
      // console.log("State differences after staking:");
      // console.log(JSON.stringify(stateDiff, null, 2));

      // Assertions based on the diff
      expect(Object.keys(stateDiff.isEligible).length).to.equal(0);

      for (const iTokenKey in stateDiff.iTokens) {
        const iTokenDiff = stateDiff.iTokens[iTokenKey];
        expect(iTokenDiff.eligibleTotalSupply).to.equal(0);
        expect(iTokenDiff.eligibleTotalBorrow).to.equal(0);

        for (const account of accounts) {
          expect(iTokenDiff.eligibleSupply[account]).to.equal(0);
          expect(iTokenDiff.eligibleBorrow[account]).to.equal(0);
        }
      }
    });

    it("unstake BLP to become ineligible", async () => {
      const beforeStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      // Withdraw from BLP staking pool
      let balance = await users[0].dfUtsStakingPool.balanceOf(accounts[0]);
      await users[0].dfUtsStakingPool.withdraw(balance);
      balance = await users[0].dfUtsStakingPool.balanceOf(accounts[1]);
      await users[1].dfUtsStakingPool.withdraw(balance);

      const afterStates = await getEligibleStates(
        rewardDistributorManager,
        accounts,
        iTokens
      );

      const stateDiff = generateDiff(beforeStates, afterStates);

      // Assertions based on the diff
      expect(stateDiff.isEligible[accountEligible]).to.deep.equal({
        from: true,
        to: false,
      });
      expect(Object.keys(stateDiff.isEligible).length).to.equal(1);

      for (const iTokenKey in stateDiff.iTokens) {
        const iTokenDiff = stateDiff.iTokens[iTokenKey];
        if (eligibleiToken === iTokenKey) {
          expect(iTokenDiff.eligibleTotalSupply).to.equal(supplyAmount.mul(-1));
          expect(iTokenDiff.eligibleTotalBorrow).to.equal(borrowAmount.mul(-1));
        } else {
          expect(iTokenDiff.eligibleTotalSupply).to.equal(0);
          expect(iTokenDiff.eligibleTotalBorrow).to.equal(0);
        }

        for (const account of accounts) {
          if (account === accountEligible && eligibleiToken === iTokenKey) {
            expect(iTokenDiff.eligibleSupply[account]).to.equal(
              supplyAmount.mul(-1)
            );
            expect(iTokenDiff.eligibleBorrow[account]).to.equal(
              borrowAmount.mul(-1)
            );
          } else {
            expect(iTokenDiff.eligibleSupply[account]).to.equal(0);
            expect(iTokenDiff.eligibleBorrow[account]).to.equal(0);
          }
        }
      }
    });
  });
});
