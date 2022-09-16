import { Component, OnInit, NgZone } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import BigNumber from 'bignumber.js';

import { TokenSelectModalComponent } from 'src/app/modals/token-select-modal/token-select-modal.component';
import { WalletConnectModalComponent } from 'src/app/modals/wallet-connect-modal/wallet-connect-modal.component';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Gate, Vault, Token, xPYT } from 'src/app/services/gate.service';
import { PermitService } from 'src/app/services/permit.service';
import { PriceService } from 'src/app/services/price.service';
import { TokenService } from 'src/app/services/token.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-burn',
  templateUrl: './burn.component.html',
  styleUrls: ['./burn.component.scss'],
})
export class BurnComponent implements OnInit {
  // user variables
  user: string;
  useWrappedPYT: boolean;
  useVaultShares: boolean;
  xpytAllowance: BigNumber;
  pytBalance: BigNumber;
  nytBalance: BigNumber;

  // global variables
  selectedGate: Gate;
  selectedVault: Vault;
  selectedToken: Token;
  selectedXPYT: xPYT;

  // burn variables
  pytAmount: BigNumber;
  nytAmount: BigNumber;
  underlyingReceived: BigNumber;
  underlyingPriceUSD: BigNumber;

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public gateService: GateService,
    public permit: PermitService,
    public priceService: PriceService,
    public tokenService: TokenService,
    public utilService: UtilService,
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
  // -----------------------------------------------------------------------
  resetData(resetUser: boolean, resetGlobal: boolean, chainId: number) {
    if (resetUser) {
      this.user = '';
      this.useWrappedPYT = true;
      this.useVaultShares = false;
      this.xpytAllowance = new BigNumber(0);
      this.pytBalance = new BigNumber(0);
      this.nytBalance = new BigNumber(0);
    }

    if (resetGlobal) {
      this.selectedGate = this.gateService.getDefaultGateList(chainId)[0];
      this.selectedXPYT = this.selectedGate.vaults[0].xpyt[0];
      this.selectVault(this.selectedGate.vaults[0]);

      this.pytAmount = new BigNumber(0);
      this.nytAmount = new BigNumber(0);
      this.underlyingReceived = new BigNumber(0);
      this.underlyingPriceUSD = new BigNumber(0);
    }
  }

  // -----------------------------------------------------------------------
  // @dev We wait 0.5 seconds before loading to prevent unnecessarily loading
  // data when a chain change has occured.
  // -----------------------------------------------------------------------
  async loadData(loadUser: boolean, loadGlobal: boolean, chainId: number) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;

    this.user = this.wallet.userAddress;

    if (loadGlobal) {
      this.selectedGate = (await this.gateService.getGateList(chainId))[0];
      this.selectedXPYT = this.selectedGate.vaults[0].xpyt[0];
      this.selectVault(this.selectedGate.vaults[0]);
    }

