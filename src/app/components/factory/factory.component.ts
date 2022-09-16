import { Component, OnInit, NgZone } from '@angular/core';
import BigNumber from 'bignumber.js';

import { ConstantsService } from 'src/app/services/constants.service';
import { ContractService } from 'src/app/services/contract.service';
import { GateService, Vault, xPYT } from 'src/app/services/gate.service';
import { UtilService } from 'src/app/services/util.service';
import { WalletService } from 'src/app/services/wallet.service';

import { Price, Currency, Token } from '@uniswap/sdk-core';
import { priceToClosestTick, TickMath } from '@uniswap/v3-sdk';


@Component({
  selector: 'app-factory',
  templateUrl: './factory.component.html',
  styleUrls: ['./factory.component.scss']
})
export class FactoryComponent implements OnInit {

  timeout: any;
  gate_address: string; // the address of the Gate used to deploy NYT and PYT
  vault_address: string; // the address of the Vault input by the user
  valid_vault_address: boolean; // true if address is valid and address is ERC4626 or Yearn Vault

  selected_xpyt: xPYT; // the xPYT object of the selected xPYT address (used in Pool Factory)
  selected_vault: Vault; // the Vault object of the input address, if one exists

  nyt_deployment: string; // the address of the deployed NYT for a given Vault (null if not deployed)
  pyt_deployment: string; // the address of the deployed PYT for a given Vault (null if not deployed)
  xpyt_deployment: string; // the address of the deployed xPYT for a given Vault and params (null if not deployed)
  pool_deployment: string; // the address of the deployed Pool for a given Vault and params (null if not deployed)

  uniswap_v3_pool_fee: BigNumber; // fee used by the Uniswap V3 pool for swapping (1% = 10000)
  uniswap_v3_twap_seconds_ago: BigNumber; // number of seconds in the past from which to take the TWAP of the Uniswap V3 pool
  pounder_reward_multiplier: BigNumber; // percentage of the yield claimed in pound() to give to the caller as reward
  minimum_output_multiplier: BigNumber; // minimum acceptable ratio between the NYT output in pound() and the expected NYT output based on the TWAP
  initial_price: BigNumber;
  observation_cardinality_next: BigNumber;


  fee: BigNumber; // fee used by the Uniswap V3 pool for swapping (1% = 10000)
  price: BigNumber; // the price of xPYT derived in NYT (2 NYT = 1 xPYT implies 1.5x leverage)

  constructor(
    public constants: ConstantsService,
    public contract: ContractService,
    public gate: GateService,
    public util: UtilService,
    public wallet: WalletService,
    public zone: NgZone
  ) { }

  ngOnInit(): void {
    this.resetData();
    this.loadData(this.wallet.chainId);

    this.wallet.chainChangedEvent.subscribe((chainId) => {
      this.zone.run(() => {
        this.resetData();
        this.loadData(chainId);
      });
    });
  }

