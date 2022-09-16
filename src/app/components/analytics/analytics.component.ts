import { Component, OnInit, NgZone } from '@angular/core';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';

import { DEPLOYMENT_TIMESTAMP } from 'src/app/constants/deployments';

import { ConstantsService } from 'src/app/services/constants.service';
import { GateService } from 'src/app/services/gate.service';
import { PriceService } from 'src/app/services/price.service';
import { TimeService } from 'src/app/services/time.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

import { TotalValueLockedComponent } from 'src/app/components/analytics/charts/total-value-locked/total-value-locked.component';

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss'],
})
export class AnalyticsComponent implements OnInit {
  vaultDetails: VaultDetails[];
  totalValueLocked: [BigNumber, string];
  totalValueChanged: BigNumber;

  constructor(
    public constants: ConstantsService,
    public gate: GateService,
    public price: PriceService,
    public time: TimeService,
    public util: UtilService,
    public wallet: WalletService,
    public zone: NgZone
  ) {}

  ngOnInit(): void {
    this.resetData();
    this.loadData(this.wallet.chainId);

    this.wallet.chainChangedEvent.subscribe((chainId) => {
      this.zone.run(() => {
        this.resetData();
        this.loadData(chainId);
      });
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  resetData() {
    this.vaultDetails = [];
    this.totalValueLocked = [new BigNumber(0), ''];
    this.totalValueChanged = new BigNumber(0);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadData(chainId: number) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;

    const day = Math.floor(Date.now() / 1e3) - this.time.DAY_IN_SEC;
    const week = Math.floor(Date.now() / 1e3) - this.time.DAY_IN_SEC * 7;
    const month = Math.floor(Date.now() / 1e3) - this.time.DAY_IN_SEC * 30;

    let queryString = `query Analytics {`;
    queryString += `vaults(first: 1000) {
      yieldTokenTotalSupply
      underlyingPriceUSD
      underlying
      share
    }`;

    if (day > DEPLOYMENT_TIMESTAMP[chainId]) {
      const day_block = await this.time.getBlock(day, chainId);
      queryString += `day: vaults(
        first: 1000,
        block: {
          number: ${day_block}
        }
      ) {
        yieldTokenTotalSupply
        underlyingPriceUSD
        share
      }`;
    }

    if (week > DEPLOYMENT_TIMESTAMP[chainId]) {
      const week_block = await this.time.getBlock(week, chainId);
      queryString += `week: vaults(
        first: 1000,
        block: {
          number: ${week_block}
        }
      ) {
        yieldTokenTotalSupply
        underlyingPriceUSD
        share
      }`;
    }

    if (month > DEPLOYMENT_TIMESTAMP[chainId]) {
      const month_block = await this.time.getBlock(month, chainId);
      queryString += `month: vaults(
        first: 1000,
        block: {
          number: ${month_block}
        }
      ) {
        yieldTokenTotalSupply
        underlyingPriceUSD
        share
      }`;
    }

    queryString += `}`;
    const query = gql`
      ${queryString}
    `;

    request(
      this.constants.GRAPHQL_ENDPOINT[chainId],
      queryString
    ).then((data: QueryResult) => this.handleData(data, chainId));
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async handleData(data: QueryResult, chainId: number) {
    let vaultDetails: VaultDetails[] = [];
    let totalValueLocked = new BigNumber(0);
    let totalValueLockedYesterday = new BigNumber(0);

    for (const vault of data.vaults) {
      const token = await this.gate.getToken(vault.underlying, chainId);
      const share = await this.gate.getToken(vault.share, chainId);

      // handle data from chain head
      const tvl = new BigNumber(vault.yieldTokenTotalSupply)
        .div(token.precision)
        .times(vault.underlyingPriceUSD)
        .div(1e6);
      totalValueLocked = totalValueLocked.plus(tvl);

      // handle data from 1 days ago
      let day = data['day'] && data['day'].find((v) => v.share === vault.share);
      let day_tvl = new BigNumber(0);
      let day_change = null;

      if (day) {
        day_tvl = new BigNumber(day.yieldTokenTotalSupply)
          .div(token.precision)
          .times(day.underlyingPriceUSD)
          .div(1e6);
        day_change = tvl.minus(day_tvl).div(day_tvl).times(100);
        if (day_change.isNaN()) {
          day_change = new BigNumber(0);
        }
      }
      totalValueLockedYesterday = totalValueLockedYesterday.plus(day_tvl);

      // handle data from 7 days ago
      let week = data['week'] && data['week'].find((v) => v.share === vault.share);
      let week_tvl = new BigNumber(0);
      let week_change = null;

      if (week) {
        week_tvl = new BigNumber(week.yieldTokenTotalSupply)
          .div(token.precision)
          .times(week.underlyingPriceUSD)
          .div(1e6);
        week_change = tvl.minus(week_tvl).div(week_tvl).times(100);
        if (week_change.isNaN()) {
          week_change = new BigNumber(0);
        }
      }

      // handle data from 30 days ago
      let month = data['month'] && data['month'].find((v) => v.share === vault.share);
      let month_tvl = new BigNumber(0);
      let month_change = null;

      if (month) {
        month_tvl = new BigNumber(month.yieldTokenTotalSupply)
          .div(token.precision)
          .times(month.underlyingPriceUSD)
          .div(1e6);
        month_change = tvl.minus(month_tvl).div(month_tvl).times(100);
        if (month_change.isNaN()) {
          month_change = new BigNumber(0);
        }
      }

      const vaultObj: VaultDetails = {
        name: share.name,
        symbol: share.symbol,
        address: share.address,
        iconPath: token.iconPath,
        totalValueLocked: this.util.formatBN(tvl),
        rawTotalValueLocked: tvl,
        dayChange: day_change,
        weekChange: week_change,
        monthChange: month_change,
      };
      vaultDetails = [...vaultDetails, vaultObj];
    }

    vaultDetails.sort((a, b) => {
      return b.rawTotalValueLocked.gt(a.rawTotalValueLocked) ? 1 : -1;
    });

    // sort by tvl
    this.vaultDetails = vaultDetails;
    this.totalValueLocked = this.util.formatBN(totalValueLocked);
    this.totalValueChanged = totalValueLocked
      .minus(totalValueLockedYesterday)
      .div(totalValueLockedYesterday)
      .times(100);
    if (this.totalValueChanged.isNaN()) {
      this.totalValueChanged = new BigNumber(0);
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  sortBy(event: any) {
    if (event.active === 'name') {
      this.vaultDetails =
        event.direction === 'asc'
          ? [
              ...this.vaultDetails.sort((a, b) =>
                a[event.active] > b[event.active] ? 1 : -1
              ),
            ]
          : [
              ...this.vaultDetails.sort((a, b) =>
                b[event.active] > a[event.active] ? 1 : -1
              ),
            ];
    } else if (event.active === 'totalValueLocked') {
      this.vaultDetails =
        event.direction === 'asc'
          ? [
              ...this.vaultDetails.sort((a, b) =>
                a[event.active][0].minus(b[event.active][0])
              ),
            ]
          : [
              ...this.vaultDetails.sort((a, b) =>
                b[event.active][0].minus(a[event.active][0])
              ),
            ];
    } else {
      this.vaultDetails =
        event.direction === 'asc'
          ? [
              ...this.vaultDetails.sort((a, b) =>
                a[event.active].minus(b[event.active])
              ),
            ]
          : [
              ...this.vaultDetails.sort((a, b) =>
                b[event.active].minus(a[event.active])
              ),
            ];
    }
  }
}

interface QueryResult {
  vaults: {
    yieldTokenTotalSupply: string;
    underlyingPriceUSD: string;
    underlying: string;
    share: string;
  }[];
}

interface VaultDetails {
  name: string;
  symbol: string;
  address: string;
  iconPath: string;
  totalValueLocked: [BigNumber, string];
  rawTotalValueLocked: BigNumber;
  dayChange: BigNumber;
  weekChange: BigNumber;
  monthChange: BigNumber;
}
