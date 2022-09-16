import { EventEmitter } from '@angular/core';
import { ConstantsService } from 'src/app/services/constants.service';
import { TransactionAlertModalComponent } from 'src/app/modals/transaction-alert-modal/transaction-alert-modal.component';
import { ToastrService } from 'ngx-toastr';
import BigNumber from 'bignumber.js';
import { splitSignature } from '@ethersproject/bytes'

// -----------------------------------------------------------------------
// WEB3
// -----------------------------------------------------------------------
import Web3 from 'web3';
import { Web3WalletConnector } from '@mindsorg/web3modal-ts';
import { CONNECT_EVENT, ERROR_EVENT } from '@mindsorg/web3modal-ts';

// -----------------------------------------------------------------------
// PROVIDERS
// -----------------------------------------------------------------------
import WalletConnectProvider from '@walletconnect/web3-provider';
import WalletLink from 'walletlink';
import Portis from '@portis/web3';
import Fortmatic from 'fortmatic';
import Torus from '@toruslabs/torus-embed';

export class Web3Enabled {
  connectedEvent: EventEmitter<null>;
  disconnectedEvent: EventEmitter<null>;
  accountChangedEvent: EventEmitter<string>;
  chainChangedEvent: EventEmitter<number>;

  provider: any;
  providerName: string;
  address: string = '';
  chainId: number = 1;

  constructor(
    public web3: Web3,
    public walletConnector: Web3WalletConnector,
    public constants: ConstantsService,
    public toastrService: ToastrService,
  ) {
    this.initWalletConnector();
    this.connectedEvent = new EventEmitter<null>();
    this.disconnectedEvent = new EventEmitter<null>();
    this.accountChangedEvent = new EventEmitter<string>();
    this.chainChangedEvent = new EventEmitter<number>();
  }

  // -----------------------------------------------------------------------
  // @dev Uses the web3Modal-ts library from @mindsorg, which can be found
  // at https://github.com/Minds/web3modal-ts. Additional resources at
  // https://github.com/Web3Modal/web3modal.
  //
  // TODO
  // injected option triggers both metamask and coinbase wallets if installed
  // a proposed solution https://github.com/Web3Modal/web3modal/issues/316
  // -----------------------------------------------------------------------
  initWalletConnector() {
    // -----------------------------------------------------------------------
    // @notice Users choose to connect a wallet from the following provider
    // options. Additional wallet provider options can be added here.
    //
    // @dev Additional configuation may be needed to support multiple chains
    // -----------------------------------------------------------------------
    this.walletConnector.setConfiguration({
      network: '',
      cacheProvider: false,
      disableInjectedProvider: false,
      providerOptions: {
        walletconnect: {
          package: WalletConnectProvider,
          options: {
            infuraId: this.constants.INFURA_KEY,
          },
        },
        walletlink: {
          package: WalletLink,
          options: {
            appName: 'Timeless',
            infuraUrl: this.constants.RPC[this.constants.CHAIN_ID.ETHEREUM],
          },
          display: {
            logo: new URL(
              'src/assets/img/wallets/coinbase.png',
              import.meta.url
            ),
          },
        },
        portis: {
          package: Portis,
          options: {
            id: this.constants.PORTIS_KEY,
          },
        },
        fortmatic: {
          package: Fortmatic,
          options: {
            key: this.constants.FORTMATIC_KEY,
            network: {
              rpcUrl: this.constants.RPC[this.constants.CHAIN_ID.ETHEREUM],
              chainId: this.constants.CHAIN_ID.ETHEREUM,
            },
          },
        },
        torus: {
          package: Torus,
        },
      },
    });

    // -----------------------------------------------------------------------
    // @notice User successfully connected a wallet
    // -----------------------------------------------------------------------
    this.walletConnector.providerController.on(
      CONNECT_EVENT,
      async (provider) => {
        this.web3 = new Web3(provider);
        this.address = (await this.web3.eth.getAccounts())[0];
        this.provider = provider;
        this.setProviderName();
        this.didChainChange();
        this.addProviderListeners();
        this.connectedEvent.emit();
      }
    );

    // -----------------------------------------------------------------------
    // @notice User was unsuccessful in connecting a wallet
    // -----------------------------------------------------------------------
    this.walletConnector.providerController.on(ERROR_EVENT, (error) => {
      console.log('Web3WalletConnector: ERROR_EVENT');
    });
  }

  // -----------------------------------------------------------------------
  // @notice Attempts to connect to the cached wallet provider. If a connection
  // is still active, it will automatically connect to the provider. If the
  // connection was previously ended, the user will be prompted to connect to
  // the provider (e.g. a MetaMask popup will appear).
  // -----------------------------------------------------------------------
  async connect() {
    const cachedProvider = window.localStorage.getItem('timeless:wallet');

    if (cachedProvider) {
      const provider = this.walletConnector.providers.find(
        (provider) => provider.name === cachedProvider
      );
      await provider.onClick();
    }
  }

