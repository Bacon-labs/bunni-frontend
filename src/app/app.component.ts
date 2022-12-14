import { Component } from '@angular/core';
import { WalletService } from './services/wallet.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  title = 'timeless-frontend';

  constructor(public wallet: WalletService) {
    wallet.connect();
  }
}
