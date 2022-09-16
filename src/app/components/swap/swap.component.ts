import { Component, OnInit, NgZone } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SwapRoute } from '@uniswap/smart-order-router';
import BigNumber from 'bignumber.js';

import { TokenSelectModalComponent } from 'src/app/modals/token-select-modal/token-select-modal.component';
import { WalletConnectModalComponent } from 'src/app/modals/wallet-connect-modal/wallet-connect-modal.component';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Vault, Token, xPYT } from 'src/app/services/gate.service';
import { PermitService } from 'src/app/services/permit.service';
import { PriceService } from 'src/app/services/price.service';
import { SwapService } from 'src/app/services/swap.service';
import { TradeService, Trade } from 'src/app/services/trade.service';
import { TokenService } from 'src/app/services/token.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-swap',
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss'],
})
export class SwapComponent implements OnInit {
  DEFAULT_FEE_TIER = 10000;

  user: string;
  spender: string; // the contract address that needs approval
  timeout: any;

  useEther: boolean;
  fromVault: Vault;
  fromToken: Token;
  fromPrice: BigNumber;
  fromAmount: BigNumber;
  fromBalance: BigNumber;
  fromAllowance: BigNumber;

  toVault: Vault;
  toToken: Token;
  toPrice: BigNumber;
  toAmount: BigNumber;
  toBalance: BigNumber;
  toAllowance: BigNumber;

