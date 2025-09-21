import Big from "big.js";
import { SmartRouter } from "./utils/interface";
import { searchFT, swapFromServer, unWrapNear, wrapNear } from "./utils/lib";
import axios from "axios";

export type SwapParams = {
  accountId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage: string;
};

export async function getSwap(
  { accountId, tokenIn, tokenOut, amountIn, slippage }: SwapParams,
  cache: {
    get: (key: string) => any;
    set: (key: string, value: any, ttl: number) => void;
  }
) {
  try {
    const isWrapNearInputToken = tokenIn === "wrap.near";
    const isWrapNearOutputToken = tokenOut === "wrap.near";
    const tokenInData = await searchFT(tokenIn, cache);
    const tokenOutData = await searchFT(tokenOut, cache);

    if (!tokenInData || !tokenOutData) {
      throw new Error(
        `Unable to find token(s) tokenInData: ${tokenInData?.name} tokenOutData: ${tokenOutData?.name}`
      );
    }

    // (un)wrap NEAR
    if (tokenInData.contract === tokenOutData.contract) {
      if (isWrapNearInputToken && !isWrapNearOutputToken) {
        return {
          transactions: [await unWrapNear({ amountIn })],
          outEstimate: amountIn,
        };
      }

      if (!isWrapNearInputToken && isWrapNearOutputToken) {
        return {
          transactions: [await wrapNear({ amountIn, accountId })],
          outEstimate: amountIn,
        };
      }
    }

    const sendAmount = Big(amountIn)
      .mul(Big(10).pow(tokenInData.decimals))
      .toFixed();

    let swapRes: SmartRouter;
    try {
      const response = await axios.get(
        `https://smartrouter.ref.finance/findPath?amountIn=${sendAmount}&tokenIn=${tokenInData.contract}&tokenOut=${tokenOutData.contract}&pathDeep=3&slippage=${slippage}`
      );
      swapRes = response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Failed to fetch swap path: ${error.response?.status} - ${
            error.response?.data?.message || error.message
          }`
        );
      }
      throw error;
    }

    if (!swapRes.result_data) {
      throw new Error("No swap path found between the specified tokens");
    }

    const receiveAmount = Big(swapRes.result_data.amount_out)
      .div(Big(10).pow(tokenOutData.decimals))
      .toFixed();

    const swapTxns = await swapFromServer({
      tokenIn: tokenInData,
      tokenOut: tokenOutData,
      amountIn: amountIn,
      accountId: accountId,
      swapsToDoServer: swapRes.result_data,
    });

    return {
      transactions: swapTxns,
      outEstimate: Big(receiveAmount).toFixed(5),
    };
  } catch (error) {
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Swap failed: ${error.message}`);
    }
    throw new Error("An unexpected error occurred during swap");
  }
}
