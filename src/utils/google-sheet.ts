import Big from "big.js";
import { google } from "googleapis";
import * as path from "path";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const CREDS_PATH = path.join(__dirname, "./near-treasury-metrics.json");
const spreadsheetId = "1XtAWMXAeMUEo74ZtSclq1krERQPmyNztmHj3j9obsY4";
const writeSpreadsheet = "17sw-bWxV-OpYTvvYN0dHrA3YnFrGFHKkZE1bm_alS7A";

async function authenticateGoogleSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDS_PATH,
    scopes: SCOPES,
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client as any });
}

function generateSumFormulasFromLetters(
  reportLength: number,
  columns: string[]
) {
  return columns.map((col) =>
    col ? `=SUM(${col}2:${col}${reportLength})` : ""
  );
}

async function clearSheet(sheets: any, spreadsheetId: string, sheetId: number) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateCells: {
            range: {
              sheetId,
            },
            rows: [], // This removes all rows
            fields: "*",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
            },
            cell: {
              userEnteredValue: null,
              userEnteredFormat: {},
            },
            fields: "userEnteredValue,userEnteredFormat",
          },
        },
      ],
    },
  });
}

function formatHeader(sheetId: number) {
  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true, italic: true },
            horizontalAlignment: "LEFT",
            verticalAlignment: "MIDDLE",
          },
        },
        fields:
          "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields:
          "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    },
  ];
}

function formatTotalRow(sheetId: number, rowIndex: number) {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1 },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true },
          horizontalAlignment: "RIGHT",
          verticalAlignment: "MIDDLE",
        },
      },
      fields:
        "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
    },
  };
}

async function updateSheet(
  sheets: any,
  spreadsheetId: string,
  values: any[][],
  requests: any[],
  sheetTitle: string
) {
  // Write values to the specific sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetTitle}'!A1:Z`, // Specify the sheet by title
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });

  // Apply formatting
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });
}

function formatColumnNumber(
  sheetId: number,
  rowStart: number,
  rowEnd: number,
  col: number,
  type: string
): any {
  return {
    repeatCell: {
      range: {
        sheetId,
        startRowIndex: rowStart,
        endRowIndex: rowEnd,
        startColumnIndex: col,
        endColumnIndex: col + 1,
      },
      cell: {
        userEnteredFormat: {
          numberFormat:
            type === "CURRENCY"
              ? { type: "CURRENCY", pattern: "$#,##0.00" } // US currency
              : { type: "NUMBER", pattern: "#,##0" }, // Standard number
        },
      },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

async function getOrCreateSheetByTitle(
  sheets: any,
  spreadsheetId: string,
  title: string
): Promise<number> {
  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = data.sheets?.find(
    (s: any) => s.properties?.title === title
  );

  if (existingSheet) return existingSheet.properties.sheetId;

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });

  return response.data.replies?.[0].addSheet?.properties?.sheetId;
}

export async function updateReportSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();

  const reportLength = reportData.length + 2; // Add 2 because of timestamp and header row

  // Format timestamp
  const now = new Date();
  const timestamp = `Report generated on: ${now.toLocaleString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC", // Set to UTC time zone
  })} UTC`;

  // Generate sheet title like "May 2025"
  const sheetTitle =
    now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }) + " Metrics Report";

  // Add timestamp row, headers, and data
  const values = [
    [timestamp],
    [
      "Created At",
      "Created By",
      "Treasury URL",
      "Lockup Account",
      "DAO Users",
      "NEAR",
      "USDC",
      "USDt",
      "FT Tokens",
      "FT Tokens (USD)",
      "Intents Tokens",
      "Intents Value (USD)",
      "FT Lockups",
      "FT Lockups (USD)",
      "DAO Assets (USD)",
      "NEAR Lockup (USD)",
      "Total Assets (USD)",
    ],
    ...reportData.map((row) => [
      row.createdAt,
      row.createdBy,
      row.treasuryUrl,
      row.lockupContract,
      row.numberOfUsers,
      row.nearAmount,
      row.usdcAmount,
      row.usdtAmount,
      row.ftTokens,
      row.ftTokensUSD,
      row.intentsTokens,
      row.intentsTotalUSD,
      row.ftLockups,
      row.ftLockupsUSD,
      row.daoAssetsValueUSD,
      row.lockupValueUSD,
      row.totalAssetsValueUSD,
    ]),
    [
      "TOTAL",
      "", // Created By
      `${reportData.length} treasuries`, // Treasury URL
      "", // Lockup Account
      ...generateSumFormulasFromLetters(reportLength, [
        "E", // DAO Users
        "F", // NEAR
        "G", // USDC
        "H", // USDt
        "", // I -> FT Tokens (text) skip
        "J", // FT Tokens (USD)
        "", // K -> Intents Tokens (text) skip
        "L", // Intents Value (USD)
        "", // M -> FT Lockups (text) skip
        "N", // FT Lockups (USD)
        "O", // DAO Assets (USD)
        "P", // NEAR Lockup (USD)
        "Q", // Total Assets (USD)
      ]),
    ],
  ];

  // Create or get the monthly sheet
  const sheetId = await getOrCreateSheetByTitle(
    sheets,
    spreadsheetId,
    sheetTitle
  );

  const requests = [
    ...formatHeader(sheetId),
    formatTotalRow(sheetId, reportLength),

    // Format number columns: DAO Users, NEAR, USDC, USDt
    ...["E", "F", "G", "H"].map((col) =>
      formatColumnNumber(
        sheetId,
        2,
        reportLength,
        col.charCodeAt(0) - 65,
        "NUMBER"
      )
    ),

    // Format currency columns: FT Tokens (USD), Intents Value (USD), FT Lockups (USD), DAO Assets, NEAR Lockup, Total Assets
    ...["J", "L", "N", "O", "P", "Q"].map((col) =>
      formatColumnNumber(
        sheetId,
        2,
        reportLength,
        col.charCodeAt(0) - 65,
        "CURRENCY"
      )
    ),
  ];

  await updateSheet(sheets, spreadsheetId, values, requests, sheetTitle);
}

