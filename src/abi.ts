/**
 * Minimal ABI fragment for the Payroll contract.
 *
 * ============================================================================
 *  Verified against src/Payroll.sol on 2026-09-21 (commit 2fd9d42).
 *  This is deliberately the only file in this project that mirrors on-chain
 *  signatures. Everything else is signature-agnostic.
 *
 *  Re-check after any change to the contract:
 *    1. runPayroll() takes no arguments and is externally callable.
 *    2. The custom error names below match exactly (case-sensitive).
 *    3. The event signatures match (used only for reporting; a mismatch
 *       degrades logging, it does not break execution).
 * ============================================================================
 */

export const payrollAbi = [
  {
    type: "function",
    name: "runPayroll",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "error",
    name: "Payroll__TooEarlyForNextPayroll",
    inputs: [{ name: "nextEligibleTimestamp", type: "uint256" }],
  },
  {
    type: "error",
    name: "Payroll__InsufficientBalanceForPayroll",
    inputs: [
      { name: "contractBalance", type: "uint256" },
      { name: "totalSalaries", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "Payroll__SalaryTransferFailed",
    inputs: [{ name: "employeeAddress", type: "address" }],
  },
  {
    type: "event",
    name: "SalaryPaid",
    inputs: [
      { name: "employee", type: "address", indexed: true },
      { name: "salary", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PayrollCompleted",
    inputs: [
      { name: "numberOfEmployeesPaid", type: "uint256", indexed: false },
      { name: "totalAmountPaid", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

/**
 * Maps a decoded custom error name to the scheduler's reaction.
 *
 * Declared as data rather than as a switch statement so that renaming an
 * error in the contract is a one-line change here, with no control flow to
 * revisit. Any error name absent from this map is treated as unexpected and
 * fails the run loudly — the safe default.
 *
 * Payroll__SalaryTransferFailed is deliberately absent: a stablecoin transfer
 * that returns false is a genuine malfunction, not a schedulable condition.
 * It is declared in the ABI above only so the failure is logged by name
 * rather than as an undecodable blob.
 */
export const ERROR_HANDLING = {
  /** Due date not reached. Expected outcome for most ticks. Not a failure. */
  Payroll__TooEarlyForNextPayroll: "NOT_DUE",
  /** Contract cannot cover the payroll. Requires human action by the employer. */
  Payroll__InsufficientBalanceForPayroll: "UNDERFUNDED",
} as const satisfies Record<string, "NOT_DUE" | "UNDERFUNDED">;
