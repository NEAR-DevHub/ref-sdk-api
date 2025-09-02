import express, { Request, Response } from "express";
import axios from "axios";
import prisma from "../prisma";
import {
  updateReportSheet,
  updateTransactionsReportSheet,
} from "../utils/google-sheet";
import { fetchFromRPC } from "../utils/fetch-from-rpc";
import Big from "big.js";
import { sha256 } from "js-sha256";

const router = express.Router();
const factoryAccount = "treasury-factory.near";

interface FtMeta {
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
  reference?: string | null;
  price?: number;
}

interface FtToken {
  contract: string;
  amount: string;
  ft_meta: FtMeta;
}

type Proposal = {
  id: number;
  proposer: string;
  description: string;
  status: string;
  vote_counts: {
    Approver: number[];
  };
  votes: Record<string, string>;
  submission_time: string;
  last_actions_log: string | null;
};

type FunctionCallProposal = Proposal & {
  kind: {
    FunctionCall: {
      actions: {
        method_name: string;
        args?: string;
        deposit?: string;
        gas?: string;
      }[];
    };
    receiver_id: string;
  };
};

type TransferProposal = Proposal & {
  kind: {
    Transfer: {
      amount: string;
      token_id: string;
    };
  };
};

function accountToLockup(accountId: string) {
  return `${sha256(accountId).slice(0, 40)}.lockup.near`;
}

async function insertTreasuryToDb({
  createdAt,
  createdBy,
  instanceAccount,
  daoAccount,
  name,
}: {
  createdAt: Date;
  createdBy: string;
  instanceAccount: string;
  daoAccount: string;
  name: string;
}) {
  let lockupContract = accountToLockup(daoAccount);
  const resp = await fetchFromRPC(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "view_account",
        finality: "final",
        account_id: lockupContract,
      },
    },
    false
  );

  if (!resp?.result?.amount) {
    lockupContract = "";
  }

  await prisma.treasury.upsert({
    where: { name },
    update: {
      createdAt,
      createdBy,
      instanceAccount,
      daoAccount,
      lockupContract,
    },
    create: {
      name,
      createdAt,
      createdBy,
      instanceAccount,
      daoAccount,
      lockupContract,
    },
  });
}

const fetchNearBalances = async (account_id: string) => {
  try {
    const { data } = await axios.get(
      `https://ref-sdk-test-cold-haze-1300-2.fly.dev/api/all-token-balance-history`,
      {
        params: { account_id, token_id: "near" },
      }
    );
    return data;
  } catch (error) {
    console.error(`Error fetching balance for ${account_id}`, error);
    return null;
  }
};

const fetchFTBalances = async (account_id: string) => {
  try {
    const { data } = await axios.get(
      `https://ref-sdk-test-cold-haze-1300-2.fly.dev/api/ft-tokens`,
      {
        params: { account_id },
      }
    );
    return data;
  } catch (error) {
    console.error(`Error fetching balance for ${account_id}`, error);
    return null;
  }
};

async function checkAccountExists(account: string) {
  const resp = await fetchFromRPC(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "view_account",
        finality: "final",
        account_id: account,
      },
    },
    false
  ).catch((e) => console.log(e));
  return resp?.result?.amount !== undefined && resp?.result?.amount !== null;
}

