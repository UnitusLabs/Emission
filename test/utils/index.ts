import * as hre from "hardhat";
import {BaseContract, BigNumber} from "ethers";
import {
  ethers,
  deployments,
  getNamedAccounts,
  getUnnamedAccounts,
  network,
} from "hardhat";
import {
  RewardDistributor,
  MockERC20Token,
  MockiToken,
  EligibilityManager,
  IController,
  IiToken,
  IEligibilityManager,
  IPriceOracle,
  IBLPStakingPool,
  RewardDistributorManager,
  MockController,
  MockOracle,
  BLPStakingPool,
  BLPReward,
  ERC20,
} from "../../typechain-types";
import {
  FakeContract,
  smock,
  MockContract,
  MockContractFactory,
} from "@defi-wonderland/smock";
import {Contract, Signer, utils} from "ethers";
import {deploy, getContract} from "../../utils/utils";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import chalk from "chalk";

export async function setupUsers<
  T extends {[contractName: string]: BaseContract}
>(addresses: string[], contracts: T): Promise<({address: string} & T)[]> {
  const users: ({address: string} & T)[] = [];
  for (const address of addresses) {
    users.push(await setupUser(address, contracts));
  }
  return users;
}

export async function setupUser<
  T extends {[contractName: string]: BaseContract}
>(address: string, contracts: T): Promise<{address: string} & T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: any = {address};
  for (const key of Object.keys(contracts)) {
    user[key] = contracts[key].connect(await ethers.getSigner(address));
  }
  return user as {address: string} & T;
}

// As the deploy script relies on the deployments files, should not setup twice
// since the old ones get overwrite, to use a global singleton
let lending = {};
let BLPStaking = {};
let eligibilityManager = {};

export async function setupMockLending() {
  if (Object.keys(lending).includes("controller")) {
    return lending;
  }

  let mockController: FakeContract<IController>;
  let mockOracle: FakeContract<IPriceOracle>;
  let mockIETH: FakeContract<IiToken>;
  let mockIUSX: FakeContract<IiToken>;
  let mockIBTC: FakeContract<IiToken>;

  mockController = await smock.fake<IController>("IController");
  mockOracle = await smock.fake<IPriceOracle>("IPriceOracle");
  mockIETH = await smock.fake<IiToken>("IiToken");
  mockIBTC = await smock.fake<IiToken>("IiToken");
  mockIUSX = await smock.fake<IiToken>("IiToken");

  // console.log("setupMockLending", mockController);

  const iTokenAddresses = [
    mockIETH.address,
    mockIBTC.address,
    mockIUSX.address,
  ];

  mockController.isController.returns(true);
  mockController.getAlliTokens.returns(iTokenAddresses);
  mockController.priceOracle.returns(mockOracle.address);

  mockController.hasiToken.whenCalledWith(mockIETH.address).returns(true);
  mockController.hasiToken.whenCalledWith(mockIBTC.address).returns(true);
  mockController.hasiToken.whenCalledWith(mockIUSX.address).returns(true);

  mockOracle.getUnderlyingPriceAndStatus
    .whenCalledWith(mockIBTC.address)
    .returns([BigNumber.from("641236463283300000000000000000000"), true]);
  mockOracle.getUnderlyingPriceAndStatus
    .whenCalledWith(mockIETH.address)
    .returns([BigNumber.from("3417294500000000000000"), true]);
  mockOracle.getUnderlyingPriceAndStatus
    .whenCalledWith(mockIUSX.address)
    .returns([BigNumber.from("1000000000000000000"), true]);

  mockIETH.borrowIndex.returns(utils.parseEther("1"));
  mockIBTC.borrowIndex.returns(utils.parseEther("1"));
  mockIUSX.borrowIndex.returns(utils.parseEther("1"));
  mockIETH.exchangeRateStored.returns(utils.parseEther("1"));
  mockIBTC.exchangeRateStored.returns(utils.parseEther("1"));
  mockIUSX.exchangeRateStored.returns(utils.parseEther("1"));

  mockIETH.borrowSnapshot.returns([0, utils.parseEther("1")]);
  mockIBTC.borrowSnapshot.returns([0, utils.parseEther("1")]);
  mockIUSX.borrowSnapshot.returns([0, utils.parseEther("1")]);

  mockIETH.name.returns("iETH");
  mockIBTC.name.returns("iBTC");
  mockIUSX.name.returns("iUSX");

  lending = {
    controller: mockController,
    oracle: mockOracle,
    iTokens: {
      iETH: mockIETH,
      iBTC: mockIBTC,
      iUSX: mockIUSX,
    },
  };

  const controllerABI = (await deployments.getArtifact("IController")).abi;

  await deployments.save("controller", {
    abi: controllerABI,
    address: mockController.address,
  });

  return lending;
}

