import { describe, it, expect } from "@jest/globals";
import request from "supertest";
import express from "express";
import https from "https";
import axios from "axios";
import oneclickTreasuryRoutes from "../src/routes/oneclick-treasury";

// Prevent keep-alive connections that cause open handle warnings
axios.defaults.httpsAgent = new https.Agent({ keepAlive: false });

// Create a test app
const app = express();
app.use(express.json());
app.use("/", oneclickTreasuryRoutes);

// NOTE: This file contains INTEGRATION tests that make real API calls
// Do NOT mock axios in this file

describe("Treasury 1Click API - Integration Tests", () => {
  // Skip these tests in CI or when explicitly disabled
  const skipIntegrationTests = process.env.SKIP_INTEGRATION_TESTS === "true";
  const describeIntegration = skipIntegrationTests ? describe.skip : describe;

  describeIntegration("Real API calls to 1Click", () => {
    it("should successfully get a quote from real 1Click API without API key", async () => {
      // This test makes a real request to the 1Click API
      // It uses a small amount to minimize any potential costs
      // The API works without a key but includes a 0.1% fee

      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "test.sputnik-dao.near",
          inputToken: {
            id: "wrap.near",
            symbol: "wNEAR",
          },
          outputToken: {
            id: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", // USDC.e on NEAR
            symbol: "USDC.e",
            blockchain: "near",
          },
          amountIn: "100000000000000000000000", // 0.1 wNEAR (small amount for testing)
          slippageTolerance: "100", // 1% slippage
          networkOut: "near",
        })
        .timeout(10000); // 10 second timeout for real API call

      // Verify the response structure
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.proposalPayload).toBeDefined();
      expect(response.body.proposalPayload.tokenIn).toBe("wrap.near");
      expect(response.body.proposalPayload.tokenInSymbol).toBe("wNEAR");
      expect(response.body.proposalPayload.tokenOut).toBe(
        "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
      );

      // Verify quote details
      expect(response.body.proposalPayload.quote).toBeDefined();
      expect(response.body.proposalPayload.quote.amountIn).toBe(
        "100000000000000000000000"
      );
      expect(response.body.proposalPayload.quote.amountOut).toBeDefined();
      expect(
        Number(response.body.proposalPayload.quote.amountOut)
      ).toBeGreaterThan(0);
      expect(response.body.proposalPayload.quote.depositAddress).toBeDefined();
      expect(response.body.proposalPayload.quote.signature).toBeDefined();

      // Verify the quote includes reasonable values
      // 0.1 wNEAR should be worth roughly 0.2-0.5 USDC depending on market conditions
      const amountOutNumber = Number(
        response.body.proposalPayload.quote.amountOut
      );
      expect(amountOutNumber).toBeGreaterThan(100000); // At least 0.1 USDC (6 decimals)
      expect(amountOutNumber).toBeLessThan(1000000000); // Less than 1000 USDC (sanity check)

      // Verify the quote request details
      expect(response.body.quoteRequest).toBeDefined();
      expect(response.body.quoteRequest.dry).toBe(false);
      expect(response.body.quoteRequest.refundTo).toBe("test.sputnik-dao.near");
      expect(response.body.quoteRequest.recipient).toBe(
        "test.sputnik-dao.near"
      );

      console.log("Integration test successful - Quote received:", {
        amountIn: response.body.proposalPayload.quote.amountInFormatted,
        amountOut: response.body.proposalPayload.quote.amountOutFormatted,
        amountOutUsd: response.body.proposalPayload.quote.amountOutUsd,
      });
    }, 15000); // 15 second timeout for the entire test

    it("should handle real API errors for invalid tokens", async () => {
      const response = await request(app)
        .post("/api/treasury/oneclick-quote")
        .send({
          treasuryDaoID: "test.sputnik-dao.near",
          inputToken: {
            id: "invalid-token.near",
            symbol: "INVALID",
          },
          outputToken: {
            id: "nep141:another-invalid-token",
            symbol: "INVALID2",
            blockchain: "near",
          },
          amountIn: "1000000000000000000000000",
          slippageTolerance: "100",
          networkOut: "near",
        })
        .timeout(10000);

      // The API should return an error for invalid tokens
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(typeof response.body.error).toBe("string");
    });

    it("should return authentication error with invalid API key", async () => {
      // Save original env var
      const originalApiKey = process.env.ONECLICK_API_KEY;

      // Set an invalid API key - using a malformed JWT that will be rejected
      process.env.ONECLICK_API_KEY =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature";

      try {
        const response = await request(app)
          .post("/api/treasury/oneclick-quote")
          .send({
            treasuryDaoID: "test.sputnik-dao.near",
            inputToken: {
              id: "wrap.near",
              symbol: "wNEAR",
            },
            outputToken: {
              id: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
              symbol: "USDC.e",
              blockchain: "near",
            },
            amountIn: "100000000000000000000000",
            slippageTolerance: "100",
            networkOut: "near",
          })
          .timeout(10000);

        // The 1Click API should reject invalid JWT tokens with 401
        // Our endpoint returns 500 with authentication error message
        expect(response.status).toBe(500);
        expect(response.body.error).toContain(
          "1Click API authentication failed"
        );
      } finally {
        // Always restore original env var
        if (originalApiKey !== undefined) {
          process.env.ONECLICK_API_KEY = originalApiKey;
        } else {
          delete process.env.ONECLICK_API_KEY;
        }
      }
    });
  });
});