router.get("/db/store-treasuries", async (_req, res) => {
  try {
    const { data } = await axios.get(
      `https://api.nearblocks.io/v1/account/${factoryAccount}/txns-only?per_page=250`,
      {
        headers: {
          Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}`,
        },
      }
    );
    if (!Array.isArray(data?.txns))
      return res.status(500).send({
        error: "Error occured while fetching nearblocks transactions",
      });
    const txns = data.txns;

    for (const tx of txns) {
      const createdAt = new Date(Number(tx?.block_timestamp) / 1_000_000);
      const createdBy =
        tx?.predecessor_account_id || tx?.signer_account_id || "unknown";
      const outcomeSuccess = tx.outcomes.status;
      if (!outcomeSuccess) {
        continue;
      }
      for (const action of tx.actions || []) {
        if (
          action.action === "FUNCTION_CALL" &&
          action.method === "create_instance" &&
          action.args
        ) {
          try {
            const parsedArgs = JSON.parse(action.args);
            const name = parsedArgs.name;
            if (!name) continue;
            if ((name || "")?.endsWith(".near")) {
              continue;
            }
            const instanceAccount = name + ".near";
            const daoAccount = name + ".sputnik-dao.near";
            const checkInstanceAccountExist = await checkAccountExists(
              instanceAccount
            );
            if (!checkInstanceAccountExist) {
              continue;
            }
            const checkDAOAccountExist = await checkAccountExists(daoAccount);
            if (!checkDAOAccountExist) {
              continue;
            }

            await insertTreasuryToDb({
              createdAt,
              createdBy,
              instanceAccount,
              daoAccount,
              name,
            });
            console.log(`✅ Stored treasury: ${name} | by: ${createdBy}`);
          } catch (err: any) {
            console.warn("⚠️ Failed to decode/store treasury:", err.message);
          }
        }
      }
    }

    return res.send({
      message: "Successfully stored all self created treasuries to database",
    });
  } catch (err) {
    console.error("❌ Error storing treasuries:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/db/insert-treasury", async (req: Request, res: Response) => {
  const payload = Array.isArray(req.body) ? req.body : [req.body];

  const results = [];

  for (const entry of payload) {
    const { name, createdAt, createdBy, instanceAccount, daoAccount } = entry;

    if (!name || !createdAt || !createdBy) {
      results.push({
        name,
        status: "failed",
        reason: "Missing name, createdAt, or createdBy",
      });
      continue;
    }

    try {
      const checkInstanceAccountExist = await checkAccountExists(
        instanceAccount
      );
      if (!checkInstanceAccountExist) {
        continue;
      }
      const checkDAOAccountExist = await checkAccountExists(daoAccount);
      if (!checkDAOAccountExist) {
        continue;
      }

      await insertTreasuryToDb({
        createdAt: new Date(createdAt),
        createdBy,
        instanceAccount,
        daoAccount,
        name,
      });
      results.push({ name, status: "success" });
    } catch (err) {
      console.error(`❌ Failed to insert treasury ${name}:`, err);
      results.push({
        name,
        status: "failed",
        reason: "Database insert failed",
      });
    }
  }

  return res.send({
    message: "Insert operation completed",
    results,
  });
});

function getParsedTokenAmount(token: FtToken) {
  return Number(
    Big(token?.amount ?? "0")
      .div(Big(10).pow(token?.ft_meta?.decimals ?? 0))
      .toFixed()
  );
}

async function getTreasuiresForReport() {
  try {
    const treasuries = await prisma.treasury.findMany();
    // Filter out test treasuries
    const filteredTreasuries = treasuries
      .filter(
        (t: any) =>
          !t.daoAccount?.includes("testing") &&
          !t.instanceAccount?.includes("test") &&
          !t.daoAccount?.includes("demo") &&
          !t.instanceAccount?.includes("sdfwefw") &&
          !t.daoAccount?.includes("astradao-staging.sputnik-dao.near")
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    return filteredTreasuries;
  } catch (e) {
    console.log("Error while fetching treasuries");
  }
}

function decodeUint8Array(uint8Array: number[]) {
  const string = String.fromCharCode(...uint8Array);
  return JSON.parse(string);
}

async function getFTLockedBalance(ftContracts: string[], daoAccount: string) {
  try {
    return await Promise.all(
      ftContracts.map(async (contract) => {
        const accountMetadataResp = await fetchFromRPC(
          {
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
              request_type: "call_function",
              finality: "final",
              account_id: contract,
              method_name: "get_account",
              args_base64: btoa(JSON.stringify({ account_id: daoAccount })),
            },
          },
          false
        );

        const contractMetadataResp = await fetchFromRPC(
          {
            jsonrpc: "2.0",
            id: "dontcare",
            method: "query",
            params: {
              request_type: "call_function",
              finality: "final",
              account_id: contract,
              method_name: "contract_metadata",
              args_base64: "",
            },
          },
          false
        );
        const contractMetadata = decodeUint8Array(
          contractMetadataResp.result.result
        );
        const ftMetadata = await getTokenMetadata(
          contractMetadata.token_account_id
        );
        const accountMetadata = decodeUint8Array(
          accountMetadataResp.result.result
        );
        return {
          contract: contract,
          balance: Big(accountMetadata?.session_num ?? 0)
            .mul(accountMetadata?.release_per_session ?? 0)
            .minus(accountMetadata?.claimed_amount ?? 0)
            .div(Big(10).pow(ftMetadata?.decimals))
            .mul(ftMetadata?.price ?? 0)
            .toFixed(),
        };
      })
    );
  } catch (error) {
    console.error(`Error fetching FT locked balance for ${daoAccount}`, error);
    return null;
  }
}

async function getIntentsBalance(daoAccount: string) {
  try {
    const { data: tokensResponse } = await axios.get(
      "https://api-mng-console.chaindefuser.com/api/tokens"
    );

    if (!tokensResponse?.items || tokensResponse.items.length === 0) {
      return { tokens: [], totalUSD: 0 };
    }

    const initialTokens = tokensResponse.items;
    const tokenIds = initialTokens.map((t: any) => t.defuse_asset_id);

    const balancesResp = await fetchFromRPC(
      {
        jsonrpc: "2.0",
        id: "dontcare",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: "intents.near",
          method_name: "mt_batch_balance_of",
          args_base64: btoa(
            JSON.stringify({
              account_id: daoAccount,
              token_ids: tokenIds,
            })
          ),
        },
      },
      false
    );

    if (!balancesResp?.result?.result) {
      console.error("Failed to fetch balances from intents.near");
      return { tokens: [], totalUSD: 0 };
    }
    const balances = decodeUint8Array(balancesResp.result.result);

    const tokensWithBalances = initialTokens.map((token: any, i: number) => ({
      ...token,
      amount: balances[i] || "0",
    }));

    const filteredTokens = tokensWithBalances.filter(
      (token: any) => token.amount && Big(token.amount).gt(0)
    );

    if (filteredTokens.length === 0) {
      return { tokens: [], totalUSD: 0 };
    }
    const tokensWithMetadata = await Promise.all(
      filteredTokens.map(async (token: any) => {
        return {
          ...token,
          usdValue: Big(token.amount)
            .div(Big(10).pow(token.decimals || 0))
            .mul(token.price || 0)
            .toFixed(),
        };
      })
    );

    // Calculate total USD value
    const totalUSD = tokensWithMetadata.reduce(
      (acc: Big, token: any) => Big(acc).plus(Big(token.usdValue || 0)),
      Big(0)
    );

    return {
      tokens: tokensWithMetadata,
      totalUSD: totalUSD.toNumber(),
    };
  } catch (error) {
    console.error("Error fetching intents balance:", error);
    return { tokens: [], totalUSD: 0 };
  }
}

router.get("/db/treasuries-report", async (_req, res) => {
  try {
    const treasuries = await getTreasuiresForReport();

    const { data: nearPriceResp } = await axios.get(
      "https://ref-sdk-test-cold-haze-1300-2.fly.dev/api/near-price"
    );
    const nearPrice = Big(nearPriceResp || 0);

    const reportData = await Promise.all(
      (treasuries ?? []).map(async (treasury: any) => {
        try {
          let daoBalance = Big(0);
          let totalAssets = Big(0);

          const promises = [
            fetchFTBalances(treasury.daoAccount),
            fetchNearBalances(treasury.daoAccount),
            fetchFromRPC(
              {
                jsonrpc: "2.0",
                id: "policy",
                method: "query",
                params: {
                  request_type: "call_function",
                  finality: "final",
                  method_name: "get_policy",
                  account_id: treasury.daoAccount,
                  args_base64: "",
                },
              },
              false
            ),
            treasury.lockupContract
              ? fetchNearBalances(treasury.lockupContract)
              : Promise.resolve(null),
          ];

          const [ftBalance, nearBalanceResp, policyResp, lockupBalanceResp] =
            await Promise.all(promises);

          const nearAmount = Big(
            nearBalanceResp?.["1H"]?.[nearBalanceResp?.["1H"]?.length - 1]
              ?.balance || "0"
          );
          const nearUSD = nearAmount.times(nearPrice);

          const ftAssetsUSD = Big(ftBalance?.totalCumulativeAmt || 0);

          const totalAssetsUSD = ftAssetsUSD.plus(nearUSD);
          daoBalance = daoBalance.plus(totalAssetsUSD);
          totalAssets = totalAssets.plus(totalAssetsUSD);

          const usdcToken = (ftBalance?.fts ?? []).find(
            (i: FtToken) =>
              i.contract ===
              "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
          );

          const usdcAmount = getParsedTokenAmount(usdcToken);

          const usdtToken = (ftBalance?.fts ?? []).find(
            (i: FtToken) => i.contract === "usdt.tether-token.near"
          );
          const usdtAmount = getParsedTokenAmount(usdtToken);

          const otherTokens = (ftBalance?.fts ?? []).filter(
            (i: FtToken) =>
              i.contract !== "usdt.tether-token.near" &&
              i.contract !==
                "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
          );
          const otherTokensTotal = otherTokens.reduce(
            (acc: any, token: FtToken) => {
              const parsedAmount = getParsedTokenAmount(token);
              return acc.plus(parsedAmount);
            },
            Big(0)
          );

          const otherAmount = Number(otherTokensTotal.toFixed());

          const rawPolicyString =
            policyResp?.result?.result
              ?.map((c: any) => String.fromCharCode(c))
              .join("") ?? "{}";

          const lockupBalance = Big(
            lockupBalanceResp?.["1H"]?.[0]?.balance || "0"
          );
          const lockupBalanceUSD = lockupBalance.times(nearPrice);

          totalAssets = totalAssets.plus(lockupBalanceUSD);

          const policy = JSON.parse(rawPolicyString);
          const allMembers =
            policy.roles?.flatMap((r: any) => r.kind?.Group || []) || [];
          const uniqueMembers = new Set(allMembers);

          return {
            treasuryUrl: `https://${treasury.instanceAccount}.page/`,
            daoAssetsValueUSD: Number(daoBalance),
            totalAssetsValueUSD: Number(totalAssets),
            numberOfUsers: uniqueMembers.size,
            monthlyTransactions: 0,
            lockupContract: treasury.lockupContract ?? "-",
            lockupValueUSD: Number(lockupBalanceUSD),
            createdAt: new Date(treasury.createdAt).toLocaleDateString(
              "en-US",
              {
                year: "numeric",
                month: "long",
                day: "2-digit",
              }
            ),
            createdBy: treasury.createdBy,
            nearAmount: Number(nearAmount.toFixed()),
            usdcAmount,
            usdtAmount,
            otherAmount,
          };
        } catch (error) {
          console.warn(`⚠️ Skipping treasury ${treasury.name}:`, error);
          return null;
        }
      })
    );

    const cleanReport = reportData.filter(Boolean);
    await updateReportSheet(cleanReport);
    return res.status(200).json(cleanReport);
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