  slippage: number; // basis points (100bps = 1%)
  deadline: number; // seconds
  loading: boolean;
  trade: Trade;
  trades: Trade[]; // used for 0x swaps only

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public gateService: GateService,
    public permit: PermitService,
    public price: PriceService,
    public swapService: SwapService,
    public tradeService: TradeService,
    public tokenService: TokenService,
    public util: UtilService,
    public wallet: WalletService,
    public zone: NgZone
  ) {}

  ngOnInit(): void {
    this.resetData(true, true, this.wallet.chainId);
    this.loadData(this.wallet.connected, true, this.wallet.chainId);

    this.wallet.connectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false, this.wallet.chainId);
        this.loadData(true, false, this.wallet.chainId);
      });
    });

    this.wallet.disconnectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false, this.wallet.chainId);
        this.loadData(false, false, this.wallet.chainId);
      });
    });

    this.wallet.chainChangedEvent.subscribe((chainId) => {
      this.zone.run(() => {
        this.resetData(true, true, chainId);
        this.loadData(this.wallet.connected, true, chainId);
      });
    });

    this.wallet.accountChangedEvent.subscribe((account) => {
      this.zone.run(() => {
        this.resetData(true, false, this.wallet.chainId);
        this.loadData(true, false, this.wallet.chainId);
      });
    });
  }

  // -----------------------------------------------------------------------
  // TODO: Check that variables are being reset correctly.
  // -----------------------------------------------------------------------
  resetData(resetUser: boolean, resetGlobal: boolean, chainId: number) {
    if (resetUser) {
      this.user = '';

      this.useEther = false;
      this.fromAmount = new BigNumber(0);
      this.fromBalance = new BigNumber(0);
      this.fromAllowance = new BigNumber(0);

      this.toAmount = new BigNumber(0);
      this.toBalance = new BigNumber(0);
      this.toAllowance = new BigNumber(0);

      this.slippage = 100; // 1%
      this.deadline = 1800; // 30 minutes
      this.loading = false;
    }

    if (resetGlobal) {
      const vaults = this.gateService.getDefaultVaultList(chainId);
      this.fromVault = vaults[0];
      this.fromPrice = new BigNumber(0);
      this.setFrom(vaults[0].underlying);

      this.toVault = vaults[0];
      this.toPrice = new BigNumber(0);
      this.setTo(vaults[0].xpyt[0]);
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadData(loadUser: boolean, loadGlobal: boolean, chainId: number) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;

    this.user = this.wallet.userAddress;

    if (loadGlobal) {
      const vaults = await this.gateService.getVaultList(chainId);
      const vault = vaults.find((vault) => vault.xpyt.length > 0 && vault.xpyt.find((xpyt) => xpyt.pools.find((pool) => pool.liquidity.gt(0))));
      this.setFrom(vault.underlying);
      this.setTo(vault.xpyt[0]);
    }

    if (loadUser) {
      if (this.fromToken) {
        this.tokenService
          .getUserBalance(this.user, this.fromToken)
          .then((balance) => {
            this.fromBalance = balance;
          });
      }

      if (this.toToken) {
        this.tokenService
          .getUserBalance(this.user, this.toToken)
          .then((balance) => {
            this.toBalance = balance;
          });
      }
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async switch() {
    const fromToken = this.fromToken;
    const toToken = this.toToken;

    [this.fromVault, this.toVault] = [this.toVault, this.fromVault];
    this.fromAmount = this.toAmount;
    this.setFrom(toToken);
    this.setTo(fromToken);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async setFrom(token: Token) {
    this.fromToken = token;
    this.useEther = token.address === this.constants.ETH_ADDRESS ? true : false;
    this.setFromAmount(this.fromAmount);

    this.fromPrice = new BigNumber(0);
    this.price.getTokenPriceUSD(token, this.wallet.chainId).then((price) => {
      this.fromPrice = new BigNumber(price);
    });

    if (this.user) {
      this.fromBalance = new BigNumber(0);
      this.tokenService.getUserBalance(this.user, token).then((balance) => {
        this.fromBalance = balance;
      });
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  setFromAmount(amount: string | number | BigNumber) {
    this.fromAmount = new BigNumber(amount);
    if (this.fromAmount.isNaN()) {
      this.fromAmount = new BigNumber(0);
    }

    if (this.fromAmount.gt(0)) {
      this.loading = true;
      clearTimeout(this.timeout);
      this.timeout = setTimeout(async () => {
        this.toAmount = await this.getToAmount();
      }, 500);
    } else {
      this.toAmount = new BigNumber(0);
    }
  }

  // -----------------------------------------------------------------------
  // @dev toToken cannot be ETH unless fromToken is WETH
  // -----------------------------------------------------------------------
  async setTo(token: Token) {
    if (token.address === this.constants.ETH_ADDRESS && !this.tokenService.isWETH(this.fromToken)) {
      this.useEther = false;
      token = this.tokenService.WETH[this.wallet.chainId];
      this.toVault = await this.gateService.getTokenVault(token, this.wallet.chainId);
    }

    if (!this.fromVault || this.fromToken.address === this.fromVault.underlying.address) {
      // fromToken is underlying
      if (!this.wallet.supports0x && (this.fromVault && this.toVault && this.toVault.share.address !== this.fromVault.share.address)) {
        token = this.fromVault.xpyt[0];
      }
    } else {
      // fromToken is NOT underlying
      if (!this.toVault || this.toVault.share.address !== this.fromVault.share.address) {
        token = this.fromVault.underlying;
        this.toVault = await this.gateService.getTokenVault(token, this.wallet.chainId);
      }
    }

    this.toToken = token;

    this.toAmount = new BigNumber(0);
    this.setFromAmount(this.fromAmount);

    this.toPrice = new BigNumber(0);
    this.price.getTokenPriceUSD(token, this.wallet.chainId).then((price) => {
      this.toPrice = new BigNumber(price);
    });

    if (this.user) {
      this.toBalance = new BigNumber(0);
      this.tokenService.getUserBalance(this.user, token).then((balance) => {
        this.toBalance = balance;
      });
    }
  }

  // -----------------------------------------------------------------------
  // @notice Calculates the tokenAmountOut for each trade type.
  //
  // @todo Refresh regularly in case price moves.
  // -----------------------------------------------------------------------
  async getToAmount(): Promise<BigNumber> {
    const fromType = await this.getTokenType(this.fromToken);
    const toType = await this.getTokenType(this.toToken);
    const vault = await this.vaultMatch(fromType, toType);

    this.trades = [];

    if (vault) {
      if (fromType === 'xpyt' && toType === 'nyt') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_ROUTER[this.wallet.chainId];
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapXpytToNyt(
          this.fromToken as xPYT,
          this.toToken,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'nyt' && toType === 'xpyt') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_ROUTER[this.wallet.chainId];
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapNytToXpyt(
          this.fromToken,
          this.toToken as xPYT,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'underlying' && toType === 'xpyt') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
        this.useEther ? null : this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapUnderlyingToXpyt(
          vault,
          this.toToken as xPYT,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'underlying' && toType === 'pyt') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
        this.useEther ? null : this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapUnderlyingToPyt(
          vault,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'underlying' && toType === 'nyt') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
        this.useEther ? null : this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapUnderlyingToNyt(
          vault,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'xpyt' && toType === 'underlying') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapXpytToUnderlying(
          vault,
          this.fromToken as xPYT,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'pyt' && toType === 'underlying') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapPytToUnderlying(
          vault,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'nyt' && toType === 'underlying') {
        // set the spender and fetch approval
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = await this.tradeService.swapNytToUnderlying(
          vault,
          this.fromAmount,
          this.slippage,
          this.deadline
        );
      } else if (fromType === 'pyt' && toType === 'xpyt') {
        // set the spender and fetch approval
        this.spender = this.toToken.address; // spender is the xPYT contract
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken); // this doesn't really matter?

        this.trade = this.tradeService.swapPytToXpyt(
          this.toToken as xPYT,
          this.fromAmount
        );
      } else if (fromType === 'xpyt' && toType === 'pyt') {
        // set the spender and fetch approval
        this.spender = this.fromToken.address; // spender is the xPYT contract
        this.getUserAllowance(this.spender, this.fromToken);
        this.getUserAllowance(this.spender, this.toToken);

        this.trade = this.tradeService.swapXpytToPyt(
          this.fromToken as xPYT,
          this.fromAmount
        );
      } else {
        console.error('Trade: single-vault (more advanced handling is needed)');
      }
    } else {
      // set the spender and fetch approval (it will always be the Swapper contract)
      if (
        this.tokenService.isETH(this.fromToken) && this.tokenService.isWETH(this.toToken) ||
        this.tokenService.isWETH(this.fromToken) && this.tokenService.isETH(this.toToken)
      ) {
        this.spender = this.constants.WETH[this.wallet.chainId];
      } else {
        this.spender = this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId];
      }
      this.useEther ? null : this.getUserAllowance(this.spender, this.fromToken);
      this.tokenService.isETH(this.toToken) ? null : this.getUserAllowance(this.spender, this.toToken);

      const toVault = await this.gateService.getTokenVault(this.toToken, this.wallet.chainId);

      if (fromType === 'underlying' && toType === 'underlying') {
        if (
          this.tokenService.isETH(this.fromToken) && this.tokenService.isWETH(this.toToken) ||
          this.tokenService.isWETH(this.fromToken) && this.tokenService.isETH(this.toToken)
        ) {
          this.trade = {
            xpyt: null,
            route: null,
            swapData: null,
            swapAmountIn: new BigNumber(0),
            tokenAmountOut: this.fromAmount,
            executionPrice: new BigNumber(1),
            slippageBase: new BigNumber(0),
            minAmountOut: new BigNumber(1),
            priceImpact: new BigNumber(0)
          };
        } else {
          this.trade = await this.tradeService.swap0x(
            this.useEther ? this.tokenService.WETH[this.wallet.chainId] : this.fromToken,
            this.toToken,
            this.fromAmount,
            this.slippage
          );
        }
      } else if (fromType === 'underlying' && toType === 'xpyt') {
        const slippage = Math.round(this.tradeService.calculateSlippage(this.slippage, 2));
        const trade0 = await this.tradeService.swap0x(this.useEther ? this.tokenService.WETH[this.wallet.chainId] : this.fromToken, toVault.underlying, this.fromAmount, slippage);
        const trade1 = await this.tradeService.swapUnderlyingToXpyt(toVault, this.toToken as xPYT, trade0.tokenAmountOut, slippage, this.deadline);
        const trade2 = await this.tradeService.swapUnderlyingToXpyt(toVault, this.toToken as xPYT, trade0.minAmountOut, slippage, this.deadline);

        this.trade = {
          xpyt: trade1.xpyt,
          route: null,
          swapData: trade0.swapData,
          swapAmountIn: new BigNumber(0), // currently unused for 0x swaps
          tokenAmountOut: trade1.tokenAmountOut,
          executionPrice: trade1.tokenAmountOut.div(this.fromAmount),
          slippageBase: new BigNumber(0), // currently unused for 0x swaps
          minAmountOut: trade2.minAmountOut,
          priceImpact: this.tradeService.calculatePriceImpact(trade0.priceImpact, trade1.priceImpact),
        };
        this.trades = [...this.trades, trade0, trade1, trade2];
      } else if (fromType === 'underlying' && toType === 'pyt') {
        const slippage = Math.round(this.tradeService.calculateSlippage(this.slippage, 2));
        const trade0 = await this.tradeService.swap0x(this.useEther ? this.tokenService.WETH[this.wallet.chainId] : this.fromToken, toVault.underlying, this.fromAmount, slippage);
        const trade1 = await this.tradeService.swapUnderlyingToPyt(toVault, trade0.tokenAmountOut, slippage, this.deadline);
        const trade2 = await this.tradeService.swapUnderlyingToPyt(toVault, trade0.minAmountOut, slippage, this.deadline);

        this.trade = {
          xpyt: trade1.xpyt,
          route: null,
          swapData: trade0.swapData,
          swapAmountIn: new BigNumber(0), // currently unused for 0x swaps
          tokenAmountOut: trade1.tokenAmountOut,
          executionPrice: trade1.tokenAmountOut.div(this.fromAmount),
          slippageBase: new BigNumber(0), // currently unused for 0x swaps
          minAmountOut: trade2.minAmountOut,
          priceImpact: this.tradeService.calculatePriceImpact(trade0.priceImpact, trade1.priceImpact),
        };
        this.trades = [...this.trades, trade0, trade1, trade2];
      } else if (fromType === 'underlying' && toType === 'nyt') {
        const slippage = Math.round(this.tradeService.calculateSlippage(this.slippage, 2));
        const trade0 = await this.tradeService.swap0x(this.useEther ? this.tokenService.WETH[this.wallet.chainId] : this.fromToken, toVault.underlying, this.fromAmount, slippage);
        const trade1 = await this.tradeService.swapUnderlyingToNyt(toVault, trade0.tokenAmountOut, slippage, this.deadline);
        const trade2 = await this.tradeService.swapUnderlyingToNyt(toVault, trade0.minAmountOut, slippage, this.deadline);

        this.trade = {
          xpyt: trade1.xpyt,
          route: null,
          swapData: trade0.swapData,
          swapAmountIn: new BigNumber(0), // currently unused for 0x swaps
          tokenAmountOut: trade1.tokenAmountOut,
          executionPrice: trade1.tokenAmountOut.div(this.fromAmount),
          slippageBase: new BigNumber(0), // currently unused for 0x swaps
          minAmountOut: trade2.minAmountOut,
          priceImpact: this.tradeService.calculatePriceImpact(trade0.priceImpact, trade1.priceImpact),
        };
        this.trades = [...this.trades, trade0, trade1, trade2];
      }
    }

    this.loading = false;
    return this.trade.tokenAmountOut.dp(this.toToken.decimals);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUserAllowance(spender: string, token: Token) {
    if (!this.user) return;

    this.tokenService
      .getUserAllowance(this.user, spender, token)
      .then((allowance) => {
        token === this.fromToken
          ? (this.fromAllowance = allowance)
          : (this.toAllowance = allowance);
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async openTokenSelectModal(from: boolean, to: boolean) {
    const modalRef = this.modalService.open(TokenSelectModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
    modalRef.componentInstance.tokenType = ['underlying', 'xpyt', 'pyt', 'nyt'];
    modalRef.componentInstance.checkPools = true;
    modalRef.componentInstance.checkLiquidity = true;
    modalRef.componentInstance.allowEther = from || this.tokenService.isWETH(this.fromToken) ? true : false;

    const selectedToken = from ? this.fromToken : this.toToken;
    modalRef.componentInstance.selectedToken = selectedToken;

    const restrictedToken = from ? this.toToken : this.fromToken;
    const restrictedTokens: Token[] = [];

    const vault = await this.gateService.getTokenVault(
      restrictedToken,
      this.wallet.chainId
    );

    const fromType = await this.getTokenType(this.fromToken);
    modalRef.componentInstance.allowDefaultTokens = from || fromType == 'underlying' ? true : false;
    if (to && !!fromType.match(/^(xpyt|pyt|nyt)$/)) {
      const fromVault = await this.gateService.getTokenVault(this.fromToken, this.wallet.chainId);
      modalRef.componentInstance.allowedVault = fromVault;
    }

    if (vault && restrictedToken.address === vault.pyt.address) {
      restrictedTokens.push(vault.nyt);
    } else if (vault && restrictedToken.address === vault.nyt.address) {
      restrictedTokens.push(vault.pyt);
    }

    modalRef.componentInstance.restrictedTokens = restrictedTokens;

    modalRef.componentInstance.selectEvent.subscribe(async (selection) => {
      if (from) {
        if (selection.token.address === this.toToken.address) {
          this.switch();
        } else if (this.tokenService.isETH(this.toToken) && !this.tokenService.isWETH(selection.token)) {
          this.fromVault = selection.vault;
          this.setFrom(selection.token);
          this.setTo(this.tokenService.WETH[this.wallet.chainId]);
        } else {
          this.fromVault = selection.vault;
          this.setFrom(selection.token);
          this.setTo(this.toToken);
        }
      }

      if (to) {
        if (selection.token.address === this.fromToken.address) {
          this.switch();
        } else {
          this.toVault = selection.vault;
          this.setTo(selection.token);
        }
      }
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  openWalletModal(): void {
    const modalRef = this.modalService.open(WalletConnectModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  swapMessage(): string {
    if (this.fromAmount.eq(0)) {
      return 'Enter an Amount';
    } else if (this.fromAmount.gt(this.fromBalance)) {
      return 'Insufficient ' + this.fromToken.symbol + ' Balance';
    } else if (
      this.fromAmount.gt(this.fromAllowance) &&
      this.spender !== this.constants.WETH[this.wallet.chainId] &&
      !this.permit.isSignatureValid(this.fromToken, this.spender, this.fromAmount) &&
      !this.useEther
    ) {
      return 'Approve';
    } else {
      return 'Swap';
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  canSwap(): boolean {
    return this.fromAmount.gt(0) && this.fromAmount.lte(this.fromBalance);
  }

  // -----------------------------------------------------------------------
  // @todo If using selfPermit, match the deadline to the signature deadline.
  // -----------------------------------------------------------------------
  async swap() {
    const fromType = await this.getTokenType(this.fromToken);
    const toType = await this.getTokenType(this.toToken);
    const vault = await this.vaultMatch(fromType, toType);
    const web3 = this.wallet.web3;

    let swapper;
    let permit;
    let convert;
    let swaps = [];

    if (vault) {
      const gate = await this.gateService.getVaultGate(
        vault,
        this.wallet.chainId
      );
      if (fromType === 'xpyt' && toType === 'nyt') {
        // use the Uniswap router contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_ROUTER[this.wallet.chainId],
          'UniswapV3Router',
          web3
        );

        const swap = swapper.methods.multicall(
          Math.floor(Date.now() / 1000 + this.deadline),
          [this.trade.route.methodParameters.calldata]
        );
        swaps = [...swaps, swap];
      } else if (fromType === 'nyt' && toType === 'xpyt') {
        // use the Uniswap router contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_ROUTER[this.wallet.chainId],
          'UniswapV3Router',
          web3
        );

        const swap = swapper.methods.multicall(
          Math.floor(Date.now() / 1000 + this.deadline),
          [this.trade.route.methodParameters.calldata]
        );
        swaps = [...swaps, swap];
      } else if (fromType === 'underlying' && toType === 'xpyt') {
        // use the Uniswap swapper contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          'Swapper',
          web3
        );

        const swapArgs = {
          gate: gate.address,
          vault: vault.share.address,
          underlying: vault.underlying.address,
          nyt: vault.nyt.address,
          pyt: vault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: this.util.processWeb3Number(
            this.fromAmount.times(this.fromToken.precision)
          ),
          minAmountOut: this.util.processWeb3Number(
            this.trade.minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: this.useEther ? true : false,
          usePYT: false,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameter(
            'uint24',
            this.trade.xpyt.uniswapV3PoolFee.toNumber()
          ),
        };

        const swap = swapper.methods.swapUnderlyingToXpyt(swapArgs);
        swaps = [...swaps, swap];
      } else if (fromType === 'underlying' && toType === 'pyt') {
        // use the Uniswap swapper contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          'Swapper',
          web3
        );

        const swapArgs = {
          gate: gate.address,
          vault: vault.share.address,
          underlying: vault.underlying.address,
          nyt: vault.nyt.address,
          pyt: vault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: this.util.processWeb3Number(
            this.fromAmount.times(this.fromToken.precision)
          ),
          minAmountOut: this.util.processWeb3Number(
            this.trade.minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: this.useEther ? true : false,
          usePYT: true,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameter(
            'uint24',
            this.trade.xpyt.uniswapV3PoolFee.toNumber()
          ),
        };

        const swap = swapper.methods.swapUnderlyingToXpyt(swapArgs);
        swaps = [...swaps, swap];
      } else if (fromType === 'underlying' && toType === 'nyt') {
        // use the Uniswap swapper contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          'Swapper',
          web3
        );

        const swapArgs = {
          gate: gate.address,
          vault: vault.share.address,
          underlying: vault.underlying.address,
          nyt: vault.nyt.address,
          pyt: vault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: this.util.processWeb3Number(
            this.fromAmount.times(this.fromToken.precision)
          ),
          minAmountOut: this.util.processWeb3Number(
            this.trade.minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: this.useEther ? true : false,
          usePYT: false,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameter(
            'uint24',
            this.trade.xpyt.uniswapV3PoolFee.toNumber()
          ),
        };

        const swap = swapper.methods.swapUnderlyingToNyt(swapArgs);
        swaps = [...swaps, swap];
      } else if (fromType === 'xpyt' && toType === 'underlying') {
        // use the Uniswap swapper contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          'Swapper',
          web3
        );

        const swapArgs = {
          gate: gate.address,
          vault: vault.share.address,
          underlying: vault.underlying.address,
          nyt: vault.nyt.address,
          pyt: vault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: this.util.processWeb3Number(
            this.fromAmount.times(this.fromToken.precision)
          ),
          minAmountOut: this.util.processWeb3Number(
            this.trade.minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: false,
          usePYT: false,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameters(
            ['uint24', 'uint256'],
            [
              this.trade.xpyt.uniswapV3PoolFee.toNumber(),
              this.util.processWeb3Number(
                this.trade.swapAmountIn.times(this.fromToken.precision)
              ),
            ]
          ),
        };

        const swap = swapper.methods.swapXpytToUnderlying(swapArgs);
        swaps = [...swaps, swap];
      } else if (fromType === 'pyt' && toType === 'underlying') {
        // use the Uniswap swapper contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          'Swapper',
          web3
        );

        const swapArgs = {
          gate: gate.address,
          vault: vault.share.address,
          underlying: vault.underlying.address,
          nyt: vault.nyt.address,
          pyt: vault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: this.util.processWeb3Number(
            this.fromAmount.times(this.fromToken.precision)
          ),
          minAmountOut: this.util.processWeb3Number(
            this.trade.minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: false,
          usePYT: true,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameters(
            ['uint24', 'uint256'],
            [
              this.trade.xpyt.uniswapV3PoolFee.toNumber(),
              this.util.processWeb3Number(
                this.trade.swapAmountIn.times(this.trade.xpyt.precision)
              ),
            ]
          ),
        };

        const swap = swapper.methods.swapXpytToUnderlying(swapArgs);
        swaps = [...swaps, swap];
      } else if (fromType === 'nyt' && toType === 'underlying') {
        // use the Uniswap swapper contract
        swapper = this.contract.getContract(
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          'Swapper',
          web3
        );

        const swapArgs = {
          gate: gate.address,
          vault: vault.share.address,
          underlying: vault.underlying.address,
          nyt: vault.nyt.address,
          pyt: vault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: this.util.processWeb3Number(
            this.fromAmount.times(this.fromToken.precision)
          ),
          minAmountOut: this.util.processWeb3Number(
            this.trade.minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: false,
          usePYT: false,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameters(
            ['uint24', 'uint256'],
            [
              this.trade.xpyt.uniswapV3PoolFee.toNumber(),
              this.util.processWeb3Number(
                this.trade.swapAmountIn.times(vault.nyt.precision)
              ),
            ]
          ),
        };

        const swap = swapper.methods.swapNytToUnderlying(swapArgs);
        swaps = [...swaps, swap];
      } else if (fromType === 'pyt' && toType === 'xpyt') {
        const amount = this.util.processWeb3Number(
          this.fromAmount.times(this.fromToken.precision)
        );
        // use the xPYT contract
        swapper = this.contract.getContract(
          this.toToken.address,
          'WrappedPerpetualYieldToken',
          web3
        );

        const swap = swapper.methods.deposit(amount, this.user);
        swaps = [...swaps, swap];
      } else if (fromType === 'xpyt' && toType === 'pyt') {
        const amount = this.util.processWeb3Number(
          this.fromAmount.times(this.fromToken.precision)
        );
        // use the xPYT contract
        swapper = this.contract.getContract(
          this.fromToken.address,
          'WrappedPerpetualYieldToken',
          web3
        );

        const swap = swapper.methods.redeem(amount, this.user, this.user);
        swaps = [...swaps, swap];
      } else {
        console.error('Trade: single-vault (more advanced handling is needed)');
        return;
      }
    } else {
      const toVault = await this.gateService.getTokenVault(this.toToken, this.wallet.chainId);
      const toGate = await this.gateService.getVaultGate(toVault, this.wallet.chainId);

      swapper = this.contract.getContract(
        this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
        'Swapper',
        web3
      );

      // check the approval for the 0x router
      const approval = await this.tokenService.getUserAllowance(
        this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
        this.constants.ZERO_EX_PROXY[this.wallet.chainId],
        this.useEther ? this.tokenService.WETH[this.wallet.chainId] : this.fromToken
      );

      if (fromType === 'underlying' && toType === 'underlying') {
        let swap;
        if (this.tokenService.isETH(this.fromToken) && this.tokenService.isWETH(this.toToken)) {
          swapper = this.contract.getContract(
            this.constants.WETH[this.wallet.chainId],
            'WETH',
            web3
          );
          swap = swapper.methods.deposit();
        } else if (this.tokenService.isWETH(this.fromToken) && this.tokenService.isETH(this.toToken)) {
          swapper = this.contract.getContract(
            this.constants.WETH[this.wallet.chainId],
            'WETH',
            web3
          );
          swap = swapper.methods.withdraw(this.util.processWeb3Number(this.fromAmount.times(this.fromToken.precision)));
        } else {
          swap = swapper.methods.doZeroExSwap(
            this.useEther ? this.tokenService.WETH[this.wallet.chainId].address : this.fromToken.address,
            this.util.processWeb3Number(this.fromAmount.times(this.fromToken.precision)),
            this.toToken.address,
            this.util.processWeb3Number(this.trade.minAmountOut.times(this.toToken.precision)),
            this.user,
            this.useEther ? true : false,
            !approval || approval.gte(this.fromAmount) ? false : true,
            Math.floor(Date.now() / 1000 + this.deadline),
            this.trade.swapData,
          );
        }
        swaps = [...swaps, swap];
      } else if (fromType === 'underlying' && toType === 'xpyt') {
        const swap0 = swapper.methods.doZeroExSwap(
          this.useEther ? this.tokenService.WETH[this.wallet.chainId].address : this.fromToken.address,
          this.util.processWeb3Number(this.fromAmount.times(this.fromToken.precision)),
          toVault.underlying.address,
          this.util.processWeb3Number(this.trades[0].minAmountOut.times(toVault.underlying.precision)),
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          this.useEther ? true : false,
          !approval || approval.gte(this.fromAmount) ? false : true,
          Math.floor(Date.now() / 1000 + this.deadline),
          this.trades[0].swapData,
        );

        const swapArgs = {
          gate: toGate.address,
          vault: toVault.share.address,
          underlying: toVault.underlying.address,
          nyt: toVault.nyt.address,
          pyt: toVault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: "0",
          minAmountOut: this.util.processWeb3Number(
            this.trades[2].minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: true,
          usePYT: false,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameter(
            'uint24',
            this.trade.xpyt.uniswapV3PoolFee.toNumber()
          ),
        };
        const swap1 = swapper.methods.swapUnderlyingToXpyt(swapArgs);

        swaps = [...swaps, swap0, swap1];
      } else if (fromType === 'underlying' && toType === 'pyt') {
        const swap0 = swapper.methods.doZeroExSwap(
          this.useEther ? this.tokenService.WETH[this.wallet.chainId].address : this.fromToken.address,
          this.util.processWeb3Number(this.fromAmount.times(this.fromToken.precision)),
          toVault.underlying.address,
          this.util.processWeb3Number(this.trades[0].minAmountOut.times(toVault.underlying.precision)),
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          this.useEther ? true : false,
          !approval || approval.gte(this.fromAmount) ? false : true,
          Math.floor(Date.now() / 1000 + this.deadline),
          this.trades[0].swapData,
        );

        const swapArgs = {
          gate: toGate.address,
          vault: toVault.share.address,
          underlying: toVault.underlying.address,
          nyt: toVault.nyt.address,
          pyt: toVault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: "0",
          minAmountOut: this.util.processWeb3Number(
            this.trades[2].minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: true,
          usePYT: true,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameter(
            'uint24',
            this.trade.xpyt.uniswapV3PoolFee.toNumber()
          ),
        };
        const swap1 = swapper.methods.swapUnderlyingToXpyt(swapArgs);

        swaps = [...swaps, swap0, swap1];
      } else if (fromType === 'underlying' && toType === 'nyt') {
        const swap0 = swapper.methods.doZeroExSwap(
          this.useEther ? this.tokenService.WETH[this.wallet.chainId].address : this.fromToken.address,
          this.util.processWeb3Number(this.fromAmount.times(this.fromToken.precision)),
          toVault.underlying.address,
          this.util.processWeb3Number(this.trades[0].minAmountOut.times(toVault.underlying.precision)),
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          this.useEther ? true : false,
          !approval || approval.gte(this.fromAmount) ? false : true,
          Math.floor(Date.now() / 1000 + this.deadline),
          this.trades[0].swapData,
        );

        const swapArgs = {
          gate: toGate.address,
          vault: toVault.share.address,
          underlying: toVault.underlying.address,
          nyt: toVault.nyt.address,
          pyt: toVault.pyt.address,
          xPYT: this.trade.xpyt.address,
          tokenAmountIn: "0",
          minAmountOut: this.util.processWeb3Number(
            this.trades[2].minAmountOut.times(this.toToken.precision)
          ),
          recipient: this.user,
          useSwapperBalance: true,
          usePYT: false,
          deadline: Math.floor(Date.now() / 1000 + this.deadline),
          extraArgs: web3.eth.abi.encodeParameter(
            'uint24',
            this.trade.xpyt.uniswapV3PoolFee.toNumber()
          ),
        };
        const swap1 = swapper.methods.swapUnderlyingToNyt(swapArgs);

        swaps = [...swaps, swap0, swap1];
      } else {
        console.error('Trade: multi-vault (more advanced handling is needed)');
        return;
      }
    }

    let calls = [];

    if (this.permit.isSignatureValid(this.fromToken, this.spender, this.fromAmount)) {
      permit = swapper.methods.selfPermitIfNecessary(
        this.permit.signature.tokenAddress,
        this.permit.signature.amount,
        this.permit.signature.deadline,
        this.permit.signature.v,
        this.permit.signature.r,
        this.permit.signature.s
      );
      calls = [...calls, permit.encodeABI()];
    }

    if (this.useEther && !this.tokenService.isWETH(this.toToken)) {
      convert = swapper.methods.wrapEthInput();
      calls = [...calls, convert.encodeABI()];
    }

    for (let swap of swaps) {
      calls = [...calls, swap.encodeABI()];
    }

    const func = calls.length > 1 ? swapper.methods.multicall(calls) : swaps[0];

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {
          this.setFromAmount(0);
          this.permit.signature = null;

          // update the fromToken balance
          this.tokenService
            .getUserBalance(this.user, this.fromToken, true)
            .then((balance) => {
              this.fromBalance = balance;
            });

          // update the toToken balance
          this.tokenService
            .getUserBalance(this.user, this.toToken, true)
            .then((balance) => {
              this.toBalance = balance;
            });
        },
        () => {},
        this.useEther ? +this.util.processWeb3Number(this.fromAmount.times(this.fromToken.precision)) : 0
      )
      .catch((error) => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // @dev Depending on the type of trade, approval needs to be given to either
  // the Uniswap router, Timeless swapper or xPYT contract.
  // -----------------------------------------------------------------------
  approve() {
    const web3 = this.wallet.web3;
    const token = this.contract.getERC20(this.fromToken.address, web3);
    const amount = this.util.processWeb3Number(
      this.fromAmount.times(this.fromToken.precision)
    );

    token.methods
      .DOMAIN_SEPARATOR()
      .call()
      .then(async () => {
        await this.permit.permit(
          this.fromToken,
          this.spender,
          this.fromAmount,
          Math.floor(Date.now() / 1000) + this.deadline
        );
      })
      .catch((error) => {
        if (error.code === 4001) return; // @dev User rejected a signature request for selfPermit()

        this.wallet
          .approveToken(
            token,
            this.spender,
            amount,
            () => {},
            () => {},
            () => {
              this.getUserAllowance(this.spender, this.fromToken);
            },
            () => {}
          )
          .catch((error) => {
            console.error(error);
          });
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  actionHandler() {
    this.fromAmount.gt(this.fromAllowance) &&
    this.spender !== this.constants.WETH[this.wallet.chainId] &&
    !this.permit.isSignatureValid(this.fromToken, this.spender, this.fromAmount) &&
    !this.useEther
      ? this.approve()
      : this.swap();
  }

  // -----------------------------------------------------------------------
  // @dev Assume token is underlying unless a vault match is found.
  // -----------------------------------------------------------------------
  async getTokenType(token: Token): Promise<string> {
    const vaults = await this.gateService.getVaultList(this.wallet.chainId);
    let key = 'underlying';

    for (let vault of vaults) {
      let keyMatch = Object.keys(vault).find((key) => {
        return key === 'xpyt'
          ? vault[key].find((xpyt) => xpyt.address === token.address)
          : vault[key].address === token.address;
      });
      if (keyMatch) {
        key = keyMatch;
        break;
      }
    }

    return key;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async vaultMatch(
    fromType: string,
    toType: string
  ): Promise<Vault | undefined> {
    let fromToken = this.fromToken;
    if (this.useEther) {
      fromToken = await this.gateService.getToken(this.constants.WETH[this.wallet.chainId], this.wallet.chainId);
      if (fromToken.address === this.toToken.address) {
        return null;
      }
    }

    const vaults = await this.gateService.getVaultList(this.wallet.chainId);
    return vaults.find((vault) =>
      (fromType === 'xpyt' ? vault[fromType].find((xpyt) => xpyt.address === fromToken.address) : vault[fromType].address === fromToken.address) &&
      (toType === 'xpyt' ? vault[toType].find((xpyt) => xpyt.address === this.toToken.address) : vault[toType].address === this.toToken.address)
    );
  }

  // -----------------------------------------------------------------------
  // @dev For 0x swaps, we must recalculate the entire trade if slippage is changed
  // -----------------------------------------------------------------------
  setSlippage(value: number) {
    this.slippage = value * 100;

    if (this.trade && this.trade.route) {
      const slippageBase = this.trade.slippageBase;
      const afterSlippage = this.swapService.afterSlippage(this.trade.route, this.slippage);
      this.trade.minAmountOut = slippageBase.plus(afterSlippage);
    }

    if (this.trades) {
      this.setFromAmount(this.fromAmount);
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  setDeadline(value: number) {
    this.deadline = value * 60;
  }
}
