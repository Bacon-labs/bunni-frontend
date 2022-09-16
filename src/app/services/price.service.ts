import { Injectable, NgZone } from '@angular/core';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Vault, Token, xPYT } from 'src/app/services/gate.service';
import { WalletService } from 'src/app/services/wallet.service';

@Injectable({
  providedIn: 'root',
})
export class PriceService {
  tokenPriceUSD: any = {};

  constructor(
    public constants: ConstantsService,
    public contract: ContractService,
    public gate: GateService,
    public wallet: WalletService,
    public zone: NgZone
  ) {
    this.loadTokenPricesUSD(this.wallet.chainId);
    this.wallet.chainChangedEvent.subscribe((chainId) => {
      this.zone.run(() => {
        this.loadTokenPricesUSD(chainId);
      });
    });
  }

  // -----------------------------------------------------------------------
  // @notice Loads the price of all Vault assets and caches them.
  // @dev Called on init and chain change.
  // -----------------------------------------------------------------------
  async loadTokenPricesUSD(chainId: number) {
    if (!this.tokenPriceUSD[chainId]) {
      this.tokenPriceUSD[chainId] = {};
    }

    const vaults: Vault[] = await this.gate.getVaultList(chainId);
    await vaults.map((vault: Vault) => {
      if (vault.underlying) {
        this.tokenPriceUSD[chainId][vault.underlying.address] = this.getUnderlyingPriceUSD(vault);
      }

      if (vault.share) {
        this.tokenPriceUSD[chainId][vault.share.address] = this.getSharePriceUSD(vault);
      }

      if (vault.xpyt.length > 0) {
        vault.xpyt.map((xpyt) => {
          this.tokenPriceUSD[chainId][xpyt.address] = this.getXpytPriceUSD(xpyt, vault);
        });
      }

      if (vault.pyt) {
        this.tokenPriceUSD[chainId][vault.pyt.address] = this.getPytPriceUSD(vault);
      }

      if (vault.nyt) {
        this.tokenPriceUSD[chainId][vault.nyt.address] = this.getNytPriceUSD(vault);
      }

    });
  }

  // -----------------------------------------------------------------------
  // @notice Fetches the USD price of a Token to 6 decimals of precision.
  // @dev If a Token does not exist in a Vault, we revert to querying the price
  // directly from Yearn's price oracle.
  // -----------------------------------------------------------------------
  async getTokenPriceUSD(token: Token, chainId: number): Promise<BigNumber> {
    let tokenPrice = this.tokenPriceUSD[chainId][token.address];
    if (!tokenPrice) {
      const web3 = this.wallet.httpsWeb3(chainId);
      const oracle = this.contract.getContract(this.constants.YEARN_PRICE_ORACLE[chainId], 'YearnPriceOracle', web3);
      if (oracle.options.address) {
        tokenPrice = await oracle.methods.getPriceUsdcRecommended(token.address).call()
          .then((result) => {
            return new BigNumber(result).div(1e6);
          });
      } else {
        tokenPrice = new BigNumber(0);
      }
      this.tokenPriceUSD[chainId][token.address] = tokenPrice;
    }
    return tokenPrice;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUnderlyingPriceUSD(vault: Vault): BigNumber {
    if (!vault.underlying) {
      return new BigNumber(0);
    }

    return new BigNumber(vault.underlyingPriceUSD);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getSharePriceUSD(vault: Vault): BigNumber {
    if (!vault.share) {
      return new BigNumber(0);
    }

    const underlyingPriceUSD = this.getUnderlyingPriceUSD(vault);
    return new BigNumber(vault.pricePerVaultShare).div(1e27).times(underlyingPriceUSD).dp(6);
  }

  // -----------------------------------------------------------------------
  // @notice 1 XPYT = 1 / (K + L) Underlying
  // -----------------------------------------------------------------------
  getXpytPriceUSD(xpyt: xPYT, vault: Vault): BigNumber {
    if (!xpyt) {
      return new BigNumber(0);
    }

    const K = this.getK(xpyt);
    const L = this.getL(xpyt);
    const underlyingPriceUSD = this.getUnderlyingPriceUSD(vault);

    return new BigNumber(1).div(K.plus(L)).times(underlyingPriceUSD).dp(6);
  }

  // -----------------------------------------------------------------------
  // @notice 1 PYT = K / (K + L) Underlying
  // @dev Calculates price based on the first xPYT in the xPYT array.
  // -----------------------------------------------------------------------
  getPytPriceUSD(vault: Vault): BigNumber {
    if (!vault.pyt) {
      return new BigNumber(0);
    }

    const K = this.getK(vault.xpyt[0]);
    const L = this.getL(vault.xpyt[0]);
    const underlyingPriceUSD = this.getUnderlyingPriceUSD(vault);

    return K.div(K.plus(L)).times(underlyingPriceUSD).dp(6);
  }

  // -----------------------------------------------------------------------
  // @notice 1 NYT = L / (K + L) Underlying
  // @dev Calculates price based on the first xPYT in the xPYT array.
  // -----------------------------------------------------------------------
  getNytPriceUSD(vault: Vault): BigNumber {
    if (!vault.nyt) {
      return new BigNumber(0);
    }

    const K = this.getK(vault.xpyt[0]);
    const L = this.getL(vault.xpyt[0]);
    const underlyingPriceUSD = this.getUnderlyingPriceUSD(vault);

    return L.div(K.plus(L)).times(underlyingPriceUSD).dp(6);
  }

  // -----------------------------------------------------------------------
  // @notice K represents the exchange rate between PYT and xPYT. 1 PYT = K xPYT.
  // @dev If xPYT has not been deployed, implicitly K = 1.
  // -----------------------------------------------------------------------
  getK(xpyt: xPYT): BigNumber {
    if (!xpyt) {
      return new BigNumber(1);
    }

    return xpyt.conversionRate.div(xpyt.precision);
  }

  // -----------------------------------------------------------------------
  // @notice L represents the spot exchange rate between NYT and xPYT. 1 NYT = L xPYT.
  // @dev If no trading pools have been deployed, implicitly L = K.
  //
  // @dev Calculates L based on the first pool in the pool array.
  // @todo Handle scenario when there are multiple trading pools deployed.
  // -----------------------------------------------------------------------
  getL(xpyt: xPYT): BigNumber {
    if (!xpyt || xpyt.pools.length == 0) {
      return this.getK(xpyt);
    }

    return xpyt.address === xpyt.pools[0].token0
      ? new BigNumber(xpyt.pools[0].token0Price)
      : new BigNumber(xpyt.pools[0].token1Price)
  }
}
