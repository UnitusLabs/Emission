import * as hre from "hardhat";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {execute} from "../utils/utils";

async function main() {
  const {deployments, getNamedAccounts, ethers} = hre;
  const {read, log} = deployments;
  const {owner, deployer} = await getNamedAccounts();

  //ARB for dfUtsBLPRewardDistributor
  const dfUtsRate = ethers.utils.parseEther("0.0005");
  //UTS for utsUsxBLPRewardDistributor
  const usxUtsRate = ethers.utils.parseEther("0.01");

  // Unpause and set speeds for UTS rewards
  await execute(
    hre,
    "dfUtsBLPRewardDistributor",
    deployer,
    "setRewardRate",
    dfUtsRate
  );

  // Unpause and set speeds for ARB rewards
  await execute(
    hre,
    "utsUsxBLPRewardDistributor",
    deployer,
    "setRewardRate",
    usxUtsRate
  );

  const dfUtsBLPRewardDistributor = await deployments.get(
    "dfUtsBLPRewardDistributor"
  );
  const utsUsxBLPRewardDistributor = await deployments.get(
    "utsUsxBLPRewardDistributor"
  );

  await execute(
    hre,
    "ARB",
    deployer,
    "approve",
    dfUtsBLPRewardDistributor.address,
    ethers.constants.MaxUint256
  );

  await execute(
    hre,
    "UTS",
    deployer,
    "approve",
    utsUsxBLPRewardDistributor.address,
    ethers.constants.MaxUint256
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
