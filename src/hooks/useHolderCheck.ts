"use client";

import { useEffect, useState } from "react";

/**
 * Resolves the "Wallet holdings" eligibility row on the bounty detail
 * page. The on-chain RPC call lives on the server (see
 * /api/wallet/holds-token); this hook orchestrates the state machine
 * around it:
 *
 *   no_requirement  → bounty has no holder gate; render nothing.
 *   needs_wallet    → bounty has a gate, but the hunter hasn't
 *                     connected a wallet yet. Show a Connect-wallet CTA.
 *   checking        → request in flight.
 *   met / unmet     → final answer.
 *   error           → RPC blew up; fall back to allowing hunt — the
 *                     POST /api/claims path will re-check at slot
 *                     reservation time with a clean error.
 */

export type HolderRequirement = {
  mint: string;
  minAmount: number;
  decimals: number;
  symbol: string;
};

export type HolderCheckState =
  | { status: "no_requirement" }
  | { status: "needs_wallet" }
  | { status: "checking" }
  | { status: "met" }
  | { status: "unmet" }
  | { status: "error"; message: string };

export function useHolderCheck(args: {
  requirement: HolderRequirement | null;
  wallet: string | null;
}): HolderCheckState {
  const initialStatus: HolderCheckState = !args.requirement
    ? { status: "no_requirement" }
    : !args.wallet
      ? { status: "needs_wallet" }
      : { status: "checking" };
  const [state, setState] = useState<HolderCheckState>(initialStatus);

  const reqMint = args.requirement?.mint ?? null;
  const reqMin = args.requirement?.minAmount ?? null;
  const reqDec = args.requirement?.decimals ?? null;
  const wallet = args.wallet;

  useEffect(() => {
    if (!reqMint || reqMin == null || reqDec == null) {
      setState({ status: "no_requirement" });
      return;
    }
    if (!wallet) {
      setState({ status: "needs_wallet" });
      return;
    }

    let cancelled = false;
    setState({ status: "checking" });

    const params = new URLSearchParams({
      wallet,
      mint: reqMint,
      minAmount: String(reqMin),
      decimals: String(reqDec),
    });
    fetch(`/api/wallet/holds-token?${params.toString()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((body: { ok: boolean; holds?: boolean; error?: string }) => {
        if (cancelled) return;
        if (body.ok && typeof body.holds === "boolean") {
          setState({ status: body.holds ? "met" : "unmet" });
        } else {
          setState({
            status: "error",
            message: body.error ?? "Check failed",
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reqMint, reqMin, reqDec, wallet]);

  return state;
}
