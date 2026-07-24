"use client";

// Settings → Account — the per-teacher identity & startup surface.
//
// Sections (top to bottom):
//   1. Display name        — the name behind the top-bar avatar initials
//                            and presence. USER-scoped.
//   2. Default view        — which planner view the app opens on
//                            (/weekly, /daily, /year, /subject). USER-scoped.
//   3. Completion privacy  — whether teammates can see this teacher's
//                            done-marks. USER-scoped; enforced when the
//                            realtime wave lands (Phase 1B).
//   4. Sign-in & account   — explainer + disabled Sign out. Sign-in
//                            arrives with the Supabase wave (Phase 1B).
//
// Everything on this page is PERSONAL — no card here changes anything for
// a teammate (the mirror image of Settings → Curriculum, which is all
// team-scoped). Each card carries scope="personal" so the chip says so.
//
// Persistence today is localStorage via lib/use-account-settings.ts
// (`mycurricula:user:*`); the values migrate to per-teacher profile
// columns when Supabase lands. Each card wires `savedTick` so the header
// flashes a "Saved" chip after every successful persist — settings have
// no Save buttons, so the chip is the only confirmation a change landed.
//
// Tooltip rule (CLAUDE.md §4): every interactive control carries an
// onboarding-voice tooltip. Inputs use `title=` + the Tooltip primitive;
// Buttons use the `tooltip` prop; option radios opt in to dismissibility
// via tooltipId. All personal-scope → none are `required`.

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  deriveInitials,
  useCompletionPrivacy,
  useDefaultView,
  useDisplayName,
  type CompletionPrivacy,
  type DefaultViewRoute,
} from "@/lib/use-account-settings";
import { useAppState } from "@/lib/app-state";
import { Button, PageHeader, Tooltip } from "@/components/ui";
import { SettingsCard, RadioDot } from "@/components/appearance/settings-card";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import reveal from "@/components/settings/section-reveal.module.css";
import styles from "./page.module.css";

// ── Page ────────────────────────────────────────────────────────────────────

export default function AccountSettingsPage(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={`${styles.inner} ${reveal.reveal}`}>
        <PageHeader
          eyebrow="Settings"
          title="Account"
          subtitle="Your name, startup view, and privacy — settings that are yours alone."
        />

        <ProfileSection />
        <DefaultViewSection />
        <CompletionPrivacySection />
        <SignInSection />
      </div>
    </div>
  );
}

// ── Shared radio-card grid ──────────────────────────────────────────────────
// The RadioDot + label + description option card from the Appearance
// pickers (theme-picker.tsx), generalized for this page's two choice
// sections. Selected state keys off aria-checked so the accessibility
// attribute IS the styling hook; cp-focusable supplies the global
// focus-visible ring.

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  desc: string;
  /** Onboarding-voice tooltip — what picking this option ACCOMPLISHES. */
  tooltip: string;
  /** Stable W2-B3 dismissibility id. */
  tooltipId: string;
}

function ChoiceGrid<T extends string>({
  ariaLabel,
  options,
  value,
  onSelect,
}: {
  ariaLabel: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}): ReactNode {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={styles.options}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Tooltip
            key={opt.value}
            content={opt.tooltip}
            side="top"
            tooltipId={opt.tooltipId}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(opt.value)}
              title={opt.tooltip}
              className={`${styles.option} cp-focusable`}
            >
              <RadioDot selected={selected} />
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{opt.label}</span>
                <span className={styles.optionDesc}>{opt.desc}</span>
              </span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

// ── Section 1 — Display name ────────────────────────────────────────────────
// Text input bound to the stored display name + a live avatar preview so
// the teacher sees the exact initials chip the top bar will show. Saves
// on blur or Enter (matches the curriculum-label idiom); clearing the
// field falls back to the account default name.

