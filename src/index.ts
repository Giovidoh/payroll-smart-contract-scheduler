import { logger } from "./logger.js";
import { tick, type Outcome } from "./tick.js";

/**
 * CLI entrypoint. One invocation performs exactly one tick, then exits.
 *
 * The process holds no timer and no loop of its own: scheduling is the
 * responsibility of whatever calls it (GitHub Actions cron here, a systemd
 * timer or a Vercel cron route elsewhere). Keeping the scheduling concern
 * outside the code is what makes the deployment target interchangeable.
 */

/**
 * Exit codes drive the red or green mark in the Actions run history, so the
 * mapping is a reporting decision, not a technical one.
 *
 * NOT_DUE and UNDERFUNDED both exit 0: neither is a malfunction of the
 * scheduler. An underfunded contract is a condition of the business, already
 * reported by email to the person who can act on it. Marking those runs red
 * would train the operator to ignore red — leaving genuine failures unnoticed.
 */
const FAILING_OUTCOMES: ReadonlySet<Outcome> = new Set([
  "UNEXPECTED_REVERT",
  "INFRASTRUCTURE_ERROR",
]);

async function main(): Promise<void> {
  const result = await tick();
  logger.info("tick finished", { ...result });

  if (FAILING_OUTCOMES.has(result.outcome)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // Reached only for configuration errors thrown before the tick starts,
  // such as a missing or malformed environment variable.
  logger.error("scheduler crashed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
