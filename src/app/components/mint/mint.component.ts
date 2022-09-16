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
  selector: 'app-mint',
  templateUrl: './mint.component.html',
  styleUrls: ['./mint.component.scss'],
})
export class MintComponent implements OnInit {
  // user variables
  user: string;
  useWrappedPYT: boolean;
  useVaultShares: boolean;
  underlyingBalance: BigNumber;
  underlyingAllowance: BigNumber;

  // global variables
  allGates: Gate[];
  availableGates: Gate[];
  selectedGate: Gate;
  selectedVault: Vault;
  selectedToken: Token;
  selectedXPYT: xPYT;

  // mint variables
  underlyingAmount: BigNumber;
  pytReceived: BigNumber;
  nytReceived: BigNumber;
  pytPriceUSD: BigNumber;
  nytPriceUSD: BigNumber;

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public gateService: GateService,
    public permit: PermitService,
    public priceService: PriceService,
    public token: TokenService,
    public util: UtilService,
    public wallet: WalletService,
    public zone: NgZone
  ) {}

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
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
      this.underlyingBalance = new BigNumber(0);
      this.underlyingAllowance = new BigNumber(0);
    }

    if (resetGlobal) {
      this.useWrappedPYT = true;
      this.useVaultShares = false;
      this.underlyingAmount = new BigNumber(0);
      this.pytReceived = new BigNumber(0);
      this.nytReceived = new BigNumber(0);
      this.pytPriceUSD = new BigNumber(0);
      this.nytPriceUSD = new BigNumber(0);
      this.allGates = this.gateService.getDefaultGateList(chainId);
      const type = this.useVaultShares ? 'share' : 'underlying';
      this.selectToken(this.allGates[0].vaults[0][type]);
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
      this.allGates = await this.gateService.getGateList(chainId);
      const type = this.useVaultShares ? 'share' : 'underlying';
      this.selectToken(this.allGates[0].vaults[0][type]);
    }

    if (loadUser) {
      if (!this.user) return;
      this.getUserBalance(this.selectedToken);
      this.getUserAllowance(this.selectedGate, this.selectedToken);
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  selectToken(token: Token) {
    this.selectedToken = token;
    if (this.user) {
      this.getUserBalance(token);
    }

    this.availableGates = this.allGates.filter((gate) =>
      gate.vaults.find((vault) => {
        const type = this.useVaultShares ? 'share' : 'underlying';
        return vault[type].address === token.address;
      })
    );
    this.selectGate(this.availableGates[0].address);
  }

  // -----------------------------------------------------------------------
  // @dev The value attribute on an <option> tag must be a string.
  // -----------------------------------------------------------------------
  selectGate(address: string) {
    this.selectedGate = this.availableGates.find(
      (gate) => gate.address === address
    );

    this.selectedVault = this.selectedGate.vaults.find(
      (vault) =>
        vault[this.useVaultShares ? 'share' : 'underlying'].address ===
        this.selectedToken.address
    );

    if (this.selectedVault.xpyt.length === 0) {
      this.useWrappedPYT = false;
      this.selectedXPYT = null;
    } else {
      this.useWrappedPYT = true;
      this.selectedXPYT = this.selectedVault.xpyt[0];
    }

    this.priceService
      .getTokenPriceUSD(
        this.useWrappedPYT ? this.selectedXPYT : this.selectedVault.pyt,
        this.wallet.chainId
      )
      .then((price) => {
        this.pytPriceUSD = new BigNumber(price);
      });

    this.priceService
      .getTokenPriceUSD(this.selectedVault.nyt, this.wallet.chainId)
      .then((price) => {
        this.nytPriceUSD = new BigNumber(price);
      });

    if (this.user) {
      this.getUserAllowance(this.selectedGate, this.selectedToken);
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUserBalance(token: Token, fetch: boolean = false) {
    if (!token) return;
    this.token.getUserBalance(this.user, token, fetch).then((balance) => {
      this.underlyingBalance = balance;
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUserAllowance(spender: Gate, token: Token) {
    if (!spender || !token) return;
    this.token
      .getUserAllowance(this.user, spender.address, token)
      .then((allowance) => {
        this.underlyingAllowance = allowance;
      });
  }

  // -----------------------------------------------------------------------
  // @dev Precision of 1e27 is used by Gate.sol for pricePerVaultShare
  // -----------------------------------------------------------------------
  setMintAmount(amount: string | number | BigNumber) {
    this.underlyingAmount = new BigNumber(amount);
    if (this.underlyingAmount.isNaN()) {
      this.underlyingAmount = new BigNumber(0);
    }

    let mintAmount = this.underlyingAmount;
    if (this.useVaultShares) {
      mintAmount = mintAmount
        .times(this.selectedVault.pricePerVaultShare)
        .div(1e27);
    }
    this.nytReceived = mintAmount;

    if (this.useWrappedPYT) {
      this.pytReceived = mintAmount
        .times(this.selectedXPYT.conversionRate)
        .div(this.selectedXPYT.precision);
    } else {
      this.pytReceived = mintAmount;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  canMint(): boolean {
    return (
      this.underlyingAmount.gt(0) &&
      this.underlyingAmount.lte(this.underlyingBalance)
    );
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  mintMessage(): string {
    if (this.underlyingAmount.eq(0)) {
      return 'Enter an Amount';
    } else if (this.underlyingAmount.gt(this.underlyingBalance)) {
      return 'Insufficient ' + this.selectedToken.symbol + ' Balance';
    } else if (
      this.underlyingAmount.gt(this.underlyingAllowance) &&
      !this.permit.isSignatureValid(this.selectedToken, this.selectedGate.address, this.underlyingAmount)
    ) {
      return 'Approve';
    } else {
      return 'Mint';
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  actionHandler() {
    this.underlyingAmount.gt(this.underlyingAllowance) &&
    !this.permit.isSignatureValid(this.selectedToken, this.selectedGate.address, this.underlyingAmount)
      ? this.approve()
      : this.mint();
  }

  // -----------------------------------------------------------------------
  // @dev Updates the underlyingAllowance on transaction confirmation.
  // -----------------------------------------------------------------------
  approve() {
    const web3 = this.wallet.web3;
    const token = this.contract.getERC20(this.selectedToken.address, web3);
    const amount = this.util.processWeb3Number(
      this.underlyingAmount.times(this.selectedToken.precision)
    );

    token.methods
      .DOMAIN_SEPARATOR()
      .call()
      .then(async () => {
        await this.permit.permit(
          this.selectedToken,
          this.selectedGate.address,
          this.underlyingAmount,
          Math.floor(Date.now() / 1000) + 3600
        );
      })
      .catch((error) => {
        if (error.code === 4001) return; // @dev User rejected a signature request for selfPermit()

        this.wallet
          .approveToken(
            token,
            this.selectedGate.address,
            amount,
            () => {},
            () => {},
            () => {
              this.getUserAllowance(this.selectedGate, this.selectedToken);
            },
            () => {}
          )
          .catch((error) => {
            console.error(error);
          });
      });
  }

  // -----------------------------------------------------------------------
  // @dev Updates the underlyingBalance on transaction confirmation.
  // -----------------------------------------------------------------------
  mint() {
    const web3 = this.wallet.web3;
    const gate = this.contract.getGate(this.selectedGate.address, web3);

    const nytRecipient = this.user;
    const pytRecipient = this.user;
    const vault = this.selectedVault.share.address;
    const xPYT = this.useWrappedPYT
      ? this.selectedXPYT.address
      : this.constants.ZERO_ADDRESS;
    const underlyingAmount = this.util.processWeb3Number(
      this.underlyingAmount.times(this.selectedToken.precision)
    );

    let permit;
    if (this.permit.isSignatureValid(this.selectedToken, this.selectedGate.address, this.underlyingAmount)) {
      permit = gate.methods.selfPermitIfNecessary(
        this.permit.signature.tokenAddress,
        this.permit.signature.amount,
        this.permit.signature.deadline,
        this.permit.signature.v,
        this.permit.signature.r,
        this.permit.signature.s
      );
    }

    let mint;
    if (this.useVaultShares) {
      mint = gate.methods.enterWithVaultShares(
        nytRecipient,
        pytRecipient,
        vault,
        xPYT,
        underlyingAmount
      );
    } else {
      mint = gate.methods.enterWithUnderlying(
        nytRecipient,
        pytRecipient,
        vault,
        xPYT,
        underlyingAmount
      );
    }

    let func;
    if (permit) {
      func = gate.methods.multicall([permit.encodeABI(), mint.encodeABI()]);
    } else {
      func = mint;
    }

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {
          this.setMintAmount(0);
          this.permit.signature = null;
          this.getUserBalance(this.selectedToken, true);

          // refresh the NYT and xPYT user balances
          this.token.getUserBalance(this.user, this.selectedVault.nyt, true);
          this.token.getUserBalance(this.user, this.useWrappedPYT ? this.selectedXPYT : this.selectedVault.pyt, true);
        },
        () => {}
      )
      .catch((error) => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  openTokenSelectModal(xpyt: boolean = false): void {
    const modalRef = this.modalService.open(TokenSelectModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
    const type = this.useVaultShares ? 'share' : 'underlying';
    modalRef.componentInstance.tokenType = [xpyt ? 'xpyt' : type];
    modalRef.componentInstance.selectedToken = xpyt ? this.selectedXPYT : this.selectedToken;
    modalRef.componentInstance.allowedVault = xpyt ? this.selectedVault : null;
    modalRef.componentInstance.selectTokenEvent.subscribe((token) => {
      if (xpyt) {
        this.selectedXPYT = token;
        this.setMintAmount(this.underlyingAmount);
      } else {
        this.selectToken(token);
        this.setMintAmount(0);
      }
    });
  }

  openWalletModal(): void {
    const modalRef = this.modalService.open(WalletConnectModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  toggleUseVaultShares() {
    this.useVaultShares = !this.useVaultShares;
    this.selectToken(this.useVaultShares ? this.selectedVault.share : this.selectedVault.underlying);
    this.setMintAmount(this.underlyingAmount);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  toggleUseWrappedPYT() {
    this.useWrappedPYT = !this.useWrappedPYT;
    this.selectedXPYT = this.useWrappedPYT ? this.selectedVault.xpyt[0] : null;
    this.setMintAmount(this.underlyingAmount);
    this.priceService
      .getTokenPriceUSD(
        this.useWrappedPYT ? this.selectedXPYT : this.selectedVault.pyt,
        this.wallet.chainId
      )
      .then((price) => {
        this.pytPriceUSD = new BigNumber(price);
      });
  }
}