// time for transactions report
const startTime = 1749031920000000000;

async function getTokenMetadata(tokenId: string) {
  const { data: meta } = await axios.get(
    `http://0.0.0.0:3000/api/ft-token-metadata?account_id=${tokenId}`
  );
  return meta;
}

async function getTokenAmountInUSD(tokenId: string, rawAmount: string) {
  const actualTokenId = tokenId?.trim() || "near";
  const meta = await getTokenMetadata(actualTokenId);

  const amount = Big(rawAmount).div(Big(10).pow(meta.decimals));
  const usdValue = amount.times(meta.price);
  return {
    amount: amount,
    usdValue: usdValue,
    symbol: actualTokenId === "near" ? "NEAR" : meta.symbol,
  };
}

async function getPaymentStats(daoAccount: string): Promise<{
  totalProposals: number;
  tokenTotals: Record<string, { amount: Big; usdValue: Big }>;
}> {
  try {
    const { data: proposals }: { data: TransferProposal[] } = await axios.get(
      `https://sputnik-indexer-divine-fog-3863.fly.dev/proposals/${daoAccount}?proposal_type=Transfer&keyword=title`
    );

    const filtered = proposals.filter((p) =>
      Big(p.submission_time).gt(startTime)
    );

    const tokenTotals: Record<string, { amount: Big; usdValue: Big }> = {};

    for (const p of filtered) {
      const transfer = p.kind?.Transfer;
      if (!transfer?.amount) continue;

      const tokenId = transfer.token_id || "near";

      const { amount, usdValue, symbol } = await getTokenAmountInUSD(
        tokenId,
        transfer.amount
      );

      if (tokenTotals[symbol]) {
        tokenTotals[symbol].amount = tokenTotals[symbol].amount.plus(amount);
        tokenTotals[symbol].usdValue =
          tokenTotals[symbol].usdValue.plus(usdValue);
      } else {
        tokenTotals[symbol] = { amount, usdValue };
      }
    }

    return {
      totalProposals: filtered.length,
      tokenTotals,
    };
  } catch (error: any) {
    const statusCode = error.response?.status || "UNKNOWN";
    console.error(
      `getPaymentStats failed for ${daoAccount} - Status Code: ${statusCode}`
    );
    return { totalProposals: 0, tokenTotals: {} };
  }
}

