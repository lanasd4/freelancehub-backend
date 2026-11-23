/**
 * Abuse limits from the brief. They are read from the environment at request
 * time so tests (and operators) can tune them; defaults are the brief's values.
 */
export function limits() {
  const n = (name: string, fallback: number) => {
    const v = Number(process.env[name]);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    loginPerMinute: n('LOGIN_LIMIT_PER_MINUTE', 5),
    registerPerHour: n('REGISTER_LIMIT_PER_HOUR', 3),
    proposalsPerDay: n('PROPOSALS_PER_DAY', 20),
  };
}
