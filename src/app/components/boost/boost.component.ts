import { Component, OnInit, NgZone } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';

import { WalletConnectModalComponent } from 'src/app/modals/wallet-connect-modal/wallet-connect-modal.component';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Gate, Vault, Token, xPYT } from 'src/app/services/gate.service';
import { PermitService } from 'src/app/services/permit.service';
import { PriceService } from 'src/app/services/price.service';
import { SwapService } from 'src/app/services/swap.service';
import { TimeService } from 'src/app/services/time.service';
import { TokenService } from 'src/app/services/token.service';
import { TradeService } from 'src/app/services/trade.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-boost',
  templateUrl: './boost.component.html',
  styleUrls: ['./boost.component.scss'],
})
export class BoostComponent implements OnInit {
  DEFAULT_DEADLINE = 1800; // 60 minutes
  DEFAULT_SLIPPAGE = 100; // 1%
  APY_PERIOD = 14; // days

  // user
  user: string;
  data: Data[]; // the merging of the below
  userData: any; // user data about a vault, typically balance
  vaultData: VaultData[]; // general data about a vault
  globalData: any; // global data about a vault, typically apy and leverage

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public gateService: GateService,
    public permit: PermitService,
    public price: PriceService,
    public swapService: SwapService,
    public time: TimeService,
    public token: TokenService,
    public trade: TradeService,
    public util: UtilService,
    public wallet: WalletService,
    public zone: NgZone
  ) {}

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  ngOnInit(): void {
    this.resetData(true, true, true);
    this.loadData(this.wallet.connected, true, true, this.wallet.chainId);

    this.wallet.connectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false, false);
        this.loadData(true, false, false, this.wallet.chainId);
      });
    });

    this.wallet.disconnectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false, false);
        this.loadData(false, false, false, this.wallet.chainId);
      });
    });

    this.wallet.chainChangedEvent.subscribe((chainId) => {
      this.zone.run(() => {
        this.resetData(true, true, true);
        this.loadData(this.wallet.connected, true, true, chainId);
      });
    });

    this.wallet.accountChangedEvent.subscribe((account) => {
      this.zone.run(() => {
        this.resetData(true, false, false);
        this.loadData(true, false, false, this.wallet.chainId);
      });
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  resetData(resetUser: boolean, resetVaults: boolean, resetGlobal: boolean) {
    if (resetUser) {
      this.user = '';
      this.userData = [];
    }

    if (resetVaults) {
      this.data = [];
      this.vaultData = [];
    }

    if (resetGlobal) {
      this.globalData = [];
    }
  }

  // -----------------------------------------------------------------------
  // @dev We wait 0.5 seconds before loading to prevent unnecessarily loading
  // data when a chain change has occured.
  // -----------------------------------------------------------------------
  async loadData(
    loadUser: boolean,
    loadVaults: boolean,
    loadGlobal: boolean,
    chainId: number
  ) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;

    this.user = this.wallet.userAddress;

    await Promise.all([
      loadUser ? this.loadUserData(chainId) : null,
      loadVaults ? this.loadVaultData(chainId) : null,
      loadGlobal ? this.loadGlobalData(chainId) : null,
    ]).then(() => {
      if (loadVaults) {
        for (const point of this.vaultData) {
          let data = this.data.find(
            (vault) => vault.share.address === point.share.address
          );

          if (!data) {
            data = this.initData();
          }

          data.gate = point.gate;
          data.vault = point.vault;
          data.underlying = point.underlying;
          data.share = point.share;
          data.xpyt = point.xpyt;
          data.pyt = point.pyt;
          data.nyt = point.nyt;
          data.underlyingPriceUSD = point.underlyingPriceUSD;
          data.xpytPriceUSD = point.xpytPriceUSD;
        }
      }

      if (loadGlobal) {
        for (const point of this.globalData) {
          const data = this.data.find(
            (vault) => vault.share.address === point.address
          );
          data.apy = point.apy;
          data.leverage = point.leverage;
          data.xpytConversionRate = point.xpytConversionRate;
          data.isNewVault = point.isNewVault;
        }
      }

      if (loadUser) {
        for (const point of this.data) {
          const underlyingBalance = this.userData.tokenBalances[
            point.underlying.address
          ];
          point.underlyingBalance = underlyingBalance.div(
            point.underlying.precision
          );

          const xpytBalance = this.userData.tokenBalances[point.xpyt.address];
          point.xpytBalance = xpytBalance.div(point.xpyt.precision);
        }
      }

      // sort descending based on boosted APY
      this.data.sort((a, b) => b.apy.gt(a.apy) ? 1 : -1);
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadUserData(chainId: number) {
    this.userData.tokenBalances = await this.token.getUserBalances(
      this.user,
      chainId
    );
  }

  // -----------------------------------------------------------------------
  // @notice Loads the general vault info.
  // -----------------------------------------------------------------------
  async loadVaultData(chainId: number) {
    const gates = await this.gateService.getGateList(chainId);
    for (const gate of gates) {
      for (const vault of gate.vaults) {
        if (vault.xpyt.length === 0) continue;

        const xpyt = this.trade.chooseXpyt(vault); // choose xPYT with the most liquidity
        if (!xpyt.pools.find((pool) => pool.liquidity.gt(0))) continue;

        const dataObj: VaultData = {
          gate: gate.address,
          vault: vault,
          underlying: vault.underlying,
          share: vault.share,
          xpyt: xpyt,
          pyt: vault.pyt,
          nyt: vault.nyt,
          underlyingPriceUSD: await this.price.getTokenPriceUSD(vault.underlying, chainId),
          xpytPriceUSD: await this.price.getTokenPriceUSD(xpyt, chainId),
        };

        this.vaultData = [...this.vaultData, dataObj];
      }
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadGlobalData(chainId: number, queryLast: boolean = true) {
    let queryString = `query VaultAPY {`;
    queryString += `current: vaults(first: 1000) {
      share
      pricePerVaultShare
      xpyt(first: 1000) {
        conversionRate
        pools {
          token0
          token1
          token0Price
          token1Price
        }
      }
    }`;
    if (queryLast) {
      const now = Math.floor(Date.now() / 1e3);
      const block = await this.time.getBlock(now - this.time.DAY_IN_SEC * this.APY_PERIOD, chainId);
      queryString += `last: vaults(
        first: 1000,
        block: {
          number: ${block}
        }
      ) {
        share
        pricePerVaultShare
      }`;
    }
    queryString += `}`;
    const query = gql`
      ${queryString}
    `;

    await request(this.constants.GRAPHQL_ENDPOINT[chainId], query)
      .then((data: GlobalQueryResult) => this.handleGlobalData(data, chainId))
      .catch((error) => this.loadGlobalData(chainId, false));
  }

  // -----------------------------------------------------------------------
  // @todo Calculate APY correctly when vault is less than 24 hours old.
  // todo Calculate leverage correctly when the pool has no trading volume, ie
  // when token0Price and token1Price are both 0.
  // -----------------------------------------------------------------------
  async handleGlobalData(data: GlobalQueryResult, chainId: number) {
    for (const currentVault of data['current']) {
      const lastVault = data['last'] && data['last'].find(
        (vault) => vault.share === currentVault.share
      );
      const vault = await this.gateService.getVault(
        currentVault.share,
        chainId
      );
      if (vault.xpyt.length === 0) continue;

      // calculate the APY
      const current = new BigNumber(currentVault.pricePerVaultShare);
      const last = new BigNumber(
        lastVault ? lastVault.pricePerVaultShare : current
      );
      const rate = current.minus(last).div(last);
      let apy = new BigNumber(1).plus(rate).pow(Math.round(365 / this.APY_PERIOD)).minus(1);

      // calculate the leverage
      const xpyt = this.trade.chooseXpyt(vault); // choose xPYT with the most liquidity
      if (xpyt.pools.length === 0) continue;
      if (!xpyt.pools.find((pool) => pool.liquidity.gt(0))) continue;

      const K = new BigNumber(xpyt.conversionRate);
      const L =
        xpyt.address.toLowerCase() === xpyt.pools[0].token0
          ? xpyt.pools[0].token0Price
          : xpyt.pools[0].token1Price;
      const leverage = new BigNumber(L).div(K.div(xpyt.precision)).plus(1);

      const dataObj: GlobalData = {
        address: currentVault.share,
        apy: apy,
        leverage: leverage,
        xpytConversionRate: new BigNumber(xpyt.conversionRate).div(xpyt.precision),
        isNewVault: lastVault ? false : true,
      };
      this.globalData = [...this.globalData, dataObj];
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  initData(): Data {
    const dataObj: Data = {
      // general
      tab: 0,
      loading: false,
      expandedDetails: false,
      gate: '',
      vault: null,
      underlying: null,
      share: null,
      xpyt: null,
      pyt: null,
      nyt: null,
      underlyingPriceUSD: new BigNumber(0),
      xpytPriceUSD: new BigNumber(0),

      // global
      apy: new BigNumber(0),
      leverage: new BigNumber(0),
      xpytConversionRate: new BigNumber(0),
      isNewVault: false,

      // user
      underlyingAllowance: new BigNumber(0),
      underlyingBalance: new BigNumber(0),
      depositAmount: new BigNumber(0),

      xpytAllowance: new BigNumber(0),
      xpytBalance: new BigNumber(0),
      withdrawAmount: new BigNumber(0),

      useEther: false,
      extraArgs: null,
      received: new BigNumber(0),
      timeout: null,
    };

    this.data = [...this.data, dataObj];

    return dataObj;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  expandDetails(data: Data) {
    this.switchTab(data, 0);
    data.expandedDetails = !data.expandedDetails;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  switchTab(data: Data, tab: number) {
    data.useEther = false;
    data.received = new BigNumber(0);
    data.depositAmount = new BigNumber(0);
    data.withdrawAmount = new BigNumber(0);
    data.tab = tab;
  }

  // -----------------------------------------------------------------------
  // @todo cache allowances to avoid RPC call on every keystroke
  // -----------------------------------------------------------------------
  async setDepositAmount(data: Data, amount: string | BigNumber) {
    data.depositAmount = new BigNumber(amount);
    if (data.depositAmount.isNaN()) {
      data.depositAmount = new BigNumber(0);
    }

    if (data.depositAmount.gt(0)) {
      clearTimeout(data.timeout);
      data.timeout = setTimeout(async () => {
        data.loading = true;
        data.received = await this.getDepositReceived(data);
        data.loading = false;
      }, 500);
    } else {
      data.received = new BigNumber(0);
    }

    if (this.user) {
      const allowance = await this.token.getUserAllowance(
        this.user,
        this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
        data.underlying
      );
      data.underlyingAllowance = allowance;
    }
  }

  // -----------------------------------------------------------------------
  // @todo cache allowances to avoid RPC call on every keystroke
  // -----------------------------------------------------------------------
  async setWithdrawAmount(data: Data, amount: string | BigNumber) {
    data.withdrawAmount = new BigNumber(amount);
    if (data.withdrawAmount.isNaN()) {
      data.withdrawAmount = new BigNumber(0);
    }

    if (data.withdrawAmount.gt(0)) {
      clearTimeout(data.timeout);
      data.timeout = setTimeout(async () => {
        data.loading = true;
        data.received = await this.getWithdrawReceived(data);
        data.loading = false;
      }, 500);
    } else {
      data.received = new BigNumber(0);
    }

    if (this.user) {
      const allowance = await this.token.getUserAllowance(
        this.user,
        this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
        data.xpyt
      );
      data.xpytAllowance = allowance;
    }
  }

  // -----------------------------------------------------------------------
  // @notice Used for disabling the approve button.
  // -----------------------------------------------------------------------
  canApprove(data: Data): boolean {
    const amount = data.tab === 0 ? data.depositAmount : data.withdrawAmount;
    const balance = data.tab === 0 ? data.underlyingBalance : data.xpytBalance;
    return amount.gt(0) && amount.lte(balance) && !this.hasApproval(data);
  }

  // -----------------------------------------------------------------------
  // @notice Used for styling the approve button. Disables the deposit/withdraw
  // button when false.
  // -----------------------------------------------------------------------
  hasApproval(data: Data): boolean {
    const amount = data.tab === 0 ? data.depositAmount : data.withdrawAmount;
    const allowance = data.tab === 0 ? data.underlyingAllowance : data.xpytAllowance;

    return (
      amount.gt(0) &&
      (
        data.useEther ||
        amount.lte(allowance) ||
        this.permit.isSignatureValid(
          data.tab === 0 ? data.underlying : data.xpyt,
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          data.tab === 0 ? data.depositAmount : data.withdrawAmount
        )
      )
    );
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  approve(data: Data) {
    const web3 = this.wallet.web3;
    const token = this.contract.getERC20(
      data.tab === 0 ? data.underlying.address : data.xpyt.address,
      web3
    );
    const amount = this.util.processWeb3Number(
      data.tab === 0
        ? data.depositAmount.times(data.underlying.precision)
        : data.withdrawAmount.times(data.xpyt.precision)
    );

    token.methods
      .DOMAIN_SEPARATOR()
      .call()
      .then(async () => {
        await this.permit.permit(
          data.tab === 0 ? data.underlying : data.xpyt,
          this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
          data.tab === 0 ? data.depositAmount : data.withdrawAmount,
          Math.floor(Date.now() / 1000) + this.DEFAULT_DEADLINE
        );
      })
      .catch((error) => {
        if (error.code === 4001) return; // @dev User rejected a signature request for selfPermit()

        this.wallet
          .approveToken(
            token,
            this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
            amount,
            () => {},
            () => {},
            () => {
              // @todo Update the user's allowance for whichever token
              this.token
                .getUserAllowance(
                  this.user,
                  this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
                  data.tab === 0 ? data.underlying : data.xpyt
                )
                .then((allowance) => {
                  data.tab === 0
                    ? (data.underlyingAllowance = allowance)
                    : (data.xpytAllowance = allowance);
                });
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
  canDeposit(data: Data): boolean {
    return (
      data.depositAmount.gt(0) &&
      data.depositAmount.lte(data.useEther ? this.userData.tokenBalances[this.constants.ETH_ADDRESS].div(1e18) : data.underlyingBalance) &&
      this.hasApproval(data)
    );
  }

  // -----------------------------------------------------------------------
  // @notice Calculates the minimum amount of xPYT received from the deposit.
  // -----------------------------------------------------------------------
  async getDepositReceived(data: Data): Promise<BigNumber> {
    const trade = await this.trade.swapUnderlyingToXpyt(data.vault, data.xpyt as xPYT, data.depositAmount, this.DEFAULT_SLIPPAGE, this.DEFAULT_DEADLINE);

    data.extraArgs = {
      fee: data.xpyt.uniswapV3PoolFee.toNumber()
    };

    return trade.minAmountOut;
  }

  // -----------------------------------------------------------------------
  // @todo Let user set slippage, deadline, etc
  // @dev Only allows swaps through 1% fee tier pools
  // -----------------------------------------------------------------------
  deposit(data: Data) {
    const web3 = this.wallet.web3;
    const swapper = this.contract.getContract(
      this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
      'Swapper',
      web3
    );

    let permit;
    if (this.permit.isSignatureValid(
      data.underlying,
      this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
      data.depositAmount
    )) {
      permit = swapper.methods.selfPermitIfNecessary(
        this.permit.signature.tokenAddress,
        this.permit.signature.amount,
        this.permit.signature.deadline,
        this.permit.signature.v,
        this.permit.signature.r,
        this.permit.signature.s
      );
    }

    let convert;
    if (data.useEther) {
      convert = swapper.methods.wrapEthInput();
    }

    // generate the swapArgs object
    const swapArgs = {
      gate: data.gate,
      vault: data.share.address,
      underlying: data.underlying.address,
      nyt: data.nyt.address,
      pyt: data.pyt.address,
      xPYT: data.xpyt.address,
      tokenAmountIn: this.util.processWeb3Number(
        data.depositAmount.times(data.underlying.precision)
      ),
      minAmountOut: this.util.processWeb3Number(
        data.received.times(data.xpyt.precision)
      ),
      recipient: this.user,
      useSwapperBalance: data.useEther ? true : false,
      usePYT: false,
      deadline: this.permit.signature
        ? this.permit.signature.deadline
        : Math.floor(Date.now() / 1000 + this.DEFAULT_DEADLINE),
      extraArgs: web3.eth.abi.encodeParameter('uint24', data.xpyt.uniswapV3PoolFee.toNumber()),
    };

    const swap = swapper.methods.swapUnderlyingToXpyt(swapArgs);

    let func;
    if (permit) {
      func = swapper.methods.multicall([permit.encodeABI(), swap.encodeABI()]);
    } else if (convert) {
      func = swapper.methods.multicall([convert.encodeABI(), swap.encodeABI()]);
    } else {
      func = swap;
    }

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {
          data.depositAmount = new BigNumber(0);
          this.permit.signature = null;

          // @todo update ETH balance

          this.token
            .getUserBalance(this.user, data.underlying, true)
            .then((balance) => {
              data.underlyingBalance = balance;
            });

          this.token
            .getUserBalance(this.user, data.xpyt, true)
            .then((balance) => {
              data.xpytBalance = balance;
            });
        },
        () => {},
        data.useEther ? +swapArgs.tokenAmountIn : 0
      )
      .catch((error) => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  canWithdraw(data: Data) {
    return (
      data.withdrawAmount.gt(0) &&
      data.withdrawAmount.lte(data.xpytBalance) &&
      this.hasApproval(data)
    );
  }

  // -----------------------------------------------------------------------
  // @notice Calculates the minimum amount of underlying received from the withdrawal.
  // -----------------------------------------------------------------------
  async getWithdrawReceived(data: Data): Promise<BigNumber> {
    const vault = await this.gateService.getTokenVault(data.xpyt, this.wallet.chainId);
    const trade = await this.trade.swapXpytToUnderlying(vault, data.xpyt as xPYT, data.withdrawAmount, this.DEFAULT_SLIPPAGE, this.DEFAULT_DEADLINE);

    data.extraArgs = {
      fee: data.xpyt.uniswapV3PoolFee.toNumber(),
      swapAmountIn: trade.swapAmountIn,
    };

    return trade.minAmountOut;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  withdraw(data: Data) {
    const web3 = this.wallet.web3;
    const swapper = this.contract.getContract(
      this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
      'Swapper',
      web3
    );

    let permit;
    if (this.permit.isSignatureValid(
      data.xpyt,
      this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
      data.withdrawAmount
    )) {
      permit = swapper.methods.selfPermitIfNecessary(
        this.permit.signature.tokenAddress,
        this.permit.signature.amount,
        this.permit.signature.deadline,
        this.permit.signature.v,
        this.permit.signature.r,
        this.permit.signature.s
      );
    }

    const swapArgs = {
      gate: data.gate,
      vault: data.share.address,
      underlying: data.underlying.address,
      nyt: data.nyt.address,
      pyt: data.pyt.address,
      xPYT: data.xpyt.address,
      tokenAmountIn: this.util.processWeb3Number(
        data.withdrawAmount.times(data.xpyt.precision)
      ),
      minAmountOut: this.util.processWeb3Number(
        data.received.times(data.underlying.precision)
      ),
      recipient: this.user,
      useSwapperBalance: false,
      usePYT: false,
      deadline: this.permit.signature
        ? this.permit.signature.deadline
        : Math.floor(Date.now() / 1000 + this.DEFAULT_DEADLINE),
      extraArgs: web3.eth.abi.encodeParameters(
        ['uint24', 'uint256'],
        [
          data.extraArgs.fee,
          this.util.processWeb3Number(
            data.extraArgs.swapAmountIn.times(data.xpyt.precision)
          ),
        ]
      ),
    };

    const swap = swapper.methods.swapXpytToUnderlying(swapArgs);

    let func;
    if (permit) {
      func = swapper.methods.multicall([permit.encodeABI(), swap.encodeABI()]);
    } else {
      func = swap;
    }

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {
          data.withdrawAmount = new BigNumber(0);
          this.permit.signature = null;

          // @todo update ETH balance

          this.token
            .getUserBalance(this.user, data.underlying, true)
            .then((balance) => {
              data.underlyingBalance = balance;
            });

          this.token
            .getUserBalance(this.user, data.xpyt, true)
            .then((balance) => {
              data.xpytBalance = balance;
            });
        },
        () => {}
      )
      .catch((error) => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  sort(event: any) {
    if (event.active === 'asset') {
      this.data = event.direction === 'asc'
        ? [...this.data.sort((a, b) => a[event.active] > b[event.active] ? 1 : -1)]
        : [...this.data.sort((a, b) => b[event.active] > a[event.active] ? 1 : -1)];
    } else {
      this.data = event.direction === 'asc'
        ? [...this.data.sort((a, b) => a[event.active].gt(b[event.active]) ? 1 : -1)]
        : [...this.data.sort((a, b) => b[event.active].gt(a[event.active]) ? 1 : -1)];
    }
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
}

interface Data {
  // general
  tab: number;
  loading: boolean; // indicator for loading trade info
  expandedDetails: boolean; // has the user expanded the interaction details section
  gate: string; // the address of the gate
  vault: Vault;
  underlying: Token;
  share: Token;
  xpyt: xPYT;
  pyt: Token;
  nyt: Token;
  underlyingPriceUSD: BigNumber; // the price of the underlying asset in USD
  xpytPriceUSD: BigNumber; // the price of the xPYT in USD

  // global
  apy: BigNumber; // the base APY for the vault, does not account for leverage
  leverage: BigNumber; // the leverage available for the vault
  xpytConversionRate: BigNumber; // how much xPYT will be received for 1 PYT
  isNewVault: boolean; // vault was deployed less than X days ago

  // user
  underlyingAllowance: BigNumber; // the user's allowance in the underlying token
  underlyingBalance: BigNumber; // the user's balance in the underlying token
  depositAmount: BigNumber; // the amount that has been set for deposit

  xpytAllowance: BigNumber; // the user's allowance in the xpyt token
  xpytBalance: BigNumber; // the user's balance in the xpyt token
  withdrawAmount: BigNumber; // the amount that has been set for withdraw

  useEther: boolean; // toggle for using ETH instead of WETH
  extraArgs: any; // the extra arguments for the trade
  received: BigNumber; // the amount of underlying / xpyt that will be received
  timeout: any;
}

interface GlobalData {
  address: string;
  apy: BigNumber;
  leverage: BigNumber;
  xpytConversionRate: BigNumber;
  isNewVault: boolean;
}

interface VaultData {
  gate: string;
  vault: Vault;
  underlying: Token;
  share: Token;
  xpyt: xPYT;
  pyt: Token;
  nyt: Token;
  underlyingPriceUSD: BigNumber;
  xpytPriceUSD: BigNumber;
}

interface UserData {
  tokenBalances: any;
}

interface GlobalQueryResult {
  share: string;
  pricePerVaultShare: string;
  xpyt: {
    conversionRate: string;
    pools: {
      token0: string;
      token1: string;
      token0Price: string;
      token1Price: string;
    }[];
  }[];
}
