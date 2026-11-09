# DeviceDeck

See and test any website as an iPhone, Android phone, iPad, Android tablet, Windows PC, Mac, Chromebook or Linux computer — side by side, at the same time.

Each device preview is a real browser view that tells websites it **is** that device: browser name (user agent), system, screen size, pixel density, touch screen, pointer and hover. Works on every website — no add-ons, no setup.

## Install (Windows 10 / 11)

1. Open **Releases** on the right of this page.
2. Download `DeviceDeck_x.y.z_x64-setup.exe` (recommended) or the `.msi`.
3. Run it. DeviceDeck appears in the Start menu.

## What it does

- Many devices side by side, with device frames, rotation and custom sizes (drag the edge of a screen).
- Layouts: Row, Grid (web), Focus (one device; the others pause until you leave Focus) and Free (drag panels anywhere by their title strip, resize them from the corner).
- Pick the browser per device: Safari, Chrome, Firefox, Edge, Samsung Internet.
- Pick the system version per device (iOS / iPadOS 16–27, Android 12–17, macOS 13–27, Windows 10–11); the latest is the default. The version shows up exactly where the real device reveals it: Safari's version, the Android version in Firefox and Samsung Internet, and Chromium client hints. (Like real browsers, the user agent alone stays frozen at "Mac OS X 10_15_7", "Windows NT 10.0", "Android 10; K" and, since iOS 26, "OS 18_6".)
- Device frames show each phone's and tablet's real screen shape: its rounded corners and front camera (Dynamic Island or punch hole) at the real size and place, also when rotated. The page is really cut there, so you see what the cutout hides.
- iPads report themselves as iPadOS (Safari's mobile-website mode), not as a Mac.
- Rate-limit friendly: all devices share your internet address, so by default they load pages one after another (Sync › Page loading: one after another, 2 s apart, 5 s apart or all at once), and later devices reuse the site's files from the shared cache. A device that gets "Too many requests" (HTTP 429) retries by itself after 4, 8 and 16 s.
- Scrolling, link clicks, button presses and typing stay in sync across all devices. Each device asks the site itself, so pages that send every device somewhere else (e.g. `/download` → `/download/mac` or `/download/android`) behave exactly like on the real devices; only links you click are shared.
- Light / dark mode per device or for all.
- Ready-made sets: phones, tablets, iOS vs Android, laptops & desktops, common breakpoints.
- Open a local HTML file or paste HTML.
- Open any device in its own window at its exact size.
- Browser tabs (`Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`), each with its own address and devices.
- Real device emulation by the browser engine: touch input and touch-style CSS, device client hints, light/dark mode.
- Inspect: browser developer tools for any device. On touch devices, inspecting pauses touch input so the mouse can select elements; click Inspect again to bring touch back.
- One-click full-page screenshots of every device, or only the focused one in Focus layout (saved to Pictures › DeviceDeck).
- AI assistants (Claude Code, Cursor…) can drive DeviceDeck through its built-in MCP server at `http://127.0.0.1:12721/mcp`:
  `claude mcp add --transport http devicedeck http://127.0.0.1:12721/mcp`

### MCP server

The server is part of the app: it only exists **while DeviceDeck is open**. `curl http://127.0.0.1:12721/health` tells you whether it is running; the `get_status` tool tells an assistant whether the window is responding.

| Tool | What it does |
| --- | --- |
| `get_status` | Is DeviceDeck running and responding; layout, focused device, loading count. |
| `get_app_state` | Address, tabs, layout and every device (pane id, size, browser, the address it actually landed on). |
| `list_devices` | Every device profile with its browsers and system versions, plus the `set_devices` format (`device-id[:browser[:version]]`). |
| `set_devices` | `["iphone-15:chrome", "pixel-8", "custom:1280x800:windows:laptop"]` |
| `navigate` / `reload` | Open or reload and wait until the devices have loaded; reports where each device ended up. |
| `screenshot` | PNGs (≤1000px wide), visible part or `full_page`. |
| `read_page` | Title, address and text. |
| `click` / `type_text` | By CSS selector. |
| `run_script` | Body of an async function; `return` a JSON-able value. One device → the value; several → `[{device, value \| error}]`. Default timeout 10s (max 60s). |
| `check_layout` | Horizontal scrolling, elements wider than the viewport, text below `min_font_px` (12), tap targets below `min_tap_px` (24) on touch devices. |

`device` accepts `all`, a pane id, a device id or part of a name. Left out, it means the focused device in Focus layout; otherwise every device for `screenshot`, `click`, `type_text`, `reload` and `check_layout`, and the first device for `read_page` and `run_script`.
- Shortcuts: `Ctrl+L` address, `Ctrl+R` reload all, `Ctrl` `+`/`-` zoom, `Esc` leave focus mode.

## Building it yourself

### 1. Install the requirements (once per machine)

| What | Version | How |
| --- | --- | --- |
| Git | any | https://git-scm.com |
| Node.js | 20 or newer (see `.nvmrc`) | https://nodejs.org, or `nvm use` |
| Rust (rustup) | picked automatically from `src-tauri/rust-toolchain.toml` (1.91.0) | https://rustup.rs |
| System build tools | see below | |

System build tools, per OS ([full Tauri list](https://tauri.app/start/prerequisites/)):

- **Windows 10/11:** "Desktop development with C++" from [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). WebView2 is already part of Windows 10/11.
- **macOS:** `xcode-select --install`
- **Linux (Debian/Ubuntu):**
  `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`

Some features (DevTools-protocol device emulation, window tricks) use WebView2 and work fully only on **Windows**. On macOS and Linux the app builds and runs with fewer faking powers.

### 2. Get the code and build

```
git clone <this repo's URL>
cd devicedeck
npm ci               # exact dependency versions from package-lock.json
npm run desktop      # builds the .exe and .msi into src-tauri/target/release/bundle
```

On macOS / Linux, use your own bundle format, for example `npm run tauri build -- --bundles app` (macOS) or `--bundles deb,appimage` (Linux), because `tauri.conf.json` lists the Windows installers.

`npm run build` builds only the interface into `dist/` (also usable as a plain website, with fewer faking powers).

### Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `src/` | The interface (plain JavaScript + Vite) |
| `src/helper.js` | Script put into every device page to fake the device |
| `extension/` | Optional Chrome extension ("DeviceDeck Connector") for the plain-website version |
| `public/` | Static files (demo page) |
| `src-tauri/` | Desktop app (Rust + Tauri 2): windows, device panes, MCP server |
| `.github/workflows/release.yml` | Builds and publishes Windows installers |

No secrets or API keys are needed to build or run DeviceDeck.

New releases: GitHub → Actions → "Windows release" → Run workflow, enter a version like `v1.0.1`.
