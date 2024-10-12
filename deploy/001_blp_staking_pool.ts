import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {deploy, execute} from "../utils/utils";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {blpReward} from "../config";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const {deployments, getNamedAccounts} = hre;
  const {deployer, treasury} = await getNamedAccounts();

  let df_uts_lp, uts_usx_lp;

  if (getNetworkName(hre.network) === "hardhat") {
    df_uts_lp = await deploy(hre, "DF_UTS_LP", "MockERC20Token", [
      "DF UTS LP",
      "DF_UTS_LP",
    ]);
    uts_usx_lp = await deploy(hre, "UTS_USX_LP", "MockERC20Token", [
      "UTS USX LP",
      "UTS_USX_LP",
    ]);
  }

  for (const [lpName, reward] of Object.entries(blpReward)) {
    // eg: DF_UTS => DF_UTS_LP => DF_UTS_StakingPool
    const lpToken = await deployments.get(lpName + "_LP");
    const stakingPoolName = lpName + "_StakingPool";

    const stakingPool = await deploy(
      hre,
      stakingPoolName,
      "BLPStakingPool",
      [lpToken.address],
      true,
      "initialize",
      [lpToken.address]
    );

    for (const rewardTokenName of Object.keys(reward)) {
      // eg:DF_UTS_UTS_BLPRewardDistributor
      const rewardToken = await deployments.get(rewardTokenName);
      const distributorName =
        lpName + "_" + rewardTokenName + "_BLPRewardDistributor";

      const distributor = await deploy(
        hre,
        distributorName,
        "BLPReward",
        [stakingPool.address, rewardToken.address, treasury],
        true,
        "initialize",
        [stakingPool.address, rewardToken.address, treasury]
      );

      await execute(
        hre,
        stakingPoolName,
        deployer,
        "_addRewardDistributor",
        distributor.address
      );
    }
  }
};

deployFunction.dependencies = ["ProxyAdmin2Step"];
deployFunction.tags = ["all", "StakingPool"];
export default deployFunction;
