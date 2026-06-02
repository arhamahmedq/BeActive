// Returns true if the string is a valid IANA timezone identifier.
// Uses the Intl API which is built into Node 18+ and all modern browsers.
export function isValidIANATimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Returns the user's local calendar date as YYYY-MM-DD for a given UTC instant.
 * Uses Intl so DST, UTC offsets, and all IANA zone quirks are handled natively.
 * en-CA produces YYYY-MM-DD without further parsing.
 *
 * This is the single shared definition of "what local day is it for this user".
 * Both the streak engine (DailyCompletion.localDate) and the posts same-day
 * guard import it from here so they can never disagree about "today".
 */
export function toLocalDateStr(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}
