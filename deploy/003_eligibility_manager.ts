import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {deploy, execute} from "../utils/utils";
import {blpReward, validSupplies} from "../config";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  const {ethers, deployments, getNamedAccounts} = hre;
  const {deployer} = await getNamedAccounts();

  const controller = await deployments.get("controller");

  const ratio = ethers.utils.parseEther("0.01");
  const initArgs = [controller.address, ratio];

  await deploy(
    hre,
    "eligibilityManager",
    "EligibilityManager",
    initArgs,
    true,
    "initialize",
    initArgs
  );

  const stakingPools = await Promise.all(
    Object.keys(blpReward).map(
      async (lpName) => (await deployments.get(lpName + "_StakingPool")).address
    )
  );

  await execute(
    hre,
    "eligibilityManager",
    deployer,
    "_addBLPStakingPools",
    stakingPools
  );

  let validSupplieTokens;
  if (validSupplies.alliTokens) {
    validSupplieTokens = await deployments.read("controller", "getAlliTokens");
  } else {
    validSupplieTokens = await Promise.all(
      validSupplies.symbols.map(async (symbol) => {
        const iToken = await deployments.get(symbol);
        return iToken.address;
      })
    );
  }

  await execute(
    hre,
    "eligibilityManager",
    deployer,
    "_addValidSupplies",
    validSupplieTokens
  );
};

deployFunction.dependencies = ["ProxyAdmin2Step"];
deployFunction.tags = ["all", "EligibilityManager"];
export default deployFunction;
