import * as hre from "hardhat";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import {execute} from "../utils/utils";
import {BigNumber} from "ethers";
import {lendingReward} from "../config";

async function main() {
  const {deployments, getNamedAccounts, ethers} = hre;
  const {read, log} = deployments;
  const {owner, deployer} = await getNamedAccounts();

  const SECS_PER_DAY = ethers.BigNumber.from(24 * 3600);

  const calcSpeedPerSec = (dailyAmount: BigNumber): BigNumber => {
    return dailyAmount.add(SECS_PER_DAY.sub(1)).div(SECS_PER_DAY);
  };

  const alliTokenAddresses = await read("controller", "getAlliTokens");

  // Generate parameters for rewards unpause
  for (const [rewardToken, rewardDaily] of Object.entries(lendingReward)) {
    const distributorName = rewardToken.toLowerCase() + "RewardDistributor";

    const rewards = alliTokenAddresses.reduce((acc, market) => {
      acc[market] = {
        supply: ethers.constants.Zero,
        borrow: ethers.constants.Zero,
      };
      return acc;
    }, {} as {[market: string]: {supply: BigNumber; borrow: BigNumber}});

    for (const [market, reward] of Object.entries(rewardDaily)) {
      const marketAddress: string = (await deployments.get(market)).address;

      if (rewards[marketAddress]) {
        rewards[marketAddress].supply = reward.supply;
        rewards[marketAddress].borrow = reward.borrow;
      }
    }

    // console.log(rewards);

    const unpauseParams = await alliTokenAddresses.reduce(
      async (
        accPromise: Promise<{
          supplymarkets: string[];
          supplySpeeds: BigNumber[];
          borrowmarkets: string[];
          borrowSpeeds: BigNumber[];
        }>,
        market: string
      ) => {
        const acc = await accPromise;

        const currentSupplySpeed = await read(
          distributorName,
          "distributionSupplySpeed",
          market
        );
        const targetSupplySpeed = calcSpeedPerSec(rewards[market].supply);
        if (!currentSupplySpeed.eq(targetSupplySpeed)) {
          acc.supplymarkets.push(market);
          acc.supplySpeeds.push(targetSupplySpeed);
        }

        const currentBorrowSpeed = await read(
          distributorName,
          "distributionSpeed",
          market
        );
        const targetBorrowSpeed = calcSpeedPerSec(rewards[market].borrow);
        if (!currentBorrowSpeed.eq(targetBorrowSpeed)) {
          acc.borrowmarkets.push(market);
          acc.borrowSpeeds.push(targetBorrowSpeed);
        }

        return acc;
      },
      Promise.resolve({
        supplymarkets: [] as string[],
        supplySpeeds: [] as BigNumber[],
        borrowmarkets: [] as string[],
        borrowSpeeds: [] as BigNumber[],
      })
    );

    if (
      unpauseParams.supplymarkets.length > 0 ||
      unpauseParams.borrowmarkets.length > 0
    ) {
      const isPaused = await read(distributorName, "paused");
      const method = isPaused ? "_unpause" : "_setDistributionSpeeds";

      // Unpause and set speeds for reward
      await execute(
        hre,
        distributorName,
        deployer,
        method,
        unpauseParams.borrowmarkets,
        unpauseParams.borrowSpeeds,
        unpauseParams.supplymarkets,
        unpauseParams.supplySpeeds
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
