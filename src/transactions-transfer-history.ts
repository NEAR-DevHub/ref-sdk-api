import {
  deduplicateByTimestamp,
  fetchAdditionalPage,
  fetchPikespeakEndpoint,
  sortByDate,
} from "./utils/lib";
import prisma from "./prisma";

export type TransferHistoryParams = {
  page?: string;
  lockupContract?: string;
  treasuryDaoID: string;
};

const totalTxnsPerPage = 20;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export async function getTransactionsTransferHistory(
  params: TransferHistoryParams
) {
  const { page = "1", lockupContract, treasuryDaoID } = params;
  const requestedPage = parseInt(page, 10);
  const now = Date.now();

  if (!treasuryDaoID) throw new Error("treasuryDaoID is required");

  const cacheKey = `${treasuryDaoID}-${lockupContract || "no-lockup"}`;

  try {
    let cachedEntry = await prisma.transferHistory.findUnique({
      where: { cacheKey },
    });

    let cachedData: any[] = (cachedEntry?.data as any[]) || [];
    const isStale =
      !cachedEntry ||
      now - new Date(cachedEntry.timestamp).getTime() > REFRESH_INTERVAL_MS;

    // Step 1: Refresh base data if stale
    if (isStale) {
      const accounts = [
        treasuryDaoID,
        ...(lockupContract ? [lockupContract] : []),
      ];

      const transferPromises = accounts.flatMap((account) => [
        fetchPikespeakEndpoint(
          `https://api.pikespeak.ai/account/near-transfer/${account}?limit=${totalTxnsPerPage}&offset=0`
        ),
        fetchPikespeakEndpoint(
          `https://api.pikespeak.ai/account/ft-transfer/${account}?limit=${totalTxnsPerPage}&offset=0`
        ),
      ]);

      const results = await Promise.all(transferPromises);
      const allData = results.flatMap((res) => (res.ok ? res.body : []));

      const cachedSlice = cachedData.slice(0, allData.length);
      const isUpdated =
        cachedData.length === 0 ||
        JSON.stringify(allData) !== JSON.stringify(cachedSlice);

      if (isUpdated) {
        cachedData = deduplicateByTimestamp([...allData, ...cachedData]);
        prisma.transferHistory
          .upsert({
            where: { cacheKey },
            update: { data: cachedData, timestamp: new Date() },
            create: { cacheKey, data: cachedData },
          })
          .catch((e) => console.error("DB write failed:", e.message));
      }
    }

    // Step 2: Check if more pages are needed
    const cachedItemCount = cachedData.length;
    const requiredCount = requestedPage * totalTxnsPerPage;

    if (cachedItemCount < requiredCount) {
      const totalCachedPages = Math.floor(cachedItemCount / totalTxnsPerPage);

      // Fetch until we cover the requested page
      for (
        let pageNum = totalCachedPages + 1;
        pageNum <= requestedPage;
        pageNum++
      ) {
        const moreData = await fetchAdditionalPage(
          totalTxnsPerPage,
          treasuryDaoID,
          lockupContract,
          pageNum - 1 // offset starts from 0
        );

        cachedData = deduplicateByTimestamp([...cachedData, ...moreData]);

        prisma.transferHistory
          .upsert({
            where: { cacheKey },
            update: { data: cachedData, timestamp: new Date() },
            create: { cacheKey, data: cachedData },
          })
          .catch((e) => console.error("DB write failed:", e.message));
      }
    }

    const endIndex = requestedPage * totalTxnsPerPage;
    return sortByDate(cachedData).slice(0, endIndex);
  } catch (error: any) {
    console.error("Error in getTransactionsTransferHistory:", error);

    // Fallback: try returning whatever is cached in the DB
    try {
      const fallback = await prisma.transferHistory.findUnique({
        where: {
          cacheKey: `${params.treasuryDaoID}-${
            params.lockupContract || "no-lockup"
          }`,
        },
      });

      if (fallback?.data) {
        const requestedPage = parseInt(params.page || "1", 10);
        const endIndex = requestedPage * totalTxnsPerPage;
        const data = fallback.data as any[];
        return sortByDate(data).slice(0, endIndex);
      }
    } catch (fallbackError) {
      console.error("Failed to retrieve fallback cached data:", fallbackError);
    }

    throw new Error("Failed to retrieve transaction history.");
  }
}
