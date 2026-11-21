# token-radar-01 — entry v1 notes (STF-08, 2026-11-21)

Built to `../CAMPAIGN.md` as the spec. No submission, sign-in or wallet action was taken;
this package is for STF-08 certification and the STF-05 filing that follows it.

## What the entry does

`main.ts` reads the sealed snapshot (758 protocols, as_of 2026-11-14) and, at run time:
classifies every protocol (416 live / 40 watchlist / 158 below-floor candidates / 144 set
aside with a stated reason); fits a comps regression (log10 market cap on snapshot figures)
on the 128 protocols whose token trades with a recorded market cap; picks its term groups by
a two-fold held-out ablation; computes token odds per age x size bucket; derives rank ranges
from 200 seeded bootstrap refits; writes a 198-row board, each row with a 7-step farm plan
costed in dollars and weeks and a FARM / THIN / SKIP verdict (33 / 30 / 135).

## Verification numbers (all local, this session)

- **Gate replica (the sealed scorer's 7 rows, re-implemented from RULES.txt): 7/7 PASS** —
  dashboard_files (3 files, 14,939 bytes, no network addresses), board_file (198 rows),
  sorted_by_value, coverage 40/40, farm_steps (all rows 3–12 steps, 20–600 chars trimmed),
  screenshots (3 JPEG, see below), dossier_matches (rebuilt dossier byte-identical).
- **Kit `check --worktree`**: competition_open pass, snapshot pass, license_osi pass,
  entrypoint pass; the only fail is `transcripts_present` (no bundle exists yet — the bundle
  is a submit-stage artefact for STF-05); intake rows report `submission` (read at submit).
- **Determinism**: two full runs produce byte-identical board.json, data.js, dossier.json,
  dashboard/ and screenshots/ (sha256 compared). Run time ~0.6 s a run locally.
- **Sizes**: dashboard source 14,939 bytes total (judge text cap 65,536 — read whole);
  screenshots 148,595 / 142,958 / 134,441 bytes at 1320x917 JPEG; **dossier.json 584,123
  bytes** — under the campaign target of 650 KB and under the dev leader's 780,687.
- **Held-out harness** (entry's own lib, `../work/harness.mjs`): ablation median |log10
  error| / Spearman rho, fold A (slug-hash) and fold B (walk-forward on listed_at):
  tvl 0.542/0.406 + 0.715/0.369; tvl+growth 0.621/0.360 + 0.711/0.393; tvl+age 0.577/0.395 +
  0.711/0.354; tvl+growth+age 0.609/0.381 + 0.709/0.356; **tvl+category 0.539/0.406 +
  0.681/0.352 (chosen)**; tvl+growth+age+category 0.612/0.374 + 0.666/0.297. Growth and age
  terms made held-out error worse on both folds, so the model drops them and the dashboard
  prints the table saying so; age still enters through the token-odds buckets. Calibration
  factor 1.125. Typical held-out miss is ~0.54–0.68 log10 (a factor of ~3.5–4.8) — that is
  the honest precision of comps on this snapshot.
- **Judge proxy** (in-session, the official judge prompt applied in order, this entry vs the
  unmodified starter = house dashboard #2; starter dossier 705,011 bytes, 200 rows, values
  from hand-set MODEL constants): criteria 1, 3, 4 edge to this entry (full 758 accounting
  with reasons; costed verdicts; more filters + validation panel); **criterion 2 decides it**
  — fitted-at-runtime model with a published held-out record vs fixed constants. Verdict:
  this entry wins, **margin 3** (the campaign's v1 bar). This is a self-assessment with the
  official prompt, not the real judge; the real dev rating only exists after STF-05 submits.

## Recipe implemented (the leaders' playbook, per CAMPAIGN.md section 2)

Comps fit on traded tokens (128) · held-out results displayed on the page · token odds from
peers · costed farm verdict per row · integrity strip accounting for 758/758 · rank ranges
from 200 refits. All fitting happens inside main.ts at run time from the snapshot itself —
no per-protocol name or number is hardcoded anywhere in the entry.

## Known gaps for v2

1. Held-out error is large in absolute terms; a richer comps set (chain count, category
   hierarchy, TVL concentration) may earn its place in the ablation — test, don't assume.
2. Growth/age hurt the value fit but the judge's criterion 2 names them; v2 could carry a
   secondary "momentum watch" column that uses them without polluting the fitted value.
3. Farm economics rest on two stated assumptions (5% community allocation, 0.1% one-wallet
   share); v2 should sensitivity-test verdicts under 1%/10% allocations on the page.
4. Screenshots sit at 1320x917 to hold the dossier at 584 KB; if v2's source grows, the
   screenshot budget shrinks first (dossier tie-break rewards smaller).
5. The board's top is dominated by Risk Curators / capital allocators with very large TVL;
   a curator-specific comps check belongs in the v2 ablation list.

## Package

main.ts · lib/model.ts · lib/farm.ts · vendor/makefun-board.ts (kit file, unmodified,
sha256 9ca51b6e…) · dashboard/{index.html, app.css, app.js} · screenshots/{1-board,
2-detail, 3-filtered}.jpg · LICENSE (MIT) · README.md (OWNER/REPO and REFERRAL_CODE_HERE
placeholders for STF-05) · notes.md (this file). Build evidence (harness, gate replica,
screenshot script, run outputs) lives in `../work/`.
