import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { WalletService } from 'src/app/services/wallet.service';

@Injectable({
  providedIn: 'root',
})
export class UtilService {
  constructor(
    public constants: ConstantsService,
    public contract: ContractService,
    public wallet: WalletService
  ) {}

  // -----------------------------------------------------------------------
  // @dev fix type of param
  // -----------------------------------------------------------------------
  processWeb3Number(number: any): string {
    return new BigNumber(number).integerValue().toFixed();
  }

  // -----------------------------------------------------------------------
  // @notice Returns a more readable BigNumber. For example, $1,250,000 would
  // be returned as $1.25m. Supports numbers up to $1 quadrillion ;-).
  // -----------------------------------------------------------------------
  formatBN(bn: BigNumber): [BigNumber, string] {
    let magnitudeLabel = null;
    let formattedBN = bn;

    if (bn.gte(1e3) && bn.lt(1e6)) {
      formattedBN = bn.div(1e3);
      magnitudeLabel = 'k';
    } else if (bn.gte(1e6) && bn.lt(1e9)) {
      formattedBN = bn.div(1e6);
      magnitudeLabel = 'm';
    } else if (bn.gte(1e9) && bn.lt(1e12)) {
      formattedBN = bn.div(1e9);
      magnitudeLabel = 'b';
    } else if (bn.gte(1e12) && bn.lt(1e15)) {
      formattedBN = bn.div(1e12);
      magnitudeLabel = 't';
    }
    return [formattedBN, magnitudeLabel];
  }

  async applySwapFee(amount: BigNumber): Promise<BigNumber> {
    const web3 = this.wallet.httpsWeb3();
    const swapper = this.contract.getContract(
      this.constants.UNISWAP_V3_SWAPPER[this.wallet.chainId],
      'Swapper',
      web3
    );

    const fee = await swapper.methods
      .protocolFeeInfo()
      .call()
      .then((result) => {
        return result.fee / 10000;
      });
    const feeAmount = amount.times(fee);

    return amount.minus(feeAmount);
  }
}
