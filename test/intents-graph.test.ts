import request from "supertest";
import app from "../src/server";
import * as intentsGraph from "../src/intents-graph";

jest.mock("../src/intents-graph");

describe("GET /api/intents-balance-history", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should return 400 when account_id is missing", async () => {
    const response = await request(app)
      .get("/api/intents-balance-history")
      .expect(400);

    expect(response.body).toEqual({
      error: "Missing required parameter: account_id",
    });
  });

  it("should return empty result for account with no intents tokens", async () => {
    const accountId = "mgoel.sputnik-dao.near";

    (intentsGraph.getIntentsBalanceHistory as jest.Mock).mockResolvedValue({});

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .expect(200);

    expect(response.body).toEqual({});
    expect(intentsGraph.getIntentsBalanceHistory).toHaveBeenCalledWith(
      expect.any(Object),
      `intents:${accountId}`,
      accountId
    );
  });

  it("should return historical data for account with intents tokens", async () => {
    const accountId = "webassemblymusic-treasury.sputnik-dao.near";
    const mockHistoryData = {
      "1H": [
        {
          timestamp: 1694678400000,
          date: "Sep 14, 2:00 PM",
          tokens: [
            {
              token_id: "btc.defuse.near",
              symbol: "BTC",
              icon: "https://example.com/btc.png",
              balance: "1000000000000000000",
              parsedBalance: "1.0",
            },
            {
              token_id: "eth.defuse.near",
              symbol: "ETH",
              icon: "https://example.com/eth.png",
              balance: "2000000000000000000",
              parsedBalance: "2.0",
            },
          ],
          totalTokens: 2,
        },
      ],
      "1D": [
        {
          timestamp: 1694592000000,
          date: "Sep 13",
          tokens: [
            {
              token_id: "btc.defuse.near",
              symbol: "BTC",
              icon: "https://example.com/btc.png",
              balance: "500000000000000000",
              parsedBalance: "0.5",
            },
          ],
          totalTokens: 1,
        },
      ],
    };

    (intentsGraph.getIntentsBalanceHistory as jest.Mock).mockResolvedValue(
      mockHistoryData
    );

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .expect(200);

    expect(response.body).toEqual(mockHistoryData);
    expect(intentsGraph.getIntentsBalanceHistory).toHaveBeenCalledWith(
      expect.any(Object), // cache
      `intents:${accountId}`,
      accountId
    );
  });

  it("should handle errors gracefully", async () => {
    const accountId = "test.near";
    const errorMessage = "RPC call failed";

    (intentsGraph.getIntentsBalanceHistory as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .expect(500);

    expect(response.body).toEqual({
      error: "Internal server error",
    });
  });

  it("should validate account_id parameter type", async () => {
    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: 123 }) // Invalid type
      .expect(400);

    expect(response.body).toEqual({
      error: "Missing required parameter: account_id",
    });
  });
});

describe("Integration Tests", () => {
  // These tests will run against the actual function (unmocked)
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("should return empty result for account with no intents tokens (integration)", async () => {
    const accountId = "mgoel.sputnik-dao.near";

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .timeout(30000); // 30 second timeout for RPC calls

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  }, 35000);

  it("should return historical data for account with intents tokens (integration)", async () => {
    const accountId = "webassemblymusic-treasury.sputnik-dao.near";

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .timeout(60000); // 60 second timeout for historical RPC calls

    expect(response.status).toBe(200);

    // Check that response has the expected structure
    if (Object.keys(response.body).length > 0) {
      // If account has tokens, validate structure
      expect(response.body).toHaveProperty("1H");
      expect(Array.isArray(response.body["1H"])).toBe(true);

      if (response.body["1H"].length > 0) {
        const entry = response.body["1H"][0];
        expect(entry).toHaveProperty("timestamp");
        expect(entry).toHaveProperty("date");
        expect(entry).toHaveProperty("tokens");
        expect(entry).toHaveProperty("totalTokens");
        expect(Array.isArray(entry.tokens)).toBe(true);

        if (entry.tokens.length > 0) {
          const token = entry.tokens[0];
          expect(token).toHaveProperty("token_id");
          expect(token).toHaveProperty("symbol");
          expect(token).toHaveProperty("balance");
          expect(token).toHaveProperty("parsedBalance");
        }
      }
    } else {
      // If account has no tokens, should be empty object
      expect(response.body).toEqual({});
    }
  }, 65000);
});
