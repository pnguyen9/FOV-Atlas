# FOV Atlas

Community database of perceived VR field of view. Static site on GitHub Pages, submissions as
GitHub issues processed by a GitHub Action. No server, ever.

## Commands

Node 22.23.5 via nvm (`nvm use`); the laptop's default node is too old.

- `npm run check`: lint (warnings fail), typecheck, unit tests with coverage thresholds, build.
- `npm run dev` / `npm run preview` (preview serves the built site with its CSP).

## Rules

- **Measuring tools are a hard partition.** Every stat, ranking and aggregate is per tool. Nothing
  is ever averaged, overlaid or converted across tools. Other attributes (face fit, tuning, gaze,
  IPD, cushion) are soft filters.
- **Security:** the site opens WebXR sessions on visitors' hardware. Keep the CSP in
  `src/contentSecurityPolicy.ts` strict (its test lists the forbidden sources); no inline
  scripts/styles, no `v-html`, no third-party hosts. Every parser of untrusted input (pasted links,
  issue bodies, imported JSON) validates length, shape and range, and rejects rather than repairs.
- **Tests:** every module in `src/lib` ships with unit tests covering each rejection path. Coverage
  thresholds live in `vite.config.ts`; don't lower them.
- **Dependencies:** install with `npm install --before=<date two weeks ago>`, exact versions.
- **GitHub Actions** (submission processing): issue bodies are attacker-controlled. Never put
  `${{ github.event.* }}` inside `run:`; pass through `env:` and parse in a script. Minimal
  `permissions:` per job, actions pinned by SHA.
- The mockup in `docs/mockup/index.html` is the reference for pages and navigation; it is not
  production code.
