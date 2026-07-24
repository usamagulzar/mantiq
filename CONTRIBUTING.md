# Contributing to Mantiq

First off, thank you for considering contributing to Mantiq — whether that's a bug report, a
new feature, a documentation fix, or a design improvement. This document explains how to get
set up and how to submit changes effectively.

By participating in this project, you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Project Setup](#project-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Working on the WebAssembly Engine](#working-on-the-webassembly-engine)
- [Coding Conventions](#coding-conventions)
- [Commit Messages](#commit-messages)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Ways to Contribute

- 🐛 **Report bugs** using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- 💡 **Suggest features** using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
- 📝 **Improve documentation** — the README, in-app guides, or code comments.
- 🎨 **Improve UI/UX** — accessibility, responsiveness, and visual polish are always welcome.
- 🔧 **Fix bugs or implement features** — see open issues, especially those tagged
  `good first issue` or `help wanted`.

## Project Setup

Mantiq's UI layer requires **no build step** — it's plain HTML, CSS, and JavaScript served
statically.

```bash
# 1. Fork the repository, then clone your fork
git clone https://github.com/usamagulzar/mantiq.git
cd mantiq

# 2. Serve it locally with any static file server
python3 -m http.server 8080
# or
npx serve .

# 3. Open http://localhost:8080 in your browser
```

> **Why a local server and not just opening `index.html`?**
> The app loads its WebAssembly module and registers a Service Worker via `fetch`, both of
> which are blocked by browsers under the `file://` protocol. A local static server avoids
> this entirely.

## Project Structure

See the [Project Structure section of the README](README.md#-project-structure) for a full
directory breakdown. In short:

- `index.html` — app shell, view markup, and modals
- `css/` — design tokens and per-feature stylesheets
- `js/` — the vanilla JS UI layer (state, rendering, interaction)
- `wasm/` — the precompiled logic engine (see below)
- `icons/`, `fonts/`, `screenshots/` — static assets

## Making Changes

1. Create a branch from `main`:
   ```bash
   git checkout -b feature/short-description
   ```
2. Make your changes, testing in at least one Chromium-based browser and one WebKit-based
   browser (Safari) if your change touches layout, PWA behavior, or the Service Worker.
3. Verify the app still works **offline** after your change (reload with DevTools' "Offline"
   throttling enabled) if you touched anything under `js/`, `css/`, or `sw.js`.
4. Update the [CHANGELOG](CHANGELOG.md) under an `Unreleased` heading if your change is
   user-facing.

## Working on the WebAssembly Engine

The files in `wasm/` (`index.wasm`, `index.js`, `mantiq-worker.js`) are **build artifacts**
compiled from a separate C++ source tree using [Emscripten](https://emscripten.org/). This
repository intentionally ships only the compiled output so the app can run with zero build
tooling.

If your contribution requires changing the engine itself (parsing, minimization logic, proof
generation, Verilog codegen), please open an issue first to discuss the change — engine
contributions are coordinated separately from the web app source in this repo. UI-only
contributions never need to touch the WASM engine.

## Coding Conventions

- **JavaScript:** plain ES2020+, no framework, no bundler-specific syntax. Keep modules
  focused — follow the existing one-concern-per-file pattern (`kmap.js`, `circuit.js`, etc.).
- **CSS:** use the existing design tokens defined in `css/vars.css` (`--accent`, `--bg-primary`,
  `--text-secondary`, etc.) rather than hard-coded colors, so light/dark theming keeps working.
- **Formatting:** match the existing indentation and style of the file you're editing.
- **Accessibility:** preserve `aria-label`s, keyboard focus behavior, and semantic HTML when
  modifying interactive elements.
- **No new runtime dependencies** without discussion — Mantiq intentionally stays
  dependency-light. Open an issue before adding a library.

## Commit Messages

Write clear, imperative-mood commit messages:

```
Add K-Map support for 5-variable expressions
Fix truth table not updating after theme switch
Update README with deployment instructions
```

Conventional prefixes (`fix:`, `feat:`, `docs:`, `chore:`, `refactor:`) are welcome but not
required.

## Submitting a Pull Request

1. Push your branch and open a pull request against `main`, using the
   [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
2. Describe **what** changed and **why**, and link any related issues (`Closes #123`).
3. Include before/after screenshots or a short screen recording for any visual change.
4. Be responsive to review feedback — small, focused PRs are easiest to review and merge.

## Reporting Bugs

Please use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Steps to reproduce (ideally with the exact expression you typed)
- Expected vs. actual behavior
- Browser, OS, and whether you're using the installed PWA or the browser tab
- Screenshots, if the issue is visual

## Suggesting Features

Please use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) and
explain the problem you're trying to solve, not just the solution — this helps us evaluate
whether a feature fits Mantiq's scope as a lightweight, client-only logic tool.

---

Thanks again for helping make Mantiq better! 🎉
