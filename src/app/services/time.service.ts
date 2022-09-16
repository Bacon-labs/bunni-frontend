import { Injectable } from '@angular/core';
import { ConstantsService } from 'src/app/services/constants.service';
import { request, gql } from 'graphql-request';
import { WalletService } from 'src/app/services/wallet.service';

@Injectable({
  providedIn: 'root',
})
export class TimeService {
  DAY_IN_SEC = 86400; // 24h * 60m * 60s
  WEEK_IN_SEC = 604800; // 7d * 24h * 60m * 60s
  MONTH_IN_SEC = 2592000; // 30d * 24h * 60m * 60s

  constructor(
    public constants: ConstantsService,
    public wallet: WalletService
  ) {}

  getLatestUTCDate() {
    let date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime() / 1000;
  }

  calcNumPeriods(start: number, end: number, period: number) {
    let interval = end - start + 1;
    return interval / period;
  }

  async getBlock(timestamp: number, chainId: number): Promise<number> {
    const queryString = gql`
      {
        blocks(
          first: 1,
          orderBy: timestamp,
          orderDirection: asc,
          where: {
            timestamp_gt: ${timestamp},
            timestamp_lt: ${timestamp + 600}
          }
        ) {
          id
          number
        }
      }
    `;
    return await request(
      this.constants.BLOCKS_GRAPHQL_ENDPOINT[chainId],
      queryString
    ).then((result) => {
      return result.blocks[0].number;
    });
  }

  getReadableTimestamps(timestamps: number[]): string[] {
    let readable: string[] = [];
    for (let i in timestamps) {
      readable.push(
        new Date(timestamps[i] * 1000).toLocaleString('en-US', {
          timeZone: 'UTC',
          month: 'short',
          day: 'numeric',
        })
      );
    }
    return readable;
  }

  async getCustomTimeSeries(
    customStart: number,
    customPeriod: number,
    networkID: number = this.wallet.chainId
  ) {
    let timeStamps: number[] = [];
    let allBlocks: number[] = [];
    let data: number[][] = [];

    let startTime: number = customStart;
    let endTime: number = this.getLatestUTCDate();

    if (customPeriod === this.MONTH_IN_SEC) {
      let current: number = customStart;
      let end: number = endTime;
      while (end >= current) {
        timeStamps.push(current);

        let seconds = 0;
        let date = new Date(current * 1000);
        let month = date.getUTCMonth();

        if (month == 0) {
          // january
          seconds = this.DAY_IN_SEC * 31;
        } else if (month == 1) {
          // february
          let year = date.getUTCFullYear();
          if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {
            seconds = this.DAY_IN_SEC * 29; // leap year
          } else {
            seconds = this.DAY_IN_SEC * 28; // normal year
          }
        } else if (month == 2) {
          // march
          seconds = this.DAY_IN_SEC * 31;
        } else if (month == 3) {
          // april
          seconds = this.DAY_IN_SEC * 30;
        } else if (month == 4) {
          // may
          seconds = this.DAY_IN_SEC * 31;
        } else if (month == 5) {
          // june
          seconds = this.DAY_IN_SEC * 30;
        } else if (month == 6) {
          // july
          seconds = this.DAY_IN_SEC * 31;
        } else if (month == 7) {
          // august
          seconds = this.DAY_IN_SEC * 31;
        } else if (month == 8) {
          // september
          seconds = this.DAY_IN_SEC * 30;
        } else if (month == 9) {
          // october
          seconds = this.DAY_IN_SEC * 31;
        } else if (month == 10) {
          // november
          seconds = this.DAY_IN_SEC * 30;
        } else if (month == 11) {
          // december
          seconds = this.DAY_IN_SEC * 31;
        }

        current += seconds;
      }
    } else {
      let period: number = customPeriod;
      let numPeriods: number = this.calcNumPeriods(startTime, endTime, period);
      for (let p = 0; p < numPeriods; p++) {
        timeStamps.push(startTime + p * period);
      }
    }

    let count: number = 0;
    while (count < timeStamps.length) {
      let limit = timeStamps.length - count;
      if (limit > 100) {
        limit = 100;
      }

      let queryString = `query GetBlocks {`;
      for (let i = count; i < count + limit; i++) {
        queryString += `t${i}: blocks(
          first: 1,
          orderBy: timestamp,
          orderDirection: asc,
          where: {
            timestamp_gt: ${timeStamps[i]},
            timestamp_lt: ${timeStamps[i] + 600}
          }
        ) {
          id
          number
          timestamp
        }`;
      }
      queryString += `}`;
      const blocksQuery = gql`
        ${queryString}
      `;

      const blocks: number[] = await request(
        this.constants.BLOCKS_GRAPHQL_ENDPOINT[networkID],
        blocksQuery
      ).then((data) => {
        let blocks: number[] = [];
        for (let block in data) {
          blocks.push(parseInt(data[block][0].number));
        }
        blocks.sort(function (a, b) {
          return a - b;
        });
        return blocks;
      });

      count += limit;
      allBlocks = allBlocks.concat(blocks);
    }

    data.push(timeStamps);
    data.push(allBlocks);
    return data;
  }
}
