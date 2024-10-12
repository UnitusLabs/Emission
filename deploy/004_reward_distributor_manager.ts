import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {deploy, execute} from "../utils/utils";
import {blpReward} from "../config";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const {deployments, getNamedAccounts} = hre;
  const {deployer, owner} = await getNamedAccounts();

  const controller = await deployments.get("controller");
  const eligibilityManager = await deployments.get("eligibilityManager");
  const initArgs = [controller.address];

  const manager = await deploy(
    hre,
    "rewardDistributorManager",
    "RewardDistributorManager",
    initArgs,
    true,
    "initialize",
    initArgs
  );

  for (const [lpName, reward] of Object.entries(blpReward)) {
    const stakingPoolName = lpName + "_StakingPool";

    await execute(
      hre,
      stakingPoolName,
      deployer,
      "_setRewardDistributorManager",
      manager.address
    );
  }

  // Must set along with the controller
  // Set eligible manager
  await execute(
    hre,
    "rewardDistributorManager",
    deployer,
    "_setEligibilityManager",
    eligibilityManager.address
  );

  // Set reward distributor
  // await execute(
  //   hre,
  //   "controller",
  //   "owner",
  //   "_setRewardDistributor",
  //   manager.address
  // );
};

deployFunction.dependencies = ["ProxyAdmin2Step"];
deployFunction.tags = ["all", "RewardDistributorManager"];
export default deployFunction;
