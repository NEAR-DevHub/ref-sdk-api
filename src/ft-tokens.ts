import axios from "axios";
import Big from "big.js";
import prisma from "./prisma";
import { WrapNearIcon } from "./constants/common";

type FTCache = {
  get: (key: string) => any;
  set: (key: string, value: any, ttl: number) => void;
};

interface FastNearToken {
  balance: string;
  contract_id: string;
  last_update_block_height: number;
}

interface FtMeta {
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
  reference?: string | null;
  price?: number;
}

interface FtsToken {
  contract: string;
  amount: string;
  ft_meta: FtMeta;
}

async function fetchFtMeta(contract_id: string): Promise<FtsToken | null> {
  try {
    const { data } = await axios.get(
      `https://api.nearblocks.io/v1/fts/${contract_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}`,
        },
      }
    );

    const contractData = data?.contracts?.[0];
    if (!contractData) return null;

    return {
      contract: contract_id,
      amount: "0", // Placeholder, will be overwritten
      ft_meta: {
        name: contractData.name,
        symbol: contractData.symbol,
        decimals: contractData.decimals,
        icon: contractData.icon || undefined,
        reference: contractData.reference || null,
        price: parseFloat(contractData.price) || 0,
      },
    };
  } catch (err: any) {
    console.error(`Failed fetching ${contract_id}:`, err.message);
    return null;
  }
}

export async function getFTTokens(account_id: string, cache: FTCache) {
  if (!account_id) throw new Error("Account ID is required");

  const cacheKey = `${account_id}-ft-tokens`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (!process.env.NEARBLOCKS_API_KEY) {
    throw new Error("NEARBLOCKS_API_KEY is not set");
  }

  try {
    const [nearblocksRes, fastnearRes] = await Promise.all([
      axios.get(
        `https://api3.nearblocks.io/v1/account/${account_id}/inventory`,
        {
          headers: {
            Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}`,
          },
        }
      ),
      axios.get(`https://api.fastnear.com/v1/account/${account_id}/full`, {
        headers: {
          Authorization: `Bearer ${process.env.FASTNEAR_API_KEY}`,
        },
      }),
    ]);

    const nearblocksFts = nearblocksRes?.data?.inventory?.fts || [];
    const fastnearFts = fastnearRes?.data?.tokens || [];

    const nearblocksMap = new Map(
      (nearblocksFts as FtsToken[]).map((ft) => [ft.contract, ft])
    );

    const mergedFts = (await Promise.all(
      fastnearFts.map(async (ft: any) => {
        const meta = nearblocksMap.get(ft.contract_id) as FtsToken | undefined;
        if (meta && meta.ft_meta) {
          return {
            contract: ft.contract_id,
            amount: ft.balance, // use FastNear balance
            ft_meta: meta.ft_meta,
          } as FtsToken;
        } else {
          // Fetch metadata if not found in Nearblocks
          const fetched = await fetchFtMeta(ft.contract_id);
          if (fetched) {
            fetched.amount = ft.balance;
            return fetched;
          }
          return null;
        }
      })
    )) as FtsToken[];

    const updatedFts = mergedFts.filter(Boolean) as FtsToken[];

    // Sort & calculate total
    const sorted = updatedFts.sort((a, b) => {
      const aValue = parseFloat(a.amount) * (a.ft_meta.price ?? 0);
      const bValue = parseFloat(b.amount) * (b.ft_meta.price ?? 0);
      return bValue - aValue;
    });

    const total = sorted.reduce((acc, ft) => {
      const amount = Big(ft.amount || "0");
      const decimals = ft.ft_meta.decimals || 0;
      const price = ft.ft_meta.price || 0;
      return acc.plus(amount.div(Big(10).pow(decimals)).mul(price));
    }, Big(0));

    const finalFts = sorted.map((ft) => {
      const isWrapped = ft.contract === "wrap.near";
      const icon = ft.ft_meta.icon || (isWrapped ? WrapNearIcon : undefined);
      return {
        ...ft,
        ft_meta: {
          ...ft.ft_meta,
          icon,
        },
      };
    });

    // Save to DB
    prisma.fTToken
      .upsert({
        where: { account_id },
        update: {
          totalCumulativeAmt: parseFloat(total.toFixed(2)),
          fts: finalFts as any,
          timestamp: new Date(),
        },
        create: {
          account_id,
          totalCumulativeAmt: parseFloat(total.toFixed(2)),
          fts: finalFts as any,
          timestamp: new Date(),
        },
      })
      .catch((e) => console.error("DB write failed:", e.message));

    const result = {
      totalCumulativeAmt: parseFloat(total.toFixed(2)),
      fts: finalFts,
    };

    cache.set(cacheKey, result, 60);
    return result;
  } catch (err: any) {
    console.error("getFTTokens error:", err.message);
    throw new Error("Failed to fetch FT tokens");
  }
}
