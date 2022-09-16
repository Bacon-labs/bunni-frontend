import { Component, OnInit } from '@angular/core';
import { ConstantsService } from 'src/app/services/constants.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-transaction-alert-modal',
  templateUrl: './transaction-alert-modal.component.html',
  styleUrls: ['./transaction-alert-modal.component.scss'],
})
export class TransactionAlertModalComponent implements OnInit {
  hash: string;
  chainId: number;
  txConfirmed: boolean;
  explorerLink: string;

  constructor(
    public constants: ConstantsService
  ) { }

  ngOnInit(): void {
    this.explorerLink = this.getExplorerLink();
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getExplorerLink(): string {
    const metadata = this.constants.CHAIN_METADATA[this.chainId];
    const prefix = metadata.blockExplorerUrls[0];
    const suffix = `/tx/` + this.hash;

    return prefix + suffix;
  }
}
