// A Nigerian NUBAN account number: 10 digits.
export function isValidAccountNumber(v: string): boolean {
  return /^[0-9]{10}$/.test(v);
}
