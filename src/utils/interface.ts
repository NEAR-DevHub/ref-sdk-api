export interface BalanceResp {
  balance: number;
  contract_id: string;
}

export interface Token {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  price: string;
  balance: string;
  parsedBalance: string;
  decimals: number;
}

export interface IServerPool {
  amount_in?: string;
  min_amount_out: string;
  pool_id: string | number;
  token_in: string;
  token_out: string;
}

export interface NearBlockTokenMetadata {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
  icon: string;
  reference: string | null;
  price: string | null;
  total_supply: string;
  onchain_market_cap: string;
  change_24: string;
  market_cap: string;
  volume_24h: string;
}

export interface RefFinanceTokenMetadata {
  spec: string;
  name: string;
  symbol: string;
  icon: string;
  reference: string;
  reference_hash: string;
  decimals: number;
}

export interface IServerRoute {
  amount_in: string;
  min_amount_out: string;
  pools: IServerPool[];
  tokens?: RefFinanceTokenMetadata[];
}

export interface IEstimateSwapServerView {
  amount_in: string;
  amount_out: string;
  contract_in: string;
  contract_out: string;
  routes: IServerRoute[];
  contract?: string;
}

export interface SwapOptions {
  useNearBalance?: boolean;
  tokenIn: NearBlockTokenMetadata;
  tokenOut: NearBlockTokenMetadata;
  amountIn: string;
  slippageTolerance?: number;
  accountId: string;
  swapsToDoServer: IEstimateSwapServerView;
}

export interface FTStorageBalance {
  total: string;
  available: string;
}

export interface SmartRouter {
  result_code: string;
  result_message: string;
  result_data: IEstimateSwapServerView;
}
