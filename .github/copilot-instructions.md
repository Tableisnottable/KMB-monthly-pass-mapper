# Copilot Instructions — KMB Monthly Pass Mapper

Guidance for working effectively in this repository.

## Project

KMB-monthly-pass-mapper. The repo is currently a stub: `README.md` (title only) and `.github/github-app.yml` (automation config with `auto_issue_session` and `remote_control` enabled). There is no application code, build, test, or lint setup yet.

When code is added, document the stack, commands, and structure here.

## Task execution: small steps, auto commit and push

- Break every request into small, independently committable steps (one logical change per step). Finish and verify one step before starting the next.
- Automatically commit after each verified step with conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`) — do not ask for confirmation first.
- Automatically push to the current working branch after committing so work is backed up in the repo. Do not push directly to `main` — use the session branch and open a pull request for review.
- Never combine unrelated changes in one commit, and never leave finished work uncommitted at the end of a session.
- Exception — large files are never auto-committed: do not commit or push files larger than 10 MB or binary build artifacts (archives, datasets, model files, media). Leave them uncommitted and tell the user, so they can decide. Small text, config, and code changes always go through the automatic path above.
