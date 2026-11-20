// What a money modal does with an error code: clear the PIN, offer the PIN
// reset, go back for a new price, or just show the message.
export function pinErrorAction(code: string): "clear_pin" | "locked" | "new_price" | "show" {
  switch (code) {
    case "PIN_INCORRECT":
      return "clear_pin";
    case "PIN_LOCKED":
      return "locked";
    case "PRICE_CHANGED":
      return "new_price";
    default:
      return "show";
  }
}
