import { Component, OnInit } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ConstantsService } from 'src/app/services/constants.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-wallet-connect-modal',
  templateUrl: './wallet-connect-modal.component.html',
  styleUrls: ['./wallet-connect-modal.component.scss'],
})
export class WalletConnectModalComponent implements OnInit {
  user: string;
  ens: string;
  explorerURL: string;

  constructor(
    public activeModal: NgbActiveModal,
    public constants: ConstantsService,
    public wallet: WalletService
  ) {}

  ngOnInit(): void {
    this.resetData();
    this.loadData();
  }

  resetData(): void {
    this.user = '';
    this.ens = '';
    this.explorerURL = '';
  }

  async loadData() {
    this.user = this.wallet.userAddress;

    if (this.user) {
      this.setExplorerURL();
      this.ens = await this.wallet.reverseENSLookup(this.user);
    }
  }

  setExplorerURL() {
    const metadata = this.constants.CHAIN_METADATA[this.wallet.chainId];
    const explorerPrefix = metadata.blockExplorerUrls[0] + '/address/';
    this.explorerURL = explorerPrefix + this.user;
  }

  async connectWallet(provider: Provider) {
    await provider.onClick();
    this.activeModal.dismiss();
  }

  disconnectWallet() {
    this.wallet.disconnect();
  }
}

interface Provider {
  name: string;
  logo: URL;
  description: string;
  onClick: () => {};
}
