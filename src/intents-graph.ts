import { fetchFromRPC } from "./utils/fetch-from-rpc";
import prisma from "./prisma";
import { periodMap } from "./constants/common";
import axios from "axios";
import Big from "big.js";
import {
  BLOCKS_PER_HOUR,
  formatLabel,
  groupByPeriod,
  decodeUint8Array,
  BalanceHistoryCache,
} from "./utils/balance-history-common";

const INTENTS_CONTRACT_ID = "intents.near";

async function getTokensMetadata() {
  try {
    const { data: tokensResponse } = await axios.get(
      "https://api-mng-console.chaindefuser.com/api/tokens"
    );
    return tokensResponse?.items || [];
  } catch (error) {
    console.error("Failed to fetch token metadata:", error);
    return [];
  }
}

type IntentsBalanceEntry = {
  timestamp: number;
  date: string;
  tokens: Array<{
    token_id: string;
    symbol: string;
    icon?: string;
    balance: string;
    parsedBalance: string;
  }>;
  totalTokens: number;
};

export async function getIntentsBalanceHistory(
  cache: BalanceHistoryCache,
  cacheKey: string,
  account_id: string
): Promise<Record<string, IntentsBalanceEntry[]>> {
  let rpcCallCount = 0;

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

    const tokensAccountHoldResp = await fetchFromRPC(
      {
        jsonrpc: "2.0",
        id: "dontcare",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: INTENTS_CONTRACT_ID,
          method_name: "mt_tokens_for_owner",
          args_base64: Buffer.from(
            JSON.stringify({
              account_id,
            })
          ).toString("base64"),
        },
      },
      false
    );

    if (!tokensAccountHoldResp?.result?.result) {
      console.log(`Account ${account_id} has no intents tokens`);
      return {}; // Return empty result if no tokens
    }

    const tokensAccountHold = decodeUint8Array(
      tokensAccountHoldResp.result.result
    );

    if (tokensAccountHold.length === 0) {
      console.log(`Account ${account_id} has no intents tokens`);
      return {}; // Return empty result if no tokens
    }

    // Get token metadata
    const tokensMetadata = await getTokensMetadata();
    const tokenMetadataMap = new Map(
      tokensMetadata.map((token: any) => [token.defuse_asset_id, token])
    );

    console.log(
      `Account ${account_id} has intents tokens, fetching historical data...`
    );

    const existingHistories = await prisma.intentsBalanceHistory.findMany({
      where: { account_id },
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
          console.log(`[${period}] [${account_id}] No new steps to fetch.`);
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

        // For each block, we'll check balances for tokens the account holds
        const tokensByBlock = blockHeights.map(() => tokensAccountHold);

        // Get balances for all tokens at each block height
        const balancesByBlock = await Promise.all(
          blockHeights.map(async (block_id, index) => {
            const tokensForBlock = tokensByBlock[index];
            if (!tokensForBlock || tokensForBlock.length === 0) {
              return [];
            }

            rpcCallCount++;
            try {
              const balancesResponse = await fetchFromRPC(
                {
                  jsonrpc: "2.0",
                  id: "dontcare",
                  method: "query",
                  params: {
                    request_type: "call_function",
                    block_id,
                    account_id: INTENTS_CONTRACT_ID,
                    method_name: "mt_batch_balance_of",
                    args_base64: Buffer.from(
                      JSON.stringify({
                        account_id,
                        token_ids: tokensForBlock.map((t: any) => t.token_id),
                      })
                    ).toString("base64"),
                  },
                },
                false,
                useArchival
              );

              const balancesResult = balancesResponse?.result?.result;
              if (!balancesResult) return [];

              const balances = decodeUint8Array(balancesResult);
              if (!balances) return [];

              // Combine token IDs with their balances and metadata
              return tokensForBlock
                .map((tokenInfo: any, i: number) => {
                  const balance = balances[i] || "0";
                  const token_id = tokenInfo.token_id;
                  const tokenMeta = tokenMetadataMap.get(token_id) as any;

                  if (Big(balance).eq(0)) {
                    return null; // Filter out tokens with zero balance
                  }

                  const parsedBalance = Big(balance)
                    .div(Big(10).pow(tokenMeta?.decimals || 0))
                    .toFixed();

                  return {
                    token_id,
                    symbol: tokenMeta?.symbol || tokenMeta?.name || token_id,
                    icon: tokenMeta?.icon || tokenMeta?.image,
                    balance,
                    parsedBalance,
                  };
                })
                .filter(Boolean); // Remove null entries
            } catch (error) {
              console.error(
                `Error fetching balances for block ${block_id}:`,
                error
              );
              return [];
            }
          })
        );

        const newHistory = blockHeights.map((_, index) => {
          const tokens = balancesByBlock[index] || [];
          const ts = timestamps[index];

          return {
            timestamp: ts,
            date: formatLabel(ts, period),
            tokens,
            totalTokens: tokens.length,
          };
        });

        const groupedHistory = groupByPeriod(newHistory);

        const mergedHistory = [
          ...((prev?.balance_history as IntentsBalanceEntry[]) || []),
          ...Object.values(groupedHistory),
        ];

        const finalHistory = Object.values(groupByPeriod(mergedHistory)).slice(
          -interval
        );

        if (prev) {
          prisma.intentsBalanceHistory
            .update({
              where: {
                account_id_period: {
                  account_id,
                  period,
                },
              },
              data: {
                balance_history: finalHistory,
                toBlock: currentBlock,
              },
            })
            .catch((e: any) => console.error("DB write failed:", e.message));
        } else {
          prisma.intentsBalanceHistory
            .create({
              data: {
                account_id,
                period,
                balance_history: finalHistory,
                fromBlock: blockHeights[0],
                toBlock: currentBlock,
              },
            })
            .catch((e: any) => console.error("DB write failed:", e.message));
        }

        return { period, data: finalHistory };
      })
    );

    const resp = allPeriodHistories.reduce((acc, { period, data }) => {
      acc[period] = data as IntentsBalanceEntry[];
      return acc;
    }, {} as Record<string, IntentsBalanceEntry[]>);

    cache.set(cacheKey, resp, 60 * 5);
    console.log(`Total RPC calls made: ${rpcCallCount}`);
    return resp;
  } catch (err) {
    console.error(
      "Fatal error in intents balance history. Using DB fallback:",
      err
    );
    const fallback = await prisma.intentsBalanceHistory.findMany({
      where: { account_id },
    });

    return fallback.reduce((acc: any, entry: any) => {
      acc[entry.period] = Array.isArray(entry.balance_history)
        ? entry.balance_history
        : [];
      return acc;
    }, {} as Record<string, IntentsBalanceEntry[]>);
  }
}
