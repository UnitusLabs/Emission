import {utils} from "ethers";

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
  ARB: {
    iWBTC: {
      supply: utils.parseEther("100"),
      borrow: utils.parseEther("20"),
    },
    iUSX: {
      supply: utils.parseEther("300"),
      borrow: utils.parseEther("80"),
    },
    iUNI: {
      supply: utils.parseEther("200"),
      borrow: utils.parseEther("80"),
    },
    iMAI: {
      supply: utils.parseEther("200"),
      borrow: utils.parseEther("100"),
    },
    iARB: {
      supply: utils.parseEther("200"),
      borrow: utils.parseEther("120"),
    },
    iFRAX: {
      supply: utils.parseEther("280"),
      borrow: utils.parseEther("140"),
    },
  },
};

export const blpReward = {
  DF_UTS: {ARB: utils.parseEther("0.0005")},
  UTS_USX: {UTS: utils.parseEther("0.01")},
};

export const validSupplies = {
  alliTokens: false,
  symbols: ["iUSX", "iUSDC", "istETH", "iARB", "iFRAX"],
};
