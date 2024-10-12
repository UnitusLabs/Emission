import chai, {expect} from "chai";
import hre, {
  ethers,
  deployments,
  getNamedAccounts,
  getUnnamedAccounts,
} from "hardhat";
import {setupMockRewardDistributorManager, impersonateAccount} from "./utils";
import {BigNumber, Contract, Signer, utils} from "ethers";
import {
  IController,
  RewardDistributor,
  RewardDistributorManager,
  MockERC20Token,
  IiToken,
  EligibilityManager,
  IEligibilityManager,
} from "../typechain-types";
import {printDistributionReward} from "./RewardDistributor.test";
import {getContract} from "../utils/utils";
import {FakeContract, smock} from "@defi-wonderland/smock";

export async function printEligibleBalances(
  rewardDistributorManager: RewardDistributorManager,
  iTokens: IiToken[],
  accounts: string[]
) {
  const names = await Promise.all(
    iTokens.map((iToken: IiToken) => iToken.name())
  );

  const isEligible = await Promise.all(
    accounts.map((account: string) =>
      rewardDistributorManager.isEligible(account)
    )
  );

  const eligibleTotalSupply = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributorManager.eligibleTotalSupply(iToken.address)
    )
  );

  const eligibleTotalBorrow = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributorManager.eligibleTotalBorrow(iToken.address)
    )
  );

  let eligibleSupply: {[iToken: string]: any} = {};
  let eligibleBorrow: {[iToken: string]: any} = {};
  for (const iToken of iTokens) {
    eligibleSupply[iToken.address] = await Promise.all(
      accounts.map((account: string) =>
        rewardDistributorManager.eligibleSupply(iToken.address, account)
      )
    );

    eligibleBorrow[iToken.address] = await Promise.all(
      accounts.map((account: string) =>
        rewardDistributorManager.eligibleBorrow(iToken.address, account)
      )
    );
  }

  iTokens.forEach((iToken: IiToken, i: number) => {
    console.log(
      names[i].padStart(6),
      "\n\tEligible Total Supply: ",
      eligibleTotalSupply[i].toString().padStart(20),
      "\tEligible Total Borrow: ",
      eligibleTotalBorrow[i].toString().padStart(20)
    );

    accounts.forEach((account: string, j: number) => {
      console.log(
        account.padStart(6),
        "\tIs Eligible: ",
        isEligible[j],
        "\tEligible Supply: ",
        eligibleSupply[iToken.address][j].toString().padStart(20),
        "\tEligible Borrow: ",
        eligibleBorrow[iToken.address][j].toString().padStart(20)
      );
    });
  });
}

