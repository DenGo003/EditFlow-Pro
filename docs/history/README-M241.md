# EditFlow Pro UXP M2.4.1 — Connection retry fix

Fixes automatic connection when Premiere UXP returns `Network request failed` (rather than the earlier `Failed to fetch`). The connector first retries an authenticated GET; if still unreachable, it attempts the existing backend launcher, then rechecks authentication. The exception **does not** prove the backend is stopped; if network is denied by UXP or antivirus, the launcher cannot fix it. HTTP 401, permission errors and manifest denies are not treated as transient.

M2.4 AI Zoom / AI Coloring and previous Auto Sync, Auto Cut, Subtitles, Caption Studio remain unchanged. Network permission `domains: "all"` is unchanged and should be restricted when Premiere's working local-host matching format is confirmed.

Install using UXP Developer Tools: Unload old plugin, extract to a fresh folder, Add Plugin from uxp/manifest.json, Load. Click **Start & Connect** after selecting the pairing folder. Keep the backend window open. If it still fails, check the launcher output and verify the backend endpoint returns HTTP 401 without a token. This ZIP is a test build, not a tested Premiere deployment.
