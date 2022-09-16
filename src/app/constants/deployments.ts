import { CHAIN_ID } from 'src/app/constants/networks';

export const DEPLOYMENT_BLOCK = {
  [CHAIN_ID.ETHEREUM]: 14916846,
  [CHAIN_ID.RINKEBY]: 10718229,
  [CHAIN_ID.ARBITRUM]: 21005251,
};

export const DEPLOYMENT_TIMESTAMP = {
  [CHAIN_ID.ETHEREUM]: 1654546268,
  [CHAIN_ID.RINKEBY]: 1653189604,
  [CHAIN_ID.ARBITRUM]: 1661213374,
};