    if (loadUser) {
      if (!this.user) return;
      this.getUserBalances(this.selectedVault);
      this.getUserAllowance(this.selectedGate, this.selectedXPYT);
    }
  }

  // -----------------------------------------------------------------------
  // @dev will 'this.wallet.chainId' cause issues?
  // -----------------------------------------------------------------------
  selectVault(vault: Vault) {
    this.selectedVault = vault;
    if (vault.xpyt.length === 0) {
      this.useWrappedPYT = false;
      this.selectedXPYT = null;
    } else {
      this.useWrappedPYT = true;
    }
    this.selectedToken = this.useVaultShares ? vault.share : vault.underlying;

    this.priceService
      .getTokenPriceUSD(this.selectedToken, this.wallet.chainId)
      .then((price) => {
        this.underlyingPriceUSD = new BigNumber(price);
      });

    if (this.user) {
      this.getUserBalances(vault);
      this.getUserAllowance(this.selectedGate, this.selectedXPYT);
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUserBalances(vault: Vault, fetch: boolean = false) {
    if (!vault) return;

    if (this.useWrappedPYT) {
      this.tokenService
        .getUserBalance(this.user, this.selectedXPYT, fetch)
        .then((balance) => {
          this.pytBalance = balance;
        });
    } else {
      this.tokenService.getUserBalance(this.user, vault.pyt, fetch).then((balance) => {
        this.pytBalance = balance;
      });
    }

    this.tokenService.getUserBalance(this.user, vault.nyt, fetch).then((balance) => {
      this.nytBalance = balance;
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUserAllowance(spender: Gate, token: Token) {
    if (!spender || !token) return;
    this.tokenService
      .getUserAllowance(this.user, spender.address, token)
      .then((allowance) => {
        this.xpytAllowance = allowance;
      });
  }

  // -----------------------------------------------------------------------
  // TODO: Check burn from xPYT amount is correct when xPYT > 1 PYT
  // TODO: Check burn to Vault share amount is correct when pricePerVaultShare > 1
  // -----------------------------------------------------------------------
  async setBurnAmount(amount: string | number | BigNumber, pyt: boolean) {
    if (this.useWrappedPYT) {
      if (pyt) {
        // burn amount set from PYT input field
        this.pytAmount = new BigNumber(amount);
        if (this.pytAmount.isNaN()) {
          this.pytAmount = new BigNumber(0);
        }

        // calculate the NYT amount
        this.nytAmount = this.pytAmount
          .times(this.selectedVault.nyt.precision)
          .div(this.selectedXPYT.conversionRate);

        // calculate underlying received
        let underlyingReceived = this.nytAmount;
        if (this.useVaultShares) {
          underlyingReceived = underlyingReceived
            .times(1e27)
            .div(this.selectedVault.pricePerVaultShare);
        }
        this.underlyingReceived = underlyingReceived;
      } else {
        // burn amount set from NYT input field
        this.nytAmount = new BigNumber(amount);
        if (this.nytAmount.isNaN()) {
          this.nytAmount = new BigNumber(0);
        }

        // calculate xPYT amount
        this.pytAmount = this.nytAmount
          .times(this.selectedXPYT.conversionRate)
          .div(this.selectedVault.pyt.precision);

        // calculate underlying received
        let underlyingReceived = this.nytAmount;
        if (this.useVaultShares) {
          underlyingReceived = underlyingReceived
            .times(1e27)
            .div(this.selectedVault.pricePerVaultShare);
        }
        this.underlyingReceived = underlyingReceived;
      }
    } else {
      // using raw PYT, NYT and PYT amounts are the same
      this.nytAmount = new BigNumber(amount);
      if (this.nytAmount.isNaN()) {
        this.nytAmount = new BigNumber(0);
      }
      this.pytAmount = this.nytAmount;

      // calculate underlying received
      let underlyingReceived = this.nytAmount;
      if (this.useVaultShares) {
        underlyingReceived = underlyingReceived
          .times(1e27)
          .div(this.selectedVault.pricePerVaultShare);
      }
      this.underlyingReceived = underlyingReceived;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  canBurn(): boolean {
    return (
      this.pytAmount.gt(0) &&
      this.nytAmount.gt(0) &&
      this.pytAmount.lte(this.pytBalance) &&
      this.nytAmount.lte(this.nytBalance)
    );
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  burnMessage(): string {
    if (this.pytAmount.eq(0) || this.nytAmount.eq(0)) {
      return 'Enter an Amount';
    } else if (this.nytAmount.gt(this.nytBalance)) {
      return 'Insufficient ' + this.selectedVault.nyt.symbol + ' Balance';
    } else if (this.pytAmount.gt(this.pytBalance)) {
      return (
        'Insufficient ' +
        (this.useWrappedPYT
          ? this.selectedXPYT.symbol
          : this.selectedVault.pyt.symbol) +
        ' Balance'
      );
    } else if (
      this.useWrappedPYT &&
      this.pytAmount.gt(this.xpytAllowance) &&
      !this.permit.isSignatureValid(this.selectedXPYT, this.selectedGate.address, this.pytAmount)
    ) {
      return 'Approve ' + this.selectedXPYT.symbol;
    } else {
      return 'Burn';
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  actionHandler() {
    this.useWrappedPYT &&
    this.pytAmount.gt(this.xpytAllowance) &&
    !this.permit.isSignatureValid(this.selectedXPYT, this.selectedGate.address, this.pytAmount)
      ? this.approve()
      : this.burn();
  }

  // -----------------------------------------------------------------------
  // @dev Only xPYT needs approval to burn and supports selfPermit.
  // -----------------------------------------------------------------------
  async approve() {
    await this.permit.permit(
      this.selectedXPYT,
      this.selectedGate.address,
      this.pytAmount,
      Math.floor(Date.now() / 1000) + 3600
    );
  }

  // -----------------------------------------------------------------------
  // @dev When burning xPYT, we require either an allowance greater than the
  // amount of xPYT being burned OR a valid signature for selfPermit. If the
  // signature is valid, we pack the encoded function calls into a multicall().
  // -----------------------------------------------------------------------
  burn() {
    const web3 = this.wallet.web3;
    const gate = this.contract.getGate(this.selectedGate.address, web3);

    const recipient = this.user;
    const vault = this.selectedVault.share.address;
    const xPYT = this.useWrappedPYT
      ? this.selectedXPYT.address
      : this.constants.ZERO_ADDRESS;
    const underlyingAmount = this.utilService.processWeb3Number(
      this.underlyingReceived.times(this.selectedToken.precision)
    );

    let permit;
    if (this.permit.isSignatureValid(this.selectedXPYT, this.selectedGate.address, this.pytAmount)) {
      permit = gate.methods.selfPermitIfNecessary(
        this.permit.signature.tokenAddress,
        this.permit.signature.amount,
        this.permit.signature.deadline,
        this.permit.signature.v,
        this.permit.signature.r,
        this.permit.signature.s
      );
    }

    let exit;
    if (this.useVaultShares) {
      exit = gate.methods.exitToVaultShares(
        recipient,
        vault,
        xPYT,
        underlyingAmount
      );
    } else {
      exit = gate.methods.exitToUnderlying(
        recipient,
        vault,
        xPYT,
        underlyingAmount
      );
    }

    let func;
    if (permit) {
      func = gate.methods.multicall([permit.encodeABI(), exit.encodeABI()]);
    } else {
      func = exit;
    }

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {
          this.permit.signature = null;
          this.setBurnAmount(0, true);
          this.getUserBalances(this.selectedVault, true);

          // refresh the Underyling / Vault Share user balance
          this.tokenService.getUserBalance(this.user, this.selectedToken, true);
        },
        () => {}
      )
      .catch((error) => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  openTokenSelectModal(type: string): void {
    const modalRef = this.modalService.open(TokenSelectModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
    modalRef.componentInstance.tokenType = [type];
    modalRef.componentInstance.selectedToken = type === 'xpyt' ? this.selectedXPYT : this.selectedVault[type];
    modalRef.componentInstance.selectEvent.subscribe((event) => {
      if (type === 'xpyt') {
        this.selectedXPYT = event.token;
      }
      this.selectedGate = event.gate;
      this.selectVault(event.vault);
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
  // TODO: Check nyt/pyt amounts are correct on toggle. 2nd parameter.
  // -----------------------------------------------------------------------
  toggleUseVaultShares() {
    this.useVaultShares = !this.useVaultShares;
    this.selectVault(this.selectedVault);
    this.setBurnAmount(this.pytAmount, true);
  }

  // -----------------------------------------------------------------------
  // TODO: Check nyt/pyt amounts are correct on toggle. 2nd parameter.
  // -----------------------------------------------------------------------
  toggleUseWrappedPYT() {
    this.useWrappedPYT = !this.useWrappedPYT;
    this.selectedXPYT = this.useWrappedPYT ? this.selectedVault.xpyt[0] : null;
    this.getUserBalances(this.selectedVault);
    this.setBurnAmount(this.pytAmount, true);
  }
}
