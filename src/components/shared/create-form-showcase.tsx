"use client";

import { useState } from "react";
import { FormSection } from "@/components/ui/form-section";
import { TagInput } from "@/components/ui/tag-input";
import { ActionToggles } from "@/components/bounties/create/action-toggles";
import { DistributionPicker } from "@/components/bounties/create/distribution-picker";
import { DurationPicker } from "@/components/bounties/create/duration-picker";
import { EligibilityFiltersBuilder } from "@/components/bounties/create/eligibility-filters-builder";
import { LivePreviewCard } from "@/components/bounties/create/live-preview-card";
import { TextActionRulesBuilder } from "@/components/bounties/text-action-rules-builder";
import { TextActionTester } from "@/components/bounties/text-action-tester";
import {
  RewardSection,
  type RewardMode,
  type TokenOption,
} from "@/components/bounties/create/reward-section";
import {
  defaultCreateBountyValues,
  type CreateBountyInput,
  type DurationHours,
} from "@/lib/validation/bounty";

/* ──────────────────────────────────────────────────────────────────────────
   /design-system showcase for Phase 6 form sections.

   Each sub-component is wired against a single shared `CreateBountyInput`
   state so callers can iterate visuals and watch the live preview
   respond on the right.
   ────────────────────────────────────────────────────────────────────────── */

export function CreateFormShowcase() {
  const [form, setForm] = useState<CreateBountyInput>(() =>
    defaultCreateBountyValues({
      actionConfig: {
        like: false,
        retweet: true,
        follow: { required: false, targetHandle: "" },
        reply: {
          required: true,
          rules: {
            mustContainAll: ["$BNTY"],
            forbidden: ["airdrop"],
            minLength: 12,
            minWordCount: 3,
            matchType: "word",
          },
        },
        quote: {
          required: true,
          rules: {
            mustContainAll: ["#bountiesfm"],
            forbidden: [],
            minLength: 0,
            minWordCount: 0,
            matchType: "word",
          },
        },
      },
    }),
  );
  const [token, setToken] = useState<TokenOption | null>(null);
  const [rewardMode, setRewardMode] = useState<RewardMode>("per_hunter");
  const [tagDemo, setTagDemo] = useState<string[]>(["alpha", "memecoin"]);

  const patch = (next: Partial<CreateBountyInput>) =>
    setForm((p) => ({ ...p, ...next }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <FormSection
          step={1}
          title="Tag input · variants"
          helper="Reusable keyword input used in the reply rules section."
        >
          <div className="space-y-3">
            <TagInput
              value={tagDemo}
              onChange={setTagDemo}
              placeholder="Add keywords…"
              variant="lavender"
            />
            <TagInput
              value={["scam", "rug"]}
              onChange={() => {}}
              placeholder="Forbidden"
              variant="amber"
            />
            <TagInput
              value={["one", "two", "three"]}
              onChange={() => {}}
              placeholder="Neutral"
              variant="neutral"
            />
          </div>
        </FormSection>

        <FormSection
          step={2}
          title="Action toggles"
          complete={
            form.actionConfig.retweet ||
            form.actionConfig.reply.required ||
            form.actionConfig.follow.required ||
            form.actionConfig.quote.required
          }
        >
          <ActionToggles
            value={form.actionConfig}
            onChange={(next) => patch({ actionConfig: next })}
          />
        </FormSection>

        <FormSection
          step={3}
          title="Reply rules"
          helper="Same rules engine as the live tester on /bounties/[slug]."
        >
          <TextActionRulesBuilder
            value={form.actionConfig.reply.rules}
            onChange={(next) =>
              patch({
                actionConfig: {
                  ...form.actionConfig,
                  reply: { ...form.actionConfig.reply, rules: next },
                },
              })
            }
          />
          <div className="mt-5">
            <TextActionTester
              rules={form.actionConfig.reply.rules}
              kind="reply"
            />
          </div>
        </FormSection>

        <FormSection
          step="3b"
          title="Quote tweet rules"
          helper="Shared TextActionRulesBuilder — same shape, different action."
        >
          <TextActionRulesBuilder
            value={form.actionConfig.quote.rules}
            onChange={(next) =>
              patch({
                actionConfig: {
                  ...form.actionConfig,
                  quote: { ...form.actionConfig.quote, rules: next },
                },
              })
            }
          />
          <div className="mt-5">
            <TextActionTester
              rules={form.actionConfig.quote.rules}
              kind="quote"
            />
          </div>
        </FormSection>

        <FormSection step={4} title="Reward section" complete>
          <RewardSection
            token={token}
            tokenLoading={false}
            tokenError={null}
            onTokenRetry={() => setToken(null)}
            rewardPerHunter={form.rewardPerHunter}
            maxHunters={form.maxHunters}
            mode={rewardMode}
            onPerHunterChange={(v) => patch({ rewardPerHunter: v })}
            onMaxHuntersChange={(v) => patch({ maxHunters: v })}
            onModeChange={setRewardMode}
          />
        </FormSection>

        <FormSection step={5} title="Eligibility filters">
          <EligibilityFiltersBuilder
            value={form.eligibilityFilters}
            onChange={(next) => patch({ eligibilityFilters: next })}
          />
        </FormSection>

        <FormSection step={6} title="Distribution model" complete>
          <DistributionPicker
            value={form.distributionModel}
            onChange={(next) => patch({ distributionModel: next })}
          />
        </FormSection>

        <FormSection step={7} title="Duration" complete>
          <DurationPicker
            value={form.durationHours as DurationHours}
            onChange={(next) => patch({ durationHours: next })}
          />
        </FormSection>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <LivePreviewCard
          tweet={null}
          authorAvatarUrl={null}
          actions={form.actionConfig}
          rewardSymbol={token?.symbol ?? "—"}
          rewardTokenCategory={token?.category ?? "other"}
          rewardPerHunter={form.rewardPerHunter}
          rewardPerHunterUsd={form.rewardPerHunterUsd}
          maxHunters={form.maxHunters}
          durationHours={form.durationHours}
        />
      </aside>
    </div>
  );
}
