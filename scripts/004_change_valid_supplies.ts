import * as hre from "hardhat";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {execute} from "../utils/utils";
import {BigNumber} from "ethers";
import {validSupplies} from "../config";

async function main() {
  const {deployments, getNamedAccounts, ethers} = hre;
  const {read, log} = deployments;
  const {owner, deployer} = await getNamedAccounts();

  let newValidSupplyTokens;
  if (validSupplies.alliTokens) {
    newValidSupplyTokens = await deployments.read(
      "controller",
      "getAlliTokens"
    );
  } else {
    newValidSupplyTokens = await Promise.all(
      validSupplies.symbols.map(async (symbol) => {
        const iToken = await deployments.get(symbol);
        return iToken.address;
    })
  );
  }

  console.log("NEW Valid supply addresses:", newValidSupplyTokens);

  const currentValidSupplies = await read(
    "eligibilityManager",
    "getValidSupplies"
  );

  const toAdd: string[] = [];
  const toRemove: string[] = [];

  for (const newValidSupply of newValidSupplyTokens) {
    if (!currentValidSupplies.includes(newValidSupply)) {
      toAdd.push(newValidSupply);
    }
  }

  for (const currentValidSupply of currentValidSupplies) {
    if (!newValidSupplyTokens.includes(currentValidSupply)) {
      toRemove.push(currentValidSupply);
    }
  }

  console.log("Tokens to add:", toAdd);
  console.log("Tokens to remove:", toRemove);

  if (toRemove.length > 0) {
    await execute(
      hre,
      "eligibilityManager",
      deployer,
      "_removeValidSupplies",
      toRemove
    );
  }

  if (toAdd.length > 0) {
    await execute(
      hre,
      "eligibilityManager",
      deployer,
      "_addValidSupplies",
      toAdd
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