async function getStakeStats(daoAccount: string): Promise<{
  totalProposals: number;
  totalStakedAmount: Big;
  totalStakedUSD: Big;
}> {
  let stakeProposalsCount = 0;
  try {
    const { data: proposals }: { data: FunctionCallProposal[] } =
      await axios.get(
        `https://sputnik-indexer-divine-fog-3863.fly.dev/proposals/${daoAccount}?proposal_type=FunctionCall&keyword=stake`
      );

    const filtered = proposals.filter((p) =>
      Big(p.submission_time).gt(startTime)
    );

    let totalStakedAmount = Big(0);
    let totalStakedUSD = Big(0);

    for (const p of filtered) {
      if (p.description.includes("* Proposal Action:")) {
        stakeProposalsCount++;
      }
      const functionCall = p.kind?.FunctionCall;
      if (!functionCall?.actions) continue;

      for (const action of functionCall.actions) {
        if (action.method_name === "deposit_and_stake" && action.deposit) {
          // it can be lockup stake
          const lockupDepositAmount = JSON.parse(
            atob(action.args as string) ?? "{}"
          )?.amount;

          const depositAmount = Big(
            lockupDepositAmount || action.deposit
          ).toFixed();

          const { amount, usdValue } = await getTokenAmountInUSD(
            "near",
            depositAmount
          );
          totalStakedAmount = totalStakedAmount.plus(amount);
          totalStakedUSD = totalStakedUSD.plus(usdValue);
        }
      }
    }
    return {
      totalProposals: totalStakedAmount.gt(0) ? stakeProposalsCount : 0,
      totalStakedAmount,
      totalStakedUSD,
    };
  } catch (error: any) {
    const statusCode = error.response?.status || "UNKNOWN";
    console.error(
      `getStakeStats failed for ${daoAccount} - Status Code: ${statusCode}`
    );
    return {
      totalProposals: 0,
      totalStakedAmount: Big(0),
      totalStakedUSD: Big(0),
    };
  }
}

