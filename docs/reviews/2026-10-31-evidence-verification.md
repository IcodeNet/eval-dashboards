# Evidence verification hardening — 2026-10-31

Assistant-UI work is parked at the owner request. This local follow-up addresses
4F.25, found while inspecting the 4F.11 bundle verification acceptance criteria.

Reproduction: 9 of 18 initial validation cases failed before the fix. Null entries
and object/number contents threw TypeError; wrong digest algorithms and non-string
source paths could be accepted. The tests now pass with explicit shape validation
before hashing, without changing digests or valid exporter output.

Evidence: src/evidence/bundle.ts:145; test/evidence-bundle-validation.test.ts:15;
test/cli-evidence-export.test.ts:196. Focused command:
`pnpm exec vitest run test/evidence-bundle-validation.test.ts test/cli-evidence-export.test.ts`.
The post-fix run passed 35 tests before the final order-invariance case was added.
Full staged-tree checks and review are required before committing, with original
logs retained in the worktree Git directory's quality-evidence folder.

The audit also corrects two claims: sorted digests ignore entry order, and
embedding a signature does not authenticate it. 4F.11's original signed-bundle
requirement remains open; digest export/integrity checking is implemented. The
CLI distinguishes invalid/missing file input (exit 2) from a parsed bundle that
fails verification (exit 1). No eval-report/v1 fields, flags or workflows change.
