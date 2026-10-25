// Postcodes as typed: shared by the tools that look one up.

/** "sw1a1aa" -> { district: "SW1A", inward: "1AA", display: "SW1A 1AA" }, or null. */
export function parsePostcode(text) {
  const m = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/.exec(text.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  return m ? { district: m[1], inward: m[2], display: `${m[1]} ${m[2]}` } : null;
}