  // -----------------------------------------------------------------------
  // @notice Attempts to terminate an active provider session using a unique
  // function for each provider. To mimic termination, the state is reset even
  // when an active provider session cannot be terminated (e.g. MetaMask).
  //
  // @dev Some providers will prompt the user to reconnect after termination.
  // @dev Coinbase provider will reload the page after termination.
  //
  // TODO
  // Make Portis and Torus disconnection work
  // -----------------------------------------------------------------------
  async disconnect() {
    switch (this.providerName) {
      case 'MetaMask':
        break;
      case 'WalletConnect':
        // @dev https://github.com/WalletConnect/walletconnect-monorepo/issues/436
        await this.provider.disconnect();
        break;
      case 'Coinbase':
        await this.provider.close();
        break;
      case 'Portis':
        // @dev Using .logout() throws an error. https://docs.portis.io/#/methods
        // await this.provider.logout();
        break;
      case 'Fortmatic':
        await this.provider.fm.user.logout();
        break;
      case 'Torus':
        // @dev Using .logout throws an error. https://docs.tor.us/wallet/api-reference/account#logout
        // await this.provider.logout();
        break;
    }
    this.removeProviderListeners();
    this.provider = null;
    this.address = '';
    this.chainId = 1;
    this.disconnectedEvent.emit();
  }

  // -----------------------------------------------------------------------
  // @notice Adds event listeners for the connected provider.
  //
  // @dev Fortmatic has an issue with event listeners. Need to fix.
  //
  // @dev Coinbase will emit both 'accountsChanged' and 'chainChanged' events
  // on connection even when they match the state. To prevent unnecessary page
  // loads, we prevent the handler from running when the state would not change.
  // -----------------------------------------------------------------------
  addProviderListeners() {
    if (this.provider.isFortmatic) return;

    this.provider.on('accountsChanged', (accounts: string[]) => {
      if (this.address === accounts[0]) return;

      if (accounts[0]) {
        this.address = accounts[0];
        this.accountChangedEvent.emit();
      } else {
        this.removeProviderListeners();
        this.provider = null;
        this.address = '';
        this.chainId = 1;
        this.disconnectedEvent.emit();
      }
    });

    this.provider.on('chainChanged', (chainId: string) => {
      if (this.chainId === parseInt(chainId)) return;
      this.chainId = parseInt(chainId);
      this.chainChangedEvent.emit(parseInt(chainId));
    });

    this.provider.on('connect', (info: { chainId: number }) => {
      console.log('.on connect');
      this.connectedEvent.emit();
    });

    this.provider.on(
      'disconnect',
      (error: { code: number; message: string }) => {
        console.log('.on disconnect');
        this.removeProviderListeners();
        this.provider = null;
        this.address = '';
        this.chainId = 1;
        this.disconnectedEvent.emit();
      }
    );
  }

  // -----------------------------------------------------------------------
  // @notice Removes all event listeners from the provider. We do this to
  // prevent duplicate event handlers from running in the event that a user
  // connects -> disconnect -> reconnects to a wallet.
  //
  // @dev Fortmatic has an issue with event listeners. Need to fix.
  // -----------------------------------------------------------------------
  removeProviderListeners() {
    if (this.provider.isFortmatic) return;
    this.provider.removeAllListeners('accountsChanged');
    this.provider.removeAllListeners('chainChanged');
    this.provider.removeAllListeners('connect');
    this.provider.removeAllListeners('disconnect');
  }