describe("RewardDistributorManager", async function () {
  let owner: any;
  let accounts: string[];
  let mockUSDCiToken: string;
  let mockUSDTiToken: string;
  let lending: any;
  let deployer: any;
  let users: any;
  let controller: IController;
  let eligibilityManager: FakeContract<EligibilityManager>;
  let rewardDistributorManager: RewardDistributorManager;
  let utsRewardDistributor: RewardDistributor;
  let arbRewardDistributor: RewardDistributor;
  let ARB: MockERC20Token;
  let UTS: MockERC20Token;
  let controllerSigner: Signer;

  before(async () => {
    ({
      controller,
      eligibilityManager,
      rewardDistributorManager,
      ARB,
      UTS,
      utsRewardDistributor,
      arbRewardDistributor,
      deployer: owner,
      users,
      lending,
    } = await setupMockRewardDistributorManager());

    await owner.UTS.approve(
      utsRewardDistributor.address,
      ethers.constants.MaxUint256
    );
    await owner.ARB.approve(
      arbRewardDistributor.address,
      ethers.constants.MaxUint256
    );

    await owner.utsRewardDistributor._unpause(
      [lending.iTokens.iBTC.address],
      [ethers.utils.parseEther("100")],
      [lending.iTokens.iBTC.address],
      [ethers.utils.parseEther("100")]
    );

    await owner.arbRewardDistributor._unpause(
      [lending.iTokens.iBTC.address],
      [ethers.utils.parseEther("200")],
      [lending.iTokens.iBTC.address],
      [ethers.utils.parseEther("200")]
    );

    controllerSigner = await impersonateAccount(lending.controller.address);
    accounts = (await getUnnamedAccounts()).slice(0, 2);

    lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
    lending.iTokens.iBTC.borrowBalanceStored.returns(utils.parseEther("100"));
    lending.iTokens.iBTC.borrowSnapshot.returns([
      utils.parseEther("100"),
      utils.parseEther("1"),
    ]);
    eligibilityManager.isEligible.returns([true, true]);

    await rewardDistributorManager.updateEligibleBalances(accounts);
  });

  describe("Eligible Balances", async () => {
    describe("eligibleSupply", function () {
      it("should return 0 for ineligible account", async function () {
        eligibilityManager.isEligible.returns([false, true]);
        lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));

        await rewardDistributorManager.updateEligibleBalances(accounts);

        const eligibleSupply = await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
        expect(eligibleSupply).to.equal(0);
      });

      it("should return correct balance for eligible account", async function () {
        eligibilityManager.isEligible.returns([true, true]);
        lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));

        await rewardDistributorManager.updateEligibleBalances(accounts);

        const eligibleSupply = await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
        expect(eligibleSupply).to.equal(ethers.utils.parseEther("100"));
      });
    });

    describe("eligibleBorrow", function () {
      it("should return 0 for ineligible account", async function () {
        eligibilityManager.isEligible.returns([false, true]);
        lending.iTokens.iBTC.borrowSnapshot.returns([
          utils.parseEther("100"),
          utils.parseEther("1"),
        ]);

        await rewardDistributorManager.updateEligibleBalances(accounts);

        const eligibleBorrow = await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
        expect(eligibleBorrow).to.equal(0);
      });

      it("should return correct borrow balance for eligible account", async function () {
        eligibilityManager.isEligible.returns([true, true]);
        lending.iTokens.iBTC.borrowSnapshot.returns([
          utils.parseEther("100"),
          utils.parseEther("1"),
        ]);

        await rewardDistributorManager.updateEligibleBalances(accounts);

        const eligibleBorrow = await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
        expect(eligibleBorrow).to.equal(ethers.utils.parseEther("100"));
      });

      it("should return 0 as borrow balance for 0 borrowIndex eligible account", async function () {
        eligibilityManager.isEligible.returns([true, true]);
        lending.iTokens.iBTC.borrowSnapshot.returns([0, 0]);

        await rewardDistributorManager.updateEligibleBalances(accounts);

        const eligibleBorrow = await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
        expect(eligibleBorrow).to.equal(ethers.utils.parseEther("0"));
      });
    });

    describe("eligibleTotalSupply/eligibleTotalBorrow", function () {
      describe("afterMint", function () {
        it("eligible => eligibleTotalSupply +, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const mintAmount = ethers.utils.parseEther("100");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterMint(
              lending.iTokens.iBTC.address,
              accounts[0],
              mintAmount,
              mintAmount
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(
            initialEligibleTotalSupply.add(mintAmount)
          );
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const mintAmount = ethers.utils.parseEther("100");

          // Get initial eligible total supply
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterMint(
              lending.iTokens.iBTC.address,
              accounts[0],
              mintAmount,
              mintAmount
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
        });
      });

      describe("afterRedeem", function () {
        it("eligible => eligibleTotalSupply -, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const redeemAmount = ethers.utils.parseEther("50");
          const redeemedUnderlying = ethers.utils.parseEther("45");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterRedeem(
              lending.iTokens.iBTC.address,
              accounts[0],
              redeemAmount,
              redeemedUnderlying
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(
            initialEligibleTotalSupply.sub(redeemAmount)
          );
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const redeemAmount = ethers.utils.parseEther("50");
          const redeemedUnderlying = ethers.utils.parseEther("45");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterRedeem(
              lending.iTokens.iBTC.address,
              accounts[0],
              redeemAmount,
              redeemedUnderlying
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      describe("afterBorrow", function () {
        it("eligible => eligibleTotalSupply =, eligibleTotalBorrow +", async function () {
          eligibilityManager.isEligible.returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const borrowAmount = ethers.utils.parseEther("100");
          const borrowIndex = ethers.utils.parseEther("1");
          lending.iTokens.iBTC.borrowIndex.returns(borrowIndex);

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterBorrow(
              lending.iTokens.iBTC.address,
              accounts[0],
              borrowAmount
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(
            initialEligibleTotalBorrow.add(borrowAmount)
          );
        });

        it("ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const borrowAmount = ethers.utils.parseEther("100");
          const borrowIndex = ethers.utils.parseEther("1");
          lending.iTokens.iBTC.borrowIndex.returns(borrowIndex);

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterBorrow(
              lending.iTokens.iBTC.address,
              accounts[0],
              borrowAmount
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      describe("afterRepayBorrow", function () {
        it("eligible => eligibleTotalSupply =, eligibleTotalBorrow -", async function () {
          eligibilityManager.isEligible.returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const repayAmount = ethers.utils.parseEther("50");
          const borrowIndex = ethers.utils.parseEther("1");
          lending.iTokens.iBTC.borrowIndex.returns(borrowIndex);

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterRepayBorrow(
              lending.iTokens.iBTC.address,
              accounts[1],
              accounts[0],
              repayAmount
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(
            initialEligibleTotalBorrow.sub(repayAmount)
          );
        });

        it("ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const repayAmount = ethers.utils.parseEther("50");
          const borrowIndex = ethers.utils.parseEther("1");
          lending.iTokens.iBTC.borrowIndex.returns(borrowIndex);

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterRepayBorrow(
              lending.iTokens.iBTC.address,
              accounts[1],
              accounts[0],
              repayAmount
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      describe("afterLiquidateBorrow", function () {
        it("eligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const repayAmount = ethers.utils.parseEther("50");
          const seizeTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterLiquidateBorrow(
              lending.iTokens.iBTC.address,
              lending.iTokens.iETH.address,
              accounts[0],
              accounts[1],
              repayAmount,
              seizeTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const repayAmount = ethers.utils.parseEther("50");
          const seizeTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterLiquidateBorrow(
              lending.iTokens.iBTC.address,
              lending.iTokens.iETH.address,
              accounts[0],
              accounts[1],
              repayAmount,
              seizeTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      describe("afterSeize", function () {
        let borrower: string;
        let liquidator: string;

        before(async () => {
          borrower = accounts[0];
          liquidator = accounts[1];
        });

        after(async () => {
          eligibilityManager.isEligible.reset();
        });

        it("borrower:eligible, liquidator: eligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(borrower)
            .returns([true, true]);
          eligibilityManager.isEligible
            .whenCalledWith(liquidator)
            .returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const seizeTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterSeize(
              lending.iTokens.iBTC.address,
              lending.iTokens.iETH.address,
              liquidator,
              borrower,
              seizeTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("borrower:eligible, liquidator: ineligible => eligibleTotalSupply -, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(borrower)
            .returns([true, true]);
          eligibilityManager.isEligible
            .whenCalledWith(liquidator)
            .returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const seizeTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterSeize(
              lending.iTokens.iBTC.address,
              lending.iTokens.iETH.address,
              liquidator,
              borrower,
              seizeTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(
            initialEligibleTotalSupply.sub(seizeTokens)
          );
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("borrower:ineligible, liquidator: eligible => eligibleTotalSupply +, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(borrower)
            .returns([false, true]);
          eligibilityManager.isEligible
            .whenCalledWith(liquidator)
            .returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const seizeTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterSeize(
              lending.iTokens.iBTC.address,
              lending.iTokens.iETH.address,
              liquidator,
              borrower,
              seizeTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(
            initialEligibleTotalSupply.add(seizeTokens)
          );
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("borrower:ineligible, liquidator: ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(borrower)
            .returns([false, true]);
          eligibilityManager.isEligible
            .whenCalledWith(liquidator)
            .returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const seizeTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterSeize(
              lending.iTokens.iBTC.address,
              lending.iTokens.iETH.address,
              liquidator,
              borrower,
              seizeTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      describe("afterTransfer", function () {
        let from: string;
        let to: string;

        before(async () => {
          from = accounts[0];
          to = accounts[1];
        });

        after(async () => {
          eligibilityManager.isEligible.reset();
        });

        it("from:eligible, to: eligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(from)
            .returns([true, true]);
          eligibilityManager.isEligible
            .whenCalledWith(to)
            .returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const transferTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterTransfer(
              lending.iTokens.iBTC.address,
              from,
              to,
              transferTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("from:eligible, to: ineligible => eligibleTotalSupply -, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(from)
            .returns([true, true]);
          eligibilityManager.isEligible
            .whenCalledWith(to)
            .returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const transferTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterTransfer(
              lending.iTokens.iBTC.address,
              from,
              to,
              transferTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(
            initialEligibleTotalSupply.sub(transferTokens)
          );
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("from:ineligible, to: eligible => eligibleTotalSupply +, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(from)
            .returns([false, true]);
          eligibilityManager.isEligible
            .whenCalledWith(to)
            .returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const transferTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterTransfer(
              lending.iTokens.iBTC.address,
              from,
              to,
              transferTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(
            initialEligibleTotalSupply.add(transferTokens)
          );
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });

        it("from:ineligible, to: ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible
            .whenCalledWith(from)
            .returns([false, true]);
          eligibilityManager.isEligible
            .whenCalledWith(to)
            .returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const transferTokens = ethers.utils.parseEther("25");

          // Get initial eligible total supply and borrow
          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterTransfer(
              lending.iTokens.iBTC.address,
              from,
              to,
              transferTokens
            );

          const newEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const newEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(newEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(newEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      describe("afterFlashloan", function () {
        it("eligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([true, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const flashloanAmount = ethers.utils.parseEther("100");

          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterFlashloan(
              lending.iTokens.iBTC.address,
              accounts[0],
              flashloanAmount
            );

          const finalEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const finalEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(finalEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(finalEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
        it("ineligible => eligibleTotalSupply =, eligibleTotalBorrow =", async function () {
          eligibilityManager.isEligible.returns([false, true]);
          await rewardDistributorManager.updateEligibleBalances(accounts);

          const flashloanAmount = ethers.utils.parseEther("100");

          const initialEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const initialEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          await rewardDistributorManager
            .connect(controllerSigner)
            .afterFlashloan(
              lending.iTokens.iBTC.address,
              accounts[0],
              flashloanAmount
            );

          const finalEligibleTotalSupply =
            await rewardDistributorManager.eligibleTotalSupply(
              lending.iTokens.iBTC.address
            );
          const finalEligibleTotalBorrow =
            await rewardDistributorManager.eligibleTotalBorrow(
              lending.iTokens.iBTC.address
            );

          expect(finalEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
          expect(finalEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
        });
      });

      it("should revert when non-controller calls after hooks", async function () {
        const nonControllerSigner = await ethers.getSigner(accounts[0]);
        const amount = ethers.utils.parseEther("100");

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterMint(
              lending.iTokens.iBTC.address,
              accounts[0],
              amount,
              amount
            )
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterRedeem(
              lending.iTokens.iBTC.address,
              accounts[0],
              amount,
              amount
            )
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterBorrow(lending.iTokens.iBTC.address, accounts[0], amount)
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterRepayBorrow(
              lending.iTokens.iBTC.address,
              accounts[0],
              accounts[0],
              amount
            )
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterLiquidateBorrow(
              lending.iTokens.iBTC.address,
              lending.iTokens.iBTC.address,
              accounts[0],
              accounts[0],
              amount,
              amount
            )
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterSeize(
              lending.iTokens.iBTC.address,
              lending.iTokens.iBTC.address,
              accounts[0],
              accounts[0],
              amount
            )
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterTransfer(
              lending.iTokens.iBTC.address,
              accounts[0],
              accounts[1],
              amount
            )
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );

        await expect(
          rewardDistributorManager
            .connect(nonControllerSigner)
            .afterFlashloan(lending.iTokens.iBTC.address, accounts[0], amount)
        ).to.be.revertedWithCustomError(
          rewardDistributorManager,
          "RewardDistributorManager__NotController"
        );
      });
    });
  });

  describe("updateEligibleBalances", function () {
    it("stays Eligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(utils.parseEther("100"));
      expect(finalEligibleBorrow).to.equal(utils.parseEther("100"));
      expect(finalEligibleSupply).to.equal(initialEligibleSupply);
      expect(finalEligibleBorrow).to.equal(initialEligibleBorrow);
      expect(finalEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
      expect(finalEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
    });

    it("Eligible => Ineligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Change eligibility status
      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(0);
      expect(finalEligibleBorrow).to.equal(0);
      // There are 2 accounts being updated, so the total change should be doubled
      expect(finalEligibleTotalSupply).to.equal(
        initialEligibleTotalSupply.sub(initialEligibleSupply.mul(2))
      );
      expect(finalEligibleTotalBorrow).to.equal(
        initialEligibleTotalBorrow.sub(initialEligibleBorrow.mul(2))
      );
    });

    it("stays Ineligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(initialEligibleSupply);
      expect(finalEligibleBorrow).to.equal(initialEligibleBorrow);
      expect(finalEligibleSupply).to.equal(0);
      expect(finalEligibleBorrow).to.equal(0);
      expect(finalEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
      expect(finalEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
    });

    it("Ineligible => Eligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      // Initial state: Ineligible
      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Change to Eligible
      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(utils.parseEther("100"));
      expect(finalEligibleBorrow).to.equal(utils.parseEther("100"));
      // There are 2 accounts being updated, so the total change should be doubled
      expect(finalEligibleTotalSupply).to.equal(
        initialEligibleTotalSupply.add(utils.parseEther("100").mul(2))
      );
      expect(finalEligibleTotalBorrow).to.equal(
        initialEligibleTotalBorrow.add(utils.parseEther("100").mul(2))
      );
    });

    it("invalid Eligibility", async () => {
      eligibilityManager.isEligible.returns([true, false]);

      await expect(
        rewardDistributorManager.updateEligibleBalances(accounts)
      ).to.be.revertedWithCustomError(
        rewardDistributorManager,
        "RewardDistributorManager_updateEligibleBalance__InvalidEligibility"
      );
    });
  });

  describe("updateEligibleBalance", function () {
    it("stays Eligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(utils.parseEther("100"));
      expect(finalEligibleBorrow).to.equal(utils.parseEther("100"));
      expect(finalEligibleSupply).to.equal(initialEligibleSupply);
      expect(finalEligibleBorrow).to.equal(initialEligibleBorrow);
      expect(finalEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
      expect(finalEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
    });

    it("Eligible => Ineligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Change eligibility status
      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(0);
      expect(finalEligibleBorrow).to.equal(0);
      expect(finalEligibleTotalSupply).to.equal(
        initialEligibleTotalSupply.sub(initialEligibleSupply)
      );
      expect(finalEligibleTotalBorrow).to.equal(
        initialEligibleTotalBorrow.sub(initialEligibleBorrow)
      );
    });

    it("stays Ineligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(initialEligibleSupply);
      expect(finalEligibleBorrow).to.equal(initialEligibleBorrow);
      expect(finalEligibleSupply).to.equal(0);
      expect(finalEligibleBorrow).to.equal(0);
      expect(finalEligibleTotalSupply).to.equal(initialEligibleTotalSupply);
      expect(finalEligibleTotalBorrow).to.equal(initialEligibleTotalBorrow);
    });

    it("Ineligible => Eligible", async () => {
      lending.iTokens.iBTC.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iBTC.borrowSnapshot.returns([
        utils.parseEther("100"),
        utils.parseEther("1"),
      ]);

      // Initial state: Ineligible
      eligibilityManager.isEligible.returns([false, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check initial values
      const initialEligibleSupply =
        await rewardDistributorManager.eligibleSupply(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleBorrow =
        await rewardDistributorManager.eligibleBorrow(
          lending.iTokens.iBTC.address,
          accounts[0]
        );
      const initialEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const initialEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Change to Eligible
      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalance(accounts[0]);

      // Check values after update
      const finalEligibleSupply = await rewardDistributorManager.eligibleSupply(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleBorrow = await rewardDistributorManager.eligibleBorrow(
        lending.iTokens.iBTC.address,
        accounts[0]
      );
      const finalEligibleTotalSupply =
        await rewardDistributorManager.eligibleTotalSupply(
          lending.iTokens.iBTC.address
        );
      const finalEligibleTotalBorrow =
        await rewardDistributorManager.eligibleTotalBorrow(
          lending.iTokens.iBTC.address
        );

      // Compare before and after values
      expect(finalEligibleSupply).to.equal(utils.parseEther("100"));
      expect(finalEligibleBorrow).to.equal(utils.parseEther("100"));
      expect(finalEligibleTotalSupply).to.equal(
        initialEligibleTotalSupply.add(utils.parseEther("100"))
      );
      expect(finalEligibleTotalBorrow).to.equal(
        initialEligibleTotalBorrow.add(utils.parseEther("100"))
      );
    });

    it("invalid Eligibility", async () => {
      eligibilityManager.isEligible.returns([true, false]);

      await expect(
        rewardDistributorManager.updateEligibleBalance(accounts[0])
      ).to.be.revertedWithCustomError(
        rewardDistributorManager,
        "RewardDistributorManager_updateEligibleBalance__InvalidEligibility"
      );
    });
  });

  describe("Distributors", function () {
    describe("updateDistributionState", async () => {
      let utsSupplyIndexSpeedEligible: BigNumber;
      let utsSupplyIndexSpeedIneligible: BigNumber;
      let arbSupplyIndexSpeedEligible: BigNumber;
      let arbSupplyIndexSpeedIneligible: BigNumber;
      let utsBorrowIndexSpeedEligible: BigNumber;
      let utsBorrowIndexSpeedIneligible: BigNumber;
      let arbBorrowIndexSpeedEligible: BigNumber;
      let arbBorrowIndexSpeedIneligible: BigNumber;

      it("Update distributor supply state when all users are eligible", async () => {
        eligibilityManager.isEligible.returns([true, true]);
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsDistributionSupplyState =
          await owner.utsRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );
        let beforeArbDistributionSupplyState =
          await owner.arbRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );

        // Update distribute state
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          false
        );

        let afterUtsDistributionSupplyState =
          await owner.utsRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );
        let afterArbDistributionSupplyState =
          await owner.arbRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );

        expect(afterUtsDistributionSupplyState.index).to.gt(
          beforeUtsDistributionSupplyState.index
        );
        expect(afterUtsDistributionSupplyState.timestamp).to.gt(
          beforeUtsDistributionSupplyState.timestamp
        );
        expect(afterArbDistributionSupplyState.index).to.gt(
          beforeArbDistributionSupplyState.index
        );
        expect(afterArbDistributionSupplyState.timestamp).to.gt(
          beforeArbDistributionSupplyState.timestamp
        );

        utsSupplyIndexSpeedEligible = afterUtsDistributionSupplyState.index
          .sub(beforeUtsDistributionSupplyState.index)
          .div(
            afterUtsDistributionSupplyState.timestamp.sub(
              beforeUtsDistributionSupplyState.timestamp
            )
          );
        arbSupplyIndexSpeedEligible = afterArbDistributionSupplyState.index
          .sub(beforeArbDistributionSupplyState.index)
          .div(
            afterArbDistributionSupplyState.timestamp.sub(
              beforeArbDistributionSupplyState.timestamp
            )
          );
      });

      it("Update distributor supply state when users are ineligible", async () => {
        eligibilityManager.isEligible.returns([false, true]);
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsDistributionSupplyState =
          await owner.utsRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );
        let beforeArbDistributionSupplyState =
          await owner.arbRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );

        // Update distribute state
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          false
        );

        let afterUtsDistributionSupplyState =
          await owner.utsRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );
        let afterArbDistributionSupplyState =
          await owner.arbRewardDistributor.distributionSupplyState(
            lending.iTokens.iBTC.address
          );

        expect(afterUtsDistributionSupplyState.index).to.gt(
          beforeUtsDistributionSupplyState.index
        );
        expect(afterUtsDistributionSupplyState.timestamp).to.gt(
          beforeUtsDistributionSupplyState.timestamp
        );
        expect(afterArbDistributionSupplyState.index).to.gt(
          beforeArbDistributionSupplyState.index
        );
        expect(afterArbDistributionSupplyState.timestamp).to.gt(
          beforeArbDistributionSupplyState.timestamp
        );

        arbSupplyIndexSpeedIneligible = afterArbDistributionSupplyState.index
          .sub(beforeArbDistributionSupplyState.index)
          .div(
            afterArbDistributionSupplyState.timestamp.sub(
              beforeArbDistributionSupplyState.timestamp
            )
          );
        utsSupplyIndexSpeedIneligible = afterUtsDistributionSupplyState.index
          .sub(beforeUtsDistributionSupplyState.index)
          .div(
            afterUtsDistributionSupplyState.timestamp.sub(
              beforeUtsDistributionSupplyState.timestamp
            )
          );

        // eligibleTotalSupply decreased, index Speed should increase
        expect(arbSupplyIndexSpeedIneligible).to.gt(
          arbSupplyIndexSpeedEligible
        );
        expect(utsSupplyIndexSpeedIneligible).to.gt(
          utsSupplyIndexSpeedEligible
        );
      });

      it("Update distributor borrow state when all users are eligible", async () => {
        eligibilityManager.isEligible.returns([true, true]);
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsDistributionBorrowState =
          await owner.utsRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );
        let beforeArbDistributionBorrowState =
          await owner.arbRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );

        // Update distribute state
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          true
        );

        let afterUtsDistributionBorrowState =
          await owner.utsRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );
        let afterArbDistributionBorrowState =
          await owner.arbRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );

        expect(afterUtsDistributionBorrowState.index).to.gt(
          beforeUtsDistributionBorrowState.index
        );
        expect(afterUtsDistributionBorrowState.timestamp).to.gt(
          beforeUtsDistributionBorrowState.timestamp
        );
        expect(afterArbDistributionBorrowState.index).to.gt(
          beforeArbDistributionBorrowState.index
        );
        expect(afterArbDistributionBorrowState.timestamp).to.gt(
          beforeArbDistributionBorrowState.timestamp
        );

        utsBorrowIndexSpeedEligible = afterUtsDistributionBorrowState.index
          .sub(beforeUtsDistributionBorrowState.index)
          .div(
            afterUtsDistributionBorrowState.timestamp.sub(
              beforeUtsDistributionBorrowState.timestamp
            )
          );

        arbBorrowIndexSpeedEligible = afterArbDistributionBorrowState.index
          .sub(beforeArbDistributionBorrowState.index)
          .div(
            afterArbDistributionBorrowState.timestamp.sub(
              beforeArbDistributionBorrowState.timestamp
            )
          );
      });

      it("Update distributor borrow state when users are ineligible", async () => {
        eligibilityManager.isEligible.returns([false, true]);
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsDistributionBorrowState =
          await owner.utsRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );
        let beforeArbDistributionBorrowState =
          await owner.arbRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );

        // Update distribute state
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          true
        );

        let afterUtsDistributionBorrowState =
          await owner.utsRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );
        let afterArbDistributionBorrowState =
          await owner.arbRewardDistributor.distributionBorrowState(
            lending.iTokens.iBTC.address
          );

        expect(afterUtsDistributionBorrowState.index).to.gt(
          beforeUtsDistributionBorrowState.index
        );
        expect(afterUtsDistributionBorrowState.timestamp).to.gt(
          beforeUtsDistributionBorrowState.timestamp
        );
        expect(afterArbDistributionBorrowState.index).to.gt(
          beforeArbDistributionBorrowState.index
        );
        expect(afterArbDistributionBorrowState.timestamp).to.gt(
          beforeArbDistributionBorrowState.timestamp
        );

        utsBorrowIndexSpeedIneligible = afterUtsDistributionBorrowState.index
          .sub(beforeUtsDistributionBorrowState.index)
          .div(
            afterUtsDistributionBorrowState.timestamp.sub(
              beforeUtsDistributionBorrowState.timestamp
            )
          );

        arbBorrowIndexSpeedIneligible = afterArbDistributionBorrowState.index
          .sub(beforeArbDistributionBorrowState.index)
          .div(
            afterArbDistributionBorrowState.timestamp.sub(
              beforeArbDistributionBorrowState.timestamp
            )
          );

        expect(utsBorrowIndexSpeedIneligible).gt(utsBorrowIndexSpeedEligible);
        expect(arbBorrowIndexSpeedIneligible).gt(arbBorrowIndexSpeedEligible);
      });
    });

    describe("updateReward", async () => {
      after(async () => {
        eligibilityManager.isEligible.returns([true, true]);
      });

      it("shoule accrue reward for supply when eligible", async () => {
        eligibilityManager.isEligible.returns([true, true]);
        // Settle all pending reward in updateEligibleBalances
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let beforeArbReward = await arbRewardDistributor.reward(accounts[0]);

        // Update reward for supply
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          false
        );
        await rewardDistributorManager.updateReward(
          lending.iTokens.iBTC.address,
          accounts[0],
          false
        );

        let afterUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let afterArbReward = await arbRewardDistributor.reward(accounts[0]);

        expect(afterUtsReward).to.gt(beforeUtsReward);
        expect(afterArbReward).to.gt(beforeArbReward);
      });

      it("shoule accrue no reward for supply when ineligible", async () => {
        eligibilityManager.isEligible.returns([false, true]);
        // Settle all pending reward in updateEligibleBalances
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let beforeArbReward = await arbRewardDistributor.reward(accounts[0]);

        // Update reward for supply
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          false
        );
        await rewardDistributorManager.updateReward(
          lending.iTokens.iBTC.address,
          accounts[0],
          false
        );

        let afterUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let afterArbReward = await arbRewardDistributor.reward(accounts[0]);

        // Should have no reward
        expect(afterUtsReward).to.eq(beforeUtsReward);
        expect(afterArbReward).to.eq(beforeArbReward);
      });

      it("shoule accrue reward for borrow when eligible", async () => {
        eligibilityManager.isEligible.returns([true, true]);
        // Settle all pending reward in updateEligibleBalances
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let beforeArbReward = await arbRewardDistributor.reward(accounts[0]);

        // Update reward for borrow
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          true
        );
        await rewardDistributorManager.updateReward(
          lending.iTokens.iBTC.address,
          accounts[0],
          true
        );

        let afterUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let afterArbReward = await arbRewardDistributor.reward(accounts[0]);

        expect(afterUtsReward).to.gt(beforeUtsReward);
        expect(afterArbReward).to.gt(beforeArbReward);
      });

      it("shoule accrue no reward for borrow when ineligible", async () => {
        eligibilityManager.isEligible.returns([false, true]);
        // Settle all pending reward in updateEligibleBalances
        await rewardDistributorManager.updateEligibleBalances(accounts);

        let beforeUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let beforeArbReward = await arbRewardDistributor.reward(accounts[0]);

        // Update reward for borrow
        await rewardDistributorManager.updateDistributionState(
          lending.iTokens.iBTC.address,
          true
        );
        await rewardDistributorManager.updateReward(
          lending.iTokens.iBTC.address,
          accounts[0],
          true
        );

        let afterUtsReward = await utsRewardDistributor.reward(accounts[0]);
        let afterArbReward = await arbRewardDistributor.reward(accounts[0]);

        expect(afterUtsReward).to.eq(beforeUtsReward);
        expect(afterArbReward).to.eq(beforeArbReward);
      });
    });

    describe("claimReward()", async () => {
      it("Should be able to claim", async () => {
        let beforeUser0ARBBalance = await ARB.balanceOf(accounts[0]);
        let beforeUser0UTSBalance = await UTS.balanceOf(accounts[0]);

        // console.log(
        //   beforeUser0ARBBalance.toString(),
        //   beforeUser0UTSBalance.toString()
        // );

        await users[0].rewardDistributorManager.claimReward(
          [accounts[0]],
          [lending.iTokens.iBTC.address]
        );

        let afterUser0ARBBalance = await ARB.balanceOf(accounts[0]);
        let afterUser0UTSBalance = await UTS.balanceOf(accounts[0]);

        // console.log(
        //   afterUser0ARBBalance.toString(),
        //   afterUser0UTSBalance.toString()
        // );

        expect(afterUser0ARBBalance).to.gt(beforeUser0ARBBalance);
        expect(afterUser0UTSBalance).to.gt(beforeUser0UTSBalance);
      });

      it("Should revert when claimReward() from distributor", async () => {
        await expect(
          users[0].arbRewardDistributor.claimReward(
            [accounts[0]],
            [lending.iTokens.iBTC.address]
          )
        ).to.be.revertedWithCustomError(
          arbRewardDistributor,
          "RewardDistributor__CallerIsNotRewardManager"
        );

        await expect(
          users[0].utsRewardDistributor.claimReward(
            [accounts[0]],
            [lending.iTokens.iBTC.address]
          )
        ).to.be.revertedWithCustomError(
          utsRewardDistributor,
          "RewardDistributor__CallerIsNotRewardManager"
        );
      });
    });

    describe("claimRewards()", async () => {
      it("Should be able to claim", async () => {
        let beforeUser0ARBBalance = await ARB.balanceOf(accounts[0]);
        let beforeUser0UTSBalance = await UTS.balanceOf(accounts[0]);

        // console.log(
        //   beforeUser0ARBBalance.toString(),
        //   beforeUser0UTSBalance.toString()
        // );

        await users[0].rewardDistributorManager.claimRewards(
          [accounts[0]],
          [lending.iTokens.iBTC.address],
          [lending.iTokens.iBTC.address]
        );

        let afterUser0ARBBalance = await ARB.balanceOf(accounts[0]);
        let afterUser0UTSBalance = await UTS.balanceOf(accounts[0]);

        // console.log(
        //   afterUser0ARBBalance.toString(),
        //   afterUser0UTSBalance.toString()
        // );

        expect(afterUser0ARBBalance).to.gt(beforeUser0ARBBalance);
        expect(afterUser0UTSBalance).to.gt(beforeUser0UTSBalance);
      });

      it("Should revert when claimReward() from distributor", async () => {
        await expect(
          users[0].arbRewardDistributor.claimRewards(
            [accounts[0]],
            [lending.iTokens.iBTC.address],
            [lending.iTokens.iBTC.address]
          )
        ).to.be.revertedWithCustomError(
          arbRewardDistributor,
          "RewardDistributor__CallerIsNotRewardManager"
        );
        await expect(
          users[0].utsRewardDistributor.claimRewards(
            [accounts[0]],
            [lending.iTokens.iBTC.address],
            [lending.iTokens.iBTC.address]
          )
        ).to.be.revertedWithCustomError(
          utsRewardDistributor,
          "RewardDistributor__CallerIsNotRewardManager"
        );
      });
    });

    describe("claimAllReward()", async () => {
      it("Should be able to claim", async () => {
        let beforeUser0ARBBalance = await ARB.balanceOf(accounts[0]);
        let beforeUser0UTSBalance = await UTS.balanceOf(accounts[0]);

        // console.log(
        //   beforeUser0ARBBalance.toString(),
        //   beforeUser0UTSBalance.toString()
        // );

        await users[0].rewardDistributorManager.claimAllReward([accounts[0]]);

        let afterUser0ARBBalance = await ARB.balanceOf(accounts[0]);
        let afterUser0UTSBalance = await UTS.balanceOf(accounts[0]);

        // console.log(
        //   afterUser0ARBBalance.toString(),
        //   afterUser0UTSBalance.toString()
        // );

        expect(afterUser0ARBBalance).to.gt(beforeUser0ARBBalance);
        expect(afterUser0UTSBalance).to.gt(beforeUser0UTSBalance);
      });

      it("Should revert when claimReward() from distributor", async () => {
        await expect(
          users[0].arbRewardDistributor.claimAllReward([accounts[0]])
        ).to.be.revertedWithCustomError(
          arbRewardDistributor,
          "RewardDistributor__CallerIsNotRewardManager"
        );
        await expect(
          users[0].utsRewardDistributor.claimAllReward([accounts[0]])
        ).to.be.revertedWithCustomError(
          utsRewardDistributor,
          "RewardDistributor__CallerIsNotRewardManager"
        );
      });
    });
  });

  describe("Bounty", async () => {
    it("Should be able to set bounty ratio", async () => {
      const newBountyRatio = ethers.utils.parseEther("0.02");

      await owner.utsRewardDistributor._setBountyRatio(newBountyRatio);
      await owner.arbRewardDistributor._setBountyRatio(newBountyRatio);

      const utsBountyRatio = await utsRewardDistributor.bountyRatio();
      const arbBountyRatio = await arbRewardDistributor.bountyRatio();

      expect(utsBountyRatio).to.equal(newBountyRatio);
      expect(arbBountyRatio).to.equal(newBountyRatio);
    });

    it("Should revert if bounty ratio is set too high", async () => {
      const tooHighBountyRatio = ethers.utils.parseEther("0.100001"); //higher than the max 10%

      await expect(
        owner.utsRewardDistributor._setBountyRatio(tooHighBountyRatio)
      ).to.be.revertedWithCustomError(
        utsRewardDistributor,
        "RewardDistributor_setBountyRatio__RatioTooHigh"
      );

      await expect(
        owner.arbRewardDistributor._setBountyRatio(tooHighBountyRatio)
      ).to.be.revertedWithCustomError(
        arbRewardDistributor,
        "RewardDistributor_setBountyRatio__RatioTooHigh"
      );
    });

    it("Should able to bounty", async () => {
      const utsBountyRatio = await utsRewardDistributor.bountyRatio();
      const arbBountyRatio = await arbRewardDistributor.bountyRatio();

      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      eligibilityManager.isEligible.returns([false, true]);

      let beforeUser0ARBBalance = await ARB.balanceOf(accounts[0]);
      let beforeUser0UTSBalance = await UTS.balanceOf(accounts[0]);
      let beforeUser1ARBBalance = await ARB.balanceOf(accounts[1]);
      let beforeUser1UTSBalance = await UTS.balanceOf(accounts[1]);

      // console.log(
      //   beforeUser0ARBBalance.toString(),
      //   beforeUser0UTSBalance.toString(),
      //   beforeUser1ARBBalance.toString(),
      //   beforeUser1UTSBalance.toString()
      // );

      await users[1].rewardDistributorManager.claimBounty([accounts[0]]);

      let afterUser0ARBBalance = await ARB.balanceOf(accounts[0]);
      let afterUser0UTSBalance = await UTS.balanceOf(accounts[0]);
      let afterUser1ARBBalance = await ARB.balanceOf(accounts[1]);
      let afterUser1UTSBalance = await UTS.balanceOf(accounts[1]);

      // console.log(
      //   afterUser0ARBBalance.toString(),
      //   afterUser0UTSBalance.toString(),
      //   afterUser1ARBBalance.toString(),
      //   afterUser1UTSBalance.toString()
      // );

      expect(afterUser0ARBBalance).to.gt(beforeUser0ARBBalance);
      expect(afterUser0UTSBalance).to.gt(beforeUser0UTSBalance);
      expect(afterUser1ARBBalance).to.gt(beforeUser1ARBBalance);
      expect(afterUser1UTSBalance).to.gt(beforeUser1UTSBalance);

      const arbReward = afterUser0ARBBalance
        .sub(beforeUser0ARBBalance)
        .add(afterUser1ARBBalance)
        .sub(beforeUser1ARBBalance);

      const arbBounty = afterUser1ARBBalance.sub(beforeUser1ARBBalance);

      const utsReward = afterUser0UTSBalance
        .sub(beforeUser0UTSBalance)
        .add(afterUser1UTSBalance)
        .sub(beforeUser1UTSBalance);

      const utsBounty = afterUser1UTSBalance.sub(beforeUser1UTSBalance);

      // Check if bounty amounts match the bountyRatio
      expect(arbBounty).to.equal(
        arbReward.mul(arbBountyRatio).div(utils.parseEther("1"))
      );
      expect(utsBounty).to.equal(
        utsReward.mul(utsBountyRatio).div(utils.parseEther("1"))
      );
    });

    it("Should not to bounty when still eligible", async () => {
      eligibilityManager.isEligible.returns([true, true]);
      await rewardDistributorManager.updateEligibleBalances(accounts);

      let beforeUser0ARBBalance = await ARB.balanceOf(accounts[0]);
      let beforeUser0UTSBalance = await UTS.balanceOf(accounts[0]);
      let beforeUser1ARBBalance = await ARB.balanceOf(accounts[1]);
      let beforeUser1UTSBalance = await UTS.balanceOf(accounts[1]);

      // console.log(
      //   beforeUser0ARBBalance.toString(),
      //   beforeUser0UTSBalance.toString(),
      //   beforeUser1ARBBalance.toString(),
      //   beforeUser1UTSBalance.toString()
      // );

      await users[1].rewardDistributorManager.claimBounty([accounts[0]]);

      let afterUser0ARBBalance = await ARB.balanceOf(accounts[0]);
      let afterUser0UTSBalance = await UTS.balanceOf(accounts[0]);
      let afterUser1ARBBalance = await ARB.balanceOf(accounts[1]);
      let afterUser1UTSBalance = await UTS.balanceOf(accounts[1]);

      // console.log(
      //   afterUser0ARBBalance.toString(),
      //   afterUser0UTSBalance.toString(),
      //   afterUser1ARBBalance.toString(),
      //   afterUser1UTSBalance.toString()
      // );

      expect(afterUser0ARBBalance).to.eq(beforeUser0ARBBalance);
      expect(afterUser0UTSBalance).to.eq(beforeUser0UTSBalance);
      expect(afterUser1ARBBalance).to.eq(beforeUser1ARBBalance);
      expect(afterUser1UTSBalance).to.eq(beforeUser1UTSBalance);
    });
  });

  describe("Initialize", async () => {
    it("Should revert when initialize twice", async () => {
      await expect(
        rewardDistributorManager.initialize(controller.address)
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Set Eligibility Manager", async () => {
    it("Should set a new eligibility manager", async () => {
      const oldEligibilityManager =
        await rewardDistributorManager.eligibilityManager();

      const mockEligibilityManager = await smock.fake<IEligibilityManager>(
        "IEligibilityManager"
      );
      mockEligibilityManager.isEligibilityManager.returns(true);

      await expect(
        rewardDistributorManager._setEligibilityManager(
          mockEligibilityManager.address
        )
      )
        .to.emit(rewardDistributorManager, "NewEligibilityManager")
        .withArgs(oldEligibilityManager, mockEligibilityManager.address);

      let eligibilityManagerAddress =
        await rewardDistributorManager.eligibilityManager();

      expect(eligibilityManagerAddress).to.eq(mockEligibilityManager.address);

      // Revert to old eligibility manager
      await rewardDistributorManager._setEligibilityManager(
        oldEligibilityManager
      );
    });

    it("Should revert when set a new eligibility manager", async () => {
      // Revert due to not a eligibility manager
      const mockEligibilityManager = await smock.fake<IEligibilityManager>(
        "IEligibilityManager"
      );
      mockEligibilityManager.isEligibilityManager.returns(false);

      await expect(
        rewardDistributorManager._setEligibilityManager(
          mockEligibilityManager.address
        )
      ).to.be.revertedWithCustomError(
        rewardDistributorManager,
        "RewardDistributorManager_setEligibilityManager_InvalidEligibilityManager"
      );

      // Revert when set the same eligibility manager
      let currentEligibilityManager =
        await rewardDistributorManager.eligibilityManager();
      await expect(
        rewardDistributorManager._setEligibilityManager(
          currentEligibilityManager
        )
      ).to.be.revertedWithCustomError(
        rewardDistributorManager,
        "RewardDistributorManager_setEligibilityManager_InvalidEligibilityManager"
      );
    });

    it("Should revert when a user set a new eligibility manager", async () => {
      const mockEligibilityManager = await smock.fake<IEligibilityManager>(
        "IEligibilityManager"
      );
      mockEligibilityManager.isEligibilityManager.returns(true);

      let owner = await rewardDistributorManager.owner();
      // User0 is not the owner
      expect(users[0].address).to.not.eq(owner);

      await expect(
        users[0].rewardDistributorManager._setEligibilityManager(
          mockEligibilityManager.address
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Add One Reward Distributor", async () => {
    it("Should add a new reward distributor", async () => {
      const factory = await ethers.getContractFactory("RewardDistributor");
      let newRewardDistributor = await factory.deploy(
        controller.address,
        rewardDistributorManager.address
      );
      await newRewardDistributor.deployed();

      let beforeRewardDistributorsLength =
        await rewardDistributorManager.getRewardDistributorsLength();

      await expect(
        rewardDistributorManager._addRewardDistributor(
          newRewardDistributor.address
        )
      )
        .to.emit(rewardDistributorManager, "AddRewardDistributor")
        .withArgs(newRewardDistributor.address);

      let afterRewardDistributorsLength =
        await rewardDistributorManager.getRewardDistributorsLength();
      expect(afterRewardDistributorsLength).to.eq(
        beforeRewardDistributorsLength.add(1)
      );

      // Revert to old reward distributor
      await rewardDistributorManager._removeRewardDistributor(
        newRewardDistributor.address
      );
    });
    it("Should revert when add an invalid reward distributor", async () => {
      await expect(
        rewardDistributorManager._addRewardDistributor(controller.address)
      ).to.be.reverted;
    });
    it("Should revert when add the same reward distributor", async () => {
      let currentRewardDistributors =
        await rewardDistributorManager.getRewardDistributors();
      // Has at least 1 reward distributor
      expect(currentRewardDistributors.length).to.gt(0);

      await expect(
        rewardDistributorManager._addRewardDistributor(
          currentRewardDistributors[0]
        )
      ).to.be.revertedWithCustomError(
        rewardDistributorManager,
        "RewardDistributorManager_addRewardDistributorInternal__RewardDistributorAlreadyExist"
      );
    });
    it("Should revert when a user add a new reward distributor", async () => {
      const factory = await ethers.getContractFactory("RewardDistributor");
      let newRewardDistributor = await factory.deploy(
        controller.address,
        rewardDistributorManager.address
      );
      await newRewardDistributor.deployed();

      let owner = await rewardDistributorManager.owner();
      // User0 is not the owner
      expect(users[0].address).to.not.eq(owner);

      await expect(
        users[0].rewardDistributorManager._addRewardDistributor(
          newRewardDistributor.address
        )
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });

  describe("Add Multiple Reward Distributors", async () => {
    it("Should add multiple reward distributors", async () => {
      const factory = await ethers.getContractFactory("RewardDistributor");
      let newRewardDistributor1 = await factory.deploy(
        controller.address,
        rewardDistributorManager.address
      );
      await newRewardDistributor1.deployed();

      let newRewardDistributor2 = await factory.deploy(
        controller.address,
        rewardDistributorManager.address
      );
      await newRewardDistributor2.deployed();

      let beforeRewardDistributorsLength =
        await rewardDistributorManager.getRewardDistributorsLength();

      await expect(
        rewardDistributorManager._addRewardDistributors([
          newRewardDistributor1.address,
          newRewardDistributor2.address,
        ])
      )
        .to.emit(rewardDistributorManager, "AddRewardDistributor")
        .withArgs(newRewardDistributor1.address)
        .withArgs(newRewardDistributor2.address);

      let afterRewardDistributorsLength =
        await rewardDistributorManager.getRewardDistributorsLength();
      expect(afterRewardDistributorsLength).to.eq(
        beforeRewardDistributorsLength.add(2)
      );

      // Revert to old reward distributor
      await rewardDistributorManager._removeRewardDistributors([
        newRewardDistributor1.address,
        newRewardDistributor2.address,
      ]);
    });
    it("Should revert when user add multiple reward distributors", async () => {
      const factory = await ethers.getContractFactory("RewardDistributor");
      let newRewardDistributor1 = await factory.deploy(
        controller.address,
        rewardDistributorManager.address
      );
      await newRewardDistributor1.deployed();

      let newRewardDistributor2 = await factory.deploy(
        controller.address,
        rewardDistributorManager.address
      );
      await newRewardDistributor2.deployed();

      let owner = await rewardDistributorManager.owner();
      // User0 is not the owner
      expect(users[0].address).to.not.eq(owner);

      await expect(
        users[0].rewardDistributorManager._addRewardDistributors([
          newRewardDistributor1.address,
          newRewardDistributor2.address,
        ])
      ).to.be.revertedWith("onlyOwner: caller is not the owner");
    });
  });
});