function ProfileSection(): ReactNode {
  // The account-default name — the signed-in teacher's auth-profile name
  // once the session resolves, or the mock ME teacher on the backend-less
  // path. Passing it into useDisplayName means a teacher with no stored
  // display name sees THEIR name here, not a fabricated mock person.
  const { accountDefaultName } = useAppState();
  const { displayName, setDisplayName } = useDisplayName(accountDefaultName);
  const [savedTick, setSavedTick] = useState(0);

  // Local draft — independent during typing; re-syncs whenever the hook
  // value updates (cross-tab rename, post-mount storage sync, the auth
  // session resolving into a new accountDefaultName) — but NEVER while the
  // teacher is mid-edit. Without the dirty guard, the Supabase session
  // resolving a second or two after load would swap the fallback name under
  // an in-progress keystroke and silently discard the unsaved edit (§4a
  // review finding). The guard clears on commit (blur/Enter), so external
  // updates resume flowing once the edit lands.
  const [draft, setDraft] = useState<string>(displayName);
  const draftDirty = useRef(false);
  useEffect(() => {
    if (!draftDirty.current) setDraft(displayName);
  }, [displayName]);

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    draftDirty.current = true;
    setDraft(e.target.value);
  };

  // Commit on blur — only when the trimmed value differs from the stored
  // one, so blurring without edits never flashes a phantom "Saved".
  // Clearing an already-default field is also a no-op.
  const onBlur = (): void => {
    // The edit is over either way — resume syncing external updates.
    draftDirty.current = false;
    const trimmed = draft.trim();
    if (trimmed === displayName) return;
    if (trimmed === "" && displayName === accountDefaultName) return;
    setDisplayName(trimmed);
    setSavedTick((t) => t + 1);
  };

  // Enter commits via the same blur path (one code path for both ways
  // of saving keeps the no-op guards in one place).
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  // Live preview reflects the DRAFT (not the persisted value) so the
  // teacher sees the initials change keystroke by keystroke. An empty
  // draft previews the fallback — exactly what clearing would produce.
  const effectiveName =
    draft.trim() === "" ? accountDefaultName : draft.trim();
  const initials = deriveInitials(effectiveName);

  const inputTip =
    "Type the name your teammates should see — it sets your top-bar avatar initials and how you appear in presence and comments. Saves when you press Enter or click out of the field.";

  return (
    <SettingsCard
      glyph={SECTION_ICONS.account({ size: 14 })}
      tone="teal"
      eyebrow="Account"
      scope="personal"
      anchorId="profile"
      savedTick={savedTick}
      title={
        <Tooltip
          content="The name behind your avatar — your top-bar initials, presence, and comments all use it. Yours alone; teammates never see a change to anyone's plan."
          side="bottom"
        >
          <span>Display name</span>
        </Tooltip>
      }
      hint="Where your name and initials appear — the top-bar avatar, presence indicators, and anywhere the app shows who did what."
    >
      <div className={styles.profileRow}>
        <div className={styles.formRow}>
          <label htmlFor="account-display-name" className={styles.fieldLabel}>
            Name
          </label>
          <Tooltip content={inputTip} side="bottom">
            <input
              id="account-display-name"
              name="displayName"
              type="text"
              value={draft}
              onChange={onChange}
              onBlur={onBlur}
              onKeyDown={onKeyDown}
              placeholder={accountDefaultName}
              autoComplete="off"
              spellCheck={false}
              maxLength={60}
              title={inputTip}
              className={styles.textInput}
            />
          </Tooltip>
          <p className={styles.fieldHint}>
            Saves when you press Enter or click out of the field. Clear it to go
            back to your account&rsquo;s default name.
          </p>
        </div>

        {/* Live avatar preview — the same dawn-gradient circle the top bar
            renders, so what the teacher sees here is what the chrome shows. */}
        <div className={styles.preview} aria-live="polite">
          <span className={styles.avatarCircle} aria-hidden="true">
            {initials}
          </span>
          <span className={styles.previewText}>
            <span className={styles.previewName}>{effectiveName}</span>
            <span className={styles.previewCaption}>
              Your avatar in the top bar
            </span>
          </span>
        </div>
      </div>
    </SettingsCard>
  );
}

// ── Section 2 — Default view ────────────────────────────────────────────────
// Radio-card picker for the route the app opens on. The root path (/)
// reads the same stored value (app/page.tsx) and forwards there.

const DEFAULT_VIEW_OPTIONS: readonly ChoiceOption<DefaultViewRoute>[] = [
  {
    value: "/weekly",
    label: "Weekly",
    desc: "The week's lessons in a grid or list.",
    tooltip:
      "Start the app on the Weekly view — the whole week's lessons at a glance. Only changes where the app opens for you.",
    tooltipId: "account-default-view-weekly",
  },
  {
    value: "/daily",
    label: "Daily",
    desc: "One day's lessons with full detail.",
    tooltip:
      "Start the app on the Daily view — a single day's lessons with the lesson-detail pane ready to teach from. Only changes where the app opens for you.",
    tooltipId: "account-default-view-daily",
  },
  {
    value: "/year",
    label: "Yearly",
    desc: "The whole year — units, weeks, lessons, and standards by subject.",
    tooltip:
      "Start the app on the Yearly view — the roadmap of every unit across the school year, drilling into weeks, lessons, and standards (the Curriculum view now lives here). Only changes where the app opens for you.",
    tooltipId: "account-default-view-year",
  },
] as const;

