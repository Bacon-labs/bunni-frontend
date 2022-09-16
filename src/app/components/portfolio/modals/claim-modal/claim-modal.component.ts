import { Component, OnInit, Input } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import BigNumber from 'bignumber.js';

import { Position } from 'src/app/components/portfolio/portfolio.component';
import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-claim-modal',
  templateUrl: './claim-modal.component.html',
  styleUrls: ['./claim-modal.component.scss'],
})
export class ClaimModalComponent implements OnInit {
  @Input() position: Position;

  compoundEarnings: boolean;
  claimInVaultShares: boolean;

  underlyingReceived: BigNumber;
  shareReceived: BigNumber;
  pytReceived: BigNumber;
  nytReceived: BigNumber;

  constructor(
    public activeModal: NgbActiveModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public util: UtilService,
    public wallet: WalletService
  ) {}

  ngOnInit(): void {
    this.resetData();
    this.loadData();
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  resetData() {
    this.compoundEarnings = false;
    this.claimInVaultShares = false;

    this.underlyingReceived = new BigNumber(0);
    this.shareReceived = new BigNumber(0);
    this.pytReceived = new BigNumber(0);
    this.nytReceived = new BigNumber(0);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadData() {
    const web3 = this.wallet.httpsWeb3();
    const xpyt = this.contract.getXPYT(this.position.vault.xpyt[0].address, web3);

    this.underlyingReceived = this.position.earnings;
    this.pytReceived = this.position.earnings;
    this.nytReceived = this.position.earnings;

    xpyt.methods
      .convertToShares(
        this.util.processWeb3Number(
          this.position.earnings.times(this.position.vault.underlying.precision)
        )
      )
      .call()
      .then((shares) => {
        this.shareReceived = new BigNumber(shares).div(
          this.position.vault.share.precision
        );
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  toggleCompoundEarnings() {
    this.compoundEarnings = !this.compoundEarnings;

    if (this.compoundEarnings) {
      this.claimInVaultShares = false;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  toggleClaimInVaultShares() {
    this.claimInVaultShares = !this.claimInVaultShares;

    if (this.claimInVaultShares) {
      this.compoundEarnings = false;
    }
  }

  // -----------------------------------------------------------------------
  // TODO: Add callback on tx confirmed
  // -----------------------------------------------------------------------
  claim() {
    const web3 = this.wallet.web3;
    const gate = this.contract.getGate(this.position.gate.address, web3);

    let func;
    if (this.compoundEarnings) {
      func = gate.methods.claimYieldAndEnter(
        this.wallet.userAddress,
        this.wallet.userAddress,
        this.position.vault.share.address,
        this.constants.ZERO_ADDRESS
      );
    } else if (this.claimInVaultShares) {
      func = gate.methods.claimYieldInVaultShares(
        this.wallet.userAddress,
        this.position.vault.share.address
      );
    } else {
      func = gate.methods.claimYieldInUnderlying(
        this.wallet.userAddress,
        this.position.vault.share.address
      );
    }

    this.wallet
      .sendTx(
        func,
        () => {
          this.activeModal.dismiss();
        },
        () => {},
        () => {}, // will the callback fire even if the modal is closed?
        () => {}
      )
      .catch((error) => {
        console.error(error);
      });
  }
}
