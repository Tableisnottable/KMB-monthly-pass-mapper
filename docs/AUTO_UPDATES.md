# Automatic Hong Kong data and website updates

Data refresh starts daily at 00:00 Hong Kong time (16:00 UTC on the previous UTC date). Timetables and adult/student fares refresh daily. Sunday runs also refresh bus stops, route alignments, schools and residents' service directories. Publishing follows validation and build completion, rather than finishing exactly at midnight. Other countries load their open-map data on demand and cache it for up to one day.

Downloads retry temporary failures. The job validates the complete refreshed snapshot, runs tests, builds the browser planner and verifies it before committing source data. KMB route-stop data is split into four files below 1 MB each; raw archives and generated application bundles stay out of Git.

## Preferred: Cloudflare's native GitHub connection

The user chose cloud builds so their PC can be off, without creating a GitHub Cloudflare API-token secret. Connect the existing Worker to `Tableisnottable/KMB-monthly-pass-mapper` in its Cloudflare Builds settings. Authorize only this repository when GitHub asks. Use production branch `main`, repository root `/`, build command `npm run cf:build`, and deploy command `npx wrangler deploy --config wrangler.jsonc`. The existing worker name in Wrangler configuration must stay `kmb-monthly-pass-mapper`.

Cloudflare then builds committed source changes and verified nightly data updates. This requires one interactive Cloudflare/GitHub authorization. Until that connection has been verified, local manual Wrangler deployment remains available. The temporary Codex midnight heartbeat is paused, and the token-based GitHub deployment workflow is disabled with `CLOUDFLARE_AUTO_DEPLOY=false`.

## Alternative: token-based GitHub deployment (disabled)

The `Deploy production website` workflow publishes verified `main` changes, and follows successful data-refresh runs. The `workflow_run` trigger is necessary because commits made with the Actions token do not trigger ordinary push workflows.

1. Create a Cloudflare custom API token with **Account / Workers Scripts / Edit** and **Account / Account Settings / Read**, restricted to the account that owns `kmb-monthly-pass-mapper`. Keep the token private.
2. Add it as the GitHub repository Actions secret `CLOUDFLARE_API_TOKEN`.
3. Set the repository variable `CLOUDFLARE_ACCOUNT_ID` to that account's ID.
4. Set the repository variable `CLOUDFLARE_AUTO_DEPLOY` to `true` and dispatch `deploy-production.yml` once to verify it.

The deployment job runs route/fare tests and browser-worker checks before using the token in the final deployment step. It has read-only GitHub permissions and deploys the existing Worker using `wrangler.jsonc`. Deployment remains disabled until explicitly configured. No paid data feed or new data-provider account is required.

Do not upload local Wrangler OAuth credentials to GitHub: their session and refresh tokens are intended for local sign-in, not this deployment workflow.
