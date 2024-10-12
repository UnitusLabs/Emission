import {HardhatRuntimeEnvironment} from "hardhat/types";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {Deployment} from "hardhat-deploy/types";
import {ethers} from "hardhat";

export async function timelockExectuteTransactions(
  hre: HardhatRuntimeEnvironment,
  from: string,
  txs: {target: string; value: number; signature: string; args: any[]}[]
) {
  const {deployments, ethers} = hre;
  const {execute, log} = deployments;

  // extract the type from the signature
  function extractTypes(input: string): string[] {
    // Regular expression to match content within parentheses
    const regex = /\(([^)]+)\)/;
    const match = input.match(regex);

    // If match is found, split the content by comma
    if (match) {
      return match[1].split(",");
    } else {
      return []; // Return an empty array if no match is found
    }
  }

  const targets = txs.map((tx) => tx.target);
  const values = txs.map((tx) => tx.value);
  const signatures = txs.map((tx) => tx.signature);
  const calldatas = txs.map((tx) =>
    ethers.utils.defaultAbiCoder.encode(extractTypes(tx.signature), tx.args)
  );

  await execute(
    "timelock",
    {from: from, log: true},
    "executeTransactions",
    targets,
    values,
    signatures,
    calldatas
  );
}

export async function transferOwnershipToTimelock(
  hre: HardhatRuntimeEnvironment,
  from: string,
  timelockOwner: string,
  excludes: string[]
) {
  const {deployments} = hre;
  const {execute, read, log} = deployments;

  const all = await deployments.all();
  const timelock = await deployments.get("timelock");

  let txs = [];

  for (const contract in all) {
    // log(contract);

    try {
      // Ignore _Impl/_Proxy and excludes
      if (
        contract.includes("_Impl") ||
        contract.includes("_Proxy") ||
        excludes.includes(contract)
      )
        continue;

      const owner = await read(contract, "owner");
      if (owner === timelock.address) {
        continue;
      }

      await execute(
        contract,
        {from: from, log: true},
        "_setPendingOwner",
        timelock.address
      );

      txs.push({
        target: all[contract].address,
        value: 0,
        signature: "_acceptOwner()",
        args: [],
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("no method named")) {
        log("Skipping", contract, ", Error:", e.message);
        continue;
      }
    }
  }

  await timelockExectuteTransactions(hre, timelockOwner, txs);
}
// Only for testnet
export async function transferOwnershipFromTimelock(
  hre: HardhatRuntimeEnvironment,
  newOwner: string,
  timelockOwner: string,
  excludes: string[]
) {
  const {deployments} = hre;
  const {execute, read, log} = deployments;

  const all = await deployments.all();
  const timelock = await deployments.get("timelock");

  let txs = [];
  let toAccept = [];

  for (const contract in all) {
    // log(contract);

    // Ignore _Impl/_Proxy and excludes
    if (
      contract.includes("_Impl") ||
      contract.includes("_Proxy") ||
      excludes.includes(contract)
    )
      continue;

    try {
      if ((await read(contract, "owner")) === timelock.address) {
        txs.push({
          target: all[contract].address,
          value: 0,
          signature: "_setPendingOwner(address)",
          args: [newOwner],
        });

        toAccept.push(contract);
      }
    } catch (e) {
      log(e);
    }
  }

  await timelockExectuteTransactions(hre, timelockOwner, txs);

  for (const contract of toAccept) {
    await execute(contract, {from: newOwner, log: true}, "_acceptOwner()");
  }
}