export async function updateTransactionsReportSheet(reportData: any[]) {
  const sheets = await authenticateGoogleSheets();

  // Timestamp (UTC)
  const now = new Date();
  const timestamp = `Report generated on: ${now.toLocaleString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  })} UTC`;

  // Sheet title like "May 2025 Txn Report"
  const sheetTitle =
    now.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    }) + " Txn Report";

  // Create or get sheet
  const sheetId = await getOrCreateSheetByTitle(
    sheets,
    spreadsheetId,
    sheetTitle
  );

  const reportLength = reportData.length + 3; // +1 timestamp, +1 category header, +1 column header

  // Data values
  const values = [
    [timestamp], // Row 0
    [
      "", // Column A
      "Payment Metrics",
      "",
      "",
      "Exchange Metrics",
      "",
      "",
      "Stake Metrics",
      "",
      "",
      "Lockup Metrics",
      "",
      "",
    ], // Row 1: Category headers
    [
      "Treasury URL",
      "Payment Proposals",
      "Tokens Paid",
      "Tokens Paid Value (USD)",
      "Asset Exchange Proposals",
      "Tokens Exchanged",
      "Asset Exchange Value (USD)",
      "Stake Delegation Proposals",
      "Amount (NEAR)",
      "Value (USD)",
      "Lockup Proposals",
      "Lockup Amount (NEAR)",
      "Lockup Value (USD)",
      "Total Transactions Value (USD)",
    ],
    ...reportData.map((row) => [
      row.treasuryUrl,
      row.paymentProposals,
      row.paymentTokens,
      row.totalPaymentValue,
      row.exchangeProposals,
      row.exchangeTokens,
      row.totalExchangeValue,
      row.stakeProposals,
      row.totalStaked,
      row.totalStakedUSD,
      row.lockupProposals,
      row.totalLockupNear,
      row.totalLockedValueUSD,
      Big(row.totalPaymentValue || 0)
        .plus(row.totalExchangeValue || 0)
        .plus(row.totalStakedUSD || 0)
        .plus(row.totalLockedValueUSD || 0)
        .toFixed(),
    ]),
    [
      "TOTAL",
      ...generateSumFormulasFromLetters(reportLength, [
        "B",
        "",
        "D",
        "E",
        "",
        "G",
        "H",
        "I",
        "J",
        "K",
        "L",
        "M",
        "N",
      ]),
    ],
  ];

  // Prepare formatting requests
  const requests: any[] = [
    ...formatHeader(sheetId),
    formatTotalRow(sheetId, reportLength),

    // Merge group headers (row 1)
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 1,
          endColumnIndex: 4,
        },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 4,
          endColumnIndex: 7,
        },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 7,
          endColumnIndex: 10,
        },
        mergeType: "MERGE_ALL",
      },
    },
    {
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 10,
          endColumnIndex: 13,
        },
        mergeType: "MERGE_ALL",
      },
    },

    // Format category header row
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: "CENTER",
            backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          },
        },
        fields:
          "userEnteredFormat(textFormat,horizontalAlignment,backgroundColor)",
      },
    },

    // Format all metrics columns: number or currency
    ...[
      { col: 2, type: "NUMBER" },
      { col: 5, type: "NUMBER" },
      { col: 8, type: "NUMBER" },
      { col: 9, type: "NUMBER" },
      { col: 11, type: "NUMBER" },
      { col: 12, type: "NUMBER" },
      { col: 4, type: "CURRENCY" },
      { col: 7, type: "CURRENCY" },
      { col: 10, type: "CURRENCY" },
      { col: 13, type: "CURRENCY" },
      { col: 14, type: "CURRENCY" },
    ].map(({ col, type }) =>
      formatColumnNumber(sheetId, 3, reportLength, col - 1, type)
    ),

    // Auto-resize columns
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: 14,
        },
      },
    },
  ];

  try {
    await clearSheet(sheets, spreadsheetId, sheetId);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });

    console.log(`✅ Sheet "${sheetTitle}" updated successfully!`);
  } catch (error) {
    console.error(`❌ Failed to update "${sheetTitle}" sheet:`, error);
  }
}

