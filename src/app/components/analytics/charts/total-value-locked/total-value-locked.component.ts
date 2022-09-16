import { Component, OnInit, NgZone } from '@angular/core';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';
import { Chart } from 'chart.js';

import { DEPLOYMENT_TIMESTAMP } from 'src/app/constants/deployments';

import { ConstantsService } from 'src/app/services/constants.service';
import { GateService } from 'src/app/services/gate.service';
import { TimeService } from 'src/app/services/time.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-total-value-locked',
  templateUrl: './total-value-locked.component.html',
  styleUrls: ['./total-value-locked.component.scss'],
})
export class TotalValueLockedComponent implements OnInit {
  PERIOD: number = this.time.DAY_IN_SEC;

  labels: string[];
  data: DataObject[];

  tooltipValue: [BigNumber, string];
  tooltipLabel: string;

  // chart variables
  public chartOptions;
  public chartLabels;
  public chartType;
  public chartLegend;
  public chartData;
  public chartPlugins;

  constructor(
    public constants: ConstantsService,
    public gate: GateService,
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
    this.tooltipValue = [new BigNumber(0), ''];
    this.tooltipLabel = '';
  }

  // -----------------------------------------------------------------------
  // @todo Loop the query to support larger queries
  // -----------------------------------------------------------------------
  async loadData(chainId: number) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;
    
    const [timestamps, blocks] = await this.time.getCustomTimeSeries(
      DEPLOYMENT_TIMESTAMP[chainId],
      this.PERIOD,
      chainId
    );
    this.labels = this.time.getReadableTimestamps(timestamps);

    // then generate the query
    let queryString = `query TotalValueLocked {`;
    queryString += `vaults {
      yieldTokenTotalSupply
      underlyingPriceUSD
      underlying
      share
    }`;
    for (let i = 0; i < blocks.length; i++) {
      queryString += `t${i}: vaults(
        block: {
          number: ${blocks[i]}
        }
      ) {
        yieldTokenTotalSupply
        underlyingPriceUSD
        underlying
        share
      }`;
    }
    queryString += `}`;
    const query = gql`
      ${queryString}
    `;