export async function setupMockBLPStaking() {
  if (Object.keys(BLPStaking).includes("dfUtsStakingPool")) {
    return BLPStaking;
  }

  let mock_df_uts_lp: FakeContract<ERC20>;
  let mock_uts_usx_lp: FakeContract<ERC20>;
  let mockBLPUTSDFStaking: FakeContract<IBLPStakingPool>;
  let mockBLPUTSUSXStaking: FakeContract<IBLPStakingPool>;

  mock_df_uts_lp = await smock.fake<ERC20>("ERC20");
  mock_uts_usx_lp = await smock.fake<ERC20>("ERC20");
  mockBLPUTSDFStaking = await smock.fake<IBLPStakingPool>("BLPStakingPool");
  mockBLPUTSUSXStaking = await smock.fake<IBLPStakingPool>("BLPStakingPool");

  mockBLPUTSDFStaking.stakingToken.returns(mock_df_uts_lp.address);
  mockBLPUTSUSXStaking.stakingToken.returns(mock_uts_usx_lp.address);
  mockBLPUTSDFStaking.isStakingPool.returns(true);
  mockBLPUTSUSXStaking.isStakingPool.returns(true);

  BLPStaking = {
    dfUtsStakingPool: mockBLPUTSDFStaking,
    utsUsxStakingPool: mockBLPUTSUSXStaking,
    df_uts_lp: mock_df_uts_lp,
    uts_usx_lp: mock_uts_usx_lp,
  };

  const ERC20ABI = (await deployments.getArtifact("ERC20")).abi;
  const IBLPStakingPoolABI = (await deployments.getArtifact("BLPStakingPool"))
    .abi;

  await deployments.save("DF_UTS_LP", {
    abi: ERC20ABI,
    address: mock_df_uts_lp.address,
  });
  await deployments.save("UTS_USX_LP", {
    abi: ERC20ABI,
    address: mock_uts_usx_lp.address,
  });
  await deployments.save("DF_UTS_StakingPool", {
    abi: IBLPStakingPoolABI,
    address: mockBLPUTSDFStaking.address,
  });
  await deployments.save("UTS_USX_StakingPool", {
    abi: IBLPStakingPoolABI,
    address: mockBLPUTSUSXStaking.address,
  });

  return BLPStaking;
}

