import {
  EligibilityManager,
  RewardDistributor,
  IController,
  IiToken,
  IEligibilityManager,
  BLPStakingPool,
  RewardDistributorManager,
  ERC20,
} from "../../typechain-types";

export async function printDistributionReward(
  rewardDistributor: RewardDistributor,
  iTokens: IiToken[],
  accounts: string[]
) {
  const names = await Promise.all(
    iTokens.map((iToken: IiToken) => iToken.name())
  );

  const supplySpeeds = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributor.distributionSupplySpeed(iToken.address)
    )
  );

  const borrowSpeeds = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributor.distributionSpeed(iToken.address)
    )
  );

  const supplyStates = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributor.distributionSupplyState(iToken.address)
    )
  );

  const borrowStates = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributor.distributionBorrowState(iToken.address)
    )
  );

  const rewards = await Promise.all(
    accounts.map((account: string) => rewardDistributor.reward(account))
  );

  let distributionSupplierIndex: {[iToken: string]: any} = {};
  let distributionBorrowerIndex: {[iToken: string]: any} = {};
  for (const iToken of iTokens) {
    distributionSupplierIndex[iToken.address] = await Promise.all(
      accounts.map((account: string) =>
        rewardDistributor.distributionSupplierIndex(iToken.address, account)
      )
    );

    distributionBorrowerIndex[iToken.address] = await Promise.all(
      accounts.map((account: string) =>
        rewardDistributor.distributionBorrowerIndex(iToken.address, account)
      )
    );
  }

  iTokens.forEach((iToken: IiToken, i: number) => {
    console.log(
      names[i].padStart(6),
      "\tSupply Speed: ",
      supplySpeeds[i].toString().padStart(20),
      "\tSupply State: ",
      supplyStates[i].index.toString().padStart(20),
      supplyStates[i].timestamp.toString().padStart(10)
    );

    console.log(
      names[i].padStart(6),
      "\tBorrow Speed: ",
      borrowSpeeds[i].toString().padStart(20),
      "\tBorrow State: ",
      borrowStates[i].index.toString().padStart(20),
      borrowStates[i].timestamp.toString().padStart(10)
    );

    accounts.forEach((account: string, j: number) => {
      console.log(
        account.padStart(6),
        "\tDistribution Supplier Index: ",
        distributionSupplierIndex[iToken.address][j].toString().padStart(20),
        "\tDistribution Borrower Index: ",
        distributionBorrowerIndex[iToken.address][j].toString().padStart(20)
      );
    });
  });

  accounts.forEach((accout: string, i: number) =>
    console.log(accout, "\tReward:", rewards[i].toString().padStart(27))
  );
}

export async function printEligibleBalances(
  rewardDistributorManager: RewardDistributorManager,
  iTokens: IiToken[],
  accounts: string[]
) {
  const names = await Promise.all(
    iTokens.map((iToken: IiToken) => iToken.name())
  );

  const isEligible = await Promise.all(
    accounts.map((account: string) =>
      rewardDistributorManager.isEligible(account)
    )
  );

  const eligibleTotalSupply = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributorManager.eligibleTotalSupply(iToken.address)
    )
  );

  const eligibleTotalBorrow = await Promise.all(
    iTokens.map((iToken: IiToken) =>
      rewardDistributorManager.eligibleTotalBorrow(iToken.address)
    )
  );

  let eligibleSupply: {[iToken: string]: any} = {};
  let eligibleBorrow: {[iToken: string]: any} = {};
  for (const iToken of iTokens) {
    eligibleSupply[iToken.address] = await Promise.all(
      accounts.map((account: string) =>
        rewardDistributorManager.eligibleSupply(iToken.address, account)
      )
    );

    eligibleBorrow[iToken.address] = await Promise.all(
      accounts.map((account: string) =>
        rewardDistributorManager.eligibleBorrow(iToken.address, account)
      )
    );
  }

  iTokens.forEach((iToken: IiToken, i: number) => {
    console.log(
      names[i].padStart(6),
      "\n\tEligible Total Supply: ",
      eligibleTotalSupply[i].toString().padStart(20),
      "\tEligible Total Borrow: ",
      eligibleTotalBorrow[i].toString().padStart(20)
    );

    accounts.forEach((account: string, j: number) => {
      console.log(
        account.padStart(6),
        "\tIs Eligible: ",
        isEligible[j],
        "\tEligible Supply: ",
        eligibleSupply[iToken.address][j].toString().padStart(20),
        "\tEligible Borrow: ",
        eligibleBorrow[iToken.address][j].toString().padStart(20)
      );
    });
  });
}
