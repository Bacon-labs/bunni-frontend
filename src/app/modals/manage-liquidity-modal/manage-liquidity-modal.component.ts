import { Component, OnInit, NgZone, Input } from "@angular/core";
import { NgbActiveModal } from "@ng-bootstrap/ng-bootstrap";

import { ConstantsService } from "src/app/services/constants.service";
import { ContractService } from "src/app/services/contract.service";
import { UtilService } from "src/app/services/util.service";
import { WalletService } from "src/app/services/wallet.service";
import { Pool, Position, Incentive } from "src/app/components/pool/pool.component";

@Component({
  selector: "app-manage-liquidity-modal",
  templateUrl: "./manage-liquidity-modal.component.html",
  styleUrls: ["./manage-liquidity-modal.component.scss"]
})
export class ManageLiquidityModalComponent implements OnInit {
  @Input() pool: Pool;

  tab: number = 0;

  // user
  userPositions: Position[]; // all of the positions for the pool owned by the user
  selectedPosition: Position;

  // pool
  uniswapLink: string; // link to add pool liquidity on Uniswap UI
  poolIncentives: Incentive[]; // all of the active incentives for the pool
  availableIncentives: Incentive[]; // the pool incentives that a position hasn't already been staked in

  constructor(
    public activeModal: NgbActiveModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public util: UtilService,
    public wallet: WalletService
  ) { }

  ngOnInit(): void {
    this.resetData();
    this.loadData();
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  resetData() {
    // user
    this.userPositions = [];
    this.selectedPosition = null;

    // pool
    this.uniswapLink = "";
    this.poolIncentives = [];
    this.availableIncentives = [];
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadData() {
    // get link to add pool liquidity on Uniswap UI
    const xpyt = this.pool.xpyt.address;
    const nyt = this.pool.nyt.address;
    const fee = this.pool.fee.toString();
    this.uniswapLink = this.getUniswapLink(xpyt, nyt, fee);

    this.userPositions = this.pool.positions;
    this.poolIncentives = this.pool.incentives;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getUniswapLink(xpyt: string, nyt: string, fee: string): string {
    const prefix = "https://app.uniswap.org/#/add";
    const chain = this.constants.CHAIN_METADATA[this.wallet.chainId].chainName;
    return `${prefix}/${xpyt}/${nyt}/${fee}?chain=${chain}`;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  switchTab(tab: number) {
    this.tab = tab;
    this.selectedPosition = null;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  selectPosition(position: Position) {
    if (this.selectedPosition && position.id === this.selectedPosition.id) return;

    this.selectedPosition = position;
    this.availableIncentives = this.getAvailableIncentives(position);
  }

  // -----------------------------------------------------------------------
  // @dev Returns an array of incentives that a position hasn't already been staked in.
  // -----------------------------------------------------------------------
  getAvailableIncentives(position: Position): Incentive[] {
    let availableIncentives: Incentive[] = [];

    for (let poolIncentive of this.poolIncentives) {
      const staked = !!position.incentives.find((incentive) => incentive.id === poolIncentive.id);
      if (!staked) {
        availableIncentives = [...availableIncentives, poolIncentive];
      }
    }

    return availableIncentives;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  canStake() {
    return !!this.selectedPosition && this.availableIncentives.length > 0;
  }

  // -----------------------------------------------------------------------
  // @notice Stakes the selected position in ALL of the available incentives.
  //
  // @dev If the position has already been transferred to the UniswapV3Staker
  // contract, we can interact with UniswapV3Staker directly. If not, we need
  // to interact with NonfungiblePositionManager.
  // -----------------------------------------------------------------------
  stake() {
    const web3 = this.wallet.web3;

    let func;

    if (this.selectedPosition.staked) {
      // UNI-V3 NFT *has already* been transferred to the UniswapV3Staker contract

      const staker = this.contract.getContract(
        this.constants.UNISWAP_V3_STAKER[this.wallet.chainId],
        "UniswapV3Staker",
        web3
      );

      let calls: any[] = [];

      for (const incentive of this.availableIncentives) {
        const IncentiveKey = {
          rewardToken: incentive.rewardToken,
          pool: incentive.pool,
          startTime: incentive.startTime,
          endTime: incentive.endTime,
          refundee: incentive.refundee
        };

        const stake = staker.methods.stakeToken(IncentiveKey, this.selectedPosition.id);
        calls = [...calls, stake.encodeABI()];
      }

      func = staker.methods.multicall(calls);
    } else {
      // UNI-V3 NFT *has not* been transferred to the UniswapV3Staker contract

      const manager = this.contract.getContract(
        this.constants.NONFUNGIBLE_POSITION_MANAGER[this.wallet.chainId],
        "NonfungiblePositionManager",
        web3
      );

      let paramsArray: any = [];

      for (const incentive of this.availableIncentives) {
        const IncentiveKey = [incentive.rewardToken, incentive.pool, incentive.startTime, incentive.endTime, incentive.refundee];
        paramsArray = [...paramsArray, IncentiveKey];
      }

      const encodedIncentiveKeys = web3.eth.abi.encodeParameter("tuple(address,address,uint256,uint256,address)[]", paramsArray);

      func = manager.methods.safeTransferFrom(
        this.wallet.userAddress,
        this.constants.UNISWAP_V3_STAKER[this.wallet.chainId],
        this.selectedPosition.id,
        encodedIncentiveKeys
      );
    }

    this.wallet
      .sendTx(
        func,
        () => {
          this.activeModal.dismiss();
        },
        () => { },
        () => { },
        () => { }
      )
      .catch(error => {
        console.error(error);
      });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  canUnstake() {
    return !!this.selectedPosition;
  }

  // -----------------------------------------------------------------------
  // @notice Unstakes the selected position from all incentives, claims the
  // rewards from those incentives, and withdraws the UNI-V3 NFT to the user.
  //
  // @dev Assumes the reward token is TIT, which may not always be true.
  // -----------------------------------------------------------------------
  unstake() {
    const web3 = this.wallet.web3;
    const staker = this.contract.getContract(
      this.constants.UNISWAP_V3_STAKER[this.wallet.chainId],
      "UniswapV3Staker",
      web3
    );

    let calls: any[] = [];

    // iterate through the incentives
    for (const incentive of this.selectedPosition.incentives) {
      const IncentiveKey = {
        rewardToken: incentive.rewardToken,
        pool: incentive.pool,
        startTime: incentive.startTime,
        endTime: incentive.endTime,
        refundee: incentive.refundee
      };

      const unstake = staker.methods.unstakeToken(IncentiveKey, this.selectedPosition.id);
      calls = [...calls, unstake.encodeABI()];
    }

    // function call to claim all rewards for the position
    const claimAmount = this.util.processWeb3Number(this.selectedPosition.reward.times(1e6)); // @dev Should be preicion of TIT
    const claim = staker.methods.claimReward(
      this.constants.TIT[this.wallet.chainId],
      this.wallet.userAddress,
      claimAmount
    );
    calls = [...calls, claim.encodeABI()];

    // function call to withdraw the NFT
    const withdraw = staker.methods.withdrawToken(this.selectedPosition.id, this.wallet.userAddress, web3.utils.bytesToHex([0]));
    calls = [...calls, withdraw.encodeABI()];

    const func = staker.methods.multicall(calls);

    this.wallet
      .sendTx(
        func,
        () => {
          this.activeModal.dismiss();
        },
        () => { },
        () => { },
        () => { }
      )
      .catch(error => {
        console.error(error);
      });
  }
}
