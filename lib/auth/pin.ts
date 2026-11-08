export const PIN_ATTEMPTS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;

export type PinGuard = {
  failures: number;
  lockedUntil: string | null;
};

export type PinDecision =
  | { ok: true; guard: PinGuard }
  | {
      ok: false;
      status: 400 | 401 | 423;
      reason: "format" | "locked" | "mismatch";
      guard: PinGuard;
      remaining: number;
    };

export function pinShapeOk(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export function decidePin(guard: PinGuard, pin: string, matches: boolean, now: Date): PinDecision {
  const lockedUntilMs = guard.lockedUntil ? new Date(guard.lockedUntil).getTime() : 0;
  let failures = guard.failures;
  if (lockedUntilMs > now.getTime()) {
    return { ok: false, status: 423, reason: "locked", guard, remaining: 0 };
  }
  if (lockedUntilMs > 0 && lockedUntilMs <= now.getTime()) failures = 0;

  const open: PinGuard = { failures, lockedUntil: null };
  if (!pinShapeOk(pin)) {
    return { ok: false, status: 400, reason: "format", guard: open, remaining: PIN_ATTEMPTS - failures };
  }
  if (matches) return { ok: true, guard: { failures: 0, lockedUntil: null } };

  failures += 1;
  if (failures >= PIN_ATTEMPTS) {
    return {
      ok: false,
      status: 423,
      reason: "locked",
      guard: { failures, lockedUntil: new Date(now.getTime() + PIN_LOCK_MS).toISOString() },
      remaining: 0,
    };
  }
  return {
    ok: false,
    status: 401,
    reason: "mismatch",
    guard: { failures, lockedUntil: null },
    remaining: PIN_ATTEMPTS - failures,
  };
}