async function getAssetExchangeStats(daoAccount: string): Promise<{
  totalProposals: number;
  totalExchangeValueUSD: Big;
  assetExchanged: string[];
}> {
  try {
    let exchangeProposalsCount = 0;
    const { data: proposals }: { data: FunctionCallProposal[] } =
      await axios.get(
        `https://sputnik-indexer-divine-fog-3863.fly.dev/proposals/${daoAccount}?proposal_type=FunctionCall&keyword=asset-exchange`
      );

    const filtered = proposals.filter((p) =>
      Big(p.submission_time).gt(startTime)
    );

    let totalExchangeValueUSD = Big(0);
    const assetExchanged: string[] = [];

    for (const p of filtered) {
      const description = p.description || "";

      const tokenInMatch = description.match(/Token In:\s*(\S+)/i);
      const tokenOutMatch = description.match(/Token Out:\s*(\S+)/i);
      const amountInMatch = description.match(/Amount In:\s*([\d.]+)/i);
      const amountOutMatch = description.match(/Amount Out:\s*([\d.]+)/i);

      if (!tokenInMatch || !tokenOutMatch || !amountInMatch || !amountOutMatch)
        continue;

      const tokenIn = tokenInMatch[1].trim();
      const tokenOut = tokenOutMatch[1].trim();
      const amountIn = Big(amountInMatch[1]);
      const amountOut = Big(amountOutMatch[1]);
      exchangeProposalsCount++;
      const inUSD = await getTokenAmountInUSD(tokenIn, amountIn.toFixed());
      const outUSD = await getTokenAmountInUSD(tokenOut, amountOut.toFixed());

      totalExchangeValueUSD = totalExchangeValueUSD
        .plus(inUSD.usdValue)
        .plus(outUSD.usdValue);

      assetExchanged.push(
        `${amountIn.toFixed()} ${
          inUSD.symbol
        } exchanged for ${amountOut.toFixed()} ${outUSD.symbol}`
      );
    }

    return {
      totalProposals: exchangeProposalsCount,
      totalExchangeValueUSD,
      assetExchanged,
    };
  } catch (error: any) {
    const statusCode = error.response?.status || "UNKNOWN";
    console.error(
      `getAssetExchangeStats failed for ${daoAccount} - Status Code: ${statusCode}`
    );
    return {
      totalProposals: 0,
      totalExchangeValueUSD: Big(0),
      assetExchanged: [],
    };
  }
}

