import chai, {expect} from "chai";
import hre, {
  ethers,
  deployments,
  getNamedAccounts,
  getUnnamedAccounts,
} from "hardhat";
import {
  RewardDistributor,
  IController,
  IiToken,
  IEligibilityManager,
  RewardDistributorManager,
} from "../typechain-types";
import {
  setupUsers,
  setupMockLending,
  setupMockEligibilityManager,
} from "./utils";
import {
  FakeContract,
  smock,
  MockContract,
  MockContractFactory,
} from "@defi-wonderland/smock";
import {Contract, Signer, utils} from "ethers";
import {deploy, getContract} from "../utils/utils";
import {setupMockRewardDistributorManager} from "./utils";
import {printDistributionReward} from "./utils/log";

chai.use(smock.matchers);

describe.skip("RewardDistributor", async function () {
  let lending: any;
  let eligibilityManager: any;
  let rewardDistributor: RewardDistributor;
  let rewardDistributorManager: RewardDistributorManager;
  let owner: any;
  let users: any[];
  let iTokens: string[];
  let accounts: string[];

  before(async () => {
    ({
      eligibilityManager,
      rewardDistributorManager,
      utsRewardDistributor: rewardDistributor,
      deployer: owner,
      users,
      lending,
    } = await setupMockRewardDistributorManager());

    iTokens = await lending.controller.getAlliTokens();
    accounts = (await getUnnamedAccounts()).splice(0, 2);
  });

  describe("MockLending", async () => {
    it("Controller::getAlliTokens should return all iTokens", async () => {
      const iTokens = await lending.controller.getAlliTokens();

      // console.log(iTokens);

      expect(iTokens).deep.eq(
        Object.values(lending.iTokens).map((v: any) => v.address)
      );
    });

    it("Controller::hasiToken should return correct value", async () => {
      expect(
        await lending.controller.hasiToken(lending.iTokens.iBTC.address)
      ).eq(true);

      expect(await lending.controller.hasiToken(lending.controller.address)).eq(
        false
      );
    });
  });

  describe("RewardDistributor", async () => {
    it("unpause", async () => {
      await rewardDistributor._unpause(
        [lending.iTokens.iETH.address],
        [utils.parseEther("100")],
        [lending.iTokens.iETH.address],
        [utils.parseEther("100")]
      );

      await printDistributionReward(
        rewardDistributor,
        [lending.iTokens.iETH],
        accounts
      );
    });

    it("updateDistributionState stays Ineligible", async () => {
      eligibilityManager.refresh.returns([false, false]);

      await rewardDistributorManager.updateEligibleBalances(accounts);

      await printDistributionReward(
        rewardDistributor,
        [lending.iTokens.iETH],
        accounts
      );
    });

    it("updateDistributionState Ineligible => Eligible", async () => {
      lending.iTokens.iETH.balanceOf.returns(utils.parseEther("100"));
      lending.iTokens.iETH.borrowBalanceStored.returns(utils.parseEther("100"));
      eligibilityManager.refresh.returns([false, true]);

      await rewardDistributorManager.updateEligibleBalances(accounts);

      await printDistributionReward(
        rewardDistributor,
        [lending.iTokens.iETH],
        accounts
      );
    });

    it("updateDistributionState Eligible => Ineligible", async () => {
      eligibilityManager.refresh.returns([true, false]);

      await rewardDistributorManager.updateEligibleBalances(accounts);

      await printDistributionReward(
        rewardDistributor,
        [lending.iTokens.iETH],
        accounts
      );
    });

    it("updateDistributionState stays Ineligible", async () => {
      eligibilityManager.refresh.returns([false, false]);

      await rewardDistributorManager.updateEligibleBalances(accounts);

      await printDistributionReward(
        rewardDistributor,
        [lending.iTokens.iETH],
        accounts
      );
    });

    it("updateDistributionState Ineligible=> Eligible", async () => {
      eligibilityManager.refresh.returns([false, true]);

      await rewardDistributorManager.updateEligibleBalances(accounts);

      await printDistributionReward(
        rewardDistributor,
        [lending.iTokens.iETH],
        accounts
      );
    });
  });
});
