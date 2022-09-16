import { Injectable } from '@angular/core';
import { ConstantsService } from 'src/app/services/constants.service';
import { WalletService } from 'src/app/services/wallet.service';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';
import {
  Multicall,
  ContractCallResults,
  ContractCallContext,
} from 'ethereum-multicall';

@Injectable({
  providedIn: 'root',
})
export class GateService {
  gates: any = {};
  vaults: any = {};
  tokens: any = {};

  constructor(
    public constants: ConstantsService,
    public wallet: WalletService
  ) { }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getGateName(address: string, chainId: number): string {
    return this.constants.GATE_NAMES[chainId][address];
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getToken(address: string, chainId: number): Promise<Token> {
    const vaults = await this.getVaultList(chainId);
    for (const vault of vaults) {
      // check underlying, share, pyt, nyt match
      const token = Object.values(vault).find((key) => key.address === address);
      if (token) {
        return token;
      }

      // check xpyt match
      const xpyt = vault.xpyt.find((xpyt) => xpyt.address === address);
      if (xpyt) {
        return xpyt;
      }
    }
    return undefined;
  }

  // -----------------------------------------------------------------------
  // @dev An array of Gate objects is cached for each chain to prevent additional
  // GraphQL queries and RPC requests each time a list of Gates is requested.
  // -----------------------------------------------------------------------
  async getGateList(chainId: number, fetch: boolean = false): Promise<Gate[]> {
    let gates = this.gates[chainId];
    if (!gates || fetch) {
      const data = await this.fetchGates(chainId);
      const metadata = await this.fetchTokenMetadata(data, chainId);
      const icons = await this.fetchTokenIcons(data, chainId);
      gates = await data.gates.map((gate) => this.loadGate(gate, metadata, icons, chainId));
      this.gates[chainId] = gates;
    }
    return gates;
  }

  // -----------------------------------------------------------------------
  // @notice The JSON file contains only a small subset of available Gates.
  //
  // @dev Used when resetting component data. We do this instead of calling
  // getGateList() to prevent errors before getGateList() has returned data.
  // -----------------------------------------------------------------------
  getDefaultGateList(chainId: number): Gate[] {
    return require('src/assets/json/gates.json')[chainId];
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getVaultList(chainId: number, fetch: boolean = false): Promise<Vault[]> {
    let vaults = this.vaults[chainId];
    if (!vaults || fetch) {
      vaults = [];
      const gates = await this.getGateList(chainId, fetch);
      for (const gate of gates) {
        for (const vault of gate.vaults) {
          vaults = [...vaults, vault];
        }
      }
      this.vaults[chainId] = vaults;
    }
    return vaults;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getVault(address: string, chainId: number): Promise<Vault> {
    const vaults = await this.getVaultList(chainId);
    return vaults.find((vault) => vault.share.address === address);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getDefaultVaultList(chainId: number): Vault[] {
    let vaults = [];
    const gates = this.getDefaultGateList(chainId);
    for (const gate of gates) {
      for (const vault of gate.vaults) {
        vaults = [...vaults, vault];
      }
    }
    return vaults;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getTokenVault(token: Token, chainId: number): Promise<Vault> {
    const vaults: Vault[] = await this.getVaultList(chainId);
    let matches = [];

    for (const vault of vaults) {
      let valueMatch = Object.values(vault).find((value) => {
        return value.length
          ? value.find((xpyt) => xpyt.address === token.address)
          : value.address === token.address;
      });

      if (valueMatch) {
        matches = [...matches, vault];
      }
    }

    return matches.length === 1 ? matches[0] : null;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getVaultGate(vault: Vault, chainId: number): Promise<Gate> {
    if (!vault) return;
    const gates: Gate[] = await this.getGateList(chainId);
    let match;

    for (const gate of gates) {
      let valueMatch = Object.values(gate.vaults).find(
        (value) => value.share.address === vault.share.address
      );

      if (valueMatch) {
        match = gate;
        break;
      }
    }

    return match;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadGate(gate, metadata, icons, chainId): Gate {
    const gateObj: Gate = {
      address: gate.address,
      vaults: gate.vaults.map((vault) => this.loadVault(vault, metadata, icons, chainId)),
    };
    return gateObj;
  }

  // -----------------------------------------------------------------------
  // @dev Using https://github.com/trustwallet/assets for token icons.
  // -----------------------------------------------------------------------
  loadVault(vault, metadata, icons, chainId): Vault {
    const vaultObj: Vault = {
      pricePerVaultShare: new BigNumber(vault.pricePerVaultShare),
      underlyingPriceUSD: new BigNumber(vault.underlyingPriceUSD).div(1e6),
      underlying: vault.underlying !== this.constants.ZERO_ADDRESS ? this.loadToken(metadata[vault.underlying], icons[vault.underlying]) : null,
      share: vault.share !== this.constants.ZERO_ADDRESS ? this.loadToken(metadata[vault.share], icons[vault.underlying]) : null,
      pyt: vault.pyt !== this.constants.ZERO_ADDRESS ? this.loadToken(metadata[vault.pyt], icons[vault.underlying]) : null,
      nyt: vault.nyt !== this.constants.ZERO_ADDRESS ? this.loadToken(metadata[vault.nyt], icons[vault.underlying]) : null,
      xpyt: vault.xpyt.map((xpyt) => this.loadXpyt(xpyt, icons[vault.underlying])),
    };

    return vaultObj;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadToken(metadata, iconPath: string): Token {
    const tokenObj: Token = {
      name: metadata.callsReturnContext[0].returnValues[0],
      symbol: metadata.callsReturnContext[1].returnValues[0],
      address: metadata.originalContractCallContext.contractAddress,
      decimals: metadata.callsReturnContext[2].returnValues[0],
      iconPath: iconPath,
      precision: Math.pow(10, metadata.callsReturnContext[2].returnValues[0]),
    };
    return tokenObj;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadXpyt(xpyt, iconPath: string): xPYT {
    const xpytObj: xPYT = {
      name: xpyt.name,
      symbol: xpyt.symbol,
      address: xpyt.address,
      decimals: parseInt(xpyt.decimals),
      iconPath: iconPath,
      precision: parseInt(xpyt.precision),
      uniswapV3PoolFee: new BigNumber(xpyt.uniswapV3PoolFee),
      uniswapV3TwapSecondsAgo: new BigNumber(xpyt.uniswapV3TwapSecondsAgo),
      pounderRewardMultiplier: new BigNumber(xpyt.pounderRewardMultiplier),
      minOutputMultiplier: new BigNumber(xpyt.minOutputMultiplier),
      conversionRate: new BigNumber(xpyt.conversionRate),
      pools: xpyt.pools.map((pool) => this.loadPool(pool)),
    };
    return xpytObj;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadPool(pool): Pool {
    const poolObj: Pool = {
      id: pool.id,
      fee: new BigNumber(pool.fee),
      token0: pool.token0,
      token1: pool.token1,
      liquidity: new BigNumber(pool.liquidity),
      token0Price: new BigNumber(pool.token0Price),
      token1Price: new BigNumber(pool.token1Price)
    };
    return poolObj;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async fetchGates(chainId: number): Promise<QueryResult> {
    const queryString = gql`
      {
        gates(first: 1000) {
          address
          vaults(first: 1000) {
            pricePerVaultShare
            underlyingPriceUSD
            underlying
            share
            pyt
            nyt
            xpyt(first: 1000) {
              name
              symbol
              address
              decimals
              precision
              conversionRate
              uniswapV3PoolFee
              uniswapV3TwapSecondsAgo
              pounderRewardMultiplier
              minOutputMultiplier
              pools {
                id
                fee
                token0
                token1
                liquidity
                token0Price
                token1Price
              }
            }
          }
        }
      }
    `;
    return await request(this.constants.GRAPHQL_ENDPOINT[chainId], queryString);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async fetchTokenMetadata(data: QueryResult, chainId: number): Promise<any> {
    const gates = data.gates;

    // build a list of unique token addresses
    let tokens: string[] = [];
    for (const gate of gates) {
      for (const vault of gate.vaults) {
        for (const key of Object.keys(vault)) {
          if (key.match(/^(underlying|share|pyt|nyt)$/)) {
            const token = vault[key];
            if (token && token !== this.constants.ZERO_ADDRESS && !tokens.includes(token)) {
              tokens = [...tokens, token];
            }
          }
        }
      }
    }

    // use multicall to fetch the metadata for each token
    const multicall = new Multicall({
      web3Instance: this.wallet.httpsWeb3(chainId),
      tryAggregate: true,
    });

    let context: ContractCallContext[] = [];
    for (let token of tokens) {
      const contextObj = {
        reference: token,
        contractAddress: token,
        abi: require(`src/assets/abi/ERC20.json`),
        calls: [
          {
            reference: 'name',
            methodName: 'name',
            methodParameters: [],
          },
          {
            reference: 'symbol',
            methodName: 'symbol',
            methodParameters: [],
          },
          {
            reference: 'decimals',
            methodName: 'decimals',
            methodParameters: [],
          },
        ],
      };
      context = [...context, contextObj];
    }

    const globalResults: ContractCallResults = await multicall.call(context);
    const results = globalResults.results;

    return results;
  }

  async fetchTokenIcons(data: QueryResult, chainId: number): Promise<any> {
    const gates = data.gates;

    let tokenMap: any = {};
    for (const gate of gates) {
      for (const vault of gate.vaults) {
        const token = vault.underlying;
        if (token && !tokenMap[token]) {
          // const web3 = this.wallet.httpsWeb3(chainId);
          // const checksum = web3.utils.toChecksumAddress(token);
          // const chainName = this.constants.CHAIN_METADATA[chainId].displayName.toLowerCase();
          //
          // const trustwalletIconPath = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${chainName}/assets/${checksum}/logo.png`;
          // const localIconPath = `assets/img/tokens/${chainId}/${checksum}.png`;
          //
          // const iconPath = await fetch(localIconPath).then((response) => {
          //   return response.ok
          //     ? localIconPath
          //     : trustwalletIconPath;
          // });

          const iconPath = 'assets/img/tokens/unknown.svg';
          tokenMap[token] = iconPath;
        }
      }
    }
    return tokenMap;
  }
}

export interface Gate {
  address: string;
  vaults: Vault[];
}

export interface Vault {
  pricePerVaultShare: BigNumber;
  underlyingPriceUSD: BigNumber;
  underlying: Token;
  share: Token;
  pyt: Token;
  nyt: Token;
  xpyt: xPYT[];
}

export interface Token {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  iconPath: string;
  precision: number;
}

export interface xPYT extends Token {
  uniswapV3PoolFee: BigNumber;
  uniswapV3TwapSecondsAgo: BigNumber;
  pounderRewardMultiplier: BigNumber;
  minOutputMultiplier: BigNumber;
  conversionRate: BigNumber;
  pools: Pool[];
}

export interface Pool {
  id: string;
  fee: BigNumber;
  token0: string;
  token1: string;
  liquidity: BigNumber;
  token0Price: BigNumber;
  token1Price: BigNumber;
};

interface QueryResult {
  gates: {
    address: string;
    vaults: {
      pricePerVaultShare: string;
      underlyingPriceUSD: string;
      underlying: string;
      share: string;
      pyt: string;
      nyt: string;
      xpyt: {
        name: string;
        symbol: string;
        address: string;
        decimals: string;
        precision: string;
        conversionRate: string;
        uniswapV3PoolFee: string;
        pools: {
          id: string;
          fee: string;
          token0: string;
          token1: string;
          liquidity: string;
          token0Price: string;
          token1Price: string;
        }[];
      }[];
    }[];
  }[];
}
