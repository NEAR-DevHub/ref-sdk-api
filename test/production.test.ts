import axios from "axios";
import https from "https";

axios.defaults.httpsAgent = new https.Agent({ keepAlive: false });
axios.defaults.timeout = 60_000; // Increase timeout to 60 seconds for CI

const BASE_URL = "https://ref-sdk-api-2.fly.dev";

// List of accounts to test
const accounts = [
  "devdao.sputnik-dao.near",
  "infinex.sputnik-dao.near",
  "shitzu.sputnik-dao.near",
  "templar.sputnik-dao.near",
];

describe("Production API Status Tests", () => {
  test.each(accounts)(
    "GET /api/whitelist-tokens for %s returns 200",
    async (account) => {
      const res = await axios.get(`${BASE_URL}/api/whitelist-tokens`, {
        params: { account },
      });
      expect(res.status).toBe(200);
    },
    60000 // 60 second timeout per test
  );

  test.each(accounts)(
    "GET /api/ft-tokens for %s returns 200",
    async (account_id) => {
      const res = await axios.get(`${BASE_URL}/api/ft-tokens`, {
        params: { account_id },
      });
      expect(res.status).toBe(200);
    }
  );

  test.each(accounts)("GET /api/swap for %s returns 200", async (accountId) => {
    const res = await axios.get(`${BASE_URL}/api/swap`, {
      params: {
        accountId,
        tokenIn: "wrap.near",
        tokenOut: "usdt.tether-token.near",
        amountIn: "1000000000000000000000000",
        slippage: "0.01",
      },
    });
    expect(res.status).toBe(200);
  });

  test.each(accounts)(
    "GET /api/transactions-transfer-history for %s returns 200",
    async (treasuryDaoID) => {
      const res = await axios.get(
        `${BASE_URL}/api/transactions-transfer-history`,
        {
          params: { treasuryDaoID },
        }
      );
      expect(res.status).toBe(200);
    },
    60000 // 60 second timeout for this endpoint
  );

  test("GET /api/near-price returns 200", async () => {
    const res = await axios.get(`${BASE_URL}/api/near-price`);
    expect(res.status).toBe(200);
  });

  test.each(accounts)(
    "GET /api/all-token-balance-history for %s returns 200",
    async (account_id) => {
      const token_id = "usdt.tether-token.near";
      const res = await axios.get(`${BASE_URL}/api/all-token-balance-history`, {
        params: { account_id, token_id },
      });
      expect(res.status).toBe(200);
    }
  );

  test.each(accounts)(
    "GET /api/ft-token-price for %s returns 200",
    async (account_id) => {
      const res = await axios.get(`${BASE_URL}/api/ft-token-price`, {
        params: { account_id },
      });
      expect(res.status).toBe(200);
    }
  );
});
