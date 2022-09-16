import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ConstantsService {
  // -----------------------------------------------------------------------
  // NETWORK DATA
  // -----------------------------------------------------------------------

  CHAIN_ID = {
    ETHEREUM: 1,
    RINKEBY: 4,
    ARBITRUM: 42161,
  };

  CHAIN_METADATA = {
    [this.CHAIN_ID.ETHEREUM]: {
      chainId: '0x1',
      chainName: 'Ethereum',
      displayName: 'Ethereum',
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://mainnet.infura.io/v3'],
      blockExplorerUrls: ['https://etherscan.io'],
      iconPath: 'assets/img/chains/ethereum-icon.png',
      supports0x: true,
      useAccessList: true,
    },
    [this.CHAIN_ID.RINKEBY]: {
      chainId: '0x4',
      chainName: 'Rinkeby',
      displayName: 'Rinkeby',
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
      },
      rpcUrls: ['https://rinkeby.infura.io/v3'],
      blockExplorerUrls: ['https://rinkeby.etherscan.io'],
      iconPath: 'assets/img/chains/ethereum-icon.png',
      supports0x: false,
      useAccessList: true,
    },
    [this.CHAIN_ID.ARBITRUM]: {
      chainId: '0xa4b1',
      chainName: 'Arbitrum One',
      displayName: 'Arbitrum',
      nativeCurrency: {
        name: 'Ethereum',
        symbol: 'AETH',
        decimals: 18,
      },
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      blockExplorerUrls: ['https://arbiscan.io'],
      iconPath: 'assets/img/chains/arbitrum-icon.svg',
      supports0x: false,
      useAccessList: false,
    },
  };

  // -----------------------------------------------------------------------
  // RPC ENDPOINTS
  // -----------------------------------------------------------------------

  RPC = {
    [this.CHAIN_ID.ETHEREUM]: 'https://eth-mainnet.alchemyapi.io/v2/Whqjb5i87dMAyACOf3S1Ajv89RabbZUc',
    [this.CHAIN_ID.RINKEBY]: 'https://eth-rinkeby.alchemyapi.io/v2/xC_ll20JRH0bGVZHfZqUvfytlBkOtdZi',
    [this.CHAIN_ID.ARBITRUM]: 'https://arb1.arbitrum.io/rpc',
  };

  // -----------------------------------------------------------------------
  // GRAPHQL ENDPOINTS
  // -----------------------------------------------------------------------

  GRAPHQL_ENDPOINT = {
    [this.CHAIN_ID.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/timeless-fi/timeless',
    [this.CHAIN_ID.RINKEBY]: 'https://api.thegraph.com/subgraphs/name/timeless-fi/timeless-rinkeby',
    [this.CHAIN_ID.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/timeless-fi/timeless-arbitrum',
  };

  BLOCKS_GRAPHQL_ENDPOINT = {
    [this.CHAIN_ID.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks',
    [this.CHAIN_ID.RINKEBY]: 'https://api.thegraph.com/subgraphs/name/blocklytics/rinkeby-blocks',
    [this.CHAIN_ID.ARBITRUM]: 'https://api.thegraph.com/subgraphs/name/sushiswap/arbitrum-blocks',
  };

  // -----------------------------------------------------------------------
  // TIMELESS CORE CONTRACTS
  // -----------------------------------------------------------------------

  GATE_FACTORY = {
    [this.CHAIN_ID.ETHEREUM]: '0xbd16088611054fce04711aa9509d1d86e04dce2c',
    [this.CHAIN_ID.RINKEBY]: '0x3a3b70721e026fcc46f4f16da8291970713e412e',
    [this.CHAIN_ID.ARBITRUM]: '0xbd16088611054fce04711aa9509d1d86e04dce2c',
  };

  YEARN_GATE = {
    [this.CHAIN_ID.ETHEREUM]: '0x36b49ebf089be8860d7fc60f2553461e9cc8e9e2',
    [this.CHAIN_ID.RINKEBY]: '0xd6ef221be3331e16478e73229e40e1f69c94d9e6',
    [this.CHAIN_ID.ARBITRUM]: '0x36b49ebf089be8860d7fc60f2553461e9cc8e9e2',
  };

  ERC4626_GATE = {
    [this.CHAIN_ID.ETHEREUM]: '0xbb443d6740322293fcee4414d03978c7e4bf5d55',
    [this.CHAIN_ID.RINKEBY]: '0xb5c82a0d5854e3bceb57f51776fb7bbf05ed4ac2',
    [this.CHAIN_ID.ARBITRUM]: '0xbb443d6740322293fcee4414d03978c7e4bf5d55',
  };

  // -----------------------------------------------------------------------
  // TIMELESS xPYT CONTRACTS
  // -----------------------------------------------------------------------

  CURVE_V2_XPYT_FACTORY = {
    [this.CHAIN_ID.ETHEREUM]: '0x7B96bfdde51226b637C7a3bc2E6C6Bc37ED51e83',
    [this.CHAIN_ID.RINKEBY]: '',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  UNISWAP_V3_XPYT_FACTORY = {
    [this.CHAIN_ID.ETHEREUM]: '0xD373A63Ce95fe95bB8A3417DC075943CC39dD1d2',
    [this.CHAIN_ID.RINKEBY]: '0x9FC04301Cf2c3AC58B571ef76d161d87A6bCA415',
    [this.CHAIN_ID.ARBITRUM]: '0x302C230bc53901D3fE363D3483B2548F938EfA33',
    };

  // -----------------------------------------------------------------------
  // TIMELESS SWAPPER CONTRACTS
  // -----------------------------------------------------------------------

  CURVE_V2_SWAPPER = {
    [this.CHAIN_ID.ETHEREUM]: '0xCE56432aBbba2a67b2AB932588c7613a38DfA937',
    [this.CHAIN_ID.RINKEBY]: '',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  CURVE_V2_JUGGLER = {
    [this.CHAIN_ID.ETHEREUM]: '0x92ee83D65e22DA280761dcB24F74616DC5C4C329',
    [this.CHAIN_ID.RINKEBY]: '',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  UNISWAP_V3_SWAPPER = {
    [this.CHAIN_ID.ETHEREUM]: '0x21b6e092a03456871ce14493c526832305618e27',
    [this.CHAIN_ID.RINKEBY]: '0x407ab1393ad777f7511defead9b2d8a812e5f034',
    [this.CHAIN_ID.ARBITRUM]: '0x983dfd698BBbF72e585DBacdA5b242221306565f',
  };

  UNISWAP_V3_JUGGLER = {
    [this.CHAIN_ID.ETHEREUM]: '0x79464810c6df82cbdbb4be23900250ed2311f105',
    [this.CHAIN_ID.RINKEBY]: '0xafa1aa79ed9eb33d4d6b32771d984fce97894926',
    [this.CHAIN_ID.ARBITRUM]: '0x79464810c6DF82CbdbB4BE23900250eD2311f105',
  };

  // -----------------------------------------------------------------------
  // BUNNI CONTRACTS
  // -----------------------------------------------------------------------

  BUNNI_HUB = {
    [this.CHAIN_ID.ETHEREUM]: '',
    [this.CHAIN_ID.RINKEBY]: '0x7A6fE32Dedf26D1694Da6Ab92d5e7366e8f68F45',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  BUNNI_LENS = {
    [this.CHAIN_ID.ETHEREUM]: '',
    [this.CHAIN_ID.RINKEBY]: '0xB06632Ec878CF3D8cF87A6a702f69Ac7600e06a3',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  BUNNI_MIGRATOR = {
    [this.CHAIN_ID.ETHEREUM]: '',
    [this.CHAIN_ID.RINKEBY]: '0x2C6f1541b5CD3787f31cf3EF7119147fe350237E',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  // -----------------------------------------------------------------------
  // UNISWAP CONTRACTS
  // -----------------------------------------------------------------------

  UNISWAP_V3_FACTORY = {
    [this.CHAIN_ID.ETHEREUM]: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    [this.CHAIN_ID.RINKEBY]: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    [this.CHAIN_ID.ARBITRUM]: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  };

  UNISWAP_V3_ROUTER = {
    [this.CHAIN_ID.ETHEREUM]: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    [this.CHAIN_ID.RINKEBY]: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    [this.CHAIN_ID.ARBITRUM]: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  };

  UNISWAP_V3_STAKER = {
    [this.CHAIN_ID.ETHEREUM]: '0xe34139463bA50bD61336E0c446Bd8C0867c6fE65',
    [this.CHAIN_ID.RINKEBY]: '0xe34139463bA50bD61336E0c446Bd8C0867c6fE65',
    [this.CHAIN_ID.ARBITRUM]: '0xe34139463bA50bD61336E0c446Bd8C0867c6fE65',
  };

  NONFUNGIBLE_POSITION_MANAGER = {
    [this.CHAIN_ID.ETHEREUM]: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    [this.CHAIN_ID.RINKEBY]: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    [this.CHAIN_ID.ARBITRUM]: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  };

  // -----------------------------------------------------------------------
  // OTHER CONTRACTS
  // -----------------------------------------------------------------------

  ZERO_EX_PROXY = {
    [this.CHAIN_ID.ETHEREUM]: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
    [this.CHAIN_ID.RINKEBY]: '',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  YEARN_PRICE_ORACLE = {
    [this.CHAIN_ID.ETHEREUM]: '0x83d95e0D5f402511dB06817Aff3f9eA88224B030',
    [this.CHAIN_ID.RINKEBY]: '',
    [this.CHAIN_ID.ARBITRUM]: '0x043518AB266485dC085a1DB095B8d9C2Fc78E9b9',
  };

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------

  GATE_NAMES = {
    [this.CHAIN_ID.ETHEREUM]: {
      '0x36b49ebf089be8860d7fc60f2553461e9cc8e9e2': 'YearnGate',
      '0xbb443d6740322293fcee4414d03978c7e4bf5d55': 'ERC4626Gate',
    },
    [this.CHAIN_ID.RINKEBY]: {
      '0xd6ef221be3331e16478e73229e40e1f69c94d9e6': 'YearnGate',
      '0xb5c82a0d5854e3bceb57f51776fb7bbf05ed4ac2': 'ERC4626Gate'
    },
    [this.CHAIN_ID.ARBITRUM]: {
      '0x36b49ebf089be8860d7fc60f2553461e9cc8e9e2': 'YearnGate',
      '0xbb443d6740322293fcee4414d03978c7e4bf5d55': 'ERC4626Gate'
    },
  };

  // -----------------------------------------------------------------------
  // TIMELESS TOKENS
  // -----------------------------------------------------------------------

  TIT = {
    [this.CHAIN_ID.ETHEREUM]: '0xA7C6Fec572f5A58060F3640E6537470cabfB72CF',
    [this.CHAIN_ID.RINKEBY]: '',
    [this.CHAIN_ID.ARBITRUM]: '',
  };

  // -----------------------------------------------------------------------
  // OTHER TOKENS
  // -----------------------------------------------------------------------

  DAI = {
    [this.CHAIN_ID.ETHEREUM]: '0x6b175474e89094c44da98b954eedeac495271d0f',
    [this.CHAIN_ID.RINKEBY]: '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea',
    [this.CHAIN_ID.ARBITRUM]: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  };

  USDC = {
    [this.CHAIN_ID.ETHEREUM]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    [this.CHAIN_ID.RINKEBY]: '0x4dbcdf9b62e891a7cec5a2568c3f4faf9e8abe2b',
    [this.CHAIN_ID.ARBITRUM]: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
  };

  WETH = {
    [this.CHAIN_ID.ETHEREUM]: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    [this.CHAIN_ID.RINKEBY]: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
    [this.CHAIN_ID.ARBITRUM]: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  };

  // -----------------------------------------------------------------------
  // API KEYS
  // -----------------------------------------------------------------------

  INFURA_KEY = '9e5f0d08ad19483193cc86092b7512f2'; // @dev this is the 88mph Infura key, needs to be changed
  PORTIS_KEY = '61885cb4-8889-4e99-8186-27f853a1ff12'; // @dev this is a test key, needs to be changed
  FORTMATIC_KEY = 'pk_live_937F9430B2CB3407'; // @dev this is the 88mph Fortmatic key, needs to be changed

  // -----------------------------------------------------------------------
  // OTHER
  // -----------------------------------------------------------------------

  MAX_UINT = Math.pow(2, 256) - 1;
  ETH_ADDRESS = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
}
