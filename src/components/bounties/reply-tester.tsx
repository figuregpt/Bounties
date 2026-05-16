/**
 * Back-compat shim. The implementation moved to
 * `text-action-tester.tsx` in Phase 6.3 — reply and quote both use it.
 * This module just re-exports `ReplyTester` so existing imports keep
 * working without churn.
 */
export { ReplyTester } from "./text-action-tester";
