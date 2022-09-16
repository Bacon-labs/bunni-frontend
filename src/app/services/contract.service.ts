import { Injectable } from '@angular/core';
import { WalletService } from 'src/app/services/wallet.service';
import Web3 from 'web3';

@Injectable({
  providedIn: 'root',
})
export class ContractService {
  constructor(public wallet: WalletService) {}

  getContract(address: string, abiName: string, web3: Web3) {
    const abi = require(`src/assets/abi/${abiName}.json`);
    return new web3.eth.Contract(abi, address);
  }

  getNamedContract(name: string, chainId: number, web3: Web3) {
    const address = require('src/assets/json/contracts.json')[chainId][name];
    return this.getContract(address, name, web3);
  }

  getERC20(address: string, web3: Web3) {
    return this.getContract(address, 'ERC20', web3);
  }

  getGate(address: string, web3: Web3) {
    return this.getContract(address, 'Gate', web3);
  }

  getXPYT(address: string, web3: Web3) {
    return this.getContract(address, 'WrappedPerpetualYieldToken', web3);
  }

  getPYT(address: string, web3: Web3) {
    return this.getContract(address, 'PerpetualYieldToken', web3);
  }

  getNYT(address: string, web3: Web3) {
    return this.getContract(address, 'NegativeYieldToken', web3);
  }
}