function DefaultViewSection(): ReactNode {
  const { defaultView, setDefaultView } = useDefaultView();
  const [savedTick, setSavedTick] = useState(0);

  const onSelect = (route: DefaultViewRoute): void => {
    if (route === defaultView) return; // re-picking the current choice is a no-op
    setDefaultView(route);
    setSavedTick((t) => t + 1);
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.account({ size: 14 })}
      tone="teal"
      eyebrow="Startup"
      scope="personal"
      anchorId="default-view"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Pick which view the app opens on when you visit MyCurricula. A personal preference — every teammate picks their own."
          side="bottom"
        >
          <span>Default view</span>
        </Tooltip>
      }
      hint="The view the app opens on when you arrive. Pick the surface you reach for first each morning."
    >
      <ChoiceGrid
        ariaLabel="Default view"
        options={DEFAULT_VIEW_OPTIONS}
        value={defaultView}
        onSelect={onSelect}
      />
    </SettingsCard>
  );
}

// ── Section 3 — Completion privacy ──────────────────────────────────────────
// Two-option choice for who sees this teacher's done-marks. Recorded now;
// ENFORCED when realtime collaboration lands (Phase 1B) — the hint says
// so explicitly so nobody mistakes the toggle for live privacy today.

const COMPLETION_PRIVACY_OPTIONS: readonly ChoiceOption<CompletionPrivacy>[] = [
  {
    value: "shared",
    label: "Shared",
    desc: "Teammates can see which lessons you've marked done.",
    tooltip:
      "Let teammates see which lessons you've marked done — useful for keeping the team's pacing in step. Takes full effect when realtime collaboration lands (Phase 1B).",
    tooltipId: "account-completion-privacy-shared",
  },
  {
    value: "private",
    label: "Private",
    desc: "Only you see your done-marks.",
    tooltip:
      "Keep your done-marks to yourself — teammates won't see your completion status. Enforced once realtime collaboration lands (Phase 1B).",
    tooltipId: "account-completion-privacy-private",
  },
] as const;

function CompletionPrivacySection(): ReactNode {
  const { privacy, setPrivacy } = useCompletionPrivacy();
  const [savedTick, setSavedTick] = useState(0);

  const onSelect = (next: CompletionPrivacy): void => {
    if (next === privacy) return; // re-picking the current choice is a no-op
    setPrivacy(next);
    setSavedTick((t) => t + 1);
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.account({ size: 14 })}
      tone="teal"
      eyebrow="Privacy"
      scope="personal"
      anchorId="completion-privacy"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Choose who sees which lessons you've marked done. Your preference is saved now and enforced when realtime collaboration lands (Phase 1B)."
          side="bottom"
        >
          <span>Completion privacy</span>
        </Tooltip>
      }
      hint="Who can see your lesson done-marks. Your choice is saved now — enforcement arrives when realtime collaboration lands (Phase 1B)."
    >
      <ChoiceGrid
        ariaLabel="Completion privacy"
        options={COMPLETION_PRIVACY_OPTIONS}
        value={privacy}
        onSelect={onSelect}
      />
    </SettingsCard>
  );
}

// ── Section 4 — Sign-in & account ───────────────────────────────────────────
// Explainer card. There is no session to sign out of in the Phase 1A
// prototype — the app runs on this device's local profile — so the Sign
// out button renders disabled with a tooltip explaining WHY (CLAUDE.md §4:
// a disabled control's tooltip explains why it's disabled). The Button
// primitive's tooltip prop handles the disabled-button hover quirk.

function SignInSection(): ReactNode {
  return (
    <SettingsCard
      glyph={SECTION_ICONS.account({ size: 14 })}
      tone="teal"
      eyebrow="Account"
      scope="personal"
      anchorId="sign-in-out"
      title={
        <Tooltip
          content="Where signing in and out will live. Today the app runs on this device's local profile — Google sign-in for your school account arrives with the Supabase wave (Phase 1B)."
          side="bottom"
        >
          <span>Sign-in &amp; account</span>
        </Tooltip>
      }
      hint="How the app knows who you are — and where signing out will live once accounts arrive."
    >
      <p className={styles.explainer}>
        Today the app runs on this device&rsquo;s local profile — your name,
        preferences, and plans are stored in this browser. School-account
        sign-in (and syncing across devices) arrives with the Supabase wave in
        Phase&nbsp;1B.
      </p>
      <div className={styles.signRow}>
        <Button
          variant="secondary"
          size="md"
          disabled
          tooltip="Sign out is disabled because there's no signed-in account yet — the app runs on this device's local profile. Sign-in (and sign-out) arrive with the Supabase wave in Phase 1B."
          tooltipSide="bottom"
        >
          Sign out
        </Button>
      </div>
    </SettingsCard>
  );
}
