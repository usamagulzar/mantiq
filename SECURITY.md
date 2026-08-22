# Security Policy

## Our Approach to Security

Mantiq is a **fully client-side, static web application**. It has no backend server, no
database, no user accounts, and no network calls beyond loading its own static assets. All
computation — parsing, minimization, simulation — happens locally in the user's browser via
WebAssembly. This significantly limits the attack surface compared to a typical web app, but
it is not zero, and we take reports seriously.

Relevant areas of concern include (but are not limited to):

- Cross-site scripting (XSS) via unsanitized rendering of user-provided expressions
- Content Security Policy (CSP) bypasses
- Service Worker cache-poisoning or scope issues
- Supply-chain risks in third-party assets (e.g. `three.min.js`)
- Vulnerabilities in the compiled WebAssembly engine (`wasm/`) that could lead to memory
  corruption reachable from untrusted input

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` | ✅ |
| Older tagged releases | ❌ (please upgrade) |

As a static site with no dependency lockfile to patch, security fixes are delivered by
updating to the latest version of `main` / the latest release.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately using one of the following methods:

1. **Preferred:** Open a [GitHub Security Advisory](../../security/advisories/new) for this
   repository (Security tab → "Report a vulnerability"). This creates a private discussion
   thread visible only to maintainers until a fix is ready.
2. **Alternative:** Email the maintainers at **hello@usamagulzar.dev** with a clear
   description of the issue.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce, including a minimal example expression or input if relevant
- The browser/OS combination you tested on
- Any suggested remediation, if you have one

### What to Expect

- We aim to acknowledge new reports within **5 business days**.
- We'll work with you to understand and validate the issue, and to agree on a disclosure
  timeline once a fix is available.
- We ask that you give us a reasonable opportunity to fix the issue before any public
  disclosure, and that you do not access, modify, or exfiltrate data belonging to others while
  investigating.

We're grateful to everyone who helps keep Mantiq and its users safe.
