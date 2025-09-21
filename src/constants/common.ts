export const periodMap = [
  { period: "1Y", value: 24 * 365, interval: 12 }, // 1 point per month
  { period: "1M", value: 24 * 30, interval: 15 }, // 1 point per 2 days
  { period: "1W", value: 24 * 7, interval: 8 }, // 1 point per day
  { period: "1D", value: 24, interval: 12 }, // 1 point per 2 hours
  { period: "1H", value: 1, interval: 6 }, // 1 point per 10 minutes
  { period: "All", value: 24 * 365 * 2, interval: 20 }, // assuming 2 years of chain history
];

export const WrapNearIcon =
  "https://img.rhea.finance/images/w-NEAR-no-border.png";

export const NearIcon = "https://img.rhea.finance/images/NEARIcon.png";

export const NearTokenMetadata = {
  contract: "near",
  spec: "ft-1.0.0",
  name: "NEAR",
  symbol: "NEAR",
  icon: NearIcon,
  reference: "",
  reference_hash: "",
  decimals: 24,
  price: null,
  total_supply: "0",
  onchain_market_cap: "0",
  change_24: "0",
  market_cap: "0",
  volume_24h: "0",
};
