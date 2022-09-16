import { Injectable } from '@angular/core';
import BigNumber from 'bignumber.js';


import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { Token } from 'src/app/services/gate.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

@Injectable({
  providedIn: 'root'
})
export class PermitService {

  signature: Signature;

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  PERMIT_TYPE = {
    AMOUNT: 1,
    ALLOWED: 2,
  };

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  PERMITTABLE_TOKENS = {
    1: {
      [this.constants.DAI[1]]: { type: this.PERMIT_TYPE.ALLOWED, version: '1' },
      [this.constants.USDC[1]]: { type: this.PERMIT_TYPE.AMOUNT, version: '2' },
    },
    // 4: {},
  };



  constructor(
    public constants: ConstantsService,
    public contract: ContractService,
    public util: UtilService,
    public wallet: WalletService,
  ) { }

  // -----------------------------------------------------------------------
  // @dev DAI requires a slightly different form of selfPermit as it does not
  // conform to the EIP2616 standard, which would require Timeless to update
  // SelfPermit.sol and redeploy most (if not all) of our contracts.
  //
  // https://docs.uniswap.org/protocol/reference/periphery/base/SelfPermit
  // -----------------------------------------------------------------------
  async permit(token: Token, spender: string, amount: BigNumber, deadline: number) {
    if (token.address === this.constants.DAI[this.wallet.chainId]) {
      throw "permit.service: DAI not supported.";
    }

    const web3 = this.wallet.web3;
    const value = this.util.processWeb3Number(amount.times(token.precision));
    const contract = this.contract.getERC20(token.address, web3);
    const nonce = await contract.methods.nonces(this.wallet.userAddress).call();

    let permittable;
    if (this.PERMITTABLE_TOKENS[this.wallet.chainId]) {
      permittable = this.PERMITTABLE_TOKENS[this.wallet.chainId][token.address];
    }

    const type = permittable ? permittable.type : 1;
    const version = permittable ? permittable.version : "1";

    const domain = this.getDomain(token, version);
    const message = this.getMessage(spender, value, nonce, deadline, type);

    const data = JSON.stringify({
      domain: domain,
      message: message,
      primaryType: 'Permit',
      types: {
        EIP712Domain: version ? EIP712_DOMAIN_TYPE : EIP712_DOMAIN_TYPE_NO_VERSION,
        Permit: type == this.PERMIT_TYPE.ALLOWED ? PERMIT_ALLOWED_TYPE : EIP2612_TYPE,
      },
    });

    const [v, r, s] = await this.wallet.sign(data);

    const signature = {
      v: v,
      r: r,
      s: s,

      owner: this.wallet.userAddress,
      spender: spender,
      tokenAddress: token.address,

      nonce: nonce,
      deadline: deadline,

      ...(type == this.PERMIT_TYPE.AMOUNT && { amount: value }),
      ...(type == this.PERMIT_TYPE.ALLOWED && { allowed: true }),
    };

    this.signature = signature;
    return signature;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getDomain(token: Token, version?: string) {
    const domain = {
      name: token.name,
      ...(version && { version: version }),
      chainId: this.wallet.chainId.toString(),
      verifyingContract: token.address
    };
    return domain;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  getMessage(spender: string, value: string, nonce: number, deadline: number, type: number) {
    const message = {
      ...(type == this.PERMIT_TYPE.AMOUNT && { owner: this.wallet.userAddress }),
      ...(type == this.PERMIT_TYPE.ALLOWED && { holder: this.wallet.userAddress }),
      spender: spender,
      ...(type == this.PERMIT_TYPE.AMOUNT && { value: value }),
      nonce: nonce,
      ...(type == this.PERMIT_TYPE.AMOUNT && { deadline: deadline }),
      ...(type == this.PERMIT_TYPE.ALLOWED && { expiry: deadline }),
      ...(type == this.PERMIT_TYPE.ALLOWED && { allowed: true }),
    };
    return message;
  }


  // -----------------------------------------------------------------------
  // @todo Check token nonce for validity.
  // -----------------------------------------------------------------------
  isSignatureValid(token: Token, spender: string, amount: BigNumber): boolean {
    const value = this.util.processWeb3Number(amount.times(token.precision));

    return this.signature &&
      this.signature.owner === this.wallet.userAddress &&
      this.signature.spender === spender &&
      this.signature.tokenAddress === token.address &&
      this.signature.deadline >= Math.floor(Date.now() / 1e3) &&
      (this.signature.allowed || this.signature.amount === value);
  }

}

// -----------------------------------------------------------------------
// DOMAIN TYPES
// -----------------------------------------------------------------------

const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

const EIP712_DOMAIN_TYPE_NO_VERSION = [
  { name: 'name', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

// -----------------------------------------------------------------------
// MESSAGE TYPES
// -----------------------------------------------------------------------

const EIP2612_TYPE = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
];

const PERMIT_ALLOWED_TYPE = [
  { name: 'holder', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'nonce', type: 'uint256' },
  { name: 'expiry', type: 'uint256' },
  { name: 'allowed', type: 'bool' },
];

// -----------------------------------------------------------------------
// SIGNATURE
// -----------------------------------------------------------------------

export interface Signature {
  v: number;
  r: string;
  s: string;

  owner: string;
  spender: string;
  tokenAddress: string;

  nonce: number;
  deadline: number;

  amount?: string;
  allowed?: boolean;
}
