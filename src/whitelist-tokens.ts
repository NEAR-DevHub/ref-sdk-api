import Big from "big.js";
import axios from "axios";
import { BalanceResp } from "./utils/interface";
import { NearIcon, NearTokenMetadata, WrapNearIcon } from "./constants/common";
import { fetchFromRPC } from "./utils/fetch-from-rpc";
import { decodeUint8Array } from "./utils/balance-history-common";

type WhitelistTokensCache = {
  get: (key: string) => any;
  set: (key: string, value: any, ttl: number) => void;
};

async function fetchRefFinanceTokens(
  cache: WhitelistTokensCache
): Promise<Record<string, any>> {
  const cacheKey = "ref-finance-tokens";

  // Return cached data if it exists
  const cachedData = cache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  // Get whitelisted tokens from RPC
  const whitelistTokensResp = await fetchFromRPC(
    {
      jsonrpc: "2.0",
      id: "dontcare",
      method: "query",
      params: {
        request_type: "call_function",
        account_id: "v2.ref-finance.near",
        method_name: "get_whitelisted_tokens",
        args_base64: "",
        finality: "final",
      },
    },
    false,
    false
  );

  const whitelistTokens = whitelistTokensResp?.result?.result;
  const whitelistTokensArray = decodeUint8Array(whitelistTokens);

  const whitelistSet = new Set(whitelistTokensArray);

  try {
    const response = await axios.get("https://api.ref.finance/list-token");
    const allRefTokens = response.data;

    // Filter Ref Finance tokens to only include whitelisted ones
    const filteredTokens: Record<string, any> = {};
    for (const tokenId in allRefTokens) {
      if (whitelistSet.has(tokenId)) {
        filteredTokens[tokenId] = allRefTokens[tokenId];
      }
    }

    cache.set(cacheKey, filteredTokens, 10 * 60); // Cache for 10 minutes
    return filteredTokens;
  } catch (error) {
    console.error("Error fetching Ref Finance tokens:", error);
    return {};
  }
}

export async function getWhitelistTokens(
  account: string,
  cache: WhitelistTokensCache
) {
  // Fetch prices and balances concurrently
  const cacheKey = `${account}-whitelist-tokens`;

  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    console.log(`Cached response for key: ${cacheKey}`);
    return cachedData;
  }

  const fetchBalancesPromise = account
    ? axios
        .get(`https://api.fastnear.com/v1/account/${account}/full`, {
          headers: {
            Authorization: `Bearer ${process.env.FASTNEAR_API_KEY}`,
          },
        })
        .then((res) => res.data)
    : Promise.resolve([]);

  // Fetch Ref Finance tokens
  const refTokens = await fetchRefFinanceTokens(cache);

  // Add NEAR token to the list since Ref Finance doesn't return it
  const nearToken = {
    near: NearTokenMetadata,
  };

  // Merge NEAR token with Ref Finance tokens
  const allTokens: Record<string, any> = { ...nearToken, ...refTokens };

  const fetchTokenPricePromises = axios
    .get(`https://api.ref.finance/list-token-price`)
    .then((res) => res.data)
    .catch((err) => {
      console.error(`Error fetching token prices: ${err.message}`);
      return {}; // Return empty object for failed fetches
    });

  // Wait for both balances and token prices to resolve
  const [userBalances, tokenPrices] = await Promise.all([
    fetchBalancesPromise,
    fetchTokenPricePromises,
  ]);

  const userTokenBalances = new Map<string, string>();
  if (userBalances.tokens) {
    userBalances.tokens.forEach((token: BalanceResp) => {
      userTokenBalances.set(
        token.contract_id.toLowerCase(),
        token.balance?.toString() || "0"
      );
    });
  }

  // Filter tokens that have price data first
  const tokensWithPrices: string[] = [];
  for (const id of Object.keys(allTokens)) {
    const priceData = tokenPrices[id === "near" ? "wrap.near" : id];
    if (priceData?.price) {
      tokensWithPrices.push(id);
    }
  }

  // Map over only tokens with prices
  const simplifiedTokens = tokensWithPrices.map((id) => {
    const token = allTokens[id];
    const priceData = tokenPrices[id === "near" ? "wrap.near" : id];

    let balance = "0";

    if (id === "near") {
      balance = userBalances.state?.balance || "0";
    } else {
      balance = userTokenBalances.get(id) || "0";
    }

    const parsedBalance = Big(balance)
      .div(Big(10).pow(token.decimals))
      .toFixed(4);

    return {
      id,
      decimals: token.decimals || 0,
      parsedBalance,
      balance,
      price: Big(priceData.price).toFixed(),
      symbol: token.symbol,
      name: token.name || token.symbol,
      icon:
        id === "near"
          ? NearIcon
          : id === "wrap.near"
          ? WrapNearIcon
          : token.icon || "",
    };
  });

  // Return sorted tokens based on balance

  const result = simplifiedTokens.sort(
    (a, b) => parseFloat(b.parsedBalance) - parseFloat(a.parsedBalance)
  );

  cache.set(cacheKey, result, 600);
  return result;
}
