# Ordonnanceur — Payroll scheduler

Off-chain scheduler that triggers the on-chain `runPayroll()` execution of the
Payroll smart contract. It is the Web2-side component of the hybrid
architecture: the part that makes salary payment *automatic* rather than
merely *possible*.

---

## Design

### The scheduler holds no schedule

It does not know when the next payroll is due, and never computes a due date.
It wakes up hourly, asks the contract whether payroll can run right now, and
acts on the answer.

The question is asked by **simulating** `runPayroll()` — an `eth_call` against
live state that executes the contract's own guards without consuming gas or
modifying anything. Three answers are possible:

| Simulation result | Meaning | Reaction |
| --- | --- | --- |
| Succeeds | Payroll is due and funded | Send the real transaction |
| Reverts `Payroll__IntervalNotElapsed` | Not due yet | Sleep. Not an error |
| Reverts `Payroll__InsufficientFunds` | Employer must deposit | Email the employer |

The consequence is that payroll rules exist in exactly one place: the contract.
The scheduler cannot drift out of sync with it, because it holds no copy of the
rules to drift.

### Properties this buys

- **No state.** No database, no cursor, no record of past cycles. Nothing to
  back up, migrate, or reconcile.
- **Crash tolerance.** A scheduler down for six hours misses no payroll: the
  next tick observes that the interval has elapsed and executes.
- **Idempotence.** Two concurrent ticks cannot double-pay. The second
  transaction reverts on the contract's interval guard.
- **Interchangeable host.** Scheduling lives outside the code. Moving from
  GitHub Actions to a systemd timer or a Vercel cron route means writing a new
  invocation wrapper, not touching `src/`.

### Security posture

The scheduler account **is not the contract owner and holds no privilege.** It
cannot add an employee, change a salary, or withdraw funds. It holds gas and
nothing else.

This follows from `runPayroll()` being permissionless, guarded by a minimum
interval. Compromising the scheduler key lets an attacker pay salaries on
schedule — which is what the scheduler does anyway. Contrast with a
conventional payroll scheduler, which necessarily holds write access to the
payroll database and often the authority to initiate bank transfers.

---

## Before the first run

**Verify `src/abi.ts` against the deployed contract.** It is the only file that
mirrors on-chain signatures. Open the contract on Etherscan (Contract → ABI) or
read `Payroll.sol`, and confirm:

1. `runPayroll()` takes no arguments and is externally callable.
2. The two custom error names match exactly, character for character. A
   mismatch is silent and severe: an unrecognised error is treated as an
   unexpected failure, so a not-yet-due payroll would report as an incident.
3. The `SalaryPaid` event signature matches. A mismatch here only degrades
   log detail and never affects execution.

---

## Local setup

```bash
npm install
cp .env.example .env      # fill in the values
npm run typecheck
npm run tick              # performs exactly one tick, then exits
```

Fund the scheduler account with Sepolia ETH before the first real run.

---

## Deployment on GitHub Actions

The workflow lives in `.github/workflows/ordonnanceur.yml` and runs hourly.

**Repository secrets** (Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
| --- | --- |
| `RPC_URL` | Sepolia endpoint |
| `PAYROLL_ADDRESS` | Deployed contract address |
| `SCHEDULER_PRIVATE_KEY` | Throwaway key holding gas only |
| `RESEND_API_KEY` | Resend API key |

**Repository variables** (same page → Variables):

| Variable | Suggested value |
| --- | --- |
| `ALERT_FROM` | A sender on a domain verified in Resend |
| `ALERT_TO` | Employer email, comma-separated for several |
| `ALERT_HOURS_UTC` | `8,20` |
| `CONFIRMATIONS` | `2` |

### Platform constraints worth knowing

- **Scheduled workflows are disabled after 60 days without repository
  activity.** For a project that may sit idle between thesis milestones, this
  is the most likely cause of a silently stopped scheduler. Any commit resets
  the counter.
- **Cron runs only on the default branch.** A workflow on a feature branch
  never fires on schedule.
- **Scheduled runs are queued, not guaranteed on time.** Delays of several
  minutes are normal under platform load; the job is scheduled at minute 17
  rather than on the hour for this reason. The tick model absorbs the delay.
- **Run history is the audit trail.** On a public repository it is publicly
  readable — convenient for a reviewer, worth a deliberate decision.

### Triggering a cycle manually

Actions → *Ordonnanceur de paie* → **Run workflow**. This is the practical way
to demonstrate a payroll cycle live, without waiting for the interval.

---

## Outcomes and exit codes

| Outcome | Exit | Meaning |
| --- | --- | --- |
| `EXECUTED` | 0 | Payroll ran; transaction confirmed |
| `NOT_DUE` | 0 | Interval not elapsed — the normal case |
| `UNDERFUNDED` | 0 | Employer alerted by email |
| `UNEXPECTED_REVERT` | 1 | Contract raised an error the scheduler does not know |
| `INFRASTRUCTURE_ERROR` | 1 | Chain unreachable, or transaction failed to land |

`UNDERFUNDED` exits 0 deliberately. It is a condition of the business, not a
malfunction of the scheduler, and it is already reported to the person who can
resolve it. Marking those runs red would train the operator to ignore red.

---

## Known limitations

Stated plainly, since they belong in the thesis rather than in a comment.

- **Single point of failure.** One centralised scheduler on one platform. The
  mitigation is architectural rather than operational: `runPayroll()` is
  permissionless, so if the scheduler stops, anyone — the employer, an
  employee — can trigger the cycle. Availability degrades; payment does not
  become impossible. A decentralised keeper network is explicitly out of scope.
- **Missed cycles are not caught up.** The contract executes one cycle per
  call. If two intervals elapse while the scheduler is down, the next tick pays
  one cycle, not two. Documented as a known limitation of the contract.
- **Alert de-duplication is time-based, not state-based.** Underfunding may go
  unreported for up to twelve hours with the default `ALERT_HOURS_UTC`. This is
  the price of holding no state; narrow the gap by adding hours.
- **Sepolia only.** `config.ts` pins the chain. Mainnet deployment is out of
  scope for this work.
