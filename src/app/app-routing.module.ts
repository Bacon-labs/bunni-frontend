import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SwapComponent } from 'src/app/components/swap/swap.component';
import { MintComponent } from 'src/app/components/mint/mint.component';
import { PoolComponent } from 'src/app/components/pool/pool.component';
import { StakeComponent } from 'src/app/components/stake/stake.component';
import { PortfolioComponent } from 'src/app/components/portfolio/portfolio.component';
import { BurnComponent } from 'src/app/components/burn/burn.component';
import { AnalyticsComponent } from 'src/app/components/analytics/analytics.component';
import { BoostComponent } from 'src/app/components/boost/boost.component';
import { LandingComponent } from 'src/app/components/landing/landing.component';
import { FactoryComponent } from './components/factory/factory.component';
import { AddComponent } from './components/add/add.component';

const routes: Routes = [
  {
    path: '',
    component: LandingComponent,
    pathMatch: 'full',
  },
  {
    path: 'pool',
    component: PoolComponent,
  },
  {
    path: 'add',
    component: AddComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
