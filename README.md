<div align="center">

<img src="icons/icon-192.png" alt="Mantiq logo" width="88" height="88" />

# Mantiq

### Turn Your Logic Into Life

**A fast, offline-first digital logic workbench — expression simplification, Karnaugh maps,
truth tables, interactive circuit simulation, and Verilog export, all in your browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8)](#-progressive-web-app)
[![WebAssembly](https://img.shields.io/badge/engine-WebAssembly-654FF0)](#-architecture)
[![Made with vanilla JS](https://img.shields.io/badge/frontend-vanilla%20JS-f7df1e)](#-tech-stack)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Live Demo](https://usamagulzar.github.io/mantiq) · [Report a Bug](../../issues/new?template=bug_report.md) · [Request a Feature](../../issues/new?template=feature_request.md) · [Documentation](#-table-of-contents)

<br/>

<img src="banner.jpg" alt="Mantiq banner" width="100%" />

</div>

<br/>

## Overview

**Mantiq** is a client-side digital logic design tool built for students, educators, and
engineers. Type a Boolean expression — or describe a Karnaugh map directly — and Mantiq
instantly gives you:

- the **minimized expression** (Sum of Products or Product of Sums),
- a **step-by-step algebraic proof** showing exactly which Boolean law was applied at every step,
- an auto-grouped, color-coded **Karnaugh map**,
- a complete **truth table** with minterm/maxterm callouts,
- an auto-generated, **interactive logic circuit diagram** you can simulate live, and
- clean, ready-to-use **Verilog HDL** output.

Everything runs **entirely on-device**. There is no backend, no account, and no telemetry —
your expressions never leave your browser. The core simplification engine (Quine–McCluskey
minimization, algebraic proof search, and code generation) is written in C++ and compiled to
**WebAssembly** for near-native performance, wrapped in a lightweight, dependency-free
vanilla JavaScript UI.

Mantiq is also a fully installable **Progressive Web App**, so it keeps working — Wi-Fi or not.

<br/>

## Table of Contents

- [Features](#-features)
- [Screenshots](#-screenshots)
- [Getting Started](#-getting-started)
  - [Use It Online](#use-it-online)
  - [Run It Locally](#run-it-locally)
  - [Install as an App](#install-as-an-app-pwa)
- [How to Use Mantiq](#-how-to-use-mantiq)
  - [Input Formats](#input-formats)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Tech Stack](#-tech-stack)
- [Progressive Web App](#-progressive-web-app)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Security](#-security)
- [FAQ](#-faq)
- [License](#-license)
- [Acknowledgements](#-acknowledgements)

<br/>

## ✨ Features

| | |
|---|---|
| 🧮 **Boolean Minimization** | Reduce any expression to its minimal SOP or POS form using the Quine–McCluskey algorithm, with all alternative minimal solutions listed side by side. |
| 📐 **Algebraic Proofs** | A guided, step-by-step derivation naming every law used — Idempotent, Absorption, Distribution, De Morgan's, Consensus, and more. |
| 🗺️ **Karnaugh Maps** | Auto-grouped, color-coded K-Maps for 2 to 5 variables, with prime implicant and don't-care highlighting. |
| 📋 **Truth Tables** | Instantly generated, fully interactive truth tables with minterm/maxterm indices. |
| 🔌 **Circuit Diagrams** | A clean, auto-routed logic gate schematic generated straight from your expression. |
| ⚡ **Live Simulation** | Flip input switches and watch signal states and output LEDs update in real time through the actual gate network. |
| 💻 **Verilog Export** | Generate ready-to-drop-in Verilog HDL from your simplified logic in one click. |
| 🌓 **Light & Dark Mode** | A polished interface that adapts to your system theme, with a manual override. |
| 📱 **Installable PWA** | Add Mantiq to your home screen and use it completely offline — no server round-trips, ever. |
| 🔗 **Shareable State** | Generate a link that reproduces your exact expression and result for classmates, colleagues, or your future self. |
| 🎓 **Guided Onboarding** | A built-in product tour, a format guide, and a curated example library for first-time users. |
| 🔒 **Private by Design** | 100% client-side computation. Nothing you type is ever sent anywhere. |

<br/>

## 📸 Screenshots

<div align="center">
<table>
<tr>
<td width="50%"><img src="screenshots/Screenshot (1).png" alt="Live simulation view" /><br/><sub align="center">Live Simulation</sub></td>
<td width="50%"><img src="screenshots/Screenshot (2).png" alt="Circuit diagram view" /><br/><sub>Auto-Generated Circuit Diagram</sub></td>
</tr>
<tr>
<td width="50%"><img src="screenshots/Screenshot (3).png" alt="Algebraic proof view" /><br/><sub>Step-by-Step Algebraic Proof</sub></td>
<td width="50%"><img src="screenshots/Screenshot (4).png" alt="Truth table view" /><br/><sub>Truth Table</sub></td>
</tr>
</table>
</div>

More screenshots are available in the [`/screenshots`](screenshots) directory.

<br/>

## 🚀 Getting Started

### Use It Online

The fastest way to try Mantiq is to open the hosted app in your browser:

**→ [usamagulzar.github.io/mantiq](https://usamagulzar.github.io/mantiq)**

*(Replace this link once the project is deployed — see [Deployment](#deployment) below.)*

### Run It Locally

Mantiq is a fully static site — no build step, no bundler, no package manager required to run
it. All you need is a local web server, since the app loads its WebAssembly module and Service
Worker via `fetch`, which most browsers block on the `file://` protocol.

```bash
# Clone the repository
git clone https://github.com/usamagulzar/mantiq.git
cd mantiq

# Serve the directory with any static file server, for example:
python3 -m http.server 8080
# or
npx serve .

# Then open:
# http://localhost:8080
```

That's it — no dependencies to install.

### Install as an App (PWA)

Once running (locally or via your live deployment), open Mantiq in a supported browser
(Chrome, Edge, or Safari) and:

- **Desktop:** click the install icon in the address bar, or use the in-app install prompt.
- **iOS Safari:** tap **Share → Add to Home Screen**.
- **Android Chrome:** tap the in-app **"Install App"** prompt, or use the browser menu.

Mantiq will then launch in its own window and work fully offline.

<br/>

## 📖 How to Use Mantiq

1. **Type an expression** into the input bar at the top — standard Boolean notation is
   supported (see [Input Formats](#input-formats) below).
2. **Watch it compute instantly.** Mantiq validates syntax live and simplifies as you type.
3. **Explore the views** from the sidebar:
   - **Simulation** — interact with a live gate-level simulation of your circuit.
   - **Diagram** — inspect the auto-generated schematic.
   - **Verilog** — copy or download generated HDL.
   - **KMAP** — see the grouped Karnaugh map.
   - **Truth Table** — view every input/output combination.
   - **Proofs** — walk through the algebraic simplification step by step.
4. **Share or export** your result using the share button, or export your circuit as Verilog.
5. Tap the **`?`** help button (bottom corner) any time for a guided tour, formatting tips, a
   library of examples, or the in-app **About** page.

### Input Formats

Mantiq accepts several common Boolean algebra notations. Operator precedence follows standard
convention: `NOT` > `AND` > `XOR` > `OR`.

| Operation | Accepted symbols |
|---|---|
| AND | `A·B`, `A*B`, `AB`, `A&B`, `A AND B` |
| OR | `A+B`, `A\|B`, `A OR B` |
| NOT | `A'`, `!A`, `~A`, `A̅`, `NOT A` |
| XOR | `A^B`, `A XOR B` |
| K-Map shorthand | `KMAP(3)`, `KMAP(W,X,Y,Z)`, `KMAP(a,b,c,d,e)` |

Open the **Learn Formats** guide from the in-app Help menu for a full interactive reference
with live examples, or check the **See Examples** panel to load ready-made expressions.

<br/>

## 🏗 Architecture

Mantiq is intentionally dependency-light and framework-free:

```
┌──────────────────────────────┐
│           index.html          │   Static shell, views, and modals
├──────────────────────────────┤
│     css/ (design system)      │   Themeable CSS custom-property tokens
├──────────────────────────────┤
│   js/ (vanilla JS UI layer)   │   Rendering, interaction, state, tutorials
│   ├─ app-core / ui-core       │
│   ├─ circuit / simulation     │
│   ├─ kmap / truth-table       │
│   ├─ solution-renderer        │
│   └─ worker-bridge            │──┐
├──────────────────────────────┤  │  postMessage bridge
│      wasm/ (logic engine)     │◄─┘
│  C++ → Emscripten → WASM      │   Expression parsing, Quine–McCluskey
│  running inside a Web Worker  │   minimization, proof search, codegen
└──────────────────────────────┘
```

The heavy computational work — parsing, minimization, proof derivation, K-Map grouping, and
Verilog generation — happens in a **C++ core compiled to WebAssembly**, executed inside a
**dedicated Web Worker** so the UI thread never blocks, even on large expressions. The
JavaScript layer is purely presentational: it renders whatever the engine returns and handles
user interaction, theming, onboarding, and persistence.

A **Service Worker** (`sw.js`) precaches the entire application shell — including the compiled
`.wasm` binary — so that after the first visit, Mantiq loads and runs with zero network
requests.

<br/>

## 📁 Project Structure

```
mantiq/
├── index.html              # App shell: layout, views, modals
├── manifest.json           # PWA manifest (icons, theme, metadata)
├── sw.js                   # Service worker — offline precaching
├── banner.jpg               # Social preview / README banner
│
├── css/
│   ├── vars.css             # Design tokens (colors, spacing, transitions)
│   ├── fonts.css            # Self-hosted font-face declarations
│   ├── layout.css           # App grid & shell layout
│   ├── topbar.css           # Top navigation & input bar
│   ├── panels.css           # Side panels
│   ├── solution.css         # Modals, proof/solution rendering
│   ├── views.css            # Per-view (Simulation/Diagram/etc.) styling
│   ├── kmap.css              # Karnaugh map grid styling
│   ├── about.css             # In-app About modal styling
│   └── responsive.css       # Breakpoints, mobile layout, Help FAB
│
├── js/
│   ├── app-core.js          # App bootstrap & global state
│   ├── ui-core.js           # Core UI rendering & DOM wiring
│   ├── worker-bridge.js     # Web Worker ↔ WASM messaging bridge
│   ├── circuit.js           # Circuit diagram generation & rendering
│   ├── simulation.js        # Live gate-level simulation logic
│   ├── kmap.js               # Karnaugh map rendering
│   ├── truth-table.js       # Truth table rendering
│   ├── solution-renderer.js # Algebraic proof rendering
│   ├── rule-modal.js        # Boolean law reference modal
│   ├── modals-events.js     # Modal open/close wiring
│   ├── tutorial.js          # Onboarding tour, tips, Help FAB
│   ├── zoom-pan.js          # Canvas/SVG zoom & pan controls
│   ├── svg-icons.js         # Inline icon library
│   └── three.min.js         # Three.js (3D rendering utilities)
│
├── wasm/
│   ├── index.wasm            # Compiled logic engine (C++ → WASM)
│   ├── index.js              # Emscripten glue/runtime
│   └── mantiq-worker.js      # Web Worker entry point
│
├── icons/                   # App icons (favicon → maskable PWA icons)
├── fonts/                   # Self-hosted web fonts
├── screenshots/             # README / store screenshots
│
├── .github/                 # Issue templates, PR template, CI workflow
├── LICENSE
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── CHANGELOG.md
```

<br/>

## 🧰 Tech Stack

| Layer | Technology |
|---|---|
| Logic engine | C++, compiled to **WebAssembly** via Emscripten |
| Concurrency | Dedicated **Web Worker** for all engine calls |
| UI | **Vanilla JavaScript** (ES2020+), no framework, no build step |
| Styling | Hand-authored **CSS** with custom-property design tokens, light/dark theming |
| 3D/graphics utilities | [Three.js](https://threejs.org/) |
| Offline support | **Service Worker** precaching (`sw.js`) |
| Distribution | **Web App Manifest** — installable as a Progressive Web App |

No React, no Webpack, no npm install required to run the app — just static files served over
HTTP.

<br/>

## 📲 Progressive Web App

Mantiq ships with a complete PWA setup:

- `manifest.json` defines the app name, icons (including maskable variants), theme colors, and
  screenshots used by browser install prompts and app stores.
- `sw.js` implements a cache-first strategy that precaches the full application shell —
  HTML, CSS, JS, fonts, and the WebAssembly binary — on install, and serves everything from
  cache afterward.
- The app detects and prompts for installation on supported platforms, with dedicated
  instructions for iOS Safari (which does not support the native install prompt).

Because computation never leaves the device, Mantiq works identically whether you're online,
offline, or anywhere in between.

<br/>

## 🗺 Roadmap

- [ ] Multi-output expression support (combinational logic with several outputs at once)
- [ ] Sequential logic primitives (flip-flops, latches, basic FSM support)
- [ ] Exportable circuit diagrams (SVG/PNG)
- [ ] Additional HDL export targets (VHDL)
- [ ] Localized UI (i18n)
- [ ] Classroom/shared-session mode

Have an idea? [Open a feature request](../../issues/new?template=feature_request.md) — see
[Contributing](#-contributing) below.

<br/>

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are genuinely welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding conventions, and the pull
request process before opening one, and note that this project follows a
[Code of Conduct](CODE_OF_CONDUCT.md).

Quick start for contributors:

```bash
git clone https://github.com/usamagulzar/mantiq.git
cd mantiq
python3 -m http.server 8080   # or any static server
```

No build tooling is required — edit HTML/CSS/JS directly and refresh. Changes to the WASM
logic engine itself require the (separate) C++ source and an Emscripten toolchain; see
[CONTRIBUTING.md](CONTRIBUTING.md) for details.

<br/>

## 🔐 Security

If you discover a security vulnerability, please **do not** open a public issue. Instead,
follow the responsible disclosure process described in [SECURITY.md](SECURITY.md).

<br/>

## ❓ FAQ

**Does Mantiq send my expressions anywhere?**
No. All parsing and computation happens locally in your browser via WebAssembly. Mantiq has no
backend and makes no network requests once the app shell is cached.

**Does it work without an internet connection?**
Yes — after your first visit, the Service Worker caches everything needed to run Mantiq fully
offline, including the WebAssembly engine.

**How many variables are supported?**
The Karnaugh map view supports 2–5 variables; expression simplification and simulation support
larger variable counts, limited by practical readability of the output.

**Is this suitable for coursework?**
Yes — Mantiq is designed with students in mind, with step-by-step proofs that show *why* a
simplification is valid, not just the final answer. Always confirm with your course's specific
requirements before submitting generated proofs as your own work.

**Can I self-host Mantiq?**
Yes. It's a static site — see [Run It Locally](#run-it-locally). Deploy the contents of this
repository to GitHub Pages, Netlify, Vercel, or any static host.

<br/>

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for the full text.

<br/>

## 🙏 Acknowledgements

- The [Quine–McCluskey algorithm](https://en.wikipedia.org/wiki/Quine%E2%80%93McCluskey_algorithm),
  the classical foundation of Mantiq's minimization engine.
- [Emscripten](https://emscripten.org/) for making C++-to-WebAssembly compilation possible.
- [Three.js](https://threejs.org/) for rendering utilities used in parts of the interface.
- Everyone who has filed an issue, suggested a feature, or shared Mantiq with a classmate.

<br/>

<div align="center">

**Made with care for learners everywhere.**

If Mantiq helped you understand digital logic a little better, consider giving the repo a ⭐.

</div>