  resetData() {
    this.gate_address = null;
    this.vault_address = null;
    this.valid_vault_address = false;

    this.selected_xpyt = null;
    this.selected_vault = null;

    this.nyt_deployment = null;
    this.pyt_deployment = null;
    this.xpyt_deployment = null;
    this.pool_deployment = null;

    this.uniswap_v3_pool_fee = new BigNumber(10000);
    this.uniswap_v3_twap_seconds_ago = new BigNumber(1800);
    this.pounder_reward_multiplier = new BigNumber(5);
    this.minimum_output_multiplier = new BigNumber(95);
    this.initial_price = new BigNumber(0.6);
    this.observation_cardinality_next = new BigNumber(200);

    this.fee = new BigNumber(10000);
    this.price = new BigNumber(2);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  loadData(chainId: number) {
    this.gate.getVaultList(chainId);
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  set_vault_address(_address: string) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(async () => {
      this.vault_address = _address;

      const valid_address = this.validate_address(_address);
      const valid_vault_address = await this.validate_vault_address(_address);
      this.valid_vault_address = valid_address && valid_vault_address;
      if (this.valid_vault_address) {
        this.get_nyt_deployment(_address).then((nyt_deployment) => this.nyt_deployment = nyt_deployment);
        this.get_pyt_deployment(_address).then((pyt_deployment) => this.pyt_deployment = pyt_deployment);
        this.get_xpyt_deployment(_address).then((xpyt_deployment) => this.xpyt_deployment = xpyt_deployment);
        this.get_pool_deployment(_address).then((pool_deployment) => this.pool_deployment = pool_deployment);
      } else {
        this.nyt_deployment = null;
        this.pyt_deployment = null;
        this.xpyt_deployment = null;
        this.pool_deployment = null;
      }
    }, 250);
  }

  // -----------------------------------------------------------------------
  // @notice xPYT factory setters
  // -----------------------------------------------------------------------
  async set_uniswap_v3_pool_fee(_fee: number | string) {
    this.uniswap_v3_pool_fee = new BigNumber(_fee);

    this.xpyt_deployment = this.valid_vault_address
      ? await this.get_xpyt_deployment(this.vault_address)
      : null;
  }

  async set_uniswap_v3_twap_seconds_ago(_seconds: number | string) {
    this.uniswap_v3_twap_seconds_ago = new BigNumber(_seconds);
    if (this.uniswap_v3_twap_seconds_ago.isNaN()) {
      this.uniswap_v3_twap_seconds_ago = new BigNumber(0);
    }

    this.xpyt_deployment = this.valid_vault_address
      ? await this.get_xpyt_deployment(this.vault_address)
      : null;
  }

  async set_pounder_reward_multiplier(_percent: number | string) {
    this.pounder_reward_multiplier = new BigNumber(_percent);
    if (this.pounder_reward_multiplier.isNaN()) {
      this.pounder_reward_multiplier = new BigNumber(0);
    }

    this.xpyt_deployment = this.valid_vault_address
      ? await this.get_xpyt_deployment(this.vault_address)
      : null;
  }

  async set_minimum_output_multiplier(_percent: number | string) {
    this.minimum_output_multiplier = new BigNumber(_percent);
    if (this.minimum_output_multiplier.isNaN()) {
      this.minimum_output_multiplier = new BigNumber(0);
    }

    this.xpyt_deployment = this.valid_vault_address
      ? await this.get_xpyt_deployment(this.vault_address)
      : null;
  }

  set_initial_price(_price: number | string) {
    this.initial_price = new BigNumber(_price);
    if (this.initial_price.isNaN()) {
      this.initial_price = new BigNumber(0);
    }
  }

  set_observation_cardinality_next(_value: number | string) {
    this.observation_cardinality_next = new BigNumber(_value);
    if (this.observation_cardinality_next.isNaN()) {
      this.observation_cardinality_next = new BigNumber(0);
    }
  }

  // -----------------------------------------------------------------------
  // @notice pool factory setters
  // -----------------------------------------------------------------------
  async set_fee(_fee: number | string) {
    this.fee = new BigNumber(_fee);

    this.pool_deployment = this.valid_vault_address
      ? await this.get_pool_deployment(this.vault_address)
      : null;
  }

  set_price(_price: number | string) {
    this.price = new BigNumber(_price);
    if (this.price.isNaN()) {
      this.price = new BigNumber(0);
    }
  }

  // -----------------------------------------------------------------------
  // @notice deployment getters
  // -----------------------------------------------------------------------
  async get_nyt_deployment(_vault: string): Promise<string> {
    const vault = await this.gate.getVault(_vault.toLowerCase(), this.wallet.chainId);
    if (!vault) return null;

    const deployment = vault.nyt;
    return deployment ? deployment.address : null;
  }

  async get_pyt_deployment(_vault: string): Promise<string> {
    const vault = await this.gate.getVault(_vault.toLowerCase(), this.wallet.chainId);
    if (!vault) return null;

    const deployment = vault.pyt;
    return deployment ? deployment.address : null;
  }

  async get_xpyt_deployment(_vault: string): Promise<string> {
    const vault = await this.gate.getVault(_vault.toLowerCase(), this.wallet.chainId);
    if (!vault) return null;

    const deployment = vault.xpyt.find((xpyt) => {
      return this.uniswap_v3_pool_fee.eq(xpyt.uniswapV3PoolFee) &&
        this.uniswap_v3_twap_seconds_ago.eq(xpyt.uniswapV3TwapSecondsAgo) &&
        this.pounder_reward_multiplier.div(100).times(1e18).eq(xpyt.pounderRewardMultiplier) &&
        this.minimum_output_multiplier.div(100).times(1e18).eq(xpyt.minOutputMultiplier);
    });
    return deployment ? deployment.address : null;
  }

  async get_pool_deployment(_vault: string): Promise<string> {
    const vault = await this.gate.getVault(_vault.toLowerCase(), this.wallet.chainId);
    if (!vault) return null;

    const deployment = vault.xpyt.find((xpyt) => {
      return this.uniswap_v3_pool_fee.eq(xpyt.uniswapV3PoolFee) &&
        this.uniswap_v3_twap_seconds_ago.eq(xpyt.uniswapV3TwapSecondsAgo) &&
        this.pounder_reward_multiplier.div(100).times(1e18).eq(xpyt.pounderRewardMultiplier) &&
        this.minimum_output_multiplier.div(100).times(1e18).eq(xpyt.minOutputMultiplier);
    });
    return deployment ? deployment.pools[0].id : null;
  }

  // -----------------------------------------------------------------------
  // @notice deployment selectors
  // -----------------------------------------------------------------------
  async select_xpyt_deployment(_xpyt: string) {
    this.selected_xpyt = await this.gate.getToken(_xpyt, this.wallet.chainId) as xPYT;

    this.pool_deployment = this.valid_vault_address
      ? await this.get_pool_deployment(this.vault_address)
      : null;
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  validate_address(_address: string): boolean {
    const web3 = this.wallet.httpsWeb3(this.wallet.chainId);
    return web3.utils.isAddress(_address.toLowerCase());
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async validate_vault_address(_address: string): Promise<boolean> {
    const vault = await this.gate.getVault(_address.toLowerCase(), this.wallet.chainId);

    if (vault) {
      const gate = await this.gate.getVaultGate(vault, this.wallet.chainId);
      this.gate_address = gate.address;
      this.selected_vault = vault;
      this.selected_xpyt = vault.xpyt.length > 0 ? vault.xpyt[0] : null;
    } else {
      this.gate_address = null;
      this.selected_vault = null;
      this.selected_xpyt = null;
    }

    return vault ? true : await this.validate_gate(_address);
  }

  // -----------------------------------------------------------------------
  // @notice Checks if vault address should use Yearn or ERC4626 gate.
  //
  // @dev If address is xPYT, return false.
  // -----------------------------------------------------------------------
  async validate_gate(_address: string): Promise<boolean> {
    if (!this.validate_address(_address)) return;

    const token = await this.gate.getToken(_address, this.wallet.chainId);
    if (token) return;

    const web3 = this.wallet.httpsWeb3(this.wallet.chainId);
    const yearn_gate = this.contract.getGate(this.constants.YEARN_GATE[this.wallet.chainId], web3);
    const erc4626_gate = this.contract.getGate(this.constants.ERC4626_GATE[this.wallet.chainId], web3);

    const yearn_vault = await yearn_gate.methods.getUnderlyingOfVault(_address).call()
      .then((result) => { return true })
      .catch((error) => { return false });

    const erc4626_vault = await erc4626_gate.methods.getUnderlyingOfVault(_address).call()
      .then((result) => { return true })
      .catch((error) => { return false });

    if (yearn_vault && !erc4626_vault) {
      this.gate_address = this.constants.YEARN_GATE[this.wallet.chainId];
      return true;
    } else if (!yearn_vault && erc4626_vault) {
      this.gate_address = this.constants.ERC4626_GATE[this.wallet.chainId]
      return true;
    } else {
      this.gate_address = null;
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // @notice action disablers
  // -----------------------------------------------------------------------
  can_deploy_token(): boolean {
    return this.valid_vault_address && (!this.nyt_deployment || !this.pyt_deployment);
  }

  can_deploy_xpyt(): boolean {
    return this.valid_vault_address && this.pyt_deployment && !this.xpyt_deployment && (+this.initial_price >= 0.5 && +this.initial_price <= 0.9);
  }

  can_deploy_pool(): boolean {
    return this.valid_vault_address && this.nyt_deployment && this.selected_xpyt && !this.pool_deployment;
  }

  // -----------------------------------------------------------------------
  // @notice message setters
  // -----------------------------------------------------------------------
  token_factory_message(): string {
    if (!this.vault_address) {
      return "Enter a Vault Address";
    } else if (!this.valid_vault_address) {
      return "Enter a Valid Vault Address";
    } else if (this.pyt_deployment && this.nyt_deployment) {
      return "Yield Tokens Already Deployed";
    } else {
      return "Deploy NYT and PYT"
    }
  }

  xpyt_factory_message(): string {
    if (!this.vault_address) {
      return "Enter a Vault Address";
    } else if (!this.valid_vault_address) {
      return "Enter a Valid Vault Address";
    } else if (!this.pyt_deployment) {
      return "NYT & PYT Must Be Deployed First"
    } else if (this.xpyt_deployment) {
      return "xPYT Already Deployed"
    } else {
      return "Deploy xPYT & Uniswap Pool"
    }
  }

  pool_factory_message(): string {
    if (!this.vault_address) {
      return "Enter a Vault Address";
    } else if (!this.valid_vault_address) {
      return "Enter a Valid Vault Address";
    } else if (!this.nyt_deployment) {
      return "NYT & PYT Must Be Deployed First";
    } else if (!this.selected_xpyt) {
      return "xPYT Must Be Deployed First";
    } else if (this.pool_deployment) {
      return "Pool Already Deployed";
    } else {
      return "Deploy Pool";
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async deploy_pyt_nyt() {
    if (!this.gate_address || !this.vault_address) {
      console.error("deploy_pyt_nyt: invalid gate and/or vault address");
      return;
    }

    const web3 = this.wallet.web3;
    const chainId = this.wallet.chainId;
    const factory_contract = this.contract.getNamedContract("GateFactory", chainId, web3);

    const func = factory_contract.methods.deployYieldTokenPair(this.gate_address, this.vault_address);

    const return_object = await this.wallet
      .sendTx(
        func,
        () => { },
        () => { },
        () => {
          setTimeout(() => this.gate.getVaultList(chainId, true), 30000);
        },
        () => { }
      )
      .catch((error) => {
        console.error(error);
      });

    if (return_object) {
      this.nyt_deployment = return_object.events.DeployYieldTokenPair.returnValues.nyt.toLowerCase();
      this.pyt_deployment = return_object.events.DeployYieldTokenPair.returnValues.pyt.toLowerCase();
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async deploy_xpyt() {
    if (!this.nyt_deployment || !this.pyt_deployment) {
      console.error("deploy_xpyt: invalid nyt and/or pyt address");
      return;
    }

    const web3 = this.wallet.web3;
    const chainId = this.wallet.chainId;
    const factory_contract = this.contract.getNamedContract("UniswapV3xPYTFactory", chainId, web3);

    const vault_contract = this.contract.getERC20(this.vault_address, web3);
    const vault_symbol = await vault_contract.methods.symbol().call();
    const vault_name = await vault_contract.methods.name().call();

    const nytContract = this.contract.getERC20(this.nyt_deployment, web3);
    const nytDecimals = Number.parseInt(await nytContract.methods.decimals().call());
    const NYT = new Token(chainId, this.nyt_deployment, nytDecimals);

    // the xPYT factory assumes address(nyt) < address(xPYT), so we generate the price tick this way
    // basically we add 1 to the NYT address (as a number) and convert it back into an address
    const mockXPYT = new Token(chainId, web3.utils.padLeft("0x" + new BigNumber(this.nyt_deployment, 16).plus(1).toString(16), 40), nytDecimals);

    const nytPrecision = new BigNumber(10).pow(nytDecimals);
    // initial_price is the price of xPYT in terms of the underlying, so initial_price / (1 - initial_price) is the price of xPYT in terms of NYT
    const xPYTPriceInNYT = nytPrecision.times(this.initial_price).div(1 - +this.initial_price);
    const tick = priceToClosestTick(new Price(mockXPYT, NYT, this.util.processWeb3Number(nytPrecision), this.util.processWeb3Number(xPYTPriceInNYT)));

    const func = factory_contract.methods.deployUniswapV3xPYT(
      this.pyt_deployment,
      this.nyt_deployment,
      `Timeless ${vault_name} xPYT`,
      `∞-${vault_symbol}-xPYT`,
      this.util.processWeb3Number(this.pounder_reward_multiplier.div(100).times(1e18)),
      this.util.processWeb3Number(this.minimum_output_multiplier.div(100).times(1e18)),
      this.util.processWeb3Number(this.uniswap_v3_pool_fee),
      this.util.processWeb3Number(this.uniswap_v3_twap_seconds_ago),
      tick,
      this.util.processWeb3Number(this.observation_cardinality_next)
    );

    const return_object = await this.wallet
      .sendTx(
        func,
        () => { },
        () => { },
        () => {
          setTimeout(() => this.gate.getVaultList(chainId, true), 30000);
        },
        () => { }
      )
      .catch((error) => {
        console.error(error);
      });

    if (return_object) {
      this.xpyt_deployment = return_object.events.DeployXPYT.returnValues.deployed.toLowerCase();
      this.pool_deployment = return_object.events.DeployXPYT.returnValues.pool.toLowerCase();
    }
  }

  // -----------------------------------------------------------------------
  // -----------------------------------------------------------------------
  async deploy_uniswap_pool() {
    if (!this.selected_xpyt) {
      console.error("deploy_uniswap_pool: invalid xpyt address");
      return;
    }

    const web3 = this.wallet.web3;
    const chainId = this.wallet.chainId;
    const factory_contract = this.contract.getNamedContract('NonfungiblePositionManager', chainId, web3);

    const nyt = await this.gate.getToken(this.nyt_deployment, chainId);
    const NYT = new Token(chainId, nyt.address, nyt.decimals, nyt.symbol, nyt.name);

    const xpyt = this.selected_xpyt;
    const XPYT = new Token(chainId, xpyt.address, xpyt.decimals, xpyt.symbol, xpyt.name);

    const tick = priceToClosestTick(new Price(XPYT, NYT, 1, this.price.toNumber()));
    const nytIsToken0 = XPYT.address > NYT.address;
    const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);

    const func = factory_contract.methods.createAndInitializePoolIfNecessary(
      nytIsToken0 ? NYT.address : XPYT.address,
      nytIsToken0 ? XPYT.address : NYT.address,
      this.fee.toString(),
      sqrtPriceX96.toString()
    );

    const return_object = await this.wallet
      .sendTx(
        func,
        () => { },
        () => { },
        () => {
          setTimeout(() => this.gate.getVaultList(chainId, true), 30000);
        },
        () => { }
      )
      .catch((error) => {
        console.error(error);
      });

    if (return_object) {
      this.pool_deployment = return_object.events[1].address;
    }
  }
}
