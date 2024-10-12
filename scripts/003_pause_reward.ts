import * as hre from "hardhat";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {execute} from "../utils/utils";
import {BigNumber} from "ethers";

async function main() {
  const {deployments, getNamedAccounts, ethers} = hre;
  const {read, log} = deployments;
  const {owner, deployer} = await getNamedAccounts();

  // pause  UTS rewards
  // await execute(hre, "utsRewardDistributor", deployer, "_pause");

  // pause  ARB rewards
  await execute(hre, "arbRewardDistributor", deployer, "_pause");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
