import { Resend } from "resend";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

/**
 * Outbound alerts.
 *
 * Only two situations warrant an email, and both share one property: the
 * scheduler cannot resolve them on its own, and a human must act.
 *
 *   - The contract cannot cover the payroll (the employer must deposit).
 *   - The scheduler account is running out of gas (the operator must top up).
 *
 * A payroll that simply is not due yet is the normal case, not an incident,
 * and never produces an email.
 */

/**
 * Stateless de-duplication.
 *
 * With an hourly tick and no storage, alerting on every failed attempt would
 * mean 24 identical emails a day. Restricting alerts to a fixed set of UTC
 * hours bounds that without introducing a database, a cache, or a committed
 * state file — all of which would undermine the stateless design.
 *
 * The trade-off is honest and worth stating: an underfunding condition may go
 * unreported for up to twelve hours with the default settings. Narrow the gap
 * by adding hours to ALERT_HOURS_UTC.
 */
export function isAlertWindow(now: Date = new Date()): boolean {
  return getConfig().notifications.alertHoursUtc.includes(now.getUTCHours());
}

async function send(subject: string, body: string): Promise<void> {
  const { enabled, resendApiKey, from, to } = getConfig().notifications;

  if (!enabled) {
    logger.info("notification suppressed (NOTIFICATIONS_ENABLED=false)", { subject });
    return;
  }

  if (!resendApiKey || to.length === 0) {
    logger.warn("notification not sent: RESEND_API_KEY or ALERT_TO is not configured", {
      subject,
    });
    return;
  }

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({ from, to, subject, text: body });

    if (error) {
      // A failed email must not fail the tick: the on-chain outcome is what
      // matters, and the condition will be retried on the next run anyway.
      logger.error("notification failed", { subject, error: error.message });
      return;
    }

    logger.info("notification sent", { subject, recipients: to.length });
  } catch (error) {
    logger.error("notification threw", {
      subject,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function notifyUnderfunded(): Promise<void> {
  const config = getConfig();
  await send(
    "[Payroll] Provision insuffisante — versement des salaires bloqué",
    [
      "Le versement des salaires n'a pas pu être exécuté.",
      "",
      "Motif : le solde en stablecoin du contrat est inférieur au total des",
      "salaires dus pour ce cycle.",
      "",
      `Contrat : ${config.payrollAddress}`,
      `Réseau  : ${config.chain.name}`,
      "",
      "Action requise : approvisionner le contrat via la fonction deposit().",
      "L'ordonnanceur réessaiera automatiquement à chaque cycle horaire ;",
      "aucune intervention n'est nécessaire une fois le contrat approvisionné.",
    ].join("\n"),
  );
}

export async function notifyLowGas(balanceWei: bigint): Promise<void> {
  const config = getConfig();
  await send(
    "[Payroll] Ordonnanceur — solde de gas faible",
    [
      "Le compte de l'ordonnanceur n'a bientôt plus de quoi payer le gas.",
      "",
      `Solde actuel : ${balanceWei} wei`,
      `Seuil        : ${config.minGasBalanceWei} wei`,
      `Réseau       : ${config.chain.name}`,
      "",
      "Sans gas, l'ordonnanceur ne pourra plus déclencher les versements.",
      "Ce compte ne détient aucun privilège sur le contrat : il ne sert",
      "qu'à payer les frais de transaction.",
    ].join("\n"),
  );
}
