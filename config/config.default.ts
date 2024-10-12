import {BigNumber, utils} from "ethers";

export const lendingReward = {
  UTS: {
    iUSDC: {
      supply: utils.parseEther("300"),
      borrow: utils.parseEther("120"),
    },
    iUSX: {
      supply: utils.parseEther("200"),
      borrow: utils.parseEther("80"),
    },
    istETH: {
      supply: utils.parseEther("100"),
      borrow: utils.parseEther("10"),
    },
    iARB: {
      supply: utils.parseEther("200"),
      borrow: utils.parseEther("50"),
    },
    iFRAX: {
      supply: utils.parseEther("120"),
      borrow: utils.parseEther("20"),
    },
  },
  ARB: {},
};

export const blpReward = {
  DF_UTS: {UTS: utils.parseEther("120"), ARB: utils.parseEther("120")},
  UTS_USX: {UTS: utils.parseEther("120"), ARB: utils.parseEther("120")},
};

// either set alliTokens to true or specify the list of iToken symbols
export const validSupplies = {
  alliTokens: true,
  symbols: [],
};
