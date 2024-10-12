import { ethers } from "hardhat";
import { Contract, Signer } from "ethers";
import { expect } from "chai";

import arbDetails from "./deployments/sepolia/ARB.json";
import utsDetails from "./deployments/sepolia/UTS.json";
import dfUtsLpDetails from "./deployments/sepolia/DF_UTS_LP.json";
import utsUsxLpDetails from "./deployments/sepolia/UTS_USX_LP.json";
import dfUtsStakingPoolDetails from "./deployments/sepolia/dfUtsStakingPool.json";
import utsUsxStakingPoolDetails from "./deployments/sepolia/utsUsxStakingPool.json";
import rewardDistributorManagerData from "./deployments/sepolia/rewardDistributorManager.json";
import eligibleManagerData from "./deployments/sepolia/eligibilityManager.json";
import {impersonateAccount} from "./test/utils/index";

describe("Test with forking", function() {
    let arb: Contract, uts: Contract;
    let dfUtsLp: Contract, utsUsxLp: Contract;
    let dfUtsStakingPool: Contract, utsUsxStakingPool: Contract;
    let rewardDistributorManager: Contract, eligibilityManager: Contract;
    let user: Signer; 
    let userAddress: String;

    before(async () => {
        // Reward token:
        arb = await ethers.getContractAt(arbDetails.abi, arbDetails.address);
        uts = await ethers.getContractAt(utsDetails.abi, utsDetails.address);
        // Staking token
        dfUtsLp = await ethers.getContractAt(dfUtsLpDetails.abi, dfUtsLpDetails.address);
        utsUsxLp = await ethers.getContractAt(utsUsxLpDetails.abi, utsUsxLpDetails.address);
        // Staking contract
        dfUtsStakingPool = await ethers.getContractAt(dfUtsStakingPoolDetails.abi, dfUtsStakingPoolDetails.address);
        utsUsxStakingPool = await ethers.getContractAt(utsUsxStakingPoolDetails.abi, utsUsxStakingPoolDetails.address);
        // Reward Distributor Manager
        rewardDistributorManager = await ethers.getContractAt(rewardDistributorManagerData.abi, rewardDistributorManagerData.address);
        // Eligibility Manager
        eligibilityManager = await ethers.getContractAt(eligibleManagerData.abi, eligibleManagerData.address);
        user = await impersonateAccount("0x6dF6d77a550459479F46B4E97a91602dA9aEf9A9");
        userAddress = await user.getAddress();
    });

    it("Stake BLP to get eligible", async function(){
        // User does not have eligible to get BLP reward
        let userIsEligible = await eligibilityManager.callStatic.isEligible(userAddress);
        await expect(userIsEligible).to.be.false;

        let blpStakingPools = await eligibilityManager.getBLPStakingPools();
        // Has df-uts staking pool
        await expect(blpStakingPools.includes(dfUtsStakingPool.address)).to.be.true;
        // Stake df-uts LP
        let userDfUtsLpBalance = await dfUtsLp.balanceOf(userAddress);
        await dfUtsLp.connect(user).approve(dfUtsStakingPool.address, userDfUtsLpBalance);
        await dfUtsStakingPool.connect(user).stake(userAddress, userDfUtsLpBalance);
        // User should have eligible to get BLP reward
        userIsEligible = await eligibilityManager.callStatic.isEligible(userAddress);
        await expect(userIsEligible).to.be.true;
    });
})
