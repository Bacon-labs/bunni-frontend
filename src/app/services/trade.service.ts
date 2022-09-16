import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { Vault, Token, xPYT } from 'src/app/services/gate.service';
import { SwapService } from 'src/app/services/swap.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

import { SwapRoute } from '@uniswap/smart-order-router';

@Injectable({
  providedIn: 'root',
})

// --------------------------------------------------------------------------------
// @dev priceImpact reflects the impact of the trade on the Uniswap pool. It would
// be more accurate to reflect the impact of the trade as a whole, some of which
// may not impact the price at all.
// --------------------------------------------------------------------------------
export class TradeService {

  constructor(
    public constants: ConstantsService,
    public contract: ContractService,
    public swap: SwapService,
    public wallet: WalletService,
    public util: UtilService
  ) {}

  // --------------------------------------------------------------------------------
  // @todo Fix incorrect priceImpact
  // --------------------------------------------------------------------------------
  async swapUnderlyingToNyt(vault: Vault, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    let tokenAmountOut = new BigNumber(0);

    const xpyt = this.chooseXpyt(vault); // use the xPYT with the most liquidity
    const tokenAmountIn = (await this.util.applySwapFee(amount)).dp(vault.underlying.decimals);;
    tokenAmountOut = tokenAmountOut.plus(tokenAmountIn);

    const swapAmountIn = this.convertToShares(xpyt, tokenAmountIn);
    const route = await this.swap.getUniswapRoute(xpyt, vault.nyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());
    tokenAmountOut = tokenAmountOut.plus(swapAmountOut);

    const slippageBase = tokenAmountIn;
    const afterSlippage = this.swap.afterSlippage(route, slippage);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @todo Fix incorrect priceImpact
  // --------------------------------------------------------------------------------
  async swapUnderlyingToPyt(vault: Vault, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    let tokenAmountOut = new BigNumber(0);

    const xpyt = this.chooseXpyt(vault); // use the xPYT with the most liquidity
    const tokenAmountIn = (await this.util.applySwapFee(amount)).dp(vault.underlying.decimals);;
    tokenAmountOut = tokenAmountOut.plus(tokenAmountIn);

    const swapAmountIn = tokenAmountIn;
    const route = await this.swap.getUniswapRoute(vault.nyt, xpyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());
    tokenAmountOut = tokenAmountOut.plus(this.convertToAssets(xpyt, swapAmountOut));

    const slippageBase = tokenAmountIn;
    const afterSlippage = this.swap.afterSlippage(route, slippage).times(xpyt.precision).div(xpyt.conversionRate);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @todo Fix incorrect priceImpact
  // --------------------------------------------------------------------------------
  async swapUnderlyingToXpyt(vault: Vault, xpyt: xPYT, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    let tokenAmountOut = new BigNumber(0);

    const tokenAmountIn = (await this.util.applySwapFee(amount)).dp(vault.underlying.decimals);
    tokenAmountOut = tokenAmountOut.plus(this.convertToShares(xpyt, tokenAmountIn));

    const swapAmountIn = tokenAmountIn;
    const route = await this.swap.getUniswapRoute(vault.nyt, xpyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());
    tokenAmountOut = tokenAmountOut.plus(swapAmountOut);

    const slippageBase = tokenAmountIn.times(xpyt.conversionRate).div(xpyt.precision);
    const afterSlippage = this.swap.afterSlippage(route, slippage);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @dev Uses the most liquid xPYT available, which may be suboptimal.
  // @dev If multiple liquidity pools exist for a xPYT/NYT pair, errors may occur
  // if Uniswap routes the trade across multiple pools. Needs handling.
  // --------------------------------------------------------------------------------
  async swapNytToUnderlying(vault: Vault, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    const xpyt = this.chooseXpyt(vault); // use the xPYT with the most liquidity
    const tokenAmountIn = (await this.util.applySwapFee(amount)).dp(vault.nyt.decimals);;

    const swapAmountIn = await this.juggle(vault.nyt, xpyt, tokenAmountIn, false);
    const route = await this.swap.getUniswapRoute(vault.nyt, xpyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = this.convertToAssets(xpyt, new BigNumber(route.trade.outputAmount.toFixed()));

    const remainingAmountIn = tokenAmountIn.minus(swapAmountIn);
    const tokenAmountOut = remainingAmountIn.lt(swapAmountOut)
      ? remainingAmountIn
      : swapAmountOut;

    const slippageBase = new BigNumber(0);
    const afterSlippage = this.convertToAssets(xpyt, new BigNumber(this.swap.afterSlippage(route, slippage)));

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @dev Uses the most liquid xPYT available, which may be suboptimal.
  // @dev If multiple liquidity pools exist for a xPYT/NYT pair, errors may occur
  // if Uniswap routes the trade across multiple pools. Needs handling.
  // --------------------------------------------------------------------------------
  async swapPytToUnderlying(vault: Vault, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    const xpyt = this.chooseXpyt(vault); // use the xPYT with the most liquidity
    const tokenAmountIn = (await this.util.applySwapFee(this.convertToShares(xpyt, amount))).dp(xpyt.decimals);

    const swapAmountIn = await this.juggle(vault.nyt, xpyt, tokenAmountIn, true);
    const route = await this.swap.getUniswapRoute(xpyt, vault.nyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());

    const remainingAmountIn = this.convertToAssets(xpyt, tokenAmountIn.minus(swapAmountIn));
    const tokenAmountOut = remainingAmountIn.lt(swapAmountOut)
      ? remainingAmountIn
      : swapAmountOut;

    const slippageBase = new BigNumber(0);
    const afterSlippage = this.swap.afterSlippage(route, slippage);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @dev If multiple liquidity pools exist for a xPYT/NYT pair, errors may occur
  // if Uniswap routes the trade across multiple pools. Needs handling.
  // --------------------------------------------------------------------------------
  async swapXpytToUnderlying(vault: Vault, xpyt: xPYT, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    const tokenAmountIn = (await this.util.applySwapFee(amount)).dp(xpyt.decimals);;

    const swapAmountIn = await this.juggle(vault.nyt, xpyt, tokenAmountIn, true);
    const route = await this.swap.getUniswapRoute(xpyt, vault.nyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());

    const remainingAmountIn = this.convertToAssets(xpyt, tokenAmountIn.minus(swapAmountIn));
    const tokenAmountOut = remainingAmountIn.lt(swapAmountOut)
      ? remainingAmountIn
      : swapAmountOut;

    const slippageBase = new BigNumber(0);
    const afterSlippage = this.swap.afterSlippage(route, slippage);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @dev Automatically routes the trade across multiple xPYT/NYT pools if they exist.
  // --------------------------------------------------------------------------------
  async swapNytToXpyt(nyt: Token, xpyt: xPYT, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    const tokenAmountIn = amount;

    const swapAmountIn = tokenAmountIn;
    const route = await this.swap.getUniswapRoute(nyt, xpyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());

    const tokenAmountOut = swapAmountOut;

    const slippageBase = new BigNumber(0);
    const afterSlippage = this.swap.afterSlippage(route, slippage);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @dev Automatically routes the trade across multiple xPYT/NYT pools if they exist.
  // --------------------------------------------------------------------------------
  async swapXpytToNyt(xpyt: xPYT, nyt: Token, amount: BigNumber, slippage: number, deadline: number): Promise<Trade> {
    const tokenAmountIn = amount;

    const swapAmountIn = tokenAmountIn;
    const route = await this.swap.getUniswapRoute(xpyt, nyt, swapAmountIn, slippage, deadline, 'EXACT_INPUT');
    const swapAmountOut = new BigNumber(route.trade.outputAmount.toFixed());

    const tokenAmountOut = swapAmountOut;

    const slippageBase = new BigNumber(0);
    const afterSlippage = this.swap.afterSlippage(route, slippage);

    const trade: Trade = {
      xpyt: xpyt,
      route: route,
      swapData: null,
      swapAmountIn: swapAmountIn,
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: slippageBase,
      minAmountOut: slippageBase.plus(afterSlippage),
      priceImpact: this.swap.getUniswapPriceImpact(route),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // --------------------------------------------------------------------------------
  swapPytToXpyt(xpyt: xPYT, amount: BigNumber): Trade {
    const tokenAmountIn = amount;
    const tokenAmountOut = this.convertToShares(xpyt, amount);

    const trade: Trade = {
      xpyt: xpyt,
      route: null,
      swapData: null,
      swapAmountIn: new BigNumber(0),
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: new BigNumber(0),
      minAmountOut: tokenAmountOut,
      priceImpact: new BigNumber(0),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // --------------------------------------------------------------------------------
  swapXpytToPyt(xpyt: xPYT, amount: BigNumber): Trade {
    const tokenAmountIn = amount;
    const tokenAmountOut = this.convertToAssets(xpyt, amount);

    const trade: Trade = {
      xpyt: xpyt,
      route: null,
      swapData: null,
      swapAmountIn: new BigNumber(0),
      tokenAmountOut: tokenAmountOut,
      executionPrice: tokenAmountOut.div(amount),
      slippageBase: new BigNumber(0),
      minAmountOut: tokenAmountOut,
      priceImpact: new BigNumber(0),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // --------------------------------------------------------------------------------
  async swap0x(sellToken: Token, buyToken: Token, amount: BigNumber, slippage: number) {
    const params = {
      sellToken: sellToken.address === this.constants.ETH_ADDRESS ? 'ETH' : sellToken.address,
      buyToken: buyToken.address,
      sellAmount: this.util.processWeb3Number(amount.times(sellToken.precision)),
      slippagePercentage: slippage / 10000,
    };

    const qs = require('qs');
    const response = await fetch(`https://api.0x.org/swap/v1/quote?${qs.stringify(params)}`);
    const result = await response.json();

    const trade: Trade = {
      xpyt: null,
      route: null,
      swapData: result.data,
      swapAmountIn: new BigNumber(0),
      tokenAmountOut: new BigNumber(result.buyAmount).div(buyToken.precision),
      executionPrice: new BigNumber(result.price),
      slippageBase: new BigNumber(0),
      minAmountOut: amount.times(result.guaranteedPrice),
      priceImpact: new BigNumber(result.estimatedPriceImpact).times(-1),
    };

    return trade;
  }

  // --------------------------------------------------------------------------------
  // @notice Given xPYT/NYT input, computes how much to swap to result in an equal
  // amount of PYT & NYT. Used when swapping from xPYT/PYT/NYT to Underlying.
  //
  // @dev Always uses the uniswapV3PoolFee of the xPYT to juggle between xPYT and
  // NYT. This may be suboptimal and/or cause issues with the Uniswap path when
  // multiple liquidity pools have been deployed.
  //
  // @todo Handle case when multiple liquidity pools exist.
  // @todo Handle case when uniswapV3PoolFee doesn't have a matching liquidity pool.
  // --------------------------------------------------------------------------------
  async juggle(nyt: Token, xpyt: xPYT, amount: BigNumber, useXpyt: boolean): Promise<BigNumber> {
    const web3 = this.wallet.httpsWeb3();

    const juggler = this.contract.getContract(
      this.constants.UNISWAP_V3_JUGGLER[this.wallet.chainId],
      'UniswapV3Juggler',
      web3
    );

    let juggleAmount;
    if (useXpyt) {
      juggleAmount = await juggler.methods.juggleXpytInput(
        nyt.address,
        xpyt.address,
        xpyt.uniswapV3PoolFee.toNumber(),
        this.util.processWeb3Number(amount.times(xpyt.precision)),
        '1'
      ).call();
    } else {
      juggleAmount = await juggler.methods.juggleNytInput(
        nyt.address,
        xpyt.address,
        xpyt.uniswapV3PoolFee.toNumber(),
        this.util.processWeb3Number(amount.times(nyt.precision)),
        '1'
      ).call();
    }

    return new BigNumber(juggleAmount).div(useXpyt ? xpyt.precision : nyt.precision);
  }

  // --------------------------------------------------------------------------------
  // @notice Calculates the amount of xPYT received for a given PYT input.
  // --------------------------------------------------------------------------------
  convertToShares(xpyt: xPYT, pytAmount: BigNumber): BigNumber {
    return pytAmount.times(xpyt.conversionRate).div(xpyt.precision);
  }

  // --------------------------------------------------------------------------------
  // @notice Calculates the amount of PYT received for a given xPYT input.
  // --------------------------------------------------------------------------------
  convertToAssets(xpyt: xPYT, xpytAmount: BigNumber): BigNumber {
    return xpytAmount.times(xpyt.precision).div(xpyt.conversionRate);
  }

  // --------------------------------------------------------------------------------
  // https://www.desmos.com/calculator/4lgr4yq1sj
  // --------------------------------------------------------------------------------
  calculateSlippage(slippage: number, hops: number) {
    const slip = 1 - (slippage / 10000);
    const exp = 1 / hops;
    const x = 1 - Math.pow(slip, exp);

    return x * 10000;
  }

  // --------------------------------------------------------------------------------
  // @notice Calculates total price impact for 2-hop swaps (assumes impact are negative)
  // @dev impact = impact0 - impact1 + ((impact0 * impact1) / 100)
  // --------------------------------------------------------------------------------
  calculatePriceImpact(impact0: BigNumber, impact1: BigNumber) {
    return impact0.plus(impact1).minus(impact0.times(impact1).div(100));
  }

  // --------------------------------------------------------------------------------
  // @dev Returns the xPYT with the most liquidity, which may not always be optimal.
  // If there is a single xPYT, returns that xPYT. We start the liquidity search from
  // -1 to handle the case were no pools have liquidity. Otherwise, it will return null.
  // --------------------------------------------------------------------------------
  chooseXpyt(vault: Vault): xPYT {
    if (vault.xpyt.length === 1) {
      return vault.xpyt[0];
    }

    let best;
    let liquidity = new BigNumber(-1);

    for (let xpyt of vault.xpyt) {
      for (let pool of xpyt.pools) {
        if (liquidity.lt(pool.liquidity)) {
          best = xpyt;
          liquidity = new BigNumber(pool.liquidity);
        }
      }
    }

    return best;
  }
}

export interface Trade {
  xpyt: xPYT; // the xPYT to use for the trade
  route: SwapRoute;
  swapData: string; // data from the 0x API (used for 0x swaps only)
  swapAmountIn: BigNumber; // amount of input token to be swapped by the Swapper contract
  tokenAmountOut: BigNumber; // amount of output token expected *before* slippage
  executionPrice: BigNumber; // amount of output token expected *before* slippage for a single input token
  slippageBase: BigNumber; // amount of output token uneffected by slippage
  minAmountOut: BigNumber; // minumum amount of output token expected *after* slippage
  priceImpact: BigNumber; // change in price caused by the trade
}
