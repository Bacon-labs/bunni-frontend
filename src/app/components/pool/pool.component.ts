import { Component, OnInit, NgZone } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';

import { ManageLiquidityModalComponent } from 'src/app/modals/manage-liquidity-modal/manage-liquidity-modal.component';
import { LiquidityModalComponent } from 'src/app/modals/liquidity-modal/liquidity-modal.component';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Gate, Vault, Token } from 'src/app/services/gate.service';
import { PriceService } from 'src/app/services/price.service';
import { TimeService } from 'src/app/services/time.service';
import { TokenService, UserBalances } from 'src/app/services/token.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Component({
  selector: 'app-pool',
  templateUrl: './pool.component.html',
  styleUrls: ['./pool.component.scss'],
})
export class PoolComponent implements OnInit {
  user: string;
  userClaimableReward: BigNumber;

  pools: Pool[];
  userPools: UserPool[];
  globalPools: GlobalPool[];

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public gate: GateService,
    public price: PriceService,
    public time: TimeService,
    public token: TokenService,
    public util: UtilService,
    public wallet: WalletService,
    public zone: NgZone
  ) {}

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  ngOnInit(): void {
    this.resetData(true, true, this.wallet.chainId);
    this.loadData(this.wallet.connected, true, this.wallet.chainId);

    this.wallet.connectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false, this.wallet.chainId);
        this.loadData(true, false, this.wallet.chainId);
      });
    });

    this.wallet.disconnectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false, this.wallet.chainId);
        this.loadData(false, false, this.wallet.chainId);
      });
    });

    this.wallet.chainChangedEvent.subscribe((chainId) => {
      this.zone.run(() => {
        this.resetData(true, true, chainId);
        this.loadData(this.wallet.connected, true, chainId);
      });
    });

    this.wallet.accountChangedEvent.subscribe((account) => {
      this.zone.run(() => {
        this.resetData(true, false, this.wallet.chainId);
        this.loadData(true, false, this.wallet.chainId);
      });
    });
  }

  // -----------------------------------------------------------------------
  // @dev Check reset position for this.pools
  // -----------------------------------------------------------------------
  resetData(resetUser: boolean, resetGlobal: boolean, chainId: number) {
    this.pools = [];

    if (resetUser) {
      this.user = '';
      this.userClaimableReward = new BigNumber(0);
      this.userPools = [];
    }
    if (resetGlobal) {
      this.globalPools = [];
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadData(loadUser: boolean, loadGlobal: boolean, chainId: number) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;

    this.user = this.wallet.userAddress;

    await Promise.all([
      loadUser ? this.loadUserData(chainId) : null,
      loadGlobal ? this.loadGlobalData(chainId) : null,
    ]).then(() => {
      // merge global pools
      for (const globalPool of this.globalPools) {
        let pool = this.pools.find(
          (pool) => pool.address === globalPool.address
        );

        if (!pool) {
          pool = this.initializePool();
        }

        pool.address = globalPool.address;
        pool.xpyt = globalPool.xpyt;
        pool.nyt = globalPool.nyt;
        pool.fee = globalPool.fee;
        pool.liquidity = globalPool.liquidity;
        pool.rawTotalValueLocked = globalPool.rawTotalValueLocked;
        pool.totalValueLocked = globalPool.totalValueLocked;
        pool.rawTotalVolume = globalPool.rawTotalVolume;
        pool.totalVolume = globalPool.totalVolume;
        pool.rawTotalFees = globalPool.rawTotalFees;
        pool.totalFees = globalPool.totalFees;
        pool.incentives = globalPool.incentives;
        pool.token0 = globalPool.token0;
        pool.token1 = globalPool.token1;
        pool.token0Price = globalPool.token0Price;
        pool.token1Price = globalPool.token1Price;
      }

      // merge user pools
      for (const userPool of this.userPools) {
        let pool = this.pools.find((pool) => pool.address === userPool.address);

        if (pool) {
          pool.reward = userPool.reward;
          pool.positions = userPool.positions;
        }
      }

      this.pools.sort((a, b) => b.rawTotalValueLocked.gt(a.rawTotalValueLocked) ? 1 : -1);
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadUserData(chainId: number) {
    const queryString = gql`
      {
        positions(
          where: {
            owner: "${this.user.toLowerCase()}"
          }
        ) {
          id
          pool
          owner
          staked
          incentives {
            id
            rewardToken
            pool
            startTime
            endTime
            refundee
          }
        }
      }
    `;
    await request(
      this.constants.GRAPHQL_ENDPOINT[chainId],
      queryString
    ).then((data: UserQueryResult) => this.handleUserData(data, chainId));
  }

  // -----------------------------------------------------------------------
  // @notice Only loads currently active incentives.
  // -----------------------------------------------------------------------
  async loadGlobalData(chainId: number, queryLast: boolean = true) {
    const now = Math.floor(Date.now() / 1e3);

    let queryString = `query Pools {`;
    queryString += `current: pools(first: 1000) {
      address
      fee
      liquidity
      token0
      token1
      token0Price
      token1Price
      totalValueLockedToken0
      totalValueLockedToken1
      totalVolumeToken0
      totalVolumeToken1
      totalFeesToken0
      totalFeesToken1
      incentives (
        where: {
          startTime_lt: ${now},
          endTime_gt: ${now}
        }
      ) {
        id
        rewardToken
        pool
        startTime
        endTime
        refundee
      }
    }`;

    if (queryLast) {
      const block = await this.time.getBlock(now - this.time.DAY_IN_SEC, chainId);
      queryString += `last: pools(first: 1000, block: {number: ${block} }) {
        address
        token0
        token1
        fee
        totalValueLockedToken0
        totalValueLockedToken1
        totalVolumeToken0
        totalVolumeToken1
        totalFeesToken0
        totalFeesToken1
      }`;
    }

    queryString += `}`;
    const query = gql`
      ${queryString}
    `;

    await request(this.constants.GRAPHQL_ENDPOINT[chainId], queryString)
      .then((data: GlobalQueryResult) => this.handleGlobalData(data, chainId))
      .catch((error) => this.loadGlobalData(chainId, false));
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async handleUserData(data: UserQueryResult, chainId: number) {
    const web3 = this.wallet.httpsWeb3(chainId);
    const staker = this.contract.getContract(
      this.constants.UNISWAP_V3_STAKER[chainId],
      'UniswapV3Staker',
      web3
    );
    const userPositions = data['positions'];

    if (this.constants.TIT[chainId]) {
      staker.methods.rewards(this.constants.TIT[chainId], this.user)
        .call()
        .then((reward) => {
          this.userClaimableReward = new BigNumber(reward).div(1e18);
        });
    }

    let userPools: UserPool[] = [];

    await Promise.all(
      userPositions.map(async (position) => {
        let userPool = userPools.find((pool) => (pool.address = position.pool));

        // add the pool if one does not yet exist
        if (!userPool) {
          userPool = {
            address: position.pool,
            positions: [],
            reward: new BigNumber(0),
          };
          userPools = [...userPools, userPool];
        }

        // handle incentives
        let incentives: Incentive[] = [];
        let positionReward: BigNumber = new BigNumber(0);

        await Promise.all(
          position.incentives.map(async (incentive) => {
            const incentiveObj: Incentive = {
              id: incentive.id,
              rewardToken: incentive.rewardToken,
              pool: incentive.pool,
              startTime: parseInt(incentive.startTime),
              endTime: parseInt(incentive.endTime),
              refundee: incentive.refundee,
            };
            incentives = [...incentives, incentiveObj];

            const IncentiveKey = {
              rewardToken: incentive.rewardToken,
              pool: incentive.pool,
              startTime: incentive.startTime,
              endTime: incentive.endTime,
              refundee: incentive.refundee,
            };

            const reward = await staker.methods
              .getRewardInfo(IncentiveKey, position.id)
              .call()
              .then((result) => {
                // position is deposited in the staking contract
                return result.reward;
              })
              .catch((error) => {
                // position is not deposited in the staking contract
                return 0;
              });
            const incentiveReward = new BigNumber(reward).div(1e18); // @dev Divide by TIT token precision
            positionReward = positionReward.plus(incentiveReward);
          })
        ).then(() => {
          userPool.reward = userPool.reward.plus(positionReward);
        });

        // add the position to the pool
        const positionObj: Position = {
          id: position.id,
          staked: position.staked,
          reward: positionReward,
          incentives: incentives,
        };
        userPool.positions = [...userPool.positions, positionObj];
      })
    ).then(() => {
      this.userPools = userPools;
    });
  }

  // -----------------------------------------------------------------------
  // @dev We call getTokenPriceUSD() twice for every pool, which will significantly
  // hinder performance as the number of xPYT/NYT liquidity pools grows. This
  // will almost definitely be an issue that needs fixing.
  //
  // @todo Find a more efficient way to fetch current xPYT & NYT prices.
  // -----------------------------------------------------------------------
  async handleGlobalData(data: GlobalQueryResult, chainId: number) {
    const currentPools = data['current']; // data from chain head
    const lastPools = data['last']; // data from 24h ago

    let globalPools: GlobalPool[] = [];

    await Promise.all(
      currentPools.map(async (currentPool) => {
        const lastPool = lastPools && lastPools.find(
          (pool) => pool.address === currentPool.address
        );

        // calculate data for token0
        const token0 = await this.gate.getToken(currentPool.token0, chainId);
        const priceToken0 = await this.price.getTokenPriceUSD(token0, chainId);
        const tvlToken0 = new BigNumber(currentPool.totalValueLockedToken0)
          .div(token0.precision)
          .times(priceToken0);

        const volumeToken0 = new BigNumber(currentPool.totalVolumeToken0)
          .minus(lastPool ? lastPool.totalVolumeToken0 : 0)
          .div(token0.precision)
          .times(priceToken0);
        const feesToken0 = new BigNumber(currentPool.totalFeesToken0)
          .minus(lastPool ? lastPool.totalFeesToken0 : 0)
          .div(token0.precision)
          .times(priceToken0);

        // calculate data for token1
        const token1 = await this.gate.getToken(currentPool.token1, chainId);
        const priceToken1 = await this.price.getTokenPriceUSD(token1, chainId);
        const volumeToken1 = new BigNumber(currentPool.totalVolumeToken1)
          .minus(lastPool ? lastPool.totalVolumeToken1 : 0)
          .div(token1.precision)
          .times(priceToken1);
        const feesToken1 = new BigNumber(currentPool.totalFeesToken1)
          .minus(lastPool ? lastPool.totalFeesToken1 : 0)
          .div(token1.precision)
          .times(priceToken1);
        const tvlToken1 = new BigNumber(currentPool.totalValueLockedToken1)
          .div(token1.precision)
          .times(priceToken1);

        const vault0 = await this.gate.getTokenVault(token0, chainId);
        const vault1 = await this.gate.getTokenVault(token1, chainId);
        const vault = vault0 ? vault0 : vault1;

        // handle pool incentives
        let incentives: Incentive[] = [];
        for (let incentive of currentPool.incentives) {
          const incentiveObj: Incentive = {
            id: incentive.id,
            rewardToken: incentive.rewardToken,
            pool: incentive.pool,
            startTime: parseInt(incentive.startTime),
            endTime: parseInt(incentive.endTime),
            refundee: incentive.refundee,
          };
          incentives = [...incentives, incentiveObj];
        }

        // create the pool object
        const globalPool: GlobalPool = {
          address: currentPool.address,
          xpyt: vault.nyt.address === token0.address ? token1 : token0,
          nyt: vault.nyt.address === token0.address ? token0 : token1,
          fee: new BigNumber(currentPool.fee),
          liquidity: new BigNumber(currentPool.liquidity),
          rawTotalValueLocked: tvlToken0.plus(tvlToken1),
          totalValueLocked: this.util.formatBN(tvlToken0.plus(tvlToken1)),
          rawTotalVolume: volumeToken0.plus(volumeToken1),
          totalVolume: this.util.formatBN(volumeToken0.plus(volumeToken1)),
          rawTotalFees: feesToken0.plus(feesToken1),
          totalFees: this.util.formatBN(feesToken0.plus(feesToken1)),
          incentives: incentives,
          token0: currentPool.token0,
          token1: currentPool.token1,
          token0Price: currentPool.token0Price,
          token1Price: currentPool.token1Price,
        };

        globalPools = [...globalPools, globalPool];
      })
    ).then(() => {
      this.globalPools = globalPools;
    });
  }

  initializePool() {
    const pool: Pool = {
      // global
      address: '',
      xpyt: null,
      nyt: null,
      fee: new BigNumber(0),
      liquidity: new BigNumber(0),
      rawTotalValueLocked: new BigNumber(0),
      totalValueLocked: [new BigNumber(0), null],
      rawTotalVolume: new BigNumber(0),
      totalVolume: [new BigNumber(0), null],
      rawTotalFees: new BigNumber(0),
      totalFees: [new BigNumber(0), null],
      incentives: [],
      token0: null,
      token1: null,
      token0Price: new BigNumber(0),
      token1Price: new BigNumber(0),

      // user
      reward: new BigNumber(0),
      positions: [],
    };

    this.pools = [...this.pools, pool];
    return pool;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  openManageLiquidityModal(pool: Pool): void {
    const modalRef = this.modalService.open(ManageLiquidityModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
    // const userPool = this.userPools.find((p) => p.address === pool.address);
    modalRef.componentInstance.pool = pool;
    // modalRef.componentInstance.positions = userPool ? userPool.positions : null;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  openLiquidityModal(pool: Pool): void {
    const modalRef = this.modalService.open(LiquidityModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'lg',
    });
    modalRef.componentInstance.pool = pool;
  }

  // -----------------------------------------------------------------------
  // @dev The ability to claim rewards owed on a specific position or incentive
  // does not exist, per se. UniswapV3Staker lets us claim a specific amount of
  // a specific reward token. Passing a specific value allows us to simulate
  // claiming rewards for a specific position or a specific incentive. If we pass
  // a value of 0, it will claim the maximum amount of that reward token.
  // -----------------------------------------------------------------------
  claimReward(amount: BigNumber = new BigNumber(0)) {
    const web3 = this.wallet.web3;
    const staker = this.contract.getContract(
      this.constants.UNISWAP_V3_STAKER[this.wallet.chainId],
      'UniswapV3Staker',
      web3
    );
    const claimAmount = this.util.processWeb3Number(amount.times(1e18)); // @dev Should be preicion of TIT

    const func = staker.methods.claimReward(
      this.constants.TIT[this.wallet.chainId],
      this.user,
      claimAmount
    );

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
}

export interface Pool {
  // global
  address: string; // address of the Uniswap V3 liquidity pool
  xpyt: Token;
  nyt: Token;
  fee: BigNumber; // fee tier of the Uniswap V3 liquidity pool
  liquidity: BigNumber; // current liquidity of the Uniswap V3 pool
  rawTotalValueLocked: BigNumber;
  totalValueLocked: [BigNumber, string]; // tvl in USD of the pool including out of bounds liquidity
  rawTotalVolume: BigNumber;
  totalVolume: [BigNumber, string]; // volume in USD of the pool over last 24h
  rawTotalFees: BigNumber;
  totalFees: [BigNumber, string]; // fees in USD of the pool over last 24h
  incentives: Incentive[];
  token0: string;
  token1: string;
  token0Price: BigNumber;
  token1Price: BigNumber;

  // user
  reward: BigNumber; // amount of TIT rewards that can be claimed by the user
  positions: any; // positions owned by the user
}

export interface GlobalPool {
  address: string;
  xpyt: Token;
  nyt: Token;
  fee: BigNumber;
  liquidity: BigNumber;
  rawTotalValueLocked: BigNumber;
  totalValueLocked: [BigNumber, string];
  rawTotalVolume: BigNumber;
  totalVolume: [BigNumber, string];
  rawTotalFees: BigNumber;
  totalFees: [BigNumber, string];
  incentives: Incentive[];
  token0: string;
  token1: string;
  token0Price: BigNumber;
  token1Price: BigNumber;
}

export interface UserPool {
  address: string;
  reward: BigNumber;
  positions: Position[];
}

export interface Position {
  id: string;
  staked: boolean;
  reward: BigNumber;
  incentives: Incentive[];
}

export interface Incentive {
  id: string;
  rewardToken: string;
  pool: string;
  startTime: number;
  endTime: number;
  refundee: string;
}

interface GlobalQueryResult {
  pools: {
    address: string;
    fee: string;
    liquidity: string;
    token0: string;
    token1: string;
    token0price: string;
    token1price: string;
    totalValueLockedToken0: string;
    totalValueLockedToken1: string;
    totalVolumeToken0: string;
    totalVolumeToken1: string;
    totalFeesToken0: string;
    totalFeesToken1: string;
    incentives: {
      id: string;
      rewardToken: string;
      pool: string;
      startTime: string;
      endTime: string;
      refundee: string;
    }[];
  }[];
}

interface UserQueryResult {
  positions: {
    id: string;
    pool: string;
    owner: string;
    staked: boolean;
    incentives: {
      id: string;
      rewardToken: string;
      pool: string;
      startTime: string;
      endTime: string;
      refundee: string;
    }[];
  }[];
}
