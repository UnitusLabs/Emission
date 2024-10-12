import {HardhatRuntimeEnvironment} from "hardhat/types";
import {DeployFunction} from "hardhat-deploy/types";
import {deploy} from "../utils/utils";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";

const deployFunction: DeployFunction = async function (
  hre: HardhatRuntimeEnvironment
) {
  await deploy(hre, "proxyAdmin", "ProxyAdmin2Step");
  if (getNetworkName(hre.network) === "hardhat") {
    // Only for test
    // Deploy underlying tokens
    const mockWBTC = await deploy(hre, "mockWBTC", "MockERC20Token", [
      "Mock WBTC",
      "mwBTC",
    ]);
    const mockUSX = await deploy(hre, "mockUSX", "MockERC20Token", [
      "Mock USX",
      "mUSDX",
    ]);
    // Deploy reward tokens
    await deploy(hre, "UTS", "MockERC20Token", ["Mock Unitus Token", "UTS"]);
    await deploy(hre, "ARB", "MockERC20Token", ["Mock Arbitrum Token", "ARB"]);
    const oracle = await deploy(hre, "oracle", "MockOracle");
    // Will update reward distributor manager later.
    const controller = await deploy(hre, "controller", "MockController", [
      oracle.address,
      oracle.address,
    ]);
    // Deploy iTokens
    await deploy(hre, "iWBTC", "MockiToken", [
      "Mock iWBTC",
      "iWBTC",
      mockWBTC.address,
      controller.address,
    ]);
    await deploy(hre, "iUSX", "MockiToken", [
      "Mock iUSX",
      "iUSX",
      mockUSX.address,
      controller.address,
    ]);
  }
};

deployFunction.dependencies = [];
deployFunction.tags = ["all", "ProxyAdmin2Step"];
export default deployFunction;