export const setupBLPEnv = deployments.createFixture(async () => {
  await deployments.fixture("all");

  let namedAccounts = await getNamedAccounts();
  const contracts = {
    // Lending
    controller: await getContract<MockController>(hre, "controller"),
    oracle: await getContract<MockOracle>(hre, "oracle"),
    mockWBTC: await getContract<MockERC20Token>(hre, "mockWBTC"),
    mockUSX: await getContract<MockERC20Token>(hre, "mockUSX"),
    iWBTC: await getContract<MockiToken>(hre, "iWBTC"),
    iUSX: await getContract<MockiToken>(hre, "iUSX"),
    ARB: await getContract<MockERC20Token>(hre, "ARB"),
    UTS: await getContract<MockERC20Token>(hre, "UTS"),
    // BLP
    dfUtsLp: await getContract<MockERC20Token>(hre, "DF_UTS_LP"),
    utsUsxLp: await getContract<MockERC20Token>(hre, "UTS_USX_LP"),
    dfUtsStakingPool: await getContract<BLPStakingPool>(
      hre,
      "DF_UTS_StakingPool"
    ),
    utsUsxStakingPool: await getContract<BLPStakingPool>(
      hre,
      "UTS_USX_StakingPool"
    ),
    dfUtsBLPRewardDistributor: await getContract<BLPReward>(
      hre,
      "DF_UTS_ARB_BLPRewardDistributor"
    ),
    utsUsxBLPRewardDistributor: await getContract<BLPReward>(
      hre,
      "UTS_USX_UTS_BLPRewardDistributor"
    ),
    eligibilityManager: await getContract<EligibilityManager>(
      hre,
      "eligibilityManager"
    ),
    rewardDistributorManager: await getContract<RewardDistributorManager>(
      hre,
      "rewardDistributorManager"
    ),
    utsRewardDistributor: await getContract<RewardDistributor>(
      hre,
      "utsRewardDistributor"
    ),
    arbRewardDistributor: await getContract<RewardDistributor>(
      hre,
      "arbRewardDistributor"
    ),
  };

  const users = await setupUsers(await getUnnamedAccounts(), contracts);
  const deployer = await setupUser(namedAccounts.deployer, contracts);

  // Distribute tokens to users
  let underlying = [
    contracts.mockWBTC,
    contracts.mockUSX,
    contracts.dfUtsLp,
    contracts.utsUsxLp,
  ];
  for (let i = 0; i < underlying.length; i++) {
    for (let j = 0; j < users.length; j++) {
      await underlying[i].mint(users[j].address, utils.parseEther("1000000"));
    }
  }

  // Set price
  await deployer.oracle.setPrice(
    contracts.iWBTC.address,
    utils.parseEther("60000")
  );
  await deployer.oracle.setPrice(contracts.iUSX.address, utils.parseEther("1"));
  // Update reward distributor manager in the controller
  await deployer.controller._setRewardDistributor(
    contracts.rewardDistributorManager.address
  );
  // Add iTokens
  await deployer.controller._addMarket(
    contracts.iWBTC.address,
    0,
    0,
    0,
    0,
    utils.parseEther("1")
  );
  await deployer.controller._addMarket(
    contracts.iUSX.address,
    0,
    0,
    0,
    0,
    utils.parseEther("1")
  );

  // Set blp price
  await deployer.oracle.setPrice(
    contracts.dfUtsLp.address,
    utils.parseEther("1")
  );
  await deployer.oracle.setPrice(
    contracts.utsUsxLp.address,
    utils.parseEther("1")
  );
  // Set reward distributor manager in the staking pool
  await deployer.dfUtsStakingPool._setRewardDistributorManager(
    contracts.rewardDistributorManager.address
  );
  await deployer.utsUsxStakingPool._setRewardDistributorManager(
    contracts.rewardDistributorManager.address
  );

  // Set valid Supplies in the eligibility manager
  await deployer.eligibilityManager._addValidSupplies(
    await contracts.controller.getAlliTokens()
  );

  return {
    ...contracts,
    users,
    deployer,
  };
});

export async function setupMockEligibilityManager() {
  if (Object.keys(eligibilityManager).includes("address")) {
    return eligibilityManager;
  }

  const mockEligibilityManager = await smock.fake<IEligibilityManager>(
    "IEligibilityManager"
  );

  mockEligibilityManager.isEligibilityManager.returns(true);

  eligibilityManager = mockEligibilityManager;

  const IEligibilityManagerABI = (
    await deployments.getArtifact("IEligibilityManager")
  ).abi;

  await deployments.save("eligibilityManager", {
    abi: IEligibilityManagerABI,
    address: mockEligibilityManager.address,
  });

  return {
    eligibilityManager: mockEligibilityManager,
  };
}

