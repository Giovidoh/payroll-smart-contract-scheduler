/**
 * Structured logging.
 *
 * Every tick emits one JSON object per line. This matters beyond tidiness:
 * the GitHub Actions run history becomes a machine-readable record of every
 * payroll attempt, its outcome, and its transaction hash — an audit trail
 * that can be handed to a reviewer without access to any private system.
 */

type Level = "info" | "warn" | "error";

type Fields = Record<string, unknown>;

/** BigInt is not JSON-serialisable; render it as a decimal string. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function emit(level: Level, message: string, fields: Fields = {}): void {
  const line = JSON.stringify(
    { timestamp: new Date().toISOString(), level, message, ...fields },
    replacer,
  );

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