async function readSheetData(
  sheets: any,
  spreadsheetId: string,
  sheetTitle: string,
  sheetType: string
) {
  // Fix: Read more columns to include "Total Assets (USD)"
  const range = `'${sheetTitle}'!A:Q`; // Changed from A:O to A:Q
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  const rows = response.data.values || [];
  return parseSheetData(rows, sheetType);
}

// --- Utility Functions ---
function parseFtLockups(ftString: string) {
  if (!ftString || ftString.trim() === "-" || ftString.trim() === "") return [];

  const cleanStr = ftString.replace(/^"+|"+$/g, "");
  const lines = cleanStr
    .split(/\r?\n|(?=Token:)/g)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const parts = line.split("|").map((p) => p.trim());
    const symbol = parts[0]?.split(":")[1]?.trim() || "";
    const usdValue = parts[2]
      ? Number(parts[2].replace("USD Value: $", "").trim())
      : 0;
    return { symbol, usdValue };
  });
}

function cleanNumber(value: any) {
  if (value === null || value === undefined) return "0";
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  return cleaned === "" ? "0" : cleaned;
}

const toBig = (v: any) => Big(cleanNumber(v));
const toInt = (v: any) => parseInt(cleanNumber(v), 10) || 0;

function parseSheetData(rows: any[], sheetType: string) {
  if (!rows || rows.length === 0) return [];

  const headerRowIndex = rows.findIndex((row: any) => {
    const filledCells = row.filter(
      (cell: any) => cell && cell.trim() !== ""
    ).length;
    return (
      filledCells > 1 &&
      row.some((cell: any) =>
        [
          "Created At",
          "Treasury URL",
          "Lockup Account",
          "Payment Proposals",
        ].includes(cell)
      )
    );
  });
  if (headerRowIndex === -1) return [];

  const headers = rows[headerRowIndex];
  const dataStartIndex = headerRowIndex + 1;

  const dataRows = rows
    .slice(dataStartIndex)
    .filter((row: any) => row[0] && row[0].toUpperCase() !== "TOTAL");

  const numericFields =
    sheetType === "holdings"
      ? [
          "DAO Assets (USD)",
          "Lockup Assets (USD)",
          "NEAR Lockup (USD)",
          "Total Assets (USD)",
        ]
      : [
          "Tokens Paid Value (USD)",
          "Asset Exchange Value (USD)",
          "Lockup Value (USD)",
          "Total Transactions Value (USD)",
          "Amount (NEAR)",
          "Lockup Amount (NEAR)",
        ];

  return dataRows.map((row: any) =>
    headers.reduce((acc: any, header: any, idx: number) => {
      let value = row[idx] || null;
      if (numericFields.includes(header) && value) value = cleanNumber(value);
      acc[header] = value;
      return acc;
    }, {})
  );
}

const monthsToCheck = [
  "April 2025",
  "May 2025",
  "June 2025",
  "July 2025",
  "August 2025",
];

