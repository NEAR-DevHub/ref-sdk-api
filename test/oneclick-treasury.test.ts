import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import request from "supertest";
import express from "express";
import axios from "axios";
import oneclickTreasuryRoutes from "../src/routes/oneclick-treasury";

// Create a test app
const app = express();
app.use(express.json());
app.use("/", oneclickTreasuryRoutes);

// Mock axios
jest.mock("axios");

describe("Treasury 1Click API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/treasury/oneclick-quote", () => {
    it("should reject non-sputnik-dao addresses for treasuryDaoID", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "regular.near", // Not a sputnik-dao address
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain(
        "Only sputnik-dao.near addresses are allowed"
      );
    });

    it("should accept valid sputnik-dao addresses", async () => {
      const mockPost = jest.fn() as jest.MockedFunction<any>;
      mockPost.mockResolvedValue({
        data: {
          quote: {
            amountOut: "1000000",
            amountIn: "1000000000000000000",
            deadline: new Date(
              Date.now() + 7 * 24 * 60 * 60 * 1000
            ).toISOString(),
          },
          signature: "mock-signature",
        },
      });
      axios.post = mockPost;

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "wrap.near", symbol: "WNEAR", decimals: 24 },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.proposalPayload).toBeDefined();
      expect(response.body.proposalPayload.tokenIn).toBe("wrap.near");
      expect(response.body.proposalPayload.tokenInSymbol).toBe("WNEAR");
    });

    it("should validate required parameters", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Missing required parameters");
    });

    it("should reject non-sputnik-dao addresses in refundTo", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "hacked.near", // Trying to use a non-sputnik address
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain(
        "Only sputnik-dao.near addresses are allowed"
      );
    });

    it("should handle 1Click API errors gracefully", async () => {
      const mockPost = jest.fn() as jest.MockedFunction<any>;
      mockPost.mockRejectedValue({
        response: {
          status: 400,
          statusText: "Bad Request",
          data: {
            message: "tokenOut is not valid",
            timestamp: new Date().toISOString(),
            path: "/v0/quote",
          },
        },
        isAxiosError: true,
      });
      axios.post = mockPost;

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "invalid.near", symbol: "INVALID" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("tokenOut is not valid");
    });

    it("should handle 1Click API authentication errors", async () => {
      const mockPost = jest.fn() as jest.MockedFunction<any>;
      mockPost.mockRejectedValue({
        response: {
          status: 401,
          statusText: "Unauthorized",
          data: {
            message: "Invalid token",
            error: "Unauthorized",
            statusCode: 401,
            timestamp: new Date().toISOString(),
            path: "/v0/quote",
          },
        },
        isAxiosError: true,
      });
      axios.post = mockPost;

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain("1Click API authentication failed");
    });

    it("should set dry to false in requests to 1Click API", async () => {
      let capturedRequest: any;

      const mockPost = jest.fn() as jest.MockedFunction<any>;
      mockPost.mockImplementation((_url: any, data: any) => {
        capturedRequest = data;
        return Promise.resolve({
          data: {
            quote: {
              amountOut: "1000000",
              amountIn: "1000000000000000000",
              deadline: new Date(
                Date.now() + 7 * 24 * 60 * 60 * 1000
              ).toISOString(),
            },
            signature: "mock-signature",
          },
        });
      });
      axios.post = mockPost;

      await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "treasury.sputnik-dao.near",
          inputToken: { id: "wrap.near", symbol: "WNEAR" },
          outputToken: { id: "usdc", blockchain: "ethereum" },
          amountIn: "1000000000000000000",
          slippageTolerance: "100",
          networkOut: "Ethereum",
        });

      expect(capturedRequest).toBeDefined();
      expect(capturedRequest.dry).toBe(false);
      expect(capturedRequest.refundTo).toBe("treasury.sputnik-dao.near");
      expect(capturedRequest.recipient).toBe("treasury.sputnik-dao.near");
    });
  });
});
