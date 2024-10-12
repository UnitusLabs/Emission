import * as hre from "hardhat";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {timelockExectuteTransactions} from "../utils/operations";

async function main() {
  const {deployments, getNamedAccounts, ethers} = hre;
  const {read, log} = deployments;
  const {owner} = await getNamedAccounts();

  const proxyAdmin = (await hre.deployments.get("proxyAdmin")).address;
  const toUpgrade: {[instance: string]: string} = {
    rewardDistributorManager: "RewardDistributorManager_Impl",
    utsRewardDistributor: "RewardDistributor_Impl",
    arbRewardDistributor: "RewardDistributor_Impl",
  };

  let txs = [];

  for (const instance in toUpgrade) {
    const impl = toUpgrade[instance];
    const instanceAddress = (await hre.deployments.get(instance)).address;
    const implAddress = (await hre.deployments.get(impl)).address;

    txs.push({
      target: proxyAdmin,
      value: 0,
      signature: "upgrade(address,address)",
      args: [instanceAddress, implAddress],
    });
  }

  // Such direct call to timelock does not update the deployments files
  // May need manually merge the ABI for new implelementations
  await timelockExectuteTransactions(hre, owner, txs);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
