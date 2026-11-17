// The app screens that should refresh for each user-event type. Anything else is
// not sent to the app stream at all.
export function customerAreasFor(type: string): string[] {
  if (type === "order.updated") return ["home", "cash", "activity"];
  if (type === "customer_order.updated") return ["home", "orders", "activity"];
  if (type === "investment.updated") return ["home", "holdings", "activity"];
  if (type.startsWith("strategy.")) return ["home", "earn", "activity"];
  if (type === "earning.recognized") return ["home", "earnings"];
  if (type === "notification.created") return ["notifications"];
  return [];
}
