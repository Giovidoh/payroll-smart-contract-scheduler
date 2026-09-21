import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ERROR_HANDLING, payrollAbi } from "./abi.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { isAlertWindow, notifyLowGas, notifyUnderfunded } from "./notifier.js";

/**
 * One tick of the scheduler.
 *
 * The scheduler never decides whether payroll is due. It asks the contract,
 * by simulating the call, and reacts to the answer. All business rules stay
 * on chain, in a single implementation.
 */

export type Outcome =
  /** Payroll was executed and the transaction is confirmed. */
  | "EXECUTED"
  /** The interval has not elapsed. The expected result of most ticks. */
  | "NOT_DUE"
  /** The contract cannot cover salaries. The employer was alerted. */
  | "UNDERFUNDED"
  /** The contract reverted for a reason this scheduler does not recognise. */
  | "UNEXPECTED_REVERT"
  /** The chain could not be reached, or the transaction failed to land. */
  | "INFRASTRUCTURE_ERROR";

export interface TickResult {
  outcome: Outcome;
  transactionHash?: Hex;
  blockNumber?: bigint;
  employeesPaid?: number;
  gasUsed?: bigint;
  detail?: string;
}

/**
 * Extracts the custom error name from a viem error, if the failure came from
 * the contract reverting rather than from the network.
 *
 * Returns undefined for transport failures, which must be treated differently:
 * a revert is an answer, an unreachable node is an absence of answer.
 */
function decodeRevertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;

  const revert = error.walk(
    (cause) => cause instanceof ContractFunctionRevertedError,
  );

  return revert instanceof ContractFunctionRevertedError
    ? revert.data?.errorName
    : undefined;
}

export async function tick(): Promise<TickResult> {
  const config = getConfig();
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.rpcUrl);

  const publicClient = createPublicClient({ chain: config.chain, transport });
  const walletClient = createWalletClient({ account, chain: config.chain, transport });

  logger.info("tick started", {
    contract: config.payrollAddress,
    scheduler: account.address,
    chain: config.chain.name,
  });

  // Gas check first. It cannot block the attempt — the point is to warn
  // before the account runs dry, not after.
  try {
    const balance = await publicClient.getBalance({ address: account.address });
    logger.info("scheduler gas balance", { balanceWei: balance });

    if (balance < config.minGasBalanceWei && isAlertWindow()) {
      await notifyLowGas(balance);
    }
  } catch (error) {
    logger.warn("could not read scheduler balance", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Simulation: an eth_call against live state. The contract runs its own
  // guards, costs no gas, and changes nothing.
  let request;
  try {
    const simulation = await publicClient.simulateContract({
      address: config.payrollAddress,
      abi: payrollAbi,
      functionName: "runPayroll",
      account,
    });
    request = simulation.request;
  } catch (error) {
    const errorName = decodeRevertName(error);

    if (errorName === undefined) {
      const detail = error instanceof Error ? error.message : String(error);
      logger.error("simulation failed without a contract revert", { detail });
      return { outcome: "INFRASTRUCTURE_ERROR", detail };
    }

    const reaction = ERROR_HANDLING[errorName as keyof typeof ERROR_HANDLING];

    if (reaction === "NOT_DUE") {
      logger.info("payroll not due yet", { errorName });
      return { outcome: "NOT_DUE", detail: errorName };
    }

    if (reaction === "UNDERFUNDED") {
      logger.warn("contract cannot cover payroll", { errorName });
      if (isAlertWindow()) {
        await notifyUnderfunded();
      } else {
        logger.info("underfunding alert suppressed outside alert window");
      }
      return { outcome: "UNDERFUNDED", detail: errorName };
    }

    // An error the contract can raise but this scheduler was never taught to
    // interpret. Failing loudly is correct: silence here would hide a real
    // change in the contract's behaviour.
    logger.error("contract reverted with an unrecognised error", { errorName });
    return { outcome: "UNEXPECTED_REVERT", detail: errorName };
  }

  // Simulation passed. Execute for real.
  try {
    const transactionHash = await walletClient.writeContract(request);
    logger.info("payroll transaction submitted", { transactionHash });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: transactionHash,
      confirmations: config.confirmations,
    });

    if (receipt.status !== "success") {
      logger.error("payroll transaction reverted on chain", { transactionHash });
      return {
        outcome: "INFRASTRUCTURE_ERROR",
        transactionHash,
        detail: "transaction reverted after a successful simulation",
      };
    }

    // Counting SalaryPaid events turns the receipt into a human-readable
    // result. Wrapped defensively: a mismatched event signature should
    // degrade the log line, never the outcome of a successful payroll.
    let employeesPaid: number | undefined;
    try {
      employeesPaid = parseEventLogs({
        abi: payrollAbi,
        eventName: "SalaryPaid",
        logs: receipt.logs,
      }).length;
    } catch {
      logger.warn("could not decode SalaryPaid events; check the ABI fragment");
    }

    logger.info("payroll executed", {
      transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      employeesPaid,
    });

    return {
      outcome: "EXECUTED",
      transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
      employeesPaid,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("failed to submit or confirm the payroll transaction", { detail });
    return { outcome: "INFRASTRUCTURE_ERROR", detail };
  }
}
