import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from "@ng-bootstrap/ng-bootstrap";
import { Pool as TimelessPool } from "src/app/components/pool/pool.component";

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { Token as TimelessToken } from 'src/app/services/gate.service';
import { PermitService, Signature } from 'src/app/services/permit.service';
import { PriceService } from 'src/app/services/price.service';
import { TokenService } from 'src/app/services/token.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

import { BunniKey, BunniDepositParams, BunniWithdrawParams } from 'src/app/constants/interfaces';

import { Token, Price, Percent } from '@uniswap/sdk-core';
import { TICK_SPACINGS, Pool, Position, TickMath } from '@uniswap/v3-sdk';
import { tickToPrice, priceToClosestTick, nearestUsableTick, maxLiquidityForAmounts } from '@uniswap/v3-sdk';

import BigNumber from 'bignumber.js';

@Component({
  selector: 'app-liquidity-modal',
  templateUrl: './liquidity-modal.component.html',
  styleUrls: ['./liquidity-modal.component.scss']
})
export class LiquidityModalComponent implements OnInit {
  @Input() pool: TimelessPool;

  MIN_PRICE: number = 1;
  MAX_PRICE: number = 9;
  SPACING: number;
  XPYT: Token;
  NYT: Token;

  tab: number = 0;

  xpytUSD: BigNumber; // price of xPYT in USD
  xpytPrice: BigNumber; // amount of xPYT per NYT
  xpytAmount: BigNumber; // input amount of xPYT
  xpytBalance: BigNumber; // user balance of xPYT
  xpytAllowance: BigNumber; // user allowance of xPYT for BunniHub
  xpytSignature: Signature; // signature for BunniHub to spend xPYT

  nytUSD: BigNumber; // price of NYT in USD
  nytPrice: BigNumber; // amount of NYT per xPYT
  nytAmount: BigNumber; // input amount of NYT
  nytBalance: BigNumber; // user balance of NYT
  nytAllowance: BigNumber; // user allowance of NYT for BunniHub
  nytSignature: Signature; // signature for BunniHub to spend NYT

  xpytInput: boolean; // true if input amount was set from xPYT field
  mintPosition: Position;

  tickLower: number;
  tickUpper: number;
  priceLower: BigNumber;
  priceUpper: BigNumber;

  constructor(
    public activeModal: NgbActiveModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public permit: PermitService,
    public price: PriceService,
    public token: TokenService,
    public util: UtilService,
    public wallet: WalletService,
  ) { }

