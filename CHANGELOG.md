# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- In-app **About Mantiq** page, accessible from the Help FAB, giving a user- and
  student-facing overview of the app's features, quick-start steps, and links.
- Standard open-source repository documentation: `README.md`, `LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, and a pull request template.

## [2.0.0]

### Added
- Complete redesign: new premium modern design system with light/dark theming.
- Live circuit **Simulation** view with interactive input switches and real-time LED output.
- Auto-generated, interactive **Circuit Diagram** view.
- **Verilog** HDL export view.
- **Karnaugh Map (K-Map)** view with auto-grouping and prime implicant highlighting for
  2–5 variables, including `KMAP(n)` shorthand input syntax.
- **Truth Table** view with minterm/maxterm callouts.
- Step-by-step **Algebraic Proof** view naming every Boolean law applied.
- Alternative simplified solutions listing.
- Shareable-link generation for reproducing a specific expression and result.
- Guided product tour, Pro Tips, Learn Formats guide, and curated Examples library.
- Full **Progressive Web App** support: installable, offline-first via Service Worker
  precaching, custom app icons (including maskable variants), and install prompts for both
  Android/Desktop and iOS Safari.
- WebAssembly-powered logic engine (compiled from C++) running inside a dedicated Web Worker
  for non-blocking computation.

---

### Versioning Notes

Given this project has no prior published changelog, entries prior to `2.0.0` are not
individually itemized. Future releases should append new sections above, following the
`[MAJOR.MINOR.PATCH] - YYYY-MM-DD` heading convention, e.g.:

```
## [2.1.0] - 2026-08-01

### Added
- ...

### Fixed
- ...
```
