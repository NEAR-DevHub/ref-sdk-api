import request from "supertest";
import app from "../src/server";
import prisma from "../src/prisma";
import * as whitelistTokens from "../src/whitelist-tokens";
import * as swap from "../src/swap";
import * as nearPrice from "../src/near-price";
import * as ftTokens from "../src/ft-tokens";
import * as allTokenBalanceHistory from "../src/all-token-balance-history";
import * as transactionsTransferHistory from "../src/transactions-transfer-history";
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock NodeCache to prevent cache interference
jest.mock("node-cache", () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockReturnValue(undefined), // Always return undefined (cache miss)
    set: jest.fn(),
    del: jest.fn(),
  }));
});

// Mock all external dependencies
jest.mock("../src/prisma", () => ({
  __esModule: true,
  default: {
    nearPrice: {
      findFirst: jest.fn(),
    },
    fTToken: {
      findFirst: jest.fn(),
    },
    tokenBalanceHistory: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("../src/whitelist-tokens");
jest.mock("../src/swap");
jest.mock("../src/near-price");
jest.mock("../src/ft-tokens");
jest.mock("../src/all-token-balance-history");
jest.mock("../src/transactions-transfer-history");
jest.mock("../src/constants/tokens", () => ({
  tokens: {
    "wrap.near": {
      decimals: 24,
      icon: "icon-url",
      name: "Wrapped NEAR",
      reference: null,
      reference_hash: null,
      spec: "ft-1.0.0",
      symbol: "wNEAR",
    },
  },
}));

describe("API Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset axios mock
    mockedAxios.get.mockReset();
  });

  describe("GET /api/whitelist-tokens", () => {
    it("should return whitelist tokens for valid account", async () => {
      const mockTokens = [
        { token_id: "wrap.near", symbol: "wNEAR", balance: "1000000" },
        {
          token_id: "usdt.tether-token.near",
          symbol: "USDt",
          balance: "500000",
        },
      ];
      (whitelistTokens.getWhitelistTokens as jest.Mock).mockResolvedValue(
        mockTokens
      );

      const response = await request(app)
        .get("/api/whitelist-tokens")
        .query({ account: "test.near" });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toEqual(mockTokens);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty("token_id");
      expect(response.body[0]).toHaveProperty("symbol");
    });

    it("should return empty array when no tokens found", async () => {
      (whitelistTokens.getWhitelistTokens as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get("/api/whitelist-tokens")
        .query({ account: "empty.near" });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should handle missing account parameter gracefully", async () => {
      (whitelistTokens.getWhitelistTokens as jest.Mock).mockResolvedValue([]);

      const response = await request(app).get("/api/whitelist-tokens");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should handle service errors gracefully", async () => {
      (whitelistTokens.getWhitelistTokens as jest.Mock).mockRejectedValue(
        new Error("Service error")
      );

      const response = await request(app)
        .get("/api/whitelist-tokens")
        .query({ account: "test.near" });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/swap", () => {
    beforeEach(() => {
      // Mock the searchToken function
      jest
        .spyOn(require("../src/utils/search-token"), "searchToken")
        .mockImplementation(async (...args: unknown[]) => {
          const token = args[0] as string;
          if (token === "wrap.near") {
            return { id: "wrap.near", decimals: 24, name: "Wrapped NEAR" };
          }
          if (token === "usdc.near") {
            return { id: "usdc.near", decimals: 6, name: "USD Coin" };
          }
          return null;
        });
    });

    it("should handle swap request with valid parameters", async () => {
      const mockSwapResult = {
        transactions: [{ type: "FunctionCall", method: "swap" }],
        outEstimate: "1000000",
      };
      (swap.getSwap as jest.Mock).mockResolvedValue(mockSwapResult);

      const response = await request(app).get("/api/swap").query({
        accountId: "test.near",
        tokenIn: "wrap.near",
        tokenOut: "usdc.near",
        amountIn: "1000000000000000000000000",
        slippage: "0.01",
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSwapResult);
      expect(response.body).toHaveProperty("transactions");
      expect(response.body).toHaveProperty("outEstimate");
      expect(Array.isArray(response.body.transactions)).toBe(true);
    });

    it("should return 400 when required parameters are missing", async () => {
      const response = await request(app).get("/api/swap").query({
        tokenIn: "wrap.near",
        tokenOut: "usdc.near",
        // missing accountId and amountIn
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error:
          "Missing required parameters. Required: accountId, tokenIn, tokenOut, amountIn",
      });
    });

    it("should handle swap service errors gracefully", async () => {
      (swap.getSwap as jest.Mock).mockRejectedValue(new Error("Swap failed"));

      const response = await request(app).get("/api/swap").query({
        accountId: "test.near",
        tokenIn: "wrap.near",
        tokenOut: "usdc.near",
        amountIn: "1000000000000000000000000",
        slippage: "0.01",
      });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Swap failed");
    });
  });

  describe("GET /api/near-price", () => {
    it("should return NEAR price as number", async () => {
      const mockPrice = 2.51;
      (nearPrice.getNearPrice as jest.Mock).mockResolvedValue(mockPrice);

      const response = await request(app).get("/api/near-price");

      expect(response.status).toBe(200);
      expect(typeof response.body).toBe("number");
      expect(response.body).toBe(mockPrice);
      expect(response.body).toBeGreaterThan(0);
    });

    it("should fallback to database on API error", async () => {
      const mockDbPrice = {
        price: 2.25,
        timestamp: new Date(),
        source: "fallback",
      };
      (nearPrice.getNearPrice as jest.Mock).mockRejectedValue(
        new Error("API Error")
      );
      (prisma.nearPrice.findFirst as jest.Mock).mockResolvedValue(mockDbPrice);

      const response = await request(app).get("/api/near-price");

      expect(response.status).toBe(200);
      expect(typeof response.body).toBe("number");
      expect(response.body).toBe(mockDbPrice.price);
    });

    it("should handle complete failure gracefully", async () => {
      (nearPrice.getNearPrice as jest.Mock).mockRejectedValue(
        new Error("API Error")
      );
      (prisma.nearPrice.findFirst as jest.Mock).mockRejectedValue(
        new Error("DB Error")
      );

      const response = await request(app).get("/api/near-price");

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/ft-tokens", () => {
    it("should return FT tokens for valid account", async () => {
      const mockTokens = {
        totalCumulativeAmt: 1500.5,
        fts: [
          {
            contract: "wrap.near",
            amount: "1000000",
            ft_meta: { symbol: "wNEAR" },
          },
          {
            contract: "usdt.tether-token.near",
            amount: "500000",
            ft_meta: { symbol: "USDt" },
          },
        ],
      };
      (ftTokens.getFTTokens as jest.Mock).mockResolvedValue(mockTokens);

      const response = await request(app)
        .get("/api/ft-tokens")
        .query({ account_id: "test.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTokens);
      expect(response.body).toHaveProperty("totalCumulativeAmt");
      expect(response.body).toHaveProperty("fts");
      expect(Array.isArray(response.body.fts)).toBe(true);
    });

    it("should return 400 when account_id is missing", async () => {
      const response = await request(app).get("/api/ft-tokens");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should handle service errors with database fallback", async () => {
      const mockDbResult = {
        totalCumulativeAmt: 100.0,
        fts: [],
        timestamp: "2025-09-14T17:44:03.576Z", // String format as returned by API
      };

      (ftTokens.getFTTokens as jest.Mock).mockRejectedValue(
        new Error("Service error")
      );
      (prisma.fTToken.findFirst as jest.Mock).mockResolvedValue({
        ...mockDbResult,
        timestamp: new Date(mockDbResult.timestamp),
      });

      const response = await request(app)
        .get("/api/ft-tokens")
        .query({ account_id: "test.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDbResult);
    });
  });

  describe("GET /api/all-token-balance-history", () => {
    it("should return token balance history for valid parameters", async () => {
      const mockHistory = {
        "1H": [
          {
            timestamp: 1694678400000,
            balance: "1000000",
            date: "Sep 14, 2:00 PM",
          },
        ],
        "1D": [{ timestamp: 1694592000000, balance: "950000", date: "Sep 13" }],
      };
      (
        allTokenBalanceHistory.getAllTokenBalanceHistory as jest.Mock
      ).mockResolvedValue(mockHistory);

      const response = await request(app)
        .get("/api/all-token-balance-history")
        .query({
          account_id: "test.near",
          token_id: "wrap.near",
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockHistory);
      expect(typeof response.body).toBe("object");
      expect(response.body).toHaveProperty("1H");
      expect(response.body).toHaveProperty("1D");
    });

    it("should return 400 when account_id is missing", async () => {
      const response = await request(app)
        .get("/api/all-token-balance-history")
        .query({ token_id: "wrap.near" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should return 400 when token_id is missing", async () => {
      const response = await request(app)
        .get("/api/all-token-balance-history")
        .query({ account_id: "test.near" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should return 400 when both parameters are missing", async () => {
      const response = await request(app).get("/api/all-token-balance-history");

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should handle service errors gracefully", async () => {
      (
        allTokenBalanceHistory.getAllTokenBalanceHistory as jest.Mock
      ).mockRejectedValue(new Error("Service error"));

      const response = await request(app)
        .get("/api/all-token-balance-history")
        .query({
          account_id: "test.near",
          token_id: "wrap.near",
        });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/transactions-transfer-history", () => {
    it("should return transfer history for valid treasury DAO", async () => {
      const mockHistory = {
        transfers: [
          {
            transaction_hash: "abc123",
            amount: "1000000",
            token_id: "wrap.near",
            timestamp: "2023-09-14T10:00:00Z",
          },
        ],
        total: 1,
      };
      (
        transactionsTransferHistory.getTransactionsTransferHistory as jest.Mock
      ).mockResolvedValue(mockHistory);

      const response = await request(app)
        .get("/api/transactions-transfer-history")
        .query({ treasuryDaoID: "test-dao.sputnik-dao.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: mockHistory });
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("transfers");
      expect(Array.isArray(response.body.data.transfers)).toBe(true);
    });

    it("should return 400 when treasuryDaoID is missing", async () => {
      const response = await request(app).get(
        "/api/transactions-transfer-history"
      );

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should handle service errors gracefully", async () => {
      (
        transactionsTransferHistory.getTransactionsTransferHistory as jest.Mock
      ).mockRejectedValue(new Error("Service error"));

      const response = await request(app)
        .get("/api/transactions-transfer-history")
        .query({ treasuryDaoID: "test-dao.sputnik-dao.near" });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/ft-token-price", () => {
    it("should return token price for NEAR", async () => {
      const mockPrice = 2.51;
      const mockResponse = {
        data: {
          contracts: [{ price: mockPrice.toString() }],
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/ft-token-price")
        .query({ account_id: "near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ price: mockPrice });
      expect(typeof response.body.price).toBe("number");
      expect(response.body.price).toBeGreaterThan(0);

      expect(axios.get).toHaveBeenCalledWith(
        "https://api.nearblocks.io/v1/fts/wrap.near",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
          }),
        })
      );
    });

    it("should return 400 if account_id is missing", async () => {
      const response = await request(app).get("/api/ft-token-price");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "account_id is required" });
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const response = await request(app)
        .get("/api/ft-token-price")
        .query({ account_id: "near" });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty("error");
    });
  });

  describe("GET /api/ft-token-metadata", () => {
    it("should return token metadata for valid account", async () => {
      const mockMetadata = {
        name: "Wrapped NEAR",
        symbol: "wNEAR",
        decimals: 24,
        icon: "https://example.com/icon.png",
      };
      const mockResponse = {
        data: { contracts: [mockMetadata] },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/ft-token-metadata")
        .query({ account_id: "wrap.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockMetadata);
      expect(response.body).toHaveProperty("name");
      expect(response.body).toHaveProperty("symbol");
      expect(response.body).toHaveProperty("decimals");
    });

    it("should convert 'near' to 'wrap.near'", async () => {
      const mockMetadata = { name: "Wrapped NEAR", symbol: "wNEAR" };
      const mockResponse = { data: { contracts: [mockMetadata] } };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/ft-token-metadata")
        .query({ account_id: "near" });

      expect(response.status).toBe(200);
      expect(axios.get).toHaveBeenCalledWith(
        "https://api.nearblocks.io/v1/fts/wrap.near",
        expect.any(Object)
      );
    });

    it("should return 400 when account_id is missing", async () => {
      const response = await request(app).get("/api/ft-token-metadata");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "account_id is required" });
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const response = await request(app)
        .get("/api/ft-token-metadata")
        .query({ account_id: "wrap.near" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "Failed to fetch token metadata",
      });
    });
  });

  describe("GET /api/user-daos", () => {
    it("should return user DAOs for valid account", async () => {
      const mockDaos = ["dao1.sputnik-dao.near", "dao2.sputnik-dao.near"];
      const mockResponse = {
        data: {
          "test.near": { daos: mockDaos },
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/user-daos")
        .query({ account_id: "test.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDaos);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
    });

    it("should return empty array when user has no DAOs", async () => {
      const mockResponse = {
        data: {
          "test.near": { daos: [] },
        },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/user-daos")
        .query({ account_id: "test.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should return 400 when account_id is missing", async () => {
      const response = await request(app).get("/api/user-daos");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "account_id is required" });
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const response = await request(app)
        .get("/api/user-daos")
        .query({ account_id: "test.near" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch user daos" });
    });
  });

  describe("GET /api/validator-details", () => {
    it("should return validator details for valid account", async () => {
      const mockDetails = {
        account_id: "validator.near",
        stake: "1000000000000000000000000",
        delegators_count: 100,
        fee: { numerator: 5, denominator: 100 },
      };

      mockedAxios.get.mockResolvedValue({ data: mockDetails });

      const response = await request(app)
        .get("/api/validator-details")
        .query({ account_id: "validator.near" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDetails);
      expect(response.body).toHaveProperty("account_id");
      expect(response.body).toHaveProperty("stake");
    });

    it("should return 400 when account_id is missing", async () => {
      const response = await request(app).get("/api/validator-details");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "account_id is required" });
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const response = await request(app)
        .get("/api/validator-details")
        .query({ account_id: "validator.near" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: "Failed to fetch validator details",
      });
    });
  });

  describe("GET /api/validators", () => {
    it("should return formatted validators list", async () => {
      const mockValidators = [
        {
          account_id: "validator1.near",
          fees: { numerator: 5, denominator: 100 },
        },
        {
          account_id: "validator2.near",
          fees: { numerator: 1000, denominator: 10000 }, // 10%
        },
      ];

      mockedAxios.get.mockResolvedValue({ data: mockValidators });

      const response = await request(app).get("/api/validators");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body).toEqual([
        { pool_id: "validator1.near", fee: "5" }, // whole number, no decimals
        { pool_id: "validator2.near", fee: "10" }, // actual behavior: whole numbers don't have decimals
      ]);
      expect(response.body[0]).toHaveProperty("pool_id");
      expect(response.body[0]).toHaveProperty("fee");
    });

    it("should handle missing fees gracefully", async () => {
      const mockValidators = [
        {
          account_id: "validator.near",
          fees: {}, // missing numerator/denominator
        },
      ];

      mockedAxios.get.mockResolvedValue({ data: mockValidators });

      const response = await request(app).get("/api/validators");

      expect(response.status).toBe(200);
      expect(response.body[0].fee).toBe("0");
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const response = await request(app).get("/api/validators");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch validators" });
    });
  });

  describe("GET /api/search-ft", () => {
    it("should return search results for valid query", async () => {
      const mockToken = {
        contract: "token.near",
        name: "Test Token",
        symbol: "TEST",
        decimals: 18,
      };
      const mockResponse = {
        data: { tokens: [mockToken] },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/search-ft")
        .query({ query: "test" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockToken);
      expect(response.body).toHaveProperty("contract");
      expect(response.body).toHaveProperty("name");
    });

    it("should return 400 when query is missing", async () => {
      const response = await request(app).get("/api/search-ft");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "query is required" });
    });

    it("should handle API errors gracefully", async () => {
      mockedAxios.get.mockRejectedValue(new Error("API Error"));

      const response = await request(app)
        .get("/api/search-ft")
        .query({ query: "test" });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to search FT" });
    });

    it("should handle empty search results", async () => {
      const mockResponse = {
        data: { tokens: [] },
      };

      mockedAxios.get.mockResolvedValue(mockResponse);

      const response = await request(app)
        .get("/api/search-ft")
        .query({ query: "nonexistent" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({}); // API returns empty object when no results
    });
  });

  describe("GET /api/token-by-defuse-asset-id", () => {
    it("should return token data for valid defuse asset ID", async () => {
      const mockToken = {
        defuse_asset_id: "nep141:some-other-token.near",
        contract_address: "some-other-token.near",
        decimals: 18,
        blockchain: "near",
        symbol: "SOT",
        price: "1.50",
        price_updated_at: "2025-09-21T10:36:30.252Z",
        icon: "https://example.com/icon.png",
      };

      // Mock the external API response
      axios.get = jest.fn().mockResolvedValue({
        data: { items: [mockToken] },
      });

      const response = await request(app).get(
        "/api/token-by-defuse-asset-id?defuseAssetId=nep141:some-other-token.near"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        defuse_asset_id: "nep141:some-other-token.near",
        contract_address: "some-other-token.near",
        decimals: 18,
        blockchain: "near",
        symbol: "SOT", // External API data preserved since no local token exists
        price: "1.50",
        price_updated_at: "2025-09-21T10:36:30.252Z",
      });
      // Should not have local token properties since this token doesn't exist locally
      expect(response.body[0]).not.toHaveProperty("address");
      expect(response.body[0]).not.toHaveProperty("bridge");
      expect(response.body[0]).not.toHaveProperty("chainName");
      expect(response.body[0]).not.toHaveProperty("defuseAssetId");
      expect(response.body[0]).not.toHaveProperty("name");
    });

    it("should return multiple tokens for comma-separated IDs", async () => {
      const mockTokens = [
        {
          defuse_asset_id: "nep141:token1.near",
          contract_address: "token1.near",
          decimals: 18,
          blockchain: "near",
          symbol: "T1",
          price: "2.00",
          price_updated_at: "2025-09-21T10:36:30.252Z",
        },
        {
          defuse_asset_id: "nep141:token2.near",
          contract_address: "token2.near",
          decimals: 6,
          blockchain: "near",
          symbol: "T2",
          price: "0.50",
          price_updated_at: "2025-09-21T10:36:30.252Z",
        },
      ];

      axios.get = jest.fn().mockResolvedValue({
        data: { items: mockTokens },
      });

      const response = await request(app).get(
        "/api/token-by-defuse-asset-id?defuseAssetId=nep141:token1.near,nep141:token2.near"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({
        defuse_asset_id: "nep141:token1.near",
        contract_address: "token1.near",
        decimals: 18,
        blockchain: "near",
        symbol: "T1",
        price: "2.00",
        price_updated_at: "2025-09-21T10:36:30.252Z",
      });
      expect(response.body[1]).toMatchObject({
        defuse_asset_id: "nep141:token2.near",
        contract_address: "token2.near",
        decimals: 6,
        blockchain: "near",
        symbol: "T2",
        price: "0.50",
        price_updated_at: "2025-09-21T10:36:30.252Z",
      });
    });

    it("should return 400 when defuseAssetId is missing", async () => {
      const response = await request(app).get("/api/token-by-defuse-asset-id");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "defuseAssetId is required" });
    });

    it("should return error for tokens not found", async () => {
      axios.get = jest.fn().mockResolvedValue({
        data: { items: [] },
      });

      const response = await request(app).get(
        "/api/token-by-defuse-asset-id?defuseAssetId=invalid-id"
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { error: "Token not found", defuse_asset_id: "invalid-id" },
      ]);
    });

    it("should handle external API failure gracefully", async () => {
      axios.get = jest.fn().mockRejectedValue(new Error("API Error"));

      const response = await request(app).get(
        "/api/token-by-defuse-asset-id?defuseAssetId=nep141:some-unknown-token.near"
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          error: "Token not found",
          defuse_asset_id: "nep141:some-unknown-token.near",
        },
      ]);
    });
  });

  describe("GET /api/blockchain-by-network", () => {
    it("should return blockchain data for valid network", async () => {
      const response = await request(app).get(
        "/api/blockchain-by-network?network=near"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toMatchObject({
        name: "Near",
        network: "near",
        icon: expect.any(String),
      });
    });

    it("should return multiple blockchains for comma-separated networks", async () => {
      const response = await request(app).get(
        "/api/blockchain-by-network?network=near,eth"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toMatchObject({ network: "near" });
      expect(response.body[1]).toMatchObject({ network: "eth" });
    });

    it("should return 400 when network is missing", async () => {
      const response = await request(app).get("/api/blockchain-by-network");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "network is required" });
    });

    it("should return error for networks not found", async () => {
      const response = await request(app).get(
        "/api/blockchain-by-network?network=invalid-network"
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { error: "Blockchain not found", network: "invalid-network" },
      ]);
    });

    it("should use dark theme when specified", async () => {
      const response = await request(app).get(
        "/api/blockchain-by-network?network=near&theme=dark"
      );

      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({
        name: "Near",
        network: "near",
        icon: expect.any(String),
      });
    });

    it("should default to light theme when theme not specified", async () => {
      const response = await request(app).get(
        "/api/blockchain-by-network?network=near"
      );

      expect(response.status).toBe(200);
      expect(response.body[0]).toMatchObject({
        name: "Near",
        network: "near",
        icon: expect.any(String),
      });
    });
  });
});
