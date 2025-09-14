import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import app from "../src/server";

// Mock the module for unit tests
jest.mock("../src/intents-graph");
import * as intentsGraph from "../src/intents-graph";

// Mock NodeCache to prevent cache interference
jest.mock("node-cache", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(undefined), // Always return undefined (cache miss)
    set: jest.fn(),
    del: jest.fn(),
  }));
});

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

    (
      intentsGraph.getIntentsBalanceHistory as jest.MockedFunction<
        typeof intentsGraph.getIntentsBalanceHistory
      >
    ).mockResolvedValue({});

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
              balance: "100000000",
              parsedBalance: "1.00000000",
            },
          ],
          totalTokens: 1,
        },
      ],
      "1D": [
        {
          timestamp: 1694592000000,
          date: "Sep 13",
          tokens: [
            {
              token_id: "eth.defuse.near",
              symbol: "ETH",
              icon: "https://example.com/eth.png",
              balance: "1000000000000000000",
              parsedBalance: "1.000000000000000000",
            },
          ],
          totalTokens: 1,
        },
      ],
    };

    (
      intentsGraph.getIntentsBalanceHistory as jest.MockedFunction<
        typeof intentsGraph.getIntentsBalanceHistory
      >
    ).mockResolvedValue(mockHistoryData);

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .expect(200);

    expect(response.body).toEqual(mockHistoryData);
    expect(response.body).toHaveProperty("1H");
    expect(response.body).toHaveProperty("1D");
    expect(Array.isArray(response.body["1H"])).toBe(true);
    expect(response.body["1H"][0]).toHaveProperty("tokens");
    expect(response.body["1H"][0]).toHaveProperty("totalTokens");
    expect(intentsGraph.getIntentsBalanceHistory).toHaveBeenCalledWith(
      expect.any(Object), // cache
      `intents:${accountId}`,
      accountId
    );
  });

  it("should handle errors gracefully", async () => {
    const accountId = "test.near";
    const errorMessage = "RPC call failed";

    (
      intentsGraph.getIntentsBalanceHistory as jest.MockedFunction<
        typeof intentsGraph.getIntentsBalanceHistory
      >
    ).mockRejectedValue(new Error(errorMessage));

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .expect(500);

    expect(response.body).toEqual({
      error: "Internal server error",
    });
  });

  it("should accept numeric strings as valid account_id", async () => {
    // Express converts query params to strings, so 123 becomes "123"
    const mockHistoryData = {
      "1H": [
        {
          timestamp: 1694678400000,
          date: "Sep 14, 2:00 PM",
          tokens: [],
          totalTokens: 0,
        },
      ],
    };

    (
      intentsGraph.getIntentsBalanceHistory as jest.MockedFunction<
        typeof intentsGraph.getIntentsBalanceHistory
      >
    ).mockResolvedValue(mockHistoryData);

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: 123 }) // Express converts to "123"
      .expect(200);

    expect(response.body).toEqual(mockHistoryData);
    expect(intentsGraph.getIntentsBalanceHistory).toHaveBeenCalledWith(
      expect.any(Object),
      "intents:123", // account_id becomes "123"
      "123"
    );
  });

  it("should handle empty account_id", async () => {
    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: "" }) // Empty string
      .expect(400);

    expect(response.body).toEqual({
      error: "Missing required parameter: account_id",
    });
  });

  it("should validate response structure for historical data", async () => {
    const accountId = "test.near";
    const mockHistoryData = {
      "1H": [
        {
          timestamp: 1694678400000,
          date: "Sep 14, 2:00 PM",
          tokens: [
            {
              token_id: "usdc.defuse.near",
              symbol: "USDC",
              icon: "https://example.com/usdc.png",
              balance: "1000000",
              parsedBalance: "1.000000",
            },
          ],
          totalTokens: 1,
        },
      ],
    };

    (
      intentsGraph.getIntentsBalanceHistory as jest.MockedFunction<
        typeof intentsGraph.getIntentsBalanceHistory
      >
    ).mockResolvedValue(mockHistoryData);

    const response = await request(app)
      .get("/api/intents-balance-history")
      .query({ account_id: accountId })
      .expect(200);

    // Validate the structure
    expect(typeof response.body).toBe("object");
    expect(response.body["1H"]).toBeDefined();
    expect(Array.isArray(response.body["1H"])).toBe(true);

    const firstEntry = response.body["1H"][0];
    expect(firstEntry).toHaveProperty("timestamp");
    expect(firstEntry).toHaveProperty("date");
    expect(firstEntry).toHaveProperty("tokens");
    expect(firstEntry).toHaveProperty("totalTokens");

    expect(typeof firstEntry.timestamp).toBe("number");
    expect(typeof firstEntry.date).toBe("string");
    expect(Array.isArray(firstEntry.tokens)).toBe(true);
    expect(typeof firstEntry.totalTokens).toBe("number");

    // Validate token structure
    const firstToken = firstEntry.tokens[0];
    expect(firstToken).toHaveProperty("token_id");
    expect(firstToken).toHaveProperty("symbol");
    expect(firstToken).toHaveProperty("balance");
    expect(firstToken).toHaveProperty("parsedBalance");

    expect(typeof firstToken.token_id).toBe("string");
    expect(typeof firstToken.symbol).toBe("string");
    expect(typeof firstToken.balance).toBe("string");
    expect(typeof firstToken.parsedBalance).toBe("string");
  });
});
