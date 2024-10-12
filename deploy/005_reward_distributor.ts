import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {deploy, execute} from "../utils/utils";
import {ethers} from "hardhat";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const {deployments, getNamedAccounts} = hre;
  const {deployer, treasury} = await getNamedAccounts();

  const controller = await deployments.get("controller");
  const rewardDistributorManager = await deployments.get(
    "rewardDistributorManager"
  );

  let uts = await deployments.get("UTS");
  let arb = await deployments.get("ARB");

  const initArgs = [controller.address, rewardDistributorManager.address];

  const bountyRatio = ethers.utils.parseEther("0.01");

  // Deploy reward distributor for uts
  const utsRewardDistributor = await deploy(
    hre,
    "utsRewardDistributor",
    "RewardDistributor",
    initArgs,
    true,
    "initialize",
    initArgs
  );

  // Set Reward token
  await execute(
    hre,
    "utsRewardDistributor",
    deployer,
    "_setRewardToken",
    uts.address
  );

  // Set treasury
  await execute(
    hre,
    "utsRewardDistributor",
    deployer,
    "_setTreasury",
    treasury
  );

  await execute(
    hre,
    "utsRewardDistributor",
    deployer,
    "_setBountyRatio",
    bountyRatio
  );

  // Deploy reward distributor for arb
  const arbRewardDistributor = await deploy(
    hre,
    "arbRewardDistributor",
    "RewardDistributor",
    initArgs,
    true,
    "initialize",
    initArgs
  );

  // Set Reward token
  await execute(
    hre,
    "arbRewardDistributor",
    deployer,
    "_setRewardToken",
    arb.address
  );

  // Set treasury
  await execute(
    hre,
    "arbRewardDistributor",
    deployer,
    "_setTreasury",
    treasury
  );

  await execute(
    hre,
    "arbRewardDistributor",
    deployer,
    "_setBountyRatio",
    bountyRatio
  );

  // Add reward distributors in reward distributor manager
  await execute(
    hre,
    "rewardDistributorManager",
    deployer,
    "_addRewardDistributors",
    [utsRewardDistributor.address, arbRewardDistributor.address]
  );
};

deployFunction.dependencies = ["RewardDistributorManager"];
deployFunction.tags = ["all", "RewardDistributor"];
export default deployFunction;
