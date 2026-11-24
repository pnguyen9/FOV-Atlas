# Security

FOV Atlas runs in the visitor's browser and, for its own measure, opens a WebXR session on their
headset. It has no server, no account system and no cookies.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability).
Please don't open a public issue for it.

## What the site does to protect visitors

- **Content Security Policy** (`src/contentSecurityPolicy.ts`): everything loads from the site itself;
  no inline script or style, no `eval`, no `data:`/`blob:` URLs, no third-party host, `form-action`
  and `base-uri` closed. Trusted Types are required, so DOM sinks only accept Vue's own policy.
- **No framing:** GitHub Pages can't send headers, so `frame-ancestors` and `Permissions-Policy` are
  unavailable. The app checks before mounting and, inside a frame, mounts only a notice, so no
  other page can embed it and lead someone into a VR session.
- **WebXR only on a click:** a VR session is only requested from an explicit button press, and the
  page reads only what the measure needs (view projections and transforms, the visibility mask).
- **Untrusted input is validated, never repaired:** pasted links and submission data go through
  strict parsers with length limits and range checks, each covered by unit tests of the rejections.
- **No raw HTML:** rendering goes through Vue templates; `v-html`, `innerHTML` and DOM queries fail
  the lint. The build fails if the published page loses its CSP or carries inline script or style.
- **Supply chain:** exact versions and a committed lockfile, install scripts disabled (`.npmrc`),
  Dependabot with a 14-day cooldown, GitHub Actions pinned by commit SHA, workflows read-only by
  default, and the build fails on any audit finding in shipped dependencies.
