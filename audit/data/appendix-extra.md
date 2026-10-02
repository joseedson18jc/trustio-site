### 10.6 Image-link check

`python3 scripts/check_images.py` (run on the repo copy, after all files were written):

```
report image/screenshot links: 138 unique, missing: 0
friction-log entries: 47, screenshot refs: 72 unique, missing: 0, entries without screenshot: 0
exit code: 0
```

### 10.7 git status

```
$ git status
On branch main
Your branch is up to date with 'origin/main'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	audit/

nothing added to commit but untracked files present (use "git add" to track)

$ git status --porcelain --untracked-files=all | grep -v '^?? audit/' | wc -l    # entries outside audit/
0
$ git status --porcelain --untracked-files=all | grep -c '^?? audit/'            # untracked files under audit/ (this run + the earlier run)
329
$ git diff --stat | wc -l                                                        # tracked files changed
0
```

Nothing was staged, committed or pushed, and no file outside `audit/` was created or modified. **Incident, disclosed for transparency:** the first plain `git status` in the sandbox refreshed the index. Git created `.git/index.lock` but the sandbox did not allow it to delete the lock, which left an empty stale lock that would have blocked the next git command. With the owner's explicit permission, that one empty file was deleted. `git status` was then re-run with `GIT_OPTIONAL_LOCKS=0` (read-only; output above), and no lock remains. Staged content and the working tree are unchanged; the only effect on `.git/index` was git's routine stat-cache refresh.

### 10.8 Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Zero form submissions, zero Stripe input, each Stripe link opened at most once, stated explicitly | ✅ | Guardrail statement at the top; §2.4 ledger (7 links × 1); `data/guardrail-log.jsonl` (only analytics beacons aborted; 0 blocked-submit events) |
| `git status` at the end shows new files only under `audit/` | ✅ | §10.7 (0 entries outside `audit/`, 0 tracked changes) |
| All six journeys at both viewports; J1 and J3 also in light theme | ✅ | "Runs:" line under each journey in §3. J1 and J3 ran desktop/mobile × dark/light. J6 mobile covers the menu, tap targets and overflow; J6 desktop covers keyboard focus (sticky header in J1-05, overflow in discovery). J2-03 mobile is a logged guardrail stop |
| Every friction entry references at least one screenshot on disk; a script checks every image link | ✅ | §10.6: 47 entries, 0 missing, 0 without a screenshot |
| Maturity score broken down by rubric dimension with justification | ✅ | §1 table (7 dimensions, weights 20/15/20/15/10/10/10) |
| Matrix ≥ 15 items, ≥ 5 Quick Wins, every item tied to evidence | ✅ | §7: 23 items, 14 Quick Wins, each citing F-IDs that carry screenshots |
| Observed separated from inferred; no invented metrics | ✅ | O/I column in §3.7 and `friction-log.csv` (44 observed, 3 inferred). Every number is measured (DOM, axe, Lighthouse lab, pixel sampling) or quoted from the page; lab caveats are stated in §2.2 and §4.5. Nothing here is asserted false: unverifiable claims are labelled "needs verification" |
