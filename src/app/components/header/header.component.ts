import { Component, OnInit, NgZone } from '@angular/core';
import { WalletConnectModalComponent } from 'src/app/modals/wallet-connect-modal/wallet-connect-modal.component';
import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { WalletService } from 'src/app/services/wallet.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { Router } from '@angular/router';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent implements OnInit {
  user: string;
  ens: string;

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public wallet: WalletService,
    public route: Router,
    public zone: NgZone
  ) {}

  ngOnInit(): void {
    this.wallet.connectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData();
        this.loadData();
      });
    });

    this.wallet.disconnectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData();
        this.loadData();
      });
    });

    this.wallet.chainChangedEvent.subscribe((networkID) => {
      this.zone.run(() => {
        this.resetData();
        this.loadData();
      });
    });

    this.wallet.accountChangedEvent.subscribe((account) => {
      this.zone.run(() => {
        this.resetData();
        this.loadData();
      });
    });
  }

  resetData(): void {
    this.user = '';
    this.ens = '';
  }

  async loadData() {
    this.user = this.wallet.userAddress;
    this.ens = await this.wallet.reverseENSLookup(this.user);
  }

  // -----------------------------------------------------------------------
  // @notice Mints 100 TEST tokens to the user. Only available on Rinkeby.
  // -----------------------------------------------------------------------
  tapFaucet() {
    if (this.wallet.chainId !== this.constants.CHAIN_ID.RINKEBY) return;

    const web3 = this.wallet.web3;
    const amount = '100000000000000000000';
    const address = '0xd373a63ce95fe95bb8a3417dc075943cc39dd1d2';
    const testToken = this.contract.getContract(address, 'MockERC20', web3);

    const func = testToken.methods.mint(this.user, amount);

    this.wallet
      .sendTx(
        func,
        () => {},
        () => {},
        () => {},
        () => {}
      )
      .catch((error) => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // MODAL FUNCTIONS
  // -----------------------------------------------------------------------

  openWalletModal(): void {
    const modalRef = this.modalService.open(WalletConnectModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
  }
}
