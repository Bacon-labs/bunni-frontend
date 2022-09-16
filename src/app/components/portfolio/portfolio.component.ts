import { Component, OnInit, NgZone } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { request, gql } from 'graphql-request';
import BigNumber from 'bignumber.js';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Gate, Vault, Token } from 'src/app/services/gate.service';
import { PriceService } from 'src/app/services/price.service';
import { TokenService, UserBalances } from 'src/app/services/token.service';
import { WalletService } from 'src/app/services/wallet.service';

import { ClaimModalComponent } from 'src/app/components/portfolio/modals/claim-modal/claim-modal.component';

@Component({
  selector: 'app-portfolio',
  templateUrl: './portfolio.component.html',
  styleUrls: ['./portfolio.component.scss'],
})
export class PortfolioComponent implements OnInit {
  xpytPositions: Position[];
  pytPositions: Position[];
  nytPositions: Position[];
  userBalances: UserBalances;
  loading: boolean;
  user: string;

  constructor(
    private modalService: NgbModal,
    public constants: ConstantsService,
    public contract: ContractService,
    public gate: GateService,
    public price: PriceService,
    public token: TokenService,
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
  // -----------------------------------------------------------------------
  resetData(resetUser: boolean, resetGlobal: boolean, chainId: number) {
    if (resetUser) {
      this.userBalances = new UserBalances();
      this.xpytPositions = [];
      this.pytPositions = [];
      this.nytPositions = [];
      this.loading = true;
      this.user = '';
    }
    if (resetGlobal) {
    }
  }

  // -----------------------------------------------------------------------
  // @dev We wait 0.5 seconds before loading to prevent unnecessarily loading
  // data when a chain change has occured.
  // -----------------------------------------------------------------------
  async loadData(loadUser: boolean, loadGlobal: boolean, chainId: number) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (this.wallet.chainId !== chainId) return;
    if (!this.wallet.supportedChain) return;

    this.user = this.wallet.userAddress;

    if (loadGlobal) {
    }

    if (loadUser) {
      if (!this.user) return;

      this.userBalances = await this.token.getUserBalances(this.user, chainId);

      const xpytPositions: Position[] = [];
      const pytPositions: Position[] = [];
      const nytPositions: Position[] = [];

      const gates = await this.gate.getGateList(chainId);
      for (let gate of gates) {
        for (let vault of gate.vaults) {
          for (let type of ['pyt', 'nyt']) {
            const token = vault[type];
            if (token) {
              const balance = this.userBalances[token.address];

              if (balance.gt(0)) {
                let apy = new BigNumber(0);
                let earnings = new BigNumber(0);

                if (type === 'pyt') {
                  apy = await this.getAPY(vault, chainId);
                  earnings = await this.getEarnings(gate, vault, chainId);
                }

                const price = await this.price.getTokenPriceUSD(token, chainId);

                const positionObj: Position = {
                  gate: gate,
                  vault: vault,
                  token: token,
                  balance: balance,
                  price: new BigNumber(price),
                  apy: apy,
                  earnings: earnings,
                };

                type === 'pyt'
                  ? pytPositions.push(positionObj)
                  : nytPositions.push(positionObj);
              }
            }
          }

          for (let xpyt of vault.xpyt) { // handle xpyt
            if (!xpyt) return;

            const balance = this.userBalances[xpyt.address];

            if (balance.gt(0)) {
              const price = await this.price.getTokenPriceUSD(xpyt, chainId);

              const positionObj: Position = {
                gate: gate,
                vault: vault,
                token: xpyt,
                balance: balance,
                price: new BigNumber(price),
                apy: new BigNumber(0),
                earnings: new BigNumber(0),
              };

              xpytPositions.push(positionObj);
            }
          }
        }
      }

      xpytPositions.sort((a, b) => {
        return a.balance.gt(b.balance) ? 1 : -1;
      });
      pytPositions.sort((a, b) => {
        return a.balance.gt(b.balance) ? 1 : -1;
      });
      nytPositions.sort((a, b) => {
        return a.balance.gt(b.balance) ? 1 : -1;
      });

      this.xpytPositions = xpytPositions;
      this.pytPositions = pytPositions;
      this.nytPositions = nytPositions;
      this.loading = false;
    }
  }

  // -----------------------------------------------------------------------
  // @dev Sends an RPC request on each call, which may be undesirable when a
  // user has many PYT positions. Consider using Multicall to batch requests.
  // -----------------------------------------------------------------------
  async getEarnings(
    gate: Gate,
    vault: Vault,
    chainId: number
  ): Promise<BigNumber> {
    const web3 = this.wallet.httpsWeb3(chainId);
    const gateContract = this.contract.getGate(gate.address, web3);
    const earnings = await gateContract.methods
      .getClaimableYieldAmount(vault.share.address, this.user)
      .call();

    return new BigNumber(earnings).div(vault.underlying.precision);
  }

  // -----------------------------------------------------------------------
  // @dev APY is calculated by taking the delta of pricePerVaultShare over 24
  // hours (6200 blocks) and compounding it daily. Using 6200 blocks as a rough
  // estimate of 24 hours, which isn't ideal.
  //
  // TODO: Get a more accurate block number for 24 hours ago.
  // -----------------------------------------------------------------------
  async getAPY(vault: Vault, chainId: number): Promise<BigNumber> {
    const block = (await this.wallet.web3.eth.getBlockNumber()) - 6200;

    // generate the query string
    let queryString = `query VaultAPY {`;
    queryString += `current: vault(id: "${vault.share.address}") {
      pricePerVaultShare
    }`;
    queryString += `last: vault(
      id: "${vault.share.address}",
      block: {
        number: ${block}
      }
    ) {
      pricePerVaultShare
    }`;
    queryString += `}`;
    const query = gql`
      ${queryString}
    `;

    // run the query
    let data = await request(this.constants.GRAPHQL_ENDPOINT[chainId], query);

    // calculate the APY
    const current = new BigNumber(data.current.pricePerVaultShare);
    const last = new BigNumber(data.last.pricePerVaultShare);
    const rate = current.minus(last).div(last);
    const apy = new BigNumber(1).plus(rate).pow(365).minus(1);

    return apy;
  }

  openClaimModal(position: Position): void {
    const modalRef = this.modalService.open(ClaimModalComponent, {
      windowClass: 'windowed',
      centered: true,
      size: 'md',
    });
    modalRef.componentInstance.position = position;
  }
}

export interface Position {
  gate: Gate;
  vault: Vault;
  token: Token;
  balance: BigNumber;
  price: BigNumber;
  apy: BigNumber;
  earnings: BigNumber;
}
