import { NgModule } from '@angular/core';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { AppRoutingModule } from './app-routing.module';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { NgChartsModule } from 'ng2-charts';
import { ToastrModule } from 'ngx-toastr';

import Web3 from 'web3';
import { Web3WalletConnector } from '@mindsorg/web3modal-ts';

// components
import { AppComponent } from './app.component';
import { HeaderComponent } from 'src/app/components/header/header.component';
import { SwapComponent } from 'src/app/components/swap/swap.component';
import { MintComponent } from 'src/app/components/mint/mint.component';
import { BurnComponent } from 'src/app/components/burn/burn.component';
import { PoolComponent } from 'src/app/components/pool/pool.component';
import { StakeComponent } from 'src/app/components/stake/stake.component';
import { PortfolioComponent } from 'src/app/components/portfolio/portfolio.component';
import { BoostComponent } from './components/boost/boost.component';
import { LandingComponent } from './components/landing/landing.component';
import { FooterComponent } from './components/footer/footer.component';
import { FactoryComponent } from './components/factory/factory.component';
import { AddComponent } from './components/add/add.component';

// modals
import { WalletConnectModalComponent } from 'src/app/modals/wallet-connect-modal/wallet-connect-modal.component';
import { TokenSelectModalComponent } from 'src/app/modals/token-select-modal/token-select-modal.component';
import { TransactionAlertModalComponent } from 'src/app/modals/transaction-alert-modal/transaction-alert-modal.component';
import { ClaimModalComponent } from './components/portfolio/modals/claim-modal/claim-modal.component';
import { AnalyticsComponent } from './components/analytics/analytics.component';
import { TotalValueLockedComponent } from './components/analytics/charts/total-value-locked/total-value-locked.component';
import { ManageLiquidityModalComponent } from './modals/manage-liquidity-modal/manage-liquidity-modal.component';
import { LiquidityModalComponent } from './modals/liquidity-modal/liquidity-modal.component';



@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    SwapComponent,
    MintComponent,
    PoolComponent,
    StakeComponent,
    PortfolioComponent,
    WalletConnectModalComponent,
    TokenSelectModalComponent,
    TransactionAlertModalComponent,
    BurnComponent,
    ClaimModalComponent,
    AnalyticsComponent,
    TotalValueLockedComponent,
    ManageLiquidityModalComponent,
    BoostComponent,
    LandingComponent,
    FooterComponent,
    FactoryComponent,
    LiquidityModalComponent,
    AddComponent,
  ],
  imports: [
    AppRoutingModule,
    BrowserModule,
    BrowserAnimationsModule,
    ClipboardModule,
    MatTableModule,
    MatSortModule,
    NgbModule,
    NgChartsModule,
    ToastrModule.forRoot(),
  ],
  providers: [
    Web3,
    {
      provide: Web3WalletConnector,
      useFactory: () => {
        return new Web3WalletConnector({
          network: '',
          cacheProvider: false,
          disableInjectedProvider: true,
          providerOptions: {},
        });
      },
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
