// A 4-digit PIN of distinct-enough digits; the API enforces the real rule,
// the input only gates the submit.
export function isValidPin(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

export function pinsMatch(a: string, b: string): boolean {
  return isValidPin(a) && a === b;
}