export async function setupRewardToken() {
  await deploy(hre, "UTS", "MockERC20Token", ["Unitus", "UTS"]);
  await deploy(hre, "ARB", "MockERC20Token", ["Arbitrum", "ARB"]);
}

export const setupMockRewardDistributorManager = deployments.createFixture(
  async () => {
    // ensure you start from a fresh deployments, and no conflict with default one
    await deployments.fixture("", {fallbackToGlobal: false});

    await setupMockLending();
    await setupMockEligibilityManager();
    await setupRewardToken();

    await deployments.fixture("RewardDistributor", {
      keepExistingDeployments: true, // to load the mock controller deployments
    });

    const {deployer} = await getNamedAccounts();
    const contracts = {
      controller: lending.controller,
      eligibilityManager: eligibilityManager,
      ARB: await getContract<MockERC20Token>(hre, "ARB"),
      UTS: await getContract<MockERC20Token>(hre, "UTS"),
      rewardDistributorManager: await getContract<RewardDistributorManager>(
        hre,
        "rewardDistributorManager"
      ),
      utsRewardDistributor: await getContract<RewardDistributor>(
        hre,
        "utsRewardDistributor"
      ),
      arbRewardDistributor: await getContract<RewardDistributor>(
        hre,
        "arbRewardDistributor"
      ),
    };

    const users = await setupUsers(await getUnnamedAccounts(), contracts);

    return {
      ...contracts,
      users,
      deployer: await setupUser(deployer, contracts),
      lending,
    };
  }
);

export const impersonateAccount = async (address: string) => {
  await helpers.impersonateAccount(address);
  await network.provider.send("hardhat_setBalance", [
    address,
    ethers.utils.parseEther("100").toHexString().replace("0x0", "0x"),
  ]);

  return await ethers.getSigner(address);
};

export const stopImpersonatingAccount = async (address: string) => {
  await helpers.stopImpersonatingAccount(address);
};

// Returns the timestamp of the latest block.
export const currentTime = async () => {
  return await helpers.time.latest();
};

export const setNextBlockTime = async (newTimestamp: number) => {
  await helpers.time.setNextBlockTimestamp(newTimestamp);
};

// Mines a new block whose timestamp is `amountInSeconds`
// after the latest block's timestamp.
export const increaseTime = async (amountInSeconds: number) => {
  await helpers.time.increase(amountInSeconds);
};

// mine several blocks
export const mine = async (amountOfBlocks: number = 1) => {
  await helpers.mine(amountOfBlocks);
};

export type ContractsType = {
  controller: IController;
  rewardDistributorManager: RewardDistributorManager;
  utsRewardDistributor: RewardDistributor;
  eligibilityManager: EligibilityManager;
  dfUtsStakingPool: BLPStakingPool;
  utsUsxStakingPool: BLPStakingPool;
  DF_UTS_LP: ERC20;
  UTS_USX_LP: ERC20;
  [key: string]: Contract;
};

export async function loadAllDeployedContracts(): Promise<ContractsType> {
  const deployments = await hre.deployments.all();
  const contractNames = Object.keys(deployments);

  const contracts = await contractNames.reduce(async (accPromise, name) => {
    const acc = await accPromise;
    const contract = await ethers.getContractAt(
      deployments[name].abi,
      deployments[name].address
    );
    return {...acc, [name]: contract};
  }, Promise.resolve({}));

  return contracts as ContractsType;
}

export const colorLog = {
  info: (...args: any[]) => console.log(chalk.blueBright(...args)),
  success: (...args: any[]) => console.log(chalk.green(...args)),
  warning: (...args: any[]) => console.log(chalk.yellow(...args)),
  error: (...args: any[]) => console.log(chalk.red(...args)),
  highlight: (...args: any[]) => console.log(chalk.bgCyan(...args)),
};
