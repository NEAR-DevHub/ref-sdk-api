# 1Click Treasury API Integration

## Overview

This document describes the custom backend endpoint for the Treasury Dashboard's 1Click API integration. The endpoint ensures secure quote generation for treasury DAOs while preventing abuse.

## Architecture

### Frontend Flow
1. **Dry Quotes (Preview)**: Auto-fetched directly from 1Click API with `dry: true` when form fields change
2. **Actual Quotes (Proposal Creation)**: Fetched from our custom backend endpoint when creating proposals

### Backend Endpoint

**Endpoint**: `POST /api/treasury/oneclick-quote`

**Purpose**: 
- Generate actual quotes for treasury DAO proposals
- Validate that only sputnik-dao.near addresses can be used
- Prevent abuse by restricting refund and recipient addresses

## Request Format

```json
{
  "treasuryDaoID": "treasury.sputnik-dao.near",
  "inputToken": {
    "id": "wrap.near",
    "symbol": "WNEAR",
    "decimals": 24
  },
  "outputToken": {
    "id": "usdc",
    "blockchain": "ethereum"
  },
  "amountIn": "1000000000000000000",
  "slippageTolerance": "100",
  "networkOut": "Ethereum"
}
```

## Response Format

### Success Response
```json
{
  "success": true,
  "proposalPayload": {
    "tokenIn": "wrap.near",
    "tokenInSymbol": "WNEAR",
    "tokenOut": "usdc",
    "networkOut": "Ethereum",
    "amountIn": "1000000000000000000",
    "quote": {
      "amountOut": "1000000",
      "deadline": "2024-01-01T00:00:00.000Z",
      "signature": "..."
    }
  },
  "quoteRequest": {
    "dry": false,
    "treasuryDaoID": "treasury.sputnik-dao.near"
  }
}
```

### Error Responses

#### Invalid Treasury DAO
```json
{
  "error": "Invalid treasury DAO ID. Only sputnik-dao.near addresses are allowed."
}
```

#### Missing Parameters
```json
{
  "error": "Missing required parameters: treasuryDaoID, inputToken, outputToken, amountIn, slippageTolerance"
}
```

#### 1Click API Error
```json
{
  "error": "Error message from 1Click API"
}
```

## Security Features

1. **Address Validation**: Only sputnik-dao.near addresses are allowed for:
   - `treasuryDaoID`
   - `refundTo` (set automatically)
   - `recipient` (set automatically)

2. **API Key Protection**: The backend uses the 1Click API key, preventing direct access

3. **Rate Limiting**: Inherits rate limiting from the main server configuration

## Environment Variables

```bash
# Required for production
ONECLICK_API_KEY=your-api-key-here

# Optional (defaults to production URL)
ONECLICK_API_URL=https://1click.chaindefuser.com/v0
```

## Testing

### Unit Tests
Run the test suite:
```bash
npm test oneclick-treasury.test.ts
```

### Manual Testing
1. Ensure the backend is running with proper environment variables
2. Test with a valid sputnik-dao address
3. Verify that non-sputnik addresses are rejected
4. Check that quotes are properly formatted

## Frontend Integration

The frontend component (`OneClickExchangeForm.jsx`) implements:
1. Auto-fetching of dry quotes when form fields change (500ms debounce)
2. Direct calls to 1Click API for dry quotes (preview only)
3. Calls to our backend endpoint when creating actual proposals

## Deployment Considerations

1. **API Key**: Must be configured in production environment
2. **CORS**: Ensure proper CORS settings for frontend domains
3. **Monitoring**: Log failed validations for security monitoring
4. **Rate Limiting**: Consider separate rate limits for this endpoint

## Future Improvements

1. Add caching for frequently requested quotes
2. Implement webhook notifications for quote status
3. Add metrics tracking for quote requests
4. Consider adding a whitelist of allowed treasury DAOs