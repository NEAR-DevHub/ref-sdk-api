export const BLOCKS_PER_HOUR = 3200;

export function formatLabel(timestamp: number, period: string): string {
  const date = new Date(timestamp);
  const timeZone = "UTC";
  // All dates formatted in UTC timezone
  switch (period) {
    case "1Y":
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: timeZone,
      });

    case "1M":
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: timeZone,
      });

    case "1W":
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: timeZone,
      });

    case "1D":
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        hour12: true,
        timeZone: timeZone,
      });

    case "1H":
      return (
        date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: timeZone,
        }) + " UTC"
      );

    default:
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: timeZone,
      });
  }
}

export type BalanceHistoryCache = {
  get: (key: string) => any;
  set: (key: string, value: any, ttl?: number) => void;
  del: (key: string) => void;
};

export function groupByPeriod<T extends { timestamp: number; date: string }>(
  history: T[]
): Record<string, T> {
  const grouped = new Map<string, T>();

  for (const entry of history) {
    const key = entry.date;
    if (!grouped.has(key) || entry.timestamp > grouped.get(key)!.timestamp) {
      grouped.set(key, entry);
    }
  }

  return Object.fromEntries(grouped);
}

// Helper function to decode Uint8Array response
export function decodeUint8Array(uint8Array: number[]): any {
  const jsonString = uint8Array.map((c) => String.fromCharCode(c)).join("");
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse JSON from Uint8Array:", error);
    return null;
  }
}

// Common block height calculation logic
export function calculateBlockHeights(
  currentBlock: number,
  lastStoredBlock: number,
  blocksPerStep: number,
  interval: number
): number[] {
  let totalSteps = Math.min(
    interval,
    Math.floor((currentBlock - lastStoredBlock) / blocksPerStep)
  );

  if (totalSteps <= 0) {
    totalSteps = 1;
  }

  return Array.from(
    { length: totalSteps },
    (_, i) => currentBlock - blocksPerStep * (totalSteps - 1 - i)
  ).filter((block) => block > lastStoredBlock && block > 1_000_000);
}

// Common period configuration logic
export function shouldUseArchival(period: string): boolean {
  return ["1Y", "1M", "1W", "All"].includes(period);
}

export function calculateBlocksPerStep(hoursPerStep: number): number {
  return Math.floor(BLOCKS_PER_HOUR * hoursPerStep);
}
