import BigNumber from 'bignumber.js';

export interface BunniKey {
  pool: string;
  tickLower: number;
  tickUpper: number;
}

export interface BunniDepositParams {
  key: BunniKey;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  deadline: number;
  recipient: string;
}

export interface BunniWithdrawParams {
  key: BunniKey;
  recipient: string;
  shares: number;
  amount0Min: number;
  amount1Min: number;
  deadline: number;
}
