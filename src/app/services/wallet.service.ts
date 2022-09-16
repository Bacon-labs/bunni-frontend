import { Injectable, Inject } from '@angular/core';
import Web3 from 'web3';
import { Web3Enabled } from '../web3Enabled';
import { Web3WalletConnector } from '@mindsorg/web3modal-ts';
import { ConstantsService } from 'src/app/services/constants.service';
import { namehash } from '@ensdomains/eth-ens-namehash';
import { ToastrService } from 'ngx-toastr';


@Injectable({
  providedIn: 'root',
})
export class WalletService extends Web3Enabled {
  constructor(
    public web3: Web3,
    public walletConnector: Web3WalletConnector,
    public constants: ConstantsService,
    public toastrService: ToastrService
  ) {
    super(web3, walletConnector, constants, toastrService);
  }

  public get userAddress(): string {
    return this.address;
  }

  public get connected(): boolean {
    return !!this.address;
  }

  public get supportedChain(): boolean {
    return !!this.constants.CHAIN_METADATA[this.chainId];
  }

  public get supports0x(): boolean {
    return this.constants.CHAIN_METADATA[this.chainId].supports0x;
  }

  // -----------------------------------------------------------------------
  // @dev Web3.js does not support reverse lookup of ENS domains, so we must
  // use a workaround. https://github.com/ChainSafe/web3.js/issues/2683
  // -----------------------------------------------------------------------
  async reverseENSLookup(address: string) {
    const web3 = this.httpsWeb3(this.constants.CHAIN_ID.ETHEREUM);
    const namehash = require('@ensdomains/eth-ens-namehash');
    const lookup = address.toLowerCase().substr(2) + '.addr.reverse';
    const ResolverContract = await web3.eth.ens.getResolver(lookup);
    const nh = namehash.hash(lookup);
    try {
      const name = await ResolverContract.methods.name(nh).call();
      if (name && name.length) {
        const verifiedAddress = await web3.eth.ens.getAddress(name);
        if (
          verifiedAddress &&
          verifiedAddress.toLowerCase() === address.toLowerCase()
        ) {
          return name;
        }
      }
    } catch (e) { }
  }
}
