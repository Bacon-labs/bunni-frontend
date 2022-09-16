import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';

import { ConstantsService } from 'src/app/services/constants.service';
import { WalletService } from 'src/app/services/wallet.service';

import { ethers } from 'ethers';
import { CurrencyAmount, Token, TradeType, Percent } from '@uniswap/sdk-core';

import { AlphaRouter, SwapRoute } from '@uniswap/smart-order-router';
import { Pair } from '@uniswap/v2-sdk';
import { Pool } from '@uniswap/v3-sdk';

@Injectable({
  providedIn: 'root',
})
export class SwapService {
  constructor(
    public constants: ConstantsService,
    public wallet: WalletService
  ) {}

  // -----------------------------------------------------------------------
  // @dev The Uniswap SDK required etheres.js so it is used here instead of
  // web3.js. https://docs.uniswap.org/sdk/guides/auto-router
  //
  // @bug
  // -----------------------------------------------------------------------
  async getUniswapRoute(
    fromToken: Asset,
    toToken: Asset,
    amount: BigNumber,
    slippage: number,
    deadline: number,
    type: string
  ): Promise<SwapRoute> {
    const rpc = this.constants.RPC[this.wallet.chainId];
    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const router = new AlphaRouter({
      chainId: this.wallet.chainId,
      provider: provider,
    });

    const FROM = new Token(
      this.wallet.chainId,
      fromToken.address,
      Math.round(Math.log(fromToken.precision) / Math.log(10)),
      fromToken.symbol,
      fromToken.name
    );

    const TO = new Token(
      this.wallet.chainId,
      toToken.address,
      Math.round(Math.log(toToken.precision) / Math.log(10)),
      toToken.symbol,
      toToken.name
    );

    const rawAmount = amount
      .times(type === 'EXACT_INPUT' ? fromToken.precision : toToken.precision)
      .toFixed();
    const parsedAmount = CurrencyAmount.fromRawAmount(
      type === 'EXACT_INPUT' ? FROM : TO,
      rawAmount
    );

    const route: SwapRoute = await router.route(
      parsedAmount,
      type === 'EXACT_INPUT' ? TO : FROM,
      TradeType[type],
      {
        recipient: this.wallet.userAddress ? this.wallet.userAddress : this.constants.ZERO_ADDRESS,
        slippageTolerance: new Percent(slippage, 10000),
        deadline: Math.floor(Date.now() / 1000 + deadline),
      }
    );
    return route;
  }

  // -----------------------------------------------------------------------
  // @dev The priceImpact returned in the SwapRoute object is represented as
  // a magnitude and includes the fee.
  // https://github.com/Uniswap/interface/blob/e5a1cb42769c8e1f5d5bd6dee5126e0c2965fa90/src/components/swap/AdvancedSwapDetails.tsx
  // -----------------------------------------------------------------------
  getUniswapPriceImpact(route: SwapRoute): BigNumber {
    const priceImpact = new BigNumber(route.trade.priceImpact.toFixed());
    const fee = this.getUniswapFee(route);
    return priceImpact.minus(fee.div(10000)).times(-1);
  }

  // -----------------------------------------------------------------------
  // https://github.com/Uniswap/interface/blob/e5a1cb42769c8e1f5d5bd6dee5126e0c2965fa90/src/utils/prices.ts
  //
  // @return The fee in bps * 100 (1% = 10000)
  // -----------------------------------------------------------------------
  getUniswapFee(route: SwapRoute): BigNumber {
    const ONE_HUNDRED_PERCENT = new BigNumber(1000000);

    if (route.trade.swaps[0].route.pools instanceof Pair) {
      console.log('V2 Swap: Needs Implementation.');
      return new BigNumber(0);
    } else {
      let fee = new BigNumber(0);

      const trade = route.trade;
      for (const swap of route.trade.swaps) {
        const percent = new BigNumber(swap.inputAmount.toFixed()).div(trade.inputAmount.toFixed());

        let currentFee = ONE_HUNDRED_PERCENT;
        for (let pool of swap.route.pools) {
          pool = pool as Pool;
          const poolFee = new BigNumber(pool.fee);
          const fraction = ONE_HUNDRED_PERCENT.minus(poolFee).div(ONE_HUNDRED_PERCENT);
          currentFee = currentFee.times(fraction);
        }
        fee = fee.plus(percent.times(ONE_HUNDRED_PERCENT.minus(currentFee)));
      }

      return fee;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  afterSlippage(route: SwapRoute, slippage: any): BigNumber {
    const tradeType = route.trade.tradeType;
    const afterSlippage =
      tradeType === 0
        ? route.trade.minimumAmountOut(new Percent(slippage, 10000))
        : route.trade.maximumAmountIn(new Percent(slippage, 10000));
    return new BigNumber(afterSlippage.toFixed());
  }
}

export interface Asset {
  name: string;
  symbol: string;
  address: string;
  iconPath: string;
  precision: number;
}
