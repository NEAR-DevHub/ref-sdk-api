# NEAR Treasury & Token API

A comprehensive RESTful API service for NEAR blockchain interactions, treasury management, token operations, and validator information. Built with Express.js and TypeScript, featuring robust caching, rate limiting, and secure request handling.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
  - [Token Operations](#token-operations)
  - [Balance & History](#balance--history)
  - [Treasury Management](#treasury-management)
  - [Validator Information](#validator-information)
  - [Search & Discovery](#search--discovery)
  - [OneClick Treasury](#oneclick-treasury)
- [Caching & Rate Limiting](#caching--rate-limiting)
- [Testing](#testing)
- [License](#license)

---

## Features

- **Token Operations:** Swap tokens, fetch metadata, prices, and balances
- **Balance History:** Historical token balance tracking with multiple time periods
- **Treasury Management:** DAO treasury analytics, reports, and transaction history
- **Validator Information:** Current validators list and detailed validator data
- **Search & Discovery:** Search for tokens and discover user DAOs
- **OneClick Treasury:** Simplified treasury proposal creation for cross-chain operations
- **Intents Balance History:** Track token balances held through intents contracts
- **Security & Performance:** Rate limiting, CORS, caching, and secure HTTP headers
- **Database Integration:** PostgreSQL with Prisma ORM for data persistence

---

## Requirements

- [Node.js](https://nodejs.org/en/) (v16+ recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- PostgreSQL database instance
- API keys for external services (NEARBLOCKS, FASTNEAR, PIKESPEAK)

---

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ref-sdk-api.git
   cd ref-sdk-api
   ```

2. **Install dependencies:**
   ```bash
   yarn install
   ```

3. **Setup environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

---

## Environment Variables

```env
HOSTNAME=127.0.0.1
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/ref_sdk_api?schema=public"
NEARBLOCKS_API_KEY=your_nearblocks_api_key
FASTNEAR_API_KEY=your_fastnear_api_key
PIKESPEAK_KEY=your_pikespeak_api_key
```

---

## Running the Server

```bash
# Development
yarn dev

# Production
yarn build
yarn start
```

Server runs on `http://127.0.0.1:3000` by default.

---

## API Endpoints

### Token Operations

#### Get Whitelist Tokens
- **Endpoint:** `GET /api/whitelist-tokens`
- **Description:** Returns whitelisted tokens with balances and prices for a specific account
- **Query Parameters:**
  - `account` (string, optional): NEAR account ID to fetch token balances for
- **Response:** Array of token objects with balance and price information
- **Example:**
  ```http
  GET /api/whitelist-tokens?account=example.near
  ```

#### Token Swap
- **Endpoint:** `GET /api/swap`
- **Description:** Generate swap transactions for token exchanges
- **Query Parameters:**
  - `accountId` (string, required): Account executing the swap
  - `tokenIn` (string, required): Input token contract ID
  - `tokenOut` (string, required): Output token contract ID  
  - `amountIn` (string, required): Amount of input token (in smallest units)
  - `slippage` (string, optional): Slippage tolerance (default: "0.01" for 1%)
- **Response:** Swap transaction details and estimated output
- **Example:**
  ```http
  GET /api/swap?accountId=example.near&tokenIn=wrap.near&tokenOut=usdt.tether-token.near&amountIn=1000000000000000000000000&slippage=0.01
  ```

#### Get NEAR Price
- **Endpoint:** `GET /api/near-price`
- **Description:** Current NEAR token price in USD with database fallback
- **Response:** Number (price in USD)
- **Example:**
  ```http
  GET /api/near-price
  ```

#### Get FT Token Price
- **Endpoint:** `GET /api/ft-token-price`
- **Description:** Get price for a specific fungible token
- **Query Parameters:**
  - `account_id` (string, required): Token contract ID (use "near" for NEAR token)
- **Response:** Object with price information
- **Example:**
  ```http
  GET /api/ft-token-price?account_id=wrap.near
  ```

#### Get FT Token Metadata
- **Endpoint:** `GET /api/ft-token-metadata`
- **Description:** Fetch metadata for a fungible token
- **Query Parameters:**
  - `account_id` (string, required): Token contract ID (use "near" for NEAR token)
- **Response:** Token metadata object (name, symbol, decimals, icon, etc.)
- **Example:**
  ```http
  GET /api/ft-token-metadata?account_id=wrap.near
  ```

#### Get FT Tokens
- **Endpoint:** `GET /api/ft-tokens`
- **Description:** Get all fungible tokens held by an account with metadata and USD values
- **Query Parameters:**
  - `account_id` (string, required): NEAR account ID
- **Response:** Object with total USD value and array of tokens with metadata
- **Example:**
  ```http
  GET /api/ft-tokens?account_id=example.near
  ```

### Balance & History

#### Get Token Balance History
- **Endpoint:** `GET /api/all-token-balance-history`
- **Description:** Historical balance data for a specific token across multiple time periods
- **Query Parameters:**
  - `account_id` (string, required): NEAR account ID
  - `token_id` (string, required): Token contract ID
- **Response:** Object mapping time periods to balance history arrays
- **Example:**
  ```http
  GET /api/all-token-balance-history?account_id=example.near&token_id=wrap.near
  ```

#### Get Intents Balance History
- **Endpoint:** `GET /api/intents-balance-history`
- **Description:** Historical balance data for tokens held through intents contracts
- **Query Parameters:**
  - `account_id` (string, required): NEAR account ID
- **Response:** Object mapping time periods to intents token balance history
- **Example:**
  ```http
  GET /api/intents-balance-history?account_id=example.near
  ```

### Treasury Management

#### Get Transactions Transfer History
- **Endpoint:** `GET /api/transactions-transfer-history`
- **Description:** Transfer transaction history for a treasury DAO
- **Query Parameters:**
  - `treasuryDaoID` (string, required): Treasury DAO contract ID
- **Response:** Object containing transfer history data
- **Example:**
  ```http
  GET /api/transactions-transfer-history?treasuryDaoID=example.sputnik-dao.near
  ```

#### Store Treasuries
- **Endpoint:** `GET /db/store-treasuries`
- **Description:** Fetch and store treasury data from factory contract
- **Response:** Success message with operation results

#### Insert Treasury
- **Endpoint:** `POST /db/insert-treasury`
- **Description:** Manually insert treasury data
- **Body:** Treasury object or array of treasury objects
- **Response:** Operation results for each treasury

#### Treasuries Report
- **Endpoint:** `GET /db/treasuries-report`
- **Description:** Generate comprehensive treasury analytics report
- **Response:** Treasury metrics and Google Sheets update status

#### Treasuries Transactions Report
- **Endpoint:** `GET /db/treasuries-transactions-report`
- **Description:** Generate treasury transaction analytics report
- **Response:** Transaction metrics and Google Sheets update status

### Validator Information

#### Get Validators
- **Endpoint:** `GET /api/validators`
- **Description:** List of current NEAR validators with formatted fee information
- **Response:** Array of validator objects with pool_id and fee percentage
- **Example:**
  ```http
  GET /api/validators
  ```

#### Get Validator Details
- **Endpoint:** `GET /api/validator-details`
- **Description:** Detailed information for a specific validator
- **Query Parameters:**
  - `account_id` (string, required): Validator account ID
- **Response:** Detailed validator information object
- **Example:**
  ```http
  GET /api/validator-details?account_id=validator.near
  ```

### Search & Discovery

#### Search FT Tokens
- **Endpoint:** `GET /api/search-ft`
- **Description:** Search for fungible tokens by name or symbol
- **Query Parameters:**
  - `query` (string, required): Search term
- **Response:** First matching token object
- **Example:**
  ```http
  GET /api/search-ft?query=near
  ```

#### Get User DAOs
- **Endpoint:** `GET /api/user-daos`
- **Description:** List of DAOs that a user is a member of
- **Query Parameters:**
  - `account_id` (string, required): NEAR account ID
- **Response:** Array of DAO contract IDs
- **Example:**
  ```http
  GET /api/user-daos?account_id=example.near
  ```

### OneClick Treasury

#### OneClick Quote
- **Endpoint:** `POST /api/treasury/oneclick-quote`
- **Description:** Generate treasury proposal for cross-chain token operations
- **Body Parameters:**
  - `treasuryDaoID` (string, required): Treasury DAO contract ID (must end with .sputnik-dao.near)
  - `inputToken` (object, required): Input token details
  - `outputToken` (object, required): Output token details  
  - `amountIn` (string, required): Input amount
  - `slippageTolerance` (string, required): Slippage tolerance
  - `networkOut` (string, optional): Output network
- **Response:** Formatted proposal payload for DAO submission
- **Example:**
  ```http
  POST /api/treasury/oneclick-quote
  Content-Type: application/json
  
  {
    "treasuryDaoID": "example.sputnik-dao.near",
    "inputToken": {"id": "wrap.near", "symbol": "WNEAR"},
    "outputToken": {"id": "usdc", "blockchain": "ethereum"},
    "amountIn": "1000000000000000000000000",
    "slippageTolerance": "100"
  }
  ```

---

## Caching & Rate Limiting

### Caching
- **NodeCache:** 2-minute TTL for most endpoints
- **Specialized caching:** Longer TTL for validator data (7 days) and search results (1 day)
- **RPC caching:** Request-based caching with error handling for rate limits

### Rate Limiting
- **Limit:** 180 requests per 30 seconds per IP
- **Scope:** All `/api/*` endpoints
- **Headers:** Standard rate limit headers included in responses

---

## Testing

```bash
# Run all tests
yarn test

# Run specific test suites
yarn test test/server.test.ts                    # Unit tests (mocked)
yarn test test/server.integration.test.ts       # Integration tests (local)
yarn test test/intents-graph.test.ts           # Intents unit tests
yarn test test/intents-graph.integration.test.ts # Intents integration tests
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

_For questions or contributions, please open an issue or submit a PR on GitHub._