  ngOnInit(): void {
    this.resetData();
    this.loadData(true, true, this.wallet.chainId);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  resetData() {
    this.xpytUSD = new BigNumber(0);
    this.xpytPrice = new BigNumber(0);
    this.xpytAmount = new BigNumber(0);
    this.xpytBalance = new BigNumber(0);
    this.xpytAllowance = new BigNumber(0);

    this.nytUSD = new BigNumber(0);
    this.nytPrice = new BigNumber(0);
    this.nytAmount = new BigNumber(0);
    this.nytBalance = new BigNumber(0);
    this.nytAllowance = new BigNumber(0);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadData(loadUser: boolean, loadGlobal: boolean, chainId: number) {
    this.SPACING = TICK_SPACINGS[this.pool.fee.toNumber()];
    this.XPYT = new Token(this.wallet.chainId, this.pool.xpyt.address, this.pool.xpyt.decimals);
    this.NYT = new Token(this.wallet.chainId, this.pool.nyt.address, this.pool.nyt.decimals);
    this.setPrice(this.MIN_PRICE, false);
    this.setPrice(this.MAX_PRICE, true);

    if (loadUser) {
      const user = this.wallet.userAddress;
      const bunniHub = this.constants.BUNNI_HUB[chainId];

      // load xPYT
      this.token.getUserBalance(user, this.pool.xpyt).then((balance) => {
        this.xpytBalance = balance;
      });
      this.token.getUserAllowance(user, bunniHub, this.pool.xpyt).then((allowance) => {
        this.xpytAllowance = allowance
      });

      // load NYT
      this.token.getUserBalance(user, this.pool.nyt).then((balance) => {
        this.nytBalance = balance;
      });
      this.token.getUserAllowance(user, bunniHub, this.pool.nyt).then((allowance) => {
        this.nytAllowance = allowance
      });
    }

    if (loadGlobal) {
      if (this.pool.token0 === this.pool.nyt.address) {
        this.xpytPrice = new BigNumber(this.pool.token1Price);
        this.nytPrice = new BigNumber(this.pool.token0Price);
      } else {
        this.xpytPrice = new BigNumber(this.pool.token0Price);
        this.nytPrice = new BigNumber(this.pool.token1Price);
      }

      this.price.getTokenPriceUSD(this.pool.xpyt, chainId).then((price) => {
        this.xpytUSD = price;
      });

      this.price.getTokenPriceUSD(this.pool.nyt, chainId).then((price) => {
        this.nytUSD = price;
      });
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  setTick(maxPrice: boolean, incrementUp: boolean) {
    if (maxPrice) {
      this.tickUpper = this.getIncrementedTick(this.tickUpper, incrementUp);
      this.priceUpper = this.getPriceAtTick(this.tickUpper);
    } else {
      this.tickLower = this.getIncrementedTick(this.tickLower, incrementUp);
      this.priceLower = this.getPriceAtTick(this.tickLower);
    }

    this.xpytInput
      ? this.nytAmount = this.getAmount(this.xpytInput)
      : this.xpytAmount = this.getAmount(this.xpytInput);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  setPrice(price: number | string, maxPrice: boolean) {
    if (maxPrice) {
      this.tickUpper = this.getTickAtPrice(+price);
      this.priceUpper = this.getPriceAtTick(this.tickUpper);
    } else {
      this.tickLower = this.getTickAtPrice(+price);
      this.priceLower = this.getPriceAtTick(this.tickLower);
    }

    this.xpytInput
      ? this.nytAmount = this.getAmount(this.xpytInput)
      : this.xpytAmount = this.getAmount(this.xpytInput);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  setAmount(amount: string | BigNumber, xpyt: boolean) {
    if (xpyt) {
      this.xpytAmount = new BigNumber(amount);
      this.nytAmount = this.getAmount(true);
      this.xpytInput = true;
    } else {
      this.nytAmount = new BigNumber(amount);
      this.xpytAmount = this.getAmount(false);
      this.xpytInput = false;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getAmount(xpyt: boolean): BigNumber {
    if (xpyt && this.xpytAmount.lte(0)) return new BigNumber(0);
    if (!xpyt && this.nytAmount.lte(0)) return new BigNumber(0);

    const price = this.nytPrice;
    const precision = this.pool.nyt.precision;
    const xpytIsToken0 = this.pool.token0 === this.pool.xpyt.address;

    const TBase = this.XPYT;
    const TQuote = this.NYT;
    const ABase = this.util.processWeb3Number(precision);
    const AQuote = this.util.processWeb3Number(price.times(precision));

    const tick = priceToClosestTick(new Price(TBase, TQuote, ABase, AQuote));
    const tickLower = xpytIsToken0 ? this.tickLower : this.tickUpper;
    const tickUpper = xpytIsToken0 ? this.tickUpper : this.tickLower;

    const sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
    const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(tickLower);
    const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(tickUpper);

    const poolLiquidity = this.pool.liquidity.toNumber();
    const poolFee = this.pool.fee.toNumber();
    const pool = new Pool(TBase, TQuote, poolFee, sqrtRatioX96, poolLiquidity, tick);

    const amount0 = this.util.processWeb3Number(xpyt ? this.xpytAmount.times(precision) : this.constants.MAX_UINT);
    const amount1 = this.util.processWeb3Number(xpyt ? this.constants.MAX_UINT : this.nytAmount.times(precision));
    const liquidity = maxLiquidityForAmounts(
      sqrtRatioX96,
      sqrtRatioAX96,
      sqrtRatioBX96,
      xpytIsToken0 ? amount0 : amount1,
      xpytIsToken0 ? amount1 : amount0,
      true
    );

    const position = new Position({ pool: pool, liquidity: liquidity, tickLower: tickLower, tickUpper: tickUpper });
    const mintAmount0 = new BigNumber(position.mintAmounts.amount0.toString()).div(precision);
    const mintAmount1 = new BigNumber(position.mintAmounts.amount1.toString()).div(precision);

    this.mintPosition = position;

    return xpyt
      ? xpytIsToken0 ? mintAmount1 : mintAmount0
      : xpytIsToken0 ? mintAmount0 : mintAmount1;
  }

  // -----------------------------------------------------------------------
  // @notice Returns the price at a given tick.
  // @dev Assumes the provided tick value is a usable tick.
  // -----------------------------------------------------------------------
  getPriceAtTick(tick: number): BigNumber {
    return new BigNumber(tickToPrice(this.XPYT, this.NYT, tick).toSignificant());
  }

  // -----------------------------------------------------------------------
  // @notice Returns the nearest usable tick at a given price.
  // -----------------------------------------------------------------------
  getTickAtPrice(price: number): number {
    const precision = this.pool.nyt.precision;
    const derivedPrice = new Price(this.XPYT, this.NYT, precision, price * precision);

    return nearestUsableTick(priceToClosestTick(derivedPrice), this.SPACING);
  }

  // -----------------------------------------------------------------------
  // @notice Returns a new tick value based on the pool spacing.
  // @dev Assumes the provided tick value is a usable tick.
  // -----------------------------------------------------------------------
  getIncrementedTick(tick: number, incrementUp: boolean): number {
    const xpytIsToken0 = this.pool.token0 === this.pool.xpyt.address;

    const tickUp: number = xpytIsToken0 ? tick + this.SPACING : tick - this.SPACING;
    const tickDown: number = xpytIsToken0 ? tick - this.SPACING : tick + this.SPACING;

    return incrementUp ? tickUp : tickDown;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  switchTab(tab: number) {
    this.tab = tab;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  nytApproved(): boolean {
    return this.nytAllowance.gte(this.nytAmount) ||
      this.isSignatureValid(this.pool.nyt, this.constants.BUNNI_HUB[this.wallet.chainId], this.nytAmount, false);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  xpytApproved(): boolean {
    return this.xpytAllowance.gte(this.xpytAmount) ||
      this.isSignatureValid(this.pool.xpyt, this.constants.BUNNI_HUB[this.wallet.chainId], this.xpytAmount, true);
  }

  // -----------------------------------------------------------------------
  // @todo check for amounts
  // -----------------------------------------------------------------------
  canDeposit(): boolean {
    return this.nytAmount.gt(0) &&
      this.xpytAmount.gt(0) &&
      this.nytApproved() &&
      this.xpytApproved();
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  depositMessage(): string {
    if (this.nytAmount.lte(0) || this.xpytAmount.lte(0)) {
      return "Enter an Amount";
    } else if (this.xpytAmount.gt(this.xpytBalance)) {
      return "Insufficient xPYT Balance";
    } else if (this.nytAmount.gt(this.nytBalance)) {
      return "Insufficient NYT Balance";
    } else if (!this.xpytApproved()) {
      return "Approve xPYT";
    } else if (!this.nytApproved()) {
      return "Approve NYT";
    } else {
      return "Deposit";
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async approve(xpyt: boolean) {
    const signature = await this.permit.permit(
      xpyt ? this.pool.xpyt : this.pool.nyt,
      this.constants.BUNNI_HUB[this.wallet.chainId],
      xpyt ? this.xpytAmount : this.nytAmount,
      Math.floor(Date.now() / 1000) + 3600 // @todo make settable by user
    );

    xpyt ? this.xpytSignature = signature : this.nytSignature = signature;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  isSignatureValid(token: TimelessToken, spender: string, amount: BigNumber, xpyt: boolean): boolean {
    const value = this.util.processWeb3Number(amount.times(token.precision));
    const signature = xpyt ? this.xpytSignature : this.nytSignature;

    return !!signature &&
      signature.owner === this.wallet.userAddress &&
      signature.spender === spender &&
      signature.tokenAddress === token.address &&
      signature.deadline >= Math.floor(Date.now() / 1e3) &&
      (signature.allowed || signature.amount === value);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async deposit() {
    const web3 = this.wallet.web3;
    const bunniHub = this.constants.BUNNI_HUB[this.wallet.chainId];
    const bunniHubContract = this.contract.getContract(bunniHub, 'BunniHub', web3);

    const precision = this.pool.nyt.precision;
    const xpytIsToken0 = this.pool.token0 === this.pool.xpyt.address;

    const bunniKey: BunniKey = {
      pool: this.pool.address,
      tickLower: xpytIsToken0 ? this.tickLower : this.tickUpper,
      tickUpper: xpytIsToken0 ? this.tickUpper : this.tickLower
    };

    let calls = [];

    // BunniToken deploy
    const bunniToken = await bunniHubContract.methods.getBunniToken(bunniKey).call();
    if (bunniToken === this.constants.ZERO_ADDRESS) {
      const deploy = bunniHubContract.methods.deployBunniToken(bunniKey);
      calls = [...calls, deploy.encodeABI()];
    }

    // NYT permit
    if (this.isSignatureValid(this.pool.nyt, bunniHub, this.nytAmount, false)) {
      const permit = bunniHubContract.methods.selfPermitIfNecessary(
        this.nytSignature.tokenAddress,
        this.nytSignature.amount,
        this.nytSignature.deadline,
        this.nytSignature.v,
        this.nytSignature.r,
        this.nytSignature.s
      );
      calls = [...calls, permit.encodeABI()];
    }

    // XPYT permit
    if (this.isSignatureValid(this.pool.xpyt, bunniHub, this.xpytAmount, true)) {
      const permit = bunniHubContract.methods.selfPermitIfNecessary(
        this.xpytSignature.tokenAddress,
        this.xpytSignature.amount,
        this.xpytSignature.deadline,
        this.xpytSignature.v,
        this.xpytSignature.r,
        this.xpytSignature.s
      );
      calls = [...calls, permit.encodeABI()];
    }

    // Deposit
    const amount0Desired = xpytIsToken0 ? this.xpytAmount : this.nytAmount;
    const amount1Desired = xpytIsToken0 ? this.nytAmount : this.xpytAmount;

    const slippage = new Percent(50, 10000); // @todo make settable by user
    const mintAmountsWithSlippage = this.mintPosition.mintAmountsWithSlippage(slippage);
    const amount0Min = new BigNumber(mintAmountsWithSlippage.amount0.toString());
    const amount1Min = new BigNumber(mintAmountsWithSlippage.amount1.toString());

    const bunniDepositParams: BunniDepositParams = {
      key: bunniKey,
      amount0Desired: this.util.processWeb3Number(amount0Desired.times(precision)),
      amount1Desired: this.util.processWeb3Number(amount1Desired.times(precision)),
      amount0Min: this.util.processWeb3Number(amount0Min),
      amount1Min: this.util.processWeb3Number(amount1Min),
      deadline: Math.floor(Date.now() / 1000 + 3600), // @todo make settable by user
      recipient: this.wallet.userAddress,
    };

    const deposit = bunniHubContract.methods.deposit(bunniDepositParams);
    calls = [...calls, deposit.encodeABI()];

    const func = bunniHubContract.methods.multicall(calls);

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {
          this.xpytSignature = null;
          this.nytSignature = null;
        },
        () => {}
      )
      .catch((error) => {
        console.error(error);
      });
  }
}
