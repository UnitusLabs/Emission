import fs from "fs";
import path from "path";
import {getNetworkName} from "hardhat-deploy/dist/src/utils";
import * as hre from "hardhat";
import {BigNumber, utils} from "ethers";

// Define the base configuration type
interface Config {
  lendingReward: LendingReward;
  blpReward: BLPReward;
  validSupplies: ValidSupplies;
}

export interface Reward {
  supply: BigNumber;
  borrow: BigNumber;
}

export interface LendingReward {
  [token: string]: {
    [market: string]: Reward;
  };
}

export interface BLPReward {
  [pool: string]: {
    [token: string]: BigNumber;
  };
}

export interface ValidSupplies {
  alliTokens: boolean;
  symbols: string[];
}
// Load the default configuration
const defaultConfig: Config = require("./config.default.ts");

const network = getNetworkName(hre.network);

// Construct the path for the environment-specific config file
const envConfigPath = path.join(__dirname, `config.${network}.ts`);

// Initialize the final configuration object
let config: Config = {...defaultConfig};

// If an environment-specific config file exists, merge it with the default config
if (fs.existsSync(envConfigPath)) {
  const envConfig: Partial<Config> = require(envConfigPath);
  config = {...config, ...envConfig};
}

// Export the final configuration
export default config;
export const {lendingReward, blpReward, validSupplies} = config;
