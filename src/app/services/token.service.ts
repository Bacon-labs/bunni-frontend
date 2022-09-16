import { Injectable, NgZone } from '@angular/core';
import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { WalletService } from 'src/app/services/wallet.service';
import { GateService, Vault, Token } from 'src/app/services/gate.service';
import BigNumber from 'bignumber.js';
import {
  Multicall,
  ContractCallResults,
  ContractCallContext,
} from 'ethereum-multicall';

@Injectable({
  providedIn: 'root',
})
export class TokenService {
  userBalances: UserBalances = new UserBalances();

  ETHER: Token = {
    name: "Ether",
    symbol: "ETH",
    address: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    decimals: 18,
    iconPath: "assets/img/tokens/eth.png",
    precision: Math.pow(10, 18)
  };

  WETH = {
    1: {
      name: "Wrapped Ether",
      symbol: "WETH",
      address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
      decimals: 18,
      iconPath: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
      precision: Math.pow(10, 18)
    }
  }

  WBTC = {
    1: {
      name: "Wrapped BTC",
      symbol: "WBTC",
      address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
      decimals: 8,
      iconPath: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
      precision: Math.pow(10, 8)
    }
  }

  USDC = {
    1: {
      name: "USD Coin",
      symbol: "USDC",
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      decimals: 6,
      iconPath: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
      precision: Math.pow(10, 6)
    }
  }

  USDT = {
    1: {
      name: "Tether USD",
      symbol: "USDT",
      address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      decimals: 6,
      iconPath: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
      precision: Math.pow(10, 6)
    }
  }

  DAI = {
    1: {
      name: "Dai Stablecoin",
      symbol: "DAI",
      address: "0x6b175474e89094c44da98b954eedeac495271d0f",
      decimals: 18,
      iconPath: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
      precision: Math.pow(10, 18)
    }
  }

  DEFAULT_TOKENS = {
    1: [
      this.DAI[1],
      this.USDT[1],
      this.USDC[1],
      this.WBTC[1],
      this.WETH[1],
    ],
    4: [],
    42161: [],
  };

  constructor(
    public constants: ConstantsService,
    public contract: ContractService,
    public gate: GateService,
    public wallet: WalletService,
    public zone: NgZone
  ) {
    this.wallet.connectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.userBalances = new UserBalances();
      });
    });

    this.wallet.disconnectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.userBalances = new UserBalances();
      });
    });

    this.wallet.accountChangedEvent.subscribe((account) => {
      this.zone.run(() => {
        this.userBalances = new UserBalances();
      });
    });
  }

  // -----------------------------------------------------------------------
  // @notice Queries the user's allowance of a specified token.
  // -----------------------------------------------------------------------
  async getUserAllowance(
    owner: string,
    spender: string,
    token: Token
  ): Promise<BigNumber> {
    const web3 = this.wallet.httpsWeb3();
    const tokenContract = this.contract.getERC20(token.address, web3);
    const userAllowance = new BigNumber(
      await tokenContract.methods.allowance(owner, spender).call()
    ).div(token.precision);
    return userAllowance;
  }

  // -----------------------------------------------------------------------
  // @notice Queries the user's balance of a specified token.
  //
  // @dev If this is the first time we're querying *any* Token balance, we call
  // getUserBalances(). On several components this gets called multiple times
  // before the results are cached, leading to redundant RPC requests.
  //
  // TODO: Add ability to specify chainID to query.
  // TODO: Fix redundant RPC requests.
  // -----------------------------------------------------------------------
  async getUserBalance(
    user: string,
    token: Token,
    fetch: boolean = false
  ): Promise<BigNumber> {
    if (!this.userBalances[this.wallet.chainId]) {
      await this.getUserBalances(user, this.wallet.chainId);
    }

    let userBalance = this.userBalances[this.wallet.chainId][token.address];

    if (!userBalance || fetch) {
      const web3 = this.wallet.httpsWeb3();
      if (this.isETH(token)) {
        const ethBalance = await web3.eth.getBalance(user);
        this.userBalances[this.wallet.chainId][this.constants.ETH_ADDRESS] = new BigNumber(ethBalance);
      } else {
        const tokenContract = this.contract.getERC20(token.address, web3);
        userBalance = new BigNumber(
          await tokenContract.methods.balanceOf(user).call()
        );
        this.userBalances[this.wallet.chainId][token.address] = userBalance;
      }
    }

    return userBalance.div(token.precision);
  }

  // -----------------------------------------------------------------------
  // @notice Queries the user's balance *in wei* of each token.
  //
  // @dev Uses the ethereum-multicall library to aggregate function calls and
  // minimize RPC requests. https://www.npmjs.com/package/ethereum-multicall.
  //
  // TODO: Add ability to specify which *types* of tokens to fetch.
  // -----------------------------------------------------------------------
  async getUserBalances(user: string, chainId: number, fetch: boolean = false): Promise<UserBalances> {
    if (!user) return;

    let userBalances: UserBalances = this.userBalances[chainId];

    if (!userBalances || fetch) {
      const web3 = this.wallet.httpsWeb3(chainId);
      const gates = await this.gate.getGateList(chainId);

      let tokens: Token[] = [];

      for (let gate of gates) {
        for (let vault of gate.vaults) {
          for (let type of ['underlying', 'share', 'pyt', 'nyt']) {
            if (vault[type] && !tokens.includes(vault[type])) {
              tokens = [...tokens, vault[type]];
            }
          }
          for (let xpyt of vault.xpyt) {
            tokens = [...tokens, xpyt];
          }
        }
      }

      for (let defaultToken of this.DEFAULT_TOKENS[chainId]) {
        if (!tokens.find((token) => token.address === defaultToken.address)) {
          tokens = [...tokens, defaultToken];
        }
      }

      const multicall = new Multicall({
        web3Instance: web3,
        tryAggregate: true,
      });

      let context: ContractCallContext[] = [];
      for (let token of tokens) {
        const contextObj = {
          reference: token.address,
          contractAddress: token.address,
          abi: require(`src/assets/abi/ERC20.json`),
          calls: [
            {
              reference: `${token.address} Balance`,
              methodName: 'balanceOf',
              methodParameters: [user],
            },
          ],
        };
        context = [...context, contextObj];
      }

      const globalResults: ContractCallResults = await multicall.call(context);
      const results = globalResults.results;

      userBalances = new UserBalances();
      for (let result in results) {
        const token = results[result];
        const address = token.originalContractCallContext.contractAddress;
        const balance = token.callsReturnContext[0].returnValues[0].hex;
        userBalances[address] = new BigNumber(balance);
      }

      const ethBalance = await web3.eth.getBalance(user);
      userBalances[this.constants.ETH_ADDRESS] = new BigNumber(ethBalance);

      this.userBalances[chainId] = userBalances;
    }

    return userBalances;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  isETH(token: Token): boolean {
    return token.address === this.constants.ETH_ADDRESS;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  isWETH(token: Token): boolean {
    return token.address === this.constants.WETH[this.wallet.chainId];
  }
}

export class UserBalances {
  address: string;
  balance: BigNumber;
}
