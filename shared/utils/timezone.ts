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
