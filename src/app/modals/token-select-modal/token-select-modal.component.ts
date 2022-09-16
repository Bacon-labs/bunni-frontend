import { Component, OnInit, NgZone } from '@angular/core';
import { Input, Output, EventEmitter } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ConstantsService } from 'src/app/services/constants.service';
import { GateService, Gate, Vault, Token } from 'src/app/services/gate.service';
import { WalletService } from 'src/app/services/wallet.service';
import { TokenService, UserBalances } from 'src/app/services/token.service';

@Component({
  selector: 'app-token-select-modal',
  templateUrl: './token-select-modal.component.html',
  styleUrls: ['./token-select-modal.component.scss'],
})
export class TokenSelectModalComponent implements OnInit {
  @Input() tokenType: string[] = ['underlying', 'share', 'xpyt', 'pyt', 'nyt'];
  @Input() checkPools: boolean = false; // vaults are restricted from selection if they do not have trading pools
  @Input() checkLiquidity: boolean = false; // vaults are restricted from selection if they do not have trading liquidity
  @Input() allowEther: boolean = false; // allow user to select ETH
  @Input() allowDefaultTokens: boolean = false; // alow user to select default tokens for 0x
  @Input() allowedVault: Vault; // tokens can only be selected from this vault. if null, all vaults can be used.
  @Input() selectedToken: Token; // token has already been selected
  @Input() restrictedTokens: Token[] = []; // tokens are restricted from selection

  @Output() selectEvent = new EventEmitter<Selection>(); // @todo migrate everything to this single Ouput emitter
  @Output() selectTokenEvent = new EventEmitter<Token>();
  @Output() selectVaultEvent = new EventEmitter<Vault>();
  @Output() selectGateEvent = new EventEmitter<Gate>();

  allTokens: Token[];
  filteredTokens: Token[];
  userBalances: UserBalances;

  constructor(
    public activeModal: NgbActiveModal,
    public constants: ConstantsService,
    public token: TokenService,
    public gate: GateService,
    public wallet: WalletService,
    public zone: NgZone
  ) {}

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  ngOnInit(): void {
    this.resetData(true, true);
    this.loadData(this.wallet.connected, true);

    this.wallet.connectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false);
        this.loadData(true, false);
      });
    });

    this.wallet.disconnectedEvent.subscribe(() => {
      this.zone.run(() => {
        this.resetData(true, false);
        this.loadData(false, false);
      });
    });

    // -----------------------------------------------------------------------
    // @dev A chain change cannot occur if there isn't a wallet connected. But,
    // when a user disconnects when on a non-Ethereum chain, the state will be
    // reset to the Ethereum chain. However, that change is not reflected here
    // as a chain change event is not emitted. To fix that, we must emit a chain
    // change event when a user disconnects from a non-Ethereum chain.
    // -----------------------------------------------------------------------
    this.wallet.chainChangedEvent.subscribe((networkId) => {
      this.zone.run(() => {
        this.resetData(true, true);
        this.loadData(this.wallet.connected, true);
      });
    });

    this.wallet.accountChangedEvent.subscribe((account) => {
      this.zone.run(() => {
        this.resetData(true, false);
        this.loadData(true, false);
      });
    });
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  resetData(resetUser: boolean, resetGlobal: boolean) {
    if (resetUser) {
      this.userBalances = new UserBalances();
    }
    if (resetGlobal) {
      this.allTokens = [];
      this.filteredTokens = [];
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async loadData(loadUser: boolean, loadGlobal: boolean) {
    if (loadUser) {
      const user: string = this.wallet.userAddress;
      if (user) {
        this.token
          .getUserBalances(user, this.wallet.chainId)
          .then((result: UserBalances) => {
            this.userBalances = result;
          });
      }
    }

    if (loadGlobal) {
      let allTokens: Token[] = [];

      let vaultContainsWeth = false;
      const gates = await this.gate.getGateList(this.wallet.chainId);
      for (let gate of gates) {
        for (let vault of gate.vaults) {
          if (!this.checkPools || vault.xpyt.find((xpyt) => xpyt.pools.length > 0)) { // does the vault have a trading pair?
            if (!this.checkLiquidity || vault.xpyt.find((xpyt) => xpyt.pools.find((pool) => pool.liquidity.gt(0)) )) { // does the vault have trading liquidity?
              if (!this.allowedVault || this.allowedVault.share.address === vault.share.address) { // is the vault allowed?
                for (let type of this.tokenType) {
                  if (type === 'xpyt') {
                    for (let xpyt of vault.xpyt) {
                      if (!this.restrictedTokens.find((token) => token.address === xpyt.address)) { // is token restricted?
                        if (!this.checkPools || xpyt.pools.length > 0) { // does the xPYT have a trading pool?
                          if (!this.checkLiquidity || xpyt.pools.find((pool) => pool.liquidity.gt(0))) { // does the xPYT have trading liquidity?
                            allTokens = [...allTokens, xpyt];
                          }
                        }
                      }
                    }
                  } else {
                    if (!allTokens.find((token) => token.address === vault[type].address)) { // has token already been added?
                      if (!this.restrictedTokens.find((token) => token.address === vault[type].address)) { // is token restricted?
                        if (!vaultContainsWeth) {
                          vaultContainsWeth = this.checkForWeth(vault[type]);
                        }
                        allTokens = [...allTokens, vault[type]];
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      if (this.allowDefaultTokens && this.wallet.supports0x) {
        this.token.DEFAULT_TOKENS[this.wallet.chainId].map((token) => {
          if ( this.wallet.supports0x && !allTokens.find((t) => t.address === token.address) ) {
            allTokens.unshift(token);
          }
        });
      }

      if (this.allowEther && (this.wallet.supports0x || vaultContainsWeth)) {
        allTokens.unshift(this.token.ETHER);
      }

      allTokens.sort((a, b) => a.symbol.toLowerCase() > b.symbol.toLowerCase() ? 1 : -1)
      this.allTokens = allTokens;
      this.filteredTokens = allTokens;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async selectToken(token: Token) {
    const vault = await this.getVault(token);
    const gate = await this.getGate(vault);
    this.selectEvent.emit({gate: gate, vault: vault, token: token});
    this.selectTokenEvent.emit(token);
    this.selectVaultEvent.emit(vault);
    this.selectGateEvent.emit(gate);
    this.activeModal.dismiss();
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  filterTokens(input: string) {
    if (input) {
      const expressions: string[] = input.toLowerCase().trim().split(' ');
      const filteredTokens: Token[] = this.allTokens.filter((token) => {
        for (let expression of expressions) {
          if (
            !token.name.toLowerCase().match(expression) &&
            !token.symbol.toLowerCase().match(expression) &&
            !token.address.toLowerCase().match(expression)
          ) {
            return false;
          }
        }
        return true;
      });
      this.filteredTokens = filteredTokens;
    } else {
      this.filteredTokens = this.allTokens;
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getVault(token: Token): Promise<Vault> {
    if (!token) return null;
    return await this.gate.getTokenVault(token, this.wallet.chainId);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async getGate(vault: Vault): Promise<Gate> {
    if (!vault) return null;
    return await this.gate.getVaultGate(vault, this.wallet.chainId);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  checkForWeth(token: Token): boolean {
    if (token.address === this.constants.WETH[this.wallet.chainId]) {
      return true;
    }
    return false;
  }
}

interface Selection {
  gate: Gate;
  vault: Vault;
  token: Token;
}