    request(
      this.constants.GRAPHQL_ENDPOINT[chainId],
      query
    ).then((data: QueryResult) => this.handleData(data, chainId));
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async handleData(data: QueryResult, chainId: number) {
    const totalValueLocked = new Array(Object.keys(data).length - 1).fill(0);

    for (const t in data) {
      let totalTVL = 0;
      for (const vault of data[t]) {
        const token = await this.gate.getToken(vault.underlying, chainId);
        const vaultTVL =
          ((+vault.yieldTokenTotalSupply / token.precision) *
            vault.underlyingPriceUSD) /
          1e6;
        totalTVL = totalTVL + vaultTVL;
      }

      if (t === 'vaults') {
        totalValueLocked.push(totalTVL);
        this.labels.push('');
      } else {
        totalValueLocked[parseInt(t.substring(1))] = totalTVL;
      }
    }

    // set the initial tooltip value to the most recent datapoint
    this.tooltipValue = this.util.formatBN(
      new BigNumber(totalValueLocked[totalValueLocked.length - 1])
    );

    let index: number;
    const plugin = {
      id: 'plugin',
      beforeEvent: (chart, args, pluginOptions) => {
        if (chart.tooltip._active && chart.tooltip._active.length) {
          const activePoint = chart.tooltip._active[0];
          if (index !== activePoint.index) {
            index = activePoint.index;
          }
        }
      },
      beforeDatasetsDraw: (chart, args, pluginOptions) => {
        if (chart.tooltip._active && chart.tooltip._active.length) {
          const activePoint = chart.tooltip._active[0];
          if (index === activePoint.index) {
            this.zone.run(() => {
              const tvl = totalValueLocked[index];
              this.tooltipValue = this.util.formatBN(new BigNumber(tvl));
              this.tooltipLabel = this.labels[index];
            });

            const ctx = chart.ctx;
            ctx.restore();
            ctx.setLineDash([0, 0]);
            ctx.beginPath();
            ctx.moveTo(activePoint.element.x, chart.chartArea.top);
            ctx.lineTo(activePoint.element.x, chart.chartArea.bottom);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(102, 102, 102, 1)';
            ctx.stroke();
            ctx.save();
          }
        } else if (!chart.tooltip_active) {
          this.zone.run(() => {
            this.tooltipValue = this.util.formatBN(
              new BigNumber(totalValueLocked[totalValueLocked.length - 1])
            );
            this.tooltipLabel = '';
          });
        }
      },
    };

    // const plugin2 = {
    //   id: 'plugin2',
    //   afterRender: (chart, args, pluginOptions) => {
    //     const ctx = chart.ctx;
    //     const left = chart.chartArea.left;
    //     const right = chart.chartArea.right;
    //
    //     let yValue = null;
    //     for (const point of chart._metasets[0].data) {
    //       if (yValue === null || point.y < yValue) {
    //         yValue = point.y;
    //       }
    //     }
    //
    //     ctx.restore();
    //     ctx.setLineDash([2, 2]);
    //     ctx.beginPath();
    //     ctx.moveTo(left, yValue);
    //     ctx.lineTo(right, yValue);
    //     ctx.lineWidth = 1;
    //     ctx.strokeStyle = 'rgba(102, 102, 102, 1)';
    //     ctx.stroke();
    //     ctx.save();
    //   },
    // };

    this.chartPlugins = [plugin];
    // this.chartPlugins = [plugin, plugin2];
    this.chartOptions = {
      responsive: true,
      animation: false,
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            align: 'start',
            autoSkip: true,
            maxRotation: 0,
            minRotation: 0,
            maxTicksLimit: 8,
          },
        },
        y: {
          grid: {
            display: false,
          },
          position: 'right',
          scaleLabel: {
            display: true,
            labelString: 'USD',
          },
          ticks: {
            maxTicksLimit: 8,
            callback: (label, index, labels) => {
              const bn = this.util.formatBN(new BigNumber(label));
              const value = bn[1] ? bn[0].toFormat(1) : bn[0].toFormat(0);
              const magnitude = bn[1] ? bn[1] : '';
              return '$' + value + magnitude;
            },
          },
        },
      },
      hover: {
        axis: 'x',
        mode: 'nearest',
        intersect: false,
      },
      elements: {
        point: {
          radius: 0,
          hoverRadius: 2,
        },
        line: {
          tension: 0,
          borderWidth: 1,
        },
      },
      events: ['mousemove', 'mouseout'],
      plugins: {
        autocolors: false,
        tooltip: {
          axis: 'x',
          mode: 'nearest',
          events: ['mousemove', 'mouseout'],
          intersect: false,
          displayColors: false,
          enabled: false,
        },
      },
    };
    this.chartLabels = this.labels;
    this.chartType = 'line';
    this.chartLegend = false;
    this.chartData = [
      {
        data: totalValueLocked,
        borderColor: 'rgba(6, 231, 204, 1)',
        hoverBorderColor: 'rgba(6, 231, 204, 1)',
        pointBorderColor: 'rgba(6, 231, 204, 1)',
        pointBackgroundColor: 'rgba(6, 231, 204, 1)',
        pointHoverBorderColor: 'rgba(6, 231, 204, 1)',
        pointHoverBackgroundColor: 'rgba(6, 231, 204, 1)',
        fill: {
          target: 'origin',
          above: function (context) {
            const chart = context.chart;
            const { ctx, chartArea } = chart;
            if (!chartArea) {
              return;
            }
            let gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, 0);
            gradient.addColorStop(0, 'rgba(26, 26, 26, 0.3)');
            gradient.addColorStop(1, 'rgba(6, 231, 204, 0)');
            return gradient;
          },
        },
      },
    ];
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

interface TotalValueLocked {
  data: number[];
  label: string;
  borderColor: string;
}

interface DataObject {
  tvl: number[];
  data: number[];
  label: string;
  vault: string;
}