  // -----------------------------------------------------------------------
  // @notice Prompts user to change chain to chainId. If chainId does not
  // exist in user's wallet, prompts user to first add the chain and then
  // change to that chain.
  //
  // @dev Only works for Injected and Coinbase providers.
  // @param chainId The hex string for the chain being changed to (e.g. '0x1').
  // @return true for successful chain change, false otherwise.
  // -----------------------------------------------------------------------
  async changeChain(chainId: string): Promise<boolean> {
    return await this.web3.currentProvider['request']({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainId }],
    })
      .then(() => {
        if (Number(chainId) !== this.chainId) {
          this.chainId = Number(chainId);
          this.chainChangedEvent.emit(Number(chainId));
        }
        return true;
      })
      .catch((error) => {
        if (error.code === 4902) {
          const metadata = this.constants.CHAIN_METADATA[parseInt(chainId)];
          this.web3.currentProvider['request']({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: metadata.chainId,
                chainName: metadata.chainName,
                nativeCurrency: metadata.nativeCurrency,
                rpcUrls: metadata.rpcUrls,
                blockExplorerUrls: metadata.blockExplorerUrls,
              },
            ],
          })
            .then(() => {
              if (Number(metadata.chainId) !== this.chainId) {
                this.chainId = Number(metadata.chainId);
                this.chainChangedEvent.emit(Number(metadata.chainId));
              }
              return true;
            })
            .catch((error) => {
              return false;
            });
        } else {
          return false;
        }
      });
  }

  // -----------------------------------------------------------------------
  // @return true if a chain change has occured, false otherwise
  // -----------------------------------------------------------------------
  async didChainChange(): Promise<boolean> {
    const chainId = await this.web3.eth.getChainId();
    if (chainId !== this.chainId) {
      this.chainId = chainId;
      this.chainChangedEvent.emit(chainId);
      return true;
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // @notice Caches the last used wallet provider in order to automatically
  // reconnect when the user revisits the site.
  // -----------------------------------------------------------------------
  setProviderName() {
    if (this.provider.isMetaMask) {
      this.providerName = 'MetaMask';
    } else if (this.provider.isWalletConnect) {
      this.providerName = 'WalletConnect';
    } else if (this.provider.isCoinbaseWallet) {
      this.providerName = 'Coinbase';
    } else if (this.provider.isPortis) {
      this.providerName = 'Portis';
    } else if (this.provider.isTorus) {
      this.providerName = 'Torus';
    } else if (this.provider.isFortmatic) {
      this.providerName = 'Fortmatic';
    }

    window.localStorage.setItem('timeless:wallet', this.providerName);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  httpsWeb3(chainId?: number) {
    return chainId
      ? new Web3(this.constants.RPC[chainId])
      : new Web3(this.constants.RPC[this.chainId]);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async sendTx(func, _onTxHash, _onReceipt, _onConfirmation, _onError, val = 0) {
    const gasLimit = await this.estimateGas(func, val, _onError);
    if (!isNaN(gasLimit)) {
      let accessListObj;
      let gasUsedWithAccessList;

      if (this.constants.CHAIN_METADATA[this.chainId].useAccessList) {
        const readonlyWeb3 = this.httpsWeb3();
        accessListObj =
          await readonlyWeb3.eth['createAccessList']({
            from: this.address,
            to: func._parent._address,
            gas: gasLimit,
            data: func.encodeABI(),
            value: val
          })
          ;
        gasUsedWithAccessList = Number(accessListObj.gasUsed);
      }

      return func
        .send({
          from: this.address,
          gas: gasLimit,
          accessList: gasUsedWithAccessList && gasUsedWithAccessList < gasLimit ? accessListObj.accessList : null,
          value: val
        })
        .on('transactionHash', (hash) => {
          _onTxHash(hash);
          this.openTxModal(hash, false);
        })
        .on('receipt', () => {
          _onReceipt();
        })
        .once('confirmation', (number, receipt) => {
          _onConfirmation();
          this.openTxModal(receipt.transactionHash, true)
        })
        .on('error', (e) => {
          _onError(e);
        });
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async approveToken(
    token,
    spender,
    amount,
    _onTxHash,
    _onReceipt,
    _onConfirmation,
    _onError
  ) {
    const max = new BigNumber(2).pow(256).minus(1).integerValue().toFixed();
    const allowance = new BigNumber(
      await token.methods.allowance(this.address, spender).call()
    );
    if (allowance.gte(amount)) {
      _onReceipt();
      return;
    }
    return this.sendTx(
      token.methods.approve(spender, max),
      _onTxHash,
      _onReceipt,
      _onConfirmation,
      _onError
    );
  }

  // -----------------------------------------------------------------------
  // @dev Returns v, r, s, values for a valid signature. Used in conjunction
  // with selfPermit(). Below are links to some helpful resources.
  //
  // https://docs.metamask.io/guide/signing-data.html#signing-data-with-metamask
  // https://medium.com/metamask/eip712-is-coming-what-to-expect-and-how-to-use-it-bb92fd1a7a26
  // https://github.com/Uniswap/interface/blob/fc34912b5355abe20039e6db72e7deedc2ea58e6/src/hooks/useERC20Permit.ts
  // -----------------------------------------------------------------------
  async sign(data: string): Promise<[number, string, string]> {
    const [v, r, s] = await this.web3.currentProvider[
      'send'
    ]('eth_signTypedData_v4', [this.address, data]).then((result) => {
      // Metamask gives the signature as result.result, Frame gives the signature as result
      const signature = splitSignature(result.result ? result.result : result);
      const r = signature.r;
      const s = signature.s;
      const v = signature.v;
      return [v, r, s];
    });
    return [v, r, s];
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async estimateGas(func, val, _onError) {
    return Math.floor(
      (await func
        .estimateGas({
          from: this.address,
          value: val,
        })
        .catch(_onError)) * 1.2
    );
  }

  // -----------------------------------------------------------------------
  // @dev The modal will be automatically dismissed after 30 seconds.
  // -----------------------------------------------------------------------
  openTxModal(hash: string, txConfirmed: boolean) {
    const toastr = this.toastrService.show(null, null, {
      toastComponent: TransactionAlertModalComponent,
      positionClass: 'toast-bottom-right'
    })

    toastr.toastRef.componentInstance.hash = hash;
    toastr.toastRef.componentInstance.chainId = this.chainId;
    toastr.toastRef.componentInstance.txConfirmed = txConfirmed;

    setTimeout(() => {
      toastr.toastRef.close();
    }, 30000);

    return toastr;
  }
}
