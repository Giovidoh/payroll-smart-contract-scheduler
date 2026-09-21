import { isAddress, isHex, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";

/**
 * Configuration is read from the environment and validated once, at startup.
 *
 * The scheduler is stateless by design: it holds no database, no cursor, no
 * record of past cycles. Everything it needs to know about payroll timing
 * lives on chain. This file therefore contains connection details and
 * operational thresholds only — never business rules.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `See .env.example for the full list.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : fallback;
}

function requiredAddress(name: string): Address {
  const value = required(name);
  if (!isAddress(value)) {
    throw new Error(`${name} is not a valid EVM address: ${value}`);
  }
  return value;
}

function parseHours(raw: string): number[] {
  const hours = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);

  if (hours.length === 0) {
    throw new Error(
      `ALERT_HOURS_UTC must contain at least one integer between 0 and 23, got: ${raw}`,
    );
  }
  return hours;
}

function parsePrivateKey(): Hex {
  const raw = required("SCHEDULER_PRIVATE_KEY");
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!isHex(key) || key.length !== 66) {
    throw new Error(
      "SCHEDULER_PRIVATE_KEY must be a 32-byte hex string (64 hex characters, " +
        "with or without the 0x prefix).",
    );
  }
  return key as Hex;
}

function build() {
  return {
    chain: sepolia,
    rpcUrl: required("RPC_URL"),
    payrollAddress: requiredAddress("PAYROLL_ADDRESS"),

    /**
     * Key of a throwaway account that holds gas and nothing else.
     *
     * This account is NOT the contract owner and holds no privilege whatsoever:
     * runPayroll() is permissionless, guarded by an on-chain interval check.
     * A leak of this key lets an attacker pay salaries on schedule — the same
     * thing the scheduler already does. Keep it out of version control anyway.
     */
    privateKey: parsePrivateKey(),

    /** Blocks to wait before considering the payroll transaction final. */
    confirmations: Number.parseInt(optional("CONFIRMATIONS", "2"), 10),

    /** Warn when the scheduler account can no longer reliably pay for gas. */
    minGasBalanceWei: BigInt(optional("MIN_GAS_BALANCE_WEI", "10000000000000000")), // 0.01 ETH

    notifications: {
      enabled: optional("NOTIFICATIONS_ENABLED", "true") === "true",
      resendApiKey: process.env.RESEND_API_KEY?.trim() ?? "",
      from: optional("ALERT_FROM", "ordonnanceur@example.com"),
      to: optional("ALERT_TO", "")
        .split(",")
        .map((address) => address.trim())
        .filter(Boolean),

      /**
       * Stateless de-duplication of underfunding alerts.
       *
       * The scheduler ticks hourly and has nowhere to record "already emailed".
       * Rather than introduce storage — which would contradict the stateless
       * design — alerts are emitted only during specific UTC hours. With the
       * default of two hours, an underfunded contract produces at most two
       * emails per day regardless of how often the scheduler runs.
       */
        alertHoursUtc: parseHours(optional("ALERT_HOURS_UTC", "8,20")),
      },
    } as const;
}

export type Config = ReturnType<typeof build>;

let cached: Config | undefined;

/**
 * Validates and returns the configuration, memoised after the first call.
 *
 * Deliberately a function rather than a module-level constant: validation
 * that runs at import time throws before any error handling is installed,
 * which turns a simple missing variable into an unhandled crash with a stack
 * trace instead of a one-line message naming the variable.
 */
export function getConfig(): Config {
  cached ??= build();
  return cached;
}