export async function calculateInsights(month: string) {
  const sheets = await authenticateGoogleSheets();
  const holdingsTitle = `${month} Metrics Report`;
  const transactionsTitle = `${month} Txn Report`;

  const holdings = await readSheetData(
    sheets,
    spreadsheetId,
    holdingsTitle,
    "holdings"
  );
  const transactions = await readSheetData(
    sheets,
    spreadsheetId,
    transactionsTitle,
    "transactions"
  );

  if (!holdings.length || !transactions.length)
    throw new Error("Missing data!");

  // --- Holdings Calculations ---
  const totalDaoAssets = holdings.reduce(
    (sum: any, h: any) => sum.plus(toBig(h["DAO Assets (USD)"])),
    Big(0)
  );

  // Fix: Include both NEAR Lockup and FT Lockups in total lockup assets
  const totalLockupAssets = holdings.reduce((sum: any, h: any) => {
    // Check for both possible column names
    const nearLockupValue = h["NEAR Lockup (USD)"] || h["Lockup Assets (USD)"] || "0";
    const nearLockup = toBig(nearLockupValue);
    const ftLockups = parseFtLockups(h["FT Lockups"]);
    const ftLockupTotal = ftLockups.reduce((acc, t) => acc + t.usdValue, 0);
    return sum.plus(nearLockup).plus(ftLockupTotal);
  }, Big(0));

  const totalAssets = totalDaoAssets.plus(totalLockupAssets);

  // Fix: Count treasuries created in the specific month
  const totalTreasuriesThisMonth = holdings.filter((h: any) =>
    isInCurrentMonth(h["Created At"], month)
  ).length;

  // --- Top 5 Treasuries ---
  const topTreasuries = holdings
    .map((h: any) => {
      return {
        treasuryUrl: h["Treasury URL"],
        value: h["Total Assets (USD)"],
      };
    })
    .sort((a, b) => {
      // Convert to numbers for sorting
      const aVal = parseFloat(cleanNumber(a.value));
      const bVal = parseFloat(cleanNumber(b.value));
      return bVal - aVal;
    })
    .slice(0, 5)
    .map((t) => {
      // Convert to currency format and add line break
      const numericValue = parseFloat(cleanNumber(t.value));
      const currencyValue = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(numericValue);
      return `${t.treasuryUrl} (${currencyValue})`;
    })
    .join("\n\n"); // Add line breaks between treasuries

  // --- Transactions Calculations ---
  const proposalCols = [
    "Payment Proposals",
    "Asset Exchange Proposals",
    "Stake Delegation Proposals",
    "Lockup Proposals",
  ];
  const totalTransactionsCount = transactions.reduce(
    (sum: number, row: any) =>
      sum + proposalCols.reduce((s, col) => s + toInt(row[col]), 0),
    0
  );
  const totalTransactionsValue = transactions.reduce(
    (sum: any, row: any) =>
      sum.plus(toBig(row["Total Transactions Value (USD)"])),
    Big(0)
  );

  // --- Transaction Share Calculations ---
  const transactionShares = {
    payment: transactions.reduce(
      (sum: number, row: any) => sum + toInt(row["Payment Proposals"]),
      0
    ),
    exchange: transactions.reduce(
      (sum: number, row: any) => sum + toInt(row["Asset Exchange Proposals"]),
      0
    ),
    stake: transactions.reduce(
      (sum: number, row: any) => sum + toInt(row["Stake Delegation Proposals"]),
      0
    ),
    lockup: transactions.reduce(
      (sum: number, row: any) => sum + toInt(row["Lockup Proposals"]),
      0
    ),
  };

  const transactionSharePercentages = {
    payment:
      totalTransactionsCount > 0
        ? ((transactionShares.payment / totalTransactionsCount) * 100).toFixed(
            1
          )
        : "0.0",
    exchange:
      totalTransactionsCount > 0
        ? ((transactionShares.exchange / totalTransactionsCount) * 100).toFixed(
            1
          )
        : "0.0",
    stake:
      totalTransactionsCount > 0
        ? ((transactionShares.stake / totalTransactionsCount) * 100).toFixed(1)
        : "0.0",
    lockup:
      totalTransactionsCount > 0
        ? ((transactionShares.lockup / totalTransactionsCount) * 100).toFixed(1)
        : "0.0",
  };

  // --- Top 5 Transaction Tokens by USD Value ---
  const tokenUsdTransactions: Record<string, number> = {};

  transactions.forEach((row: any) => {
    // 1. Tokens Paid - parse and add USD values
    const tokensPaid = parseFtLockups(row["Tokens Paid"]);
    tokensPaid.forEach((token) => {
      if (token.symbol && token.symbol !== "undefined" && token.usdValue > 0) {
        tokenUsdTransactions[token.symbol] =
          (tokenUsdTransactions[token.symbol] || 0) + token.usdValue;
      }
    });

    // 2. Stake Delegation - NEAR tokens (use Amount (NEAR) and Value (USD))
    if (row["Amount (NEAR)"] && row["Value (USD)"]) {
      const stakeAmount = Number(cleanNumber(row["Amount (NEAR)"]));
      const stakeValue = Number(cleanNumber(row["Value (USD)"]));
      if (
        !isNaN(stakeAmount) &&
        !isNaN(stakeValue) &&
        stakeAmount > 0 &&
        stakeValue > 0
      ) {
        tokenUsdTransactions["NEAR"] =
          (tokenUsdTransactions["NEAR"] || 0) + stakeValue;
      }
    }

    // 3. Lockup Proposals - NEAR tokens (use Lockup Amount (NEAR) and Lockup Value (USD))
    if (row["Lockup Amount (NEAR)"] && row["Lockup Value (USD)"]) {
      const lockupAmount = Number(cleanNumber(row["Lockup Amount (NEAR)"]));
      const lockupValue = Number(cleanNumber(row["Lockup Value (USD)"]));
      if (
        !isNaN(lockupAmount) &&
        !isNaN(lockupValue) &&
        lockupAmount > 0 &&
        lockupValue > 0
      ) {
        tokenUsdTransactions["NEAR"] =
          (tokenUsdTransactions["NEAR"] || 0) + lockupValue;
      }
    }
  });

  const topTokens = Object.entries(tokenUsdTransactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token, usd]) => ({ token, usd }));

  // --- FT Lockups & NEAR Lockups ---
  let totalFTUsd = Big(0);
  let totalFTLockupCount = 0;
  let totalNearLockupsCount = 0;

  holdings.forEach((h: any) => {
    const fts = parseFtLockups(h["FT Lockups"]);
    totalFTUsd = totalFTUsd.plus(fts.reduce((acc, t) => acc + t.usdValue, 0));
    totalFTLockupCount += fts.length;
    if (h["Lockup Account"] && h["Lockup Account"] !== "-")
      totalNearLockupsCount += 1;
  });

  // --- Top 5 Tokens Held by USD Value ---
  const tokenUsdHoldings: Record<string, number> = {};

  // Fetch NEAR price from the internal API
  let nearPrice = 2.5; // fallback price
  try {
    const nearPriceResponse = await fetch(
      "http://localhost:3000/api/near-price"
    );
    if (nearPriceResponse.ok) {
      nearPrice = await nearPriceResponse.json();
    }
  } catch (error) {
    console.log("Failed to fetch NEAR price, using fallback:", error);
  }

  holdings.forEach((h: any) => {
    // 1. NEAR tokens - fetch price and calculate USD value
    if (h["NEAR"]) {
      const nearAmount = Number(cleanNumber(h["NEAR"]));
      if (!isNaN(nearAmount) && nearAmount > 0) {
        const nearUsdValue = nearAmount * nearPrice;
        tokenUsdHoldings["NEAR"] =
          (tokenUsdHoldings["NEAR"] || 0) + nearUsdValue;
      }
    }

    // 2. USDC - 1:1 with USD
    if (h["USDC"]) {
      const usdcAmount = Number(cleanNumber(h["USDC"]));
      if (!isNaN(usdcAmount) && usdcAmount > 0) {
        tokenUsdHoldings["USDC"] = (tokenUsdHoldings["USDC"] || 0) + usdcAmount;
      }
    }

    // 3. USDt - 1:1 with USD
    if (h["USDt"]) {
      const usdtAmount = Number(cleanNumber(h["USDt"]));
      if (!isNaN(usdtAmount) && usdtAmount > 0) {
        tokenUsdHoldings["USDT"] = (tokenUsdHoldings["USDT"] || 0) + usdtAmount;
      }
    }

    // 4. FT Tokens - parse and add USD values
    const ftTokens = parseFtLockups(h["FT Tokens"]);
    ftTokens.forEach((ft) => {
      if (ft.symbol && ft.symbol !== "undefined" && ft.usdValue > 0) {
        tokenUsdHoldings[ft.symbol] =
          (tokenUsdHoldings[ft.symbol] || 0) + ft.usdValue;
      }
    });

    // 5. Intents Tokens - parse and add USD values
    const intentsTokens = parseFtLockups(h["Intents Tokens"]);
    intentsTokens.forEach((token) => {
      if (token.symbol && token.symbol !== "undefined" && token.usdValue > 0) {
        tokenUsdHoldings[token.symbol] =
          (tokenUsdHoldings[token.symbol] || 0) + token.usdValue;
      }
    });
  });

  const topTokensHeld = Object.entries(tokenUsdHoldings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token, usd]) => ({ token, usd }));

  // --- Top 5 Tokens Held Through Intents ---
  const intentsTokenHoldings: Record<string, number> = {};

  holdings.forEach((h: any) => {
    const intentsTokens = parseFtLockups(h["Intents Tokens"]);
    intentsTokens.forEach((token) => {
      if (token.symbol && token.symbol !== "undefined" && token.usdValue > 0) {
        intentsTokenHoldings[token.symbol] =
          (intentsTokenHoldings[token.symbol] || 0) + token.usdValue;
      }
    });
  });

  const topIntentsTokens = Object.entries(intentsTokenHoldings)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([token, usd]) => ({ token, usd }));

  // --- Top 5 Active Treasuries (by transaction count) ---
  const activeTreasuries = transactions
    .map((row: any) => {
      const totalTxnCount = proposalCols.reduce(
        (sum, col) => sum + toInt(row[col]),
        0
      );
      return {
        treasuryUrl: row["Treasury URL"],
        transactionCount: totalTxnCount,
      };
    })
    .sort((a, b) => b.transactionCount - a.transactionCount)
    .slice(0, 5)
    .map((t) => `${t.treasuryUrl} (${t.transactionCount} transactions)`)
    .join("\n\n");

  // --- Transaction Count Ranges ---
  const transactionRanges = {
    zeroToFive: transactions.filter((row: any) => {
      const count = proposalCols.reduce((sum, col) => sum + toInt(row[col]), 0);
      return count >= 0 && count <= 5;
    }).length,
    fiveToTen: transactions.filter((row: any) => {
      const count = proposalCols.reduce((sum, col) => sum + toInt(row[col]), 0);
      return count > 5 && count <= 10;
    }).length,
    moreThanTen: transactions.filter((row: any) => {
      const count = proposalCols.reduce((sum, col) => sum + toInt(row[col]), 0);
      return count > 10;
    }).length,
  };

  // --- Transactions by USD Amount (ranges) ---
  const transactionsByUsd = {
    under1k: transactions.filter((row: any) => {
      const value = parseFloat(
        cleanNumber(row["Total Transactions Value (USD)"])
      );
      return value > 0 && value < 1000;
    }).length,
    oneToTenK: transactions.filter((row: any) => {
      const value = parseFloat(
        cleanNumber(row["Total Transactions Value (USD)"])
      );
      return value >= 1000 && value < 10000;
    }).length,
    tenToHundredK: transactions.filter((row: any) => {
      const value = parseFloat(
        cleanNumber(row["Total Transactions Value (USD)"])
      );
      return value >= 10000 && value < 100000;
    }).length,
    overHundredK: transactions.filter((row: any) => {
      const value = parseFloat(
        cleanNumber(row["Total Transactions Value (USD)"])
      );
      return value >= 100000;
    }).length,
  };

  // --- Treasury Lists by Transaction Count ---
  const treasuriesByTransactionCount = {
    moreThanTen: transactions
      .filter((row: any) => {
        const count = proposalCols.reduce(
          (sum, col) => sum + toInt(row[col]),
          0
        );
        return count > 10;
      })
      .map((row: any) => {
        const count = proposalCols.reduce(
          (sum, col) => sum + toInt(row[col]),
          0
        );
        return `${row["Treasury URL"]} (${count} transactions)`;
      }),
  };

  // --- Treasury Lists by USD Value ---
  const treasuriesByUsdValue = {
    overHundredK: transactions
      .filter((row: any) => {
        const value = parseFloat(
          cleanNumber(row["Total Transactions Value (USD)"])
        );
        return value >= 100000;
      })
      .map((row: any) => {
        const value = parseFloat(
          cleanNumber(row["Total Transactions Value (USD)"])
        );
        const currencyValue = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(value);
        return `${row["Treasury URL"]} (${currencyValue})`;
      }),
  };

  // --- Total Treasuries Count ---
  const totalTreasuries = holdings.length;

  return {
    totalTreasuriesThisMonth,
    totalDaoAssets: totalDaoAssets.toFixed(2),
    totalLockupAssets: totalLockupAssets.toFixed(2),
    totalAssets: totalAssets.toFixed(2),
    topTreasuries,
    totalTransactionsCount,
    totalTransactionsValue: totalTransactionsValue.toFixed(2),
    transactionShares,
    transactionSharePercentages,
    topTokens,
    totalFTUsd: totalFTUsd.toFixed(2),
    totalFTLockupCount,
    totalNearLockupsCount,
    topTokensHeld,
    topIntentsTokens,
    activeTreasuries,
    transactionRanges,
    transactionsByUsd,
    totalTreasuries,
    treasuriesByTransactionCount,
    treasuriesByUsdValue,
  };
}

// Create a new function to calculate insights for all months
export async function calculateMultiMonthInsights() {
  const allInsights = [];

  for (const month of monthsToCheck) {
    try {
      const insights = await calculateInsights(month);
      allInsights.push({
        month,
        ...insights,
      });
    } catch (error) {
      console.log(`No data found for ${month}:`, (error as Error).message);
      // Add empty data for missing months
      allInsights.push({
        month,
        totalTreasuries: 0,
        totalTreasuriesThisMonth: 0,
        totalDaoAssets: "0.00",
        totalLockupAssets: "0.00",
        totalAssets: "0.00",
        topTreasuries: "",
        totalTransactionsCount: 0,
        totalTransactionsValue: "0.00",
        transactionShares: { payment: 0, exchange: 0, stake: 0, lockup: 0 },
        transactionSharePercentages: {
          payment: "0.0",
          exchange: "0.0",
          stake: "0.0",
          lockup: "0.0",
        },
        topTokens: [],
        totalFTUsd: "0.00",
        totalFTLockupCount: 0,
        totalNearLockupsCount: 0,
        topTokensHeld: [],
        topIntentsTokens: [],
        activeTreasuries: "",
        transactionRanges: { zeroToFive: 0, fiveToTen: 0, moreThanTen: 0 },
        transactionsByUsd: {
          under1k: 0,
          oneToTenK: 0,
          tenToHundredK: 0,
          overHundredK: 0,
        },
        treasuriesByTransactionCount: { moreThanTen: [] },
        treasuriesByUsdValue: { overHundredK: [] },
      });
    }
  }

  return allInsights;
}

// Fix the isInCurrentMonth function to accept month parameter
function isInCurrentMonth(dateStr: string, monthToCheck: string) {
  if (!dateStr || dateStr.trim() === "") return false;
  
  const [monthName, yearStr] = monthToCheck.split(" ");
  const year = parseInt(yearStr, 10);
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  
  const startOfMonth = new Date(year, monthIndex, 1);
  const endOfMonth = new Date(year, monthIndex + 1, 0);
  
  // Try to parse the date string
  let date: Date;
  try {
    date = new Date(dateStr);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      console.log(`Invalid date format: ${dateStr}`);
      return false;
    }
  } catch (error) {
    console.log(`Error parsing date: ${dateStr}`, error);
    return false;
  }
  
  return date >= startOfMonth && date <= endOfMonth;
}

// Create separate focused tables
export async function updateDashboardSheet() {
  const allInsights = await calculateMultiMonthInsights();
  const sheets = await authenticateGoogleSheets();

  // Helper function to format currency
  const formatCurrency = (value: string | number) => {
    const numericValue = typeof value === "string" ? parseFloat(value) : value;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(numericValue);
  };

  // 1. Treasury Overview Table
  await createTreasuryOverviewTable(sheets, allInsights, formatCurrency);
  
  // 2. Asset Holdings Table
  await createAssetHoldingsTable(sheets, allInsights, formatCurrency);
  
  // 3. Transaction Activity Table
  await createTransactionActivityTable(sheets, allInsights, formatCurrency);
  
  // 4. Top Performers Table
  await createTopPerformersTable(sheets, allInsights, formatCurrency);
  
  // 5. Transaction Value Analysis Table
  await createTransactionValueTable(sheets, allInsights, formatCurrency);
}

// 1. Treasury Overview Table
async function createTreasuryOverviewTable(sheets: any, allInsights: any[], formatCurrency: Function) {
  const sheetTitle = "Treasury Overview";
  
  const values = [
    ["Metric", "April 2025", "May 2025", "June 2025", "July 2025", "August 2025"],
    ["Total Treasuries", ...allInsights.map(i => i.totalTreasuries)],
    ["Treasuries Created This Month", ...allInsights.map(i => i.totalTreasuriesThisMonth)],
    ["Number of NEAR Lockup Accounts", ...allInsights.map(i => i.totalNearLockupsCount)],
    ["Number of FT Lockups", ...allInsights.map(i => i.totalFTLockupCount)],
  ];

  await createOrUpdateSheet(sheets, sheetTitle, values);
}

// 2. Asset Holdings Table
async function createAssetHoldingsTable(sheets: any, allInsights: any[], formatCurrency: Function) {
  const sheetTitle = "Asset Holdings";
  
  const values = [
    ["Metric", "April 2025", "May 2025", "June 2025", "July 2025", "August 2025"],
    ["DAO Assets (USD)", ...allInsights.map(i => formatCurrency(i.totalDaoAssets))],
    ["NEAR Lockup Assets (USD)", ...allInsights.map(i => formatCurrency(i.totalLockupAssets))],
    ["FT Lockup Assets (USD)", ...allInsights.map(i => formatCurrency(i.totalFTUsd))],
    ["Total Treasury Assets (USD)", ...allInsights.map(i => formatCurrency(i.totalAssets))],
  ];

  await createOrUpdateSheet(sheets, sheetTitle, values);
}

// 3. Transaction Activity Table
async function createTransactionActivityTable(sheets: any, allInsights: any[], formatCurrency: Function) {
  const sheetTitle = "Transaction Activity";
  
  const values = [
    ["Metric", "April 2025", "Apr Details", "May 2025", "May Details", "June 2025", "Jun Details", "July 2025", "Jul Details", "August 2025", "Aug Details"],
    ["Total Transactions", ...allInsights.flatMap(i => [i.totalTransactionsCount, ""])],
    ["Payment Proposals", ...allInsights.flatMap(i => [`${i.transactionShares.payment} (${i.transactionSharePercentages.payment}%)`, ""])],
    ["Asset Exchange Proposals", ...allInsights.flatMap(i => [`${i.transactionShares.exchange} (${i.transactionSharePercentages.exchange}%)`, ""])],
    ["Stake Delegation Proposals", ...allInsights.flatMap(i => [`${i.transactionShares.stake} (${i.transactionSharePercentages.stake}%)`, ""])],
    ["Lockup Proposals", ...allInsights.flatMap(i => [`${i.transactionShares.lockup} (${i.transactionSharePercentages.lockup}%)`, ""])],
    ["Treasuries with 0-5 Transactions", ...allInsights.flatMap(i => [i.transactionRanges.zeroToFive, ""])],
    ["Treasuries with 5-10 Transactions", ...allInsights.flatMap(i => [i.transactionRanges.fiveToTen, ""])],
    ["Treasuries with 10+ Transactions", ...allInsights.flatMap(i => [i.transactionRanges.moreThanTen, i.treasuriesByTransactionCount.moreThanTen.join("\n\n")])],
  ];

  await createOrUpdateSheet(sheets, sheetTitle, values);
}

// 4. Top Performers Table
async function createTopPerformersTable(sheets: any, allInsights: any[], formatCurrency: Function) {
  const sheetTitle = "Top Performers";
  
  const values = [
    ["Category", "April 2025", "May 2025", "June 2025", "July 2025", "August 2025"],
    ["Top 5 Treasuries by Assets", ...allInsights.map(i => i.topTreasuries)],
    [],
    ["Top 5 Active Treasuries", ...allInsights.map(i => i.activeTreasuries)],
    [],
    ["Top 5 Transacting Tokens", ...allInsights.map(i => 
      i.topTokens.map((t: any) => `${t.token} (${formatCurrency(t.usd)})`).join("\n\n")
    )],
    [],
    ["Top 5 Tokens Held", ...allInsights.map(i => 
      i.topTokensHeld.map((t: any) => `${t.token} (${formatCurrency(t.usd)})`).join("\n\n")
    )],
    [],
    ["Top 5 Intents Tokens", ...allInsights.map(i => 
      i.topIntentsTokens.map((t: any) => `${t.token} (${formatCurrency(t.usd)})`).join("\n\n")
    )],
  ];

  await createOrUpdateSheet(sheets, sheetTitle, values);
}

// 5. Transaction Value Analysis Table
async function createTransactionValueTable(sheets: any, allInsights: any[], formatCurrency: Function) {
  const sheetTitle = "Transaction Value Analysis";
  
  const values = [
    ["Metric", "April 2025", "Apr Details", "May 2025", "May Details", "June 2025", "Jun Details", "July 2025", "Jul Details", "August 2025", "Aug Details"],
    ["Total Transaction Value (USD)", ...allInsights.flatMap(i => [formatCurrency(i.totalTransactionsValue), ""])],
    ["Treasuries Under $1K", ...allInsights.flatMap(i => [i.transactionsByUsd.under1k, ""])],
    ["Treasuries $1K-$10K", ...allInsights.flatMap(i => [i.transactionsByUsd.oneToTenK, ""])],
    ["Treasuries $10K-$100K", ...allInsights.flatMap(i => [i.transactionsByUsd.tenToHundredK, ""])],
    ["Treasuries Over $100K", ...allInsights.flatMap(i => [i.transactionsByUsd.overHundredK, i.treasuriesByUsdValue.overHundredK.join("\n\n")])],
  ];

  await createOrUpdateSheet(sheets, sheetTitle, values);
}

// Helper function to create or update a sheet
async function createOrUpdateSheet(sheets: any, sheetTitle: string, values: any[][]) {
  const sheetId = await getOrCreateSheetByTitle(
    sheets,
    writeSpreadsheet,
    sheetTitle
  );

  // Only add formatting requests if we have values to format
  const requests: any[] = [];
  
  // Add basic formatting for the header row
  if (values.length > 0) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
        },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)",
      },
    });
  }

  console.log(`Creating/updating sheet: ${sheetTitle}`);
  
  // If we have requests, use batchUpdate, otherwise just update values
  if (requests.length > 0) {
    await updateSheet(sheets, writeSpreadsheet, values, requests, sheetTitle);
  } else {
    // Just update values without formatting
    await sheets.spreadsheets.values.update({
      spreadsheetId: writeSpreadsheet,
      range: `'${sheetTitle}'!A1:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
  }
  
  console.log(`✅ Sheet "${sheetTitle}" updated successfully!`);
}
