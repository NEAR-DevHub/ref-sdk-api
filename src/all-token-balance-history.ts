import { fetchFromRPC } from "./utils/fetch-from-rpc";
import { convertFTBalance } from "./utils/convert-ft-balance";
import prisma from "./prisma";
import { tokens } from "./constants/tokens";
import { periodMap } from "./constants/period-map";
import { getUserStakeBalances } from "./utils/lib";
import {
  BLOCKS_PER_HOUR,
  formatLabel,
  groupByPeriod,
  BalanceHistoryCache,
} from "./utils/balance-history-common";

type BalanceHistoryEntry = {
  timestamp: number;
  date: string;
  balance: string;
};

export async function getAllTokenBalanceHistory(
  cache: BalanceHistoryCache,
  cacheKey: string,
  account_id: string,
  token_id: string
): Promise<Record<string, BalanceHistoryEntry[]>> {
  let rpcCallCount = 0;

  const token = tokens[token_id as keyof typeof tokens];
  let decimals = token?.decimals || 24;

  if (!token?.decimals) {
    try {
      const tokenDetails = await fetchFromRPC(
        {
          jsonrpc: "2.0",
          id: "dontcare",
          method: "query",
          params: {
            request_type: "call_function",
            account_id: token_id,
            finality: "final",
            method_name: "ft_metadata",
            args_base64: btoa(JSON.stringify({})),
          },
        },
        false,
        false
      );
      const decodedResult = tokenDetails.result.result
        .map((c: number) => String.fromCharCode(c))
        .join("");
      const decodedResultObject = JSON.parse(decodedResult);
      decimals = parseInt(decodedResultObject.decimals, 10);
    } catch (err) {
      console.error("Failed to fetch token metadata:", err);
    }
  }

  try {
    const currentBlockData = await fetchFromRPC(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "block",
        params: { finality: "final" },
      },
      true,
      false
    );
    rpcCallCount++;
    const currentBlock = currentBlockData.result.header.height;

    const existingHistories = await prisma.tokenBalanceHistory.findMany({
      where: { account_id, token_id },
    });

    const existingMap = Object.fromEntries(
      existingHistories
        .filter((e: any) => Array.isArray(e.balance_history))
        .map((e: any) => [e.period, e])
    );

    const allPeriodHistories = await Promise.all(
      periodMap.map(async ({ period, value, interval }) => {
        const useArchival = ["1Y", "1M", "1W", "All"].includes(period);
        const hoursPerStep = value / interval;
        const blocksPerStep = Math.floor(BLOCKS_PER_HOUR * hoursPerStep);

        const prev = existingMap[period];
        const lastStoredBlock =
          typeof prev?.toBlock === "number" ? prev.toBlock : 0;

        if (currentBlock <= lastStoredBlock) {
          console.log(`[${period}] No new blocks since last stored. Skipping.`);
          return {
            period,
            data: Array.isArray(prev?.balance_history)
              ? prev.balance_history
              : [],
          };
        }

        let totalSteps = Math.min(
          interval,
          Math.floor((currentBlock - lastStoredBlock) / blocksPerStep)
        );

        if (totalSteps <= 0) {
          console.log(`[${period}] [${account_id}]  No new steps to fetch.`);
          totalSteps = 1;
        }

        const blockHeights = Array.from(
          { length: totalSteps },
          (_, i) => currentBlock - blocksPerStep * (totalSteps - 1 - i)
        ).filter((block) => block > lastStoredBlock && block > 1_000_000);

        if (blockHeights.length === 0) {
          console.log(
            `[${period}] Filtered block heights are empty. Skipping.`
          );
          return {
            period,
            data: Array.isArray(prev?.balance_history)
              ? prev.balance_history
              : [],
          };
        }

        const timestamps = await Promise.all(
          blockHeights.map(async (block_id) => {
            const data = await fetchFromRPC(
              {
                jsonrpc: "2.0",
                id: block_id,
                method: "block",
                params: { block_id },
              },
              false,
              useArchival
            );
            rpcCallCount++;
            return data.result.header.timestamp / 1e6;
          })
        );

        const balances = await Promise.all(
          blockHeights.map(async (block_id) => {
            rpcCallCount++;
            if (token_id === "near") {
              return fetchFromRPC(
                {
                  jsonrpc: "2.0",
                  id: 1,
                  method: "query",
                  params: {
                    request_type: "view_account",
                    block_id,
                    account_id,
                  },
                },
                false,
                useArchival
              );
            } else {
              return fetchFromRPC(
                {
                  jsonrpc: "2.0",
                  id: "dontcare",
                  method: "query",
                  params: {
                    request_type: "call_function",
                    block_id,
                    account_id: token_id,
                    method_name: "ft_balance_of",
                    args_base64: btoa(JSON.stringify({ account_id })),
                  },
                },
                false,
                useArchival
              );
            }
          })
        );

        let stakeBalances: any[] = [];
        if (token_id === "near") {
          // fetch all pools where user has staked near and get the balance for each at each blockheights
          stakeBalances = await getUserStakeBalances(
            account_id,
            blockHeights,
            rpcCallCount,
            cache,
            useArchival
          );
        }

        const newHistory = blockHeights.map((_, index) => {
          let balance = "0";
          if (token_id === "near") {
            balance = balances[index]?.result?.amount?.toString() || "0";
            balance = (
              BigInt(balance) + BigInt(stakeBalances[index] || 0)
            ).toString();
          } else {
            const raw = String.fromCharCode(
              ...(balances[index]?.result?.result || [])
            );
            balance = raw ? raw.replace(/"/g, "") : "0";
          }

          const ts = timestamps[index];

          return {
            timestamp: ts,
            date: formatLabel(ts, period),
            balance: convertFTBalance(balance, decimals),
          };
        });

        const groupedHistory = groupByPeriod(newHistory);

        const mergedHistory = [
          ...((prev?.balance_history as BalanceHistoryEntry[]) || []),
          ...Object.values(groupedHistory),
        ];

        const finalHistory = Object.values(groupByPeriod(mergedHistory)).slice(
          -interval
        );

        if (prev) {
          prisma.tokenBalanceHistory
            .update({
              where: {
                account_id_token_id_period: {
                  account_id,
                  token_id,
                  period,
                },
              },
              data: {
                balance_history: finalHistory,
                toBlock: currentBlock,
              },
            })
            .catch((e) => console.error("DB write failed:", e.message));
        } else {
          prisma.tokenBalanceHistory
            .create({
              data: {
                account_id,
                token_id,
                period,
                balance_history: finalHistory,
                fromBlock: blockHeights[0],
                toBlock: currentBlock,
              },
            })
            .catch((e) => console.error("DB write failed:", e.message));
        }

        return { period, data: finalHistory };
      })
    );

    const resp = allPeriodHistories.reduce((acc, { period, data }) => {
      acc[period] = data as BalanceHistoryEntry[];
      return acc;
    }, {} as Record<string, BalanceHistoryEntry[]>);

    cache.set(cacheKey, resp, 60 * 5);
    console.log(`Total RPC calls made: ${rpcCallCount}`);
    return resp;
  } catch (err) {
    console.error("Fatal error in balance history. Using DB fallback:", err);
    const fallback = await prisma.tokenBalanceHistory.findMany({
      where: { account_id, token_id },
    });

    return fallback.reduce((acc: any, entry: any) => {
      acc[entry.period] = Array.isArray(entry.balance_history)
        ? entry.balance_history
        : [];
      return acc;
    }, {} as Record<string, BalanceHistoryEntry[]>);
  }
}
