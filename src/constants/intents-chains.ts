export type BlockchainOption = {
  name: string;
  icon: string;
  network: string;
};

const prefix = "https://near-intents.org/static/icons/network/";

export const chainIcons: Record<string, { dark: string; light: string }> = {
  eth: {
    dark: `${prefix}ethereum_white.svg`,
    light: `${prefix}ethereum.svg`,
  },
  near: {
    dark: `${prefix}near.svg`,
    light: `${prefix}near_dark.svg`,
  },
  base: {
    dark: `${prefix}base.svg`,
    light: `${prefix}base.svg`,
  },
  arbitrum: {
    dark: `${prefix}arbitrum.svg`,
    light: `${prefix}arbitrum.svg`,
  },
  bitcoin: {
    dark: `${prefix}btc.svg`,
    light: `${prefix}btc.svg`,
  },

  solana: {
    dark: `${prefix}solana.svg`,
    light: `${prefix}solana.svg`,
  },

  dogecoin: {
    dark: `${prefix}dogecoin.svg`,
    light: `${prefix}dogecoin.svg`,
  },

  turbochain: {
    dark: `${prefix}turbochain.png`,
    light: `${prefix}turbochain.png`,
  },
  tuxappchain: {
    dark: `${prefix}tuxappchain.svg`,
    light: `${prefix}tuxappchain.svg`,
  },
  vertex: {
    dark: `${prefix}vertex.svg`,
    light: `${prefix}vertex.svg`,
  },
  optima: {
    dark: `${prefix}optima.svg`,
    light: `${prefix}optima.svg`,
  },
  easychain: {
    dark: `${prefix}easychain.svg`,
    light: `${prefix}easychain.svg`,
  },
  aurora: {
    dark: `${prefix}aurora.svg`,
    light: `${prefix}aurora.svg`,
  },
  aurora_devnet: {
    dark: `${prefix}aurora_devnet.svg`,
    light: `${prefix}aurora_devnet.svg`,
  },
  xrpledger: {
    dark: `${prefix}xrpledger_white.svg`,
    light: `${prefix}xrpledger.svg`,
  },
  zcash: {
    dark: `${prefix}zcash.svg`,
    light: `${prefix}zcash-icon-black.svg`,
  },
  gnosis: {
    dark: `${prefix}gnosis_white.svg`,
    light: `${prefix}gnosis.svg`,
  },
  berachain: {
    dark: `${prefix}berachain.svg`,
    light: `${prefix}berachain.svg`,
  },
  tron: {
    dark: `${prefix}tron.svg`,
    light: `${prefix}tron.svg`,
  },
  polygon: {
    dark: `${prefix}polygon.svg`,
    light: `${prefix}polygon.svg`,
  },
  bsc: {
    dark: `${prefix}bsc.svg`,
    light: `${prefix}bsc.svg`,
  },
  hyperliquid: {
    dark: `${prefix}hyperliquid.svg`,
    light: `${prefix}hyperliquid.svg`,
  },
  ton: {
    dark: `${prefix}ton.svg`,
    light: `${prefix}ton.svg`,
  },
  optimism: {
    dark: `${prefix}optimism.svg`,
    light: `${prefix}optimism_dark.svg`,
  },
  avalanche: {
    dark: `${prefix}avalanche.svg`,
    light: `${prefix}avalanche.svg`,
  },
  sui: {
    dark: `${prefix}sui.svg`,
    light: `${prefix}sui_dark.svg`,
  },
  stellar: {
    dark: `${prefix}stellar_white.svg`,
    light: `${prefix}stellar.svg`,
  },
  aptos: {
    dark: `${prefix}aptos_white.svg`,
    light: `${prefix}aptos.svg`,
  },
  cardano: {
    dark: `${prefix}cardano.svg`,
    light: `${prefix}cardano.svg`,
  },
};

export function getBlockchainsOptions(theme: "light" | "dark" = "light") {
  return [
    {
      name: "Near",
      icon: chainIcons.near[theme],
      network: "near",
    },
    {
      name: "Ethereum",
      icon: chainIcons.eth[theme],
      network: "eth",
    },
    {
      name: "Base",
      icon: chainIcons.base[theme],
      network: "base",
    },
    {
      name: "Arbitrum",
      icon: chainIcons.arbitrum[theme],
      network: "arbitrum",
    },
    {
      name: "Bitcoin",
      icon: chainIcons.bitcoin[theme],
      network: "bitcoin",
    },
    {
      name: "Bitcoin",
      icon: chainIcons.bitcoin[theme],
      network: "btc",
    },
    {
      name: "Solana",
      icon: chainIcons.solana[theme],
      network: "solana",
    },
    {
      name: "Solana",
      icon: chainIcons.solana[theme],
      network: "sol",
    },
    {
      name: "Dogecoin",
      icon: chainIcons.dogecoin[theme],
      network: "dogecoin",
    },
    {
      name: "Dogecoin",
      icon: chainIcons.dogecoin[theme],
      network: "doge",
    },
    {
      name: "TurboChain",
      icon: chainIcons.turbochain[theme],
      network: "turbochain",
    },
    {
      name: "Aurora",
      icon: chainIcons.aurora[theme],
      network: "aurora",
    },
    {
      name: "Aurora Devnet",
      icon: chainIcons.aurora[theme],
      network: "aurora_devnet",
    },
    {
      name: "XRP Ledger",
      icon: chainIcons.xrpledger[theme],
      network: "xrpledger",
    },
    {
      name: "XRP Ledger",
      icon: chainIcons.xrpledger[theme],
      network: "xrp",
    },
    {
      name: "Zcash",
      icon: chainIcons.zcash[theme],
      network: "zcash",
    },
    {
      name: "Zcash",
      icon: chainIcons.zcash[theme],
      network: "zec",
    },
    {
      name: "Gnosis",
      icon: chainIcons.gnosis[theme],
      network: "gnosis",
    },
    {
      name: "BeraChain",
      icon: chainIcons.berachain[theme],
      network: "berachain",
    },
    {
      name: "Tron",
      icon: chainIcons.tron[theme],
      network: "tron",
    },
    {
      name: "TuxaChain",
      icon: chainIcons.tuxappchain[theme],
      network: "tuxappchain",
    },
    {
      name: "Vertex",
      icon: chainIcons.vertex[theme],
      network: "vertex",
    },
    {
      name: "Optima",
      icon: chainIcons.optima[theme],
      network: "optima",
    },
    {
      name: "EasyChain",
      icon: chainIcons.easychain[theme],
      network: "easychain",
    },
    {
      name: "Polygon",
      icon: chainIcons.polygon[theme],
      network: "polygon",
    },
    {
      name: "BNB Smart Chain",
      icon: chainIcons.bsc[theme],
      network: "bsc",
    },
    {
      name: "Hyperliquid",
      icon: chainIcons.hyperliquid[theme],
      network: "hyperliquid",
    },
    {
      name: "TON",
      icon: chainIcons.ton[theme],
      network: "ton",
    },
    {
      name: "Optimism",
      icon: chainIcons.optimism[theme],
      network: "optimism",
    },
    {
      name: "Avalanche",
      icon: chainIcons.avalanche[theme],
      network: "avalanche",
    },
    {
      name: "Sui",
      icon: chainIcons.sui[theme],
      network: "sui",
    },
    {
      name: "Stellar",
      icon: chainIcons.stellar[theme],
      network: "stellar",
    },
    {
      name: "Aptos",
      icon: chainIcons.aptos[theme],
      network: "aptos",
    },
    {
      name: "Cardano",
      icon: chainIcons.cardano[theme],
      network: "cardano",
    },
  ];
}