async function getLockupStats(daoAccount: string): Promise<{
  totalProposals: number;
  totalLockupAmount: Big;
  totalLockupUSD: Big;
}> {
  try {
    let lockupProposalsCount = 0;
    const { data: proposals }: { data: FunctionCallProposal[] } =
      await axios.get(
        `https://sputnik-indexer-divine-fog-3863.fly.dev/proposals/${daoAccount}?proposal_type=FunctionCall&keyword=lockup`
      );

    const filtered = proposals.filter((p) =>
      Big(p.submission_time).gt(startTime)
    );

    let totalLockupAmount = Big(0);
    let totalLockupUSD = Big(0);

    for (const p of filtered) {
      const actions = p.kind?.FunctionCall?.actions;
      if (!Array.isArray(actions)) continue;

      for (const action of actions) {
        if (action.method_name === "create" && action.deposit) {
          lockupProposalsCount++;
          const depositNear = Big(action.deposit).toFixed();

          const { amount, usdValue } = await getTokenAmountInUSD(
            "near",
            depositNear
          );

          totalLockupAmount = totalLockupAmount.plus(amount);
          totalLockupUSD = totalLockupUSD.plus(usdValue);
        }
      }
    }

    return {
      totalProposals: totalLockupAmount.gt(0) ? lockupProposalsCount : 0,
      totalLockupAmount,
      totalLockupUSD,
    };
  } catch (error: any) {
    const statusCode = error.response?.status || "UNKNOWN";
    console.error(
      `getLockupStats failed for ${daoAccount}: - Status Code: ${statusCode}`
    );
    return {
      totalProposals: 0,
      totalLockupAmount: Big(0),
      totalLockupUSD: Big(0),
    };
  }
}

router.get("/db/treasuries-transactions-report", async (_req, res) => {
  try {
    const treasuries = await getTreasuiresForReport();

    function delay(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    const reportData = [];

    for (const treasury of treasuries ?? []) {
      const daoAccount = treasury.daoAccount;

      const [paymentStats, stakeStats, assetExchangeStats, lockupStats] =
        await Promise.all([
          getPaymentStats(daoAccount),
          getStakeStats(daoAccount),
          getAssetExchangeStats(daoAccount),
          getLockupStats(daoAccount),
        ]);

      reportData.push({
        treasuryUrl: `https://${treasury.instanceAccount}.page/`,
        paymentProposals: paymentStats.totalProposals,
        paymentTokens: Object.entries(paymentStats.tokenTotals)
          .map(
            ([tokenId, { amount, usdValue }]) =>
              `Token: ${tokenId} | Amount: ${amount.toFixed()} | USD Value: $${usdValue.toFixed()}`
          )
          .join("\n"),
        totalPaymentValue: Object.values(paymentStats.tokenTotals).reduce(
          (total, { usdValue }) => total.plus(usdValue),
          Big(0)
        ),
        exchangeProposals: assetExchangeStats.totalProposals,
        exchangeTokens: assetExchangeStats.assetExchanged.join("\n"),
        totalExchangeValue: assetExchangeStats.totalExchangeValueUSD,
        stakeProposals: stakeStats.totalProposals,
        totalStaked: stakeStats.totalStakedAmount,
        totalStakedUSD: stakeStats.totalStakedUSD,
        lockupProposals: lockupStats.totalProposals,
        totalLockupNear: lockupStats.totalLockupAmount,
        totalLockedValueUSD: lockupStats.totalLockupUSD,
      });

      // ⏳ Delay 1 seconds before processing the next treasury otherwise the indexer api throws 429 error
      await delay(5000);
    }

    const cleanReport = reportData.filter(Boolean);
    await updateTransactionsReportSheet(cleanReport);
    return res.status(200).json(cleanReport);
  } catch (err) {
    console.error("Error generating transactions report:", err);
    res.status(500).json({ error: "Failed to generate transactions report" });
  }
});

export default router;
