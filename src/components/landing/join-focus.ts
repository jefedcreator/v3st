// After a native jump to /#join, move focus into the closing form's email
// field. Next updates the hash once the navigation (or same-page scroll) has
// happened, and pushState fires no hashchange, so poll briefly for it.
export function focusJoinAfterJump(): void {
  const startedAt = performance.now();
  const focusJoin = () => {
    const field = document.getElementById("join-email");
    if (window.location.hash === "#join" && field) {
      field.focus({ preventScroll: true });
      return;
    }
    if (performance.now() - startedAt < 1500) window.setTimeout(focusJoin, 50);
  };
  window.setTimeout(focusJoin, 0);
}
