//! Developer extras: the browser's own device emulation and screenshots (through the
//! DevTools protocol of each device view), DevTools windows for inspecting elements,
//! and a local MCP server so AI coding assistants can drive DeviceDeck.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, EventTarget, Manager, Webview};

pub const MCP_PORT: u16 = 12721;
static MCP_LISTENING: AtomicBool = AtomicBool::new(false);

/// The port can be moved (e.g. to run a second copy) with the DEVICEDECK_MCP_PORT environment variable.
fn mcp_port() -> u16 {
    std::env::var("DEVICEDECK_MCP_PORT").ok().and_then(|v| v.trim().parse().ok()).unwrap_or(MCP_PORT)
}

/* ------------------------------------------------------------------ DevTools protocol */

#[cfg(windows)]
async fn cdp(wv: &Webview, method: String, params: String) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<String, String>>();
    let tx = std::sync::Arc::new(Mutex::new(Some(tx)));
    let tx_err = tx.clone();
    let send_err = move |e: String| {
        if let Some(t) = tx_err.lock().ok().and_then(|mut g| g.take()) {
            let _ = t.send(Err(e));
        }
    };
    wv.with_webview(move |platform| unsafe {
        use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
        use windows::core::HSTRING;
        let core = match platform.controller().CoreWebView2() {
            Ok(c) => c,
            Err(e) => return send_err(e.to_string()),
        };
        let tx_done = tx.clone();
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |res, json| {
            if let Some(t) = tx_done.lock().ok().and_then(|mut g| g.take()) {
                let _ = t.send(res.map(|_| json).map_err(|e| e.to_string()));
            }
            Ok(())
        }));
        if let Err(e) = core.CallDevToolsProtocolMethod(
            &HSTRING::from(method.as_str()),
            &HSTRING::from(params.as_str()),
            &handler,
        ) {
            send_err(e.to_string());
        }
    })
    .map_err(|e| e.to_string())?;
    match tokio::time::timeout(Duration::from_secs(20), rx).await {
        Ok(Ok(r)) => r,
        Ok(Err(_)) => Err("no answer from the view".into()),
        Err(_) => Err("the view took too long to answer".into()),
    }
}

#[cfg(not(windows))]
async fn cdp(_wv: &Webview, _method: String, _params: String) -> Result<String, String> {
    Err("only available on Windows".into())
}

/// Call a DevTools-protocol method on one device view; returns the JSON answer.
#[tauri::command]
pub async fn pane_cdp(app: AppHandle, label: String, method: String, params: String) -> Result<String, String> {
    if !(label.starts_with("pane-") || label.starts_with("popup-")) {
        return Err("bad label".into());
    }
    let wv = app.get_webview(&label).ok_or("device view not found")?;
    cdp(&wv, method, params).await
}

/// Open the browser developer tools (inspect element, console, network…) for one device.
#[tauri::command]
pub fn pane_devtools(app: AppHandle, label: String) -> Result<(), String> {
    let wv = app.get_webview(&label).ok_or("device view not found")?;
    wv.open_devtools();
    Ok(())
}

/// Put one device view above the others (native views ignore the page's z-index,
/// so a panel that is dragged over another one has to be raised by the system).
#[tauri::command]
pub fn pane_raise(app: AppHandle, label: String) -> Result<(), String> {
    if !label.starts_with("pane-") {
        return Err("bad label".into());
    }
    let wv = app.get_webview(&label).ok_or("device view not found")?;
    raise(&wv);
    Ok(())
}

#[cfg(windows)]
fn raise(wv: &Webview) {
    let _ = wv.with_webview(|platform| unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, HWND_TOP, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
        };
        let mut hwnd = windows::Win32::Foundation::HWND::default();
        if platform.controller().ParentWindow(&mut hwnd).is_ok() && !hwnd.is_invalid() {
            let _ = SetWindowPos(hwnd, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    });
}

#[cfg(not(windows))]
fn raise(_wv: &Webview) {}

/* ------------------------------------------------------------------ screenshots */

fn safe_name(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '-' })
        .collect();
    let trimmed = cleaned.trim_matches('-');
    let t: String = trimmed.chars().take(120).collect();
    if t.is_empty() { "screenshot".into() } else { t }
}

/// Where screenshots go: Pictures/DeviceDeck (or the home folder if there is no Pictures folder).
fn shots_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let base = app
        .path()
        .picture_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    Ok(base.join("DeviceDeck"))
}

/// Facts for the Settings page: version, system, MCP server and screenshot folder.
#[tauri::command]
pub fn app_info(app: AppHandle) -> Value {
    let port = mcp_port();
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "mcpRunning": MCP_LISTENING.load(Ordering::Relaxed),
        "mcpUrl": format!("http://127.0.0.1:{port}/mcp"),
        "screenshotsDir": shots_dir(&app).map(|d| d.to_string_lossy().to_string()).unwrap_or_default(),
    })
}

/// Create the screenshot folder if needed and show it.
#[tauri::command]
pub fn open_shots_dir(app: AppHandle) -> Result<(), String> {
    let dir = shots_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    open_path(dir.to_string_lossy().to_string(), None)
}

/// Delete cookies, cache and site storage of the device previews (signs out of every site).
/// The webviews share one browser profile, so this also clears the interface's own storage;
/// the interface saves its settings again right after.
#[tauri::command]
pub fn clear_browsing_data(app: AppHandle) -> Result<(), String> {
    let views = app.webviews();
    let mut done = false;
    for (label, wv) in views.iter() {
        if label.starts_with("pane-") || !done {
            wv.clear_all_browsing_data().map_err(|e| e.to_string())?;
            done = true;
        }
    }
    Ok(())
}

/// Open a web page in the default browser. Only plain https links (no spaces or quotes).
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let ok = url.starts_with("https://") && url.len() < 4096 && !url.chars().any(|c| c.is_whitespace() || c.is_control() || c == '"');
    if !ok {
        return Err("Only https links can be opened.".into());
    }
    #[cfg(windows)]
    let mut cmd = {
        // rundll32 hands the link to the default browser without going through a shell.
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", &url]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&url);
        c
    };
    #[cfg(not(any(windows, target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&url);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Save a PNG (base64) into Pictures\DeviceDeck; returns the file path.
#[tauri::command]
pub fn save_screenshot(app: AppHandle, name: String, data: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| e.to_string())?;
    let dir = shots_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut path = dir.join(format!("{}.png", safe_name(&name)));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{}-{n}.png", safe_name(&name)));
        n += 1;
    }
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Show a file or folder in Explorer / Finder / the Linux file manager.
#[tauri::command]
pub fn open_path(path: String, select: Option<bool>) -> Result<(), String> {
    let select = select.unwrap_or(false);
    #[cfg(windows)]
    let mut cmd = {
        let mut c = std::process::Command::new("explorer");
        c.arg(if select { format!("/select,{path}") } else { path });
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        if select {
            c.arg("-R");
        }
        c.arg(path);
        c
    };
    #[cfg(not(any(windows, target_os = "macos")))]
    let mut cmd = {
        // xdg-open cannot highlight a file, so open its folder instead.
        let p = std::path::PathBuf::from(&path);
        let target = if select { p.parent().map(|d| d.to_path_buf()).unwrap_or(p) } else { p };
        let mut c = std::process::Command::new("xdg-open");
        c.arg(target);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/* ------------------------------------------------------------------ MCP server for AI assistants */

type Pending = Mutex<HashMap<u64, std::sync::mpsc::Sender<Value>>>;
fn pending() -> &'static Pending {
    static P: OnceLock<Pending> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}
static NEXT_CALL: AtomicU64 = AtomicU64::new(1);

/// The interface answers a tool call it received through the "mcp-call" event.
#[tauri::command]
pub fn mcp_reply(id: u64, result: Value) {
    if let Some(tx) = pending().lock().ok().and_then(|mut p| p.remove(&id)) {
        let _ = tx.send(result);
    }
}

/// How every tool picks its devices (shared text so the rule reads the same everywhere).
const DEVICE_RULE: &str = "Which device(s) to use: 'all', a pane id from get_app_state (e.g. 'p1k2x3a0'), \
a device id (e.g. 'iphone-15') or part of a device name, case-insensitive (e.g. 'galaxy' matches every Galaxy). \
When omitted: the focused device if DeviceDeck is in Focus layout";

fn device_arg(default: &str) -> Value {
    json!({ "type": "string", "description": format!("{DEVICE_RULE}, otherwise {default}.") })
}

fn read_only() -> Value {
    json!({ "readOnlyHint": true, "openWorldHint": false })
}

fn tools() -> Value {
    json!([
        { "name": "get_status",
          "description": "Check that DeviceDeck is running and its window is responding. Call this first, or whenever another \
tool fails or times out. DeviceDeck is a desktop app: these tools only work while it is open on this computer \
(the server lives at http://127.0.0.1:12721/mcp). If the app is closed, no tool can be reached at all and the person \
has to start DeviceDeck. Returns JSON: { running, windowResponding, version, layout, focusedDevice, devices, loading }.\n\
Example: get_status {}",
          "annotations": read_only(),
          "inputSchema": { "type": "object", "properties": {} } },
        { "name": "get_app_state",
          "description": "The current address, open tabs, layout and the devices being previewed. Each device entry has its \
pane id (use it as `device` in other tools), device id, name, system, browser, viewport size, pixel ratio, \
whether it is still loading, and `url`: the address that device actually ended up on. Sites often send each \
device to its own page (e.g. /download -> /download/mac on a Mac and /download/android on a phone); that is \
expected and is not synced between devices.\nExample: get_app_state {}",
          "annotations": read_only(),
          "inputSchema": { "type": "object", "properties": {} } },
        { "name": "list_devices",
          "description": "Every built-in device profile (phones, tablets, laptops, desktops) with its id, size, pixel ratio and \
the browsers and system versions it supports (the first version is the latest and the default), plus the exact \
format set_devices accepts.\nExample: list_devices {}",
          "annotations": read_only(),
          "inputSchema": { "type": "object", "properties": {} } },
        { "name": "set_devices",
          "description": "Replace the previewed devices. Each entry is 'device-id[:browser[:version]]': browser must be one \
listed for that device in list_devices (otherwise the device's default browser is used) and version one of its \
system versions, e.g. iOS '17' or Android '14' (default: the latest; leave the browser empty to keep its default, \
'pixel-8::14'). A custom size is 'custom:WIDTHxHEIGHT[:system[:kind[:version]]]' (system: windows, macos, linux, \
chromeos, android, ios, ipados; kind: phone, tablet, laptop, desktop).\n\
Example: set_devices { \"devices\": [\"iphone-15:chrome\", \"pixel-8::14\", \"ipad-air:safari:17\", \"windows-laptop:edge:10\", \"custom:1280x800:windows:laptop\"] }",
          "inputSchema": { "type": "object", "properties": {
              "devices": { "type": "array", "minItems": 1, "items": { "type": "string" },
                           "description": "e.g. [\"iphone-15:safari\", \"galaxy-s24:samsung\", \"custom:390x844:ios:phone\"]" } },
            "required": ["devices"] } },
        { "name": "navigate",
          "description": "Open an address and wait (up to `timeout_ms`) until the devices have loaded it. Without `device` it opens \
in every device (only the focused one in Focus layout; the others catch up when Focus is left). Each device \
asks the site itself, so servers that pick a page per device (App Store vs Google Play, Mac vs Windows download) \
answer differently per device: the result lists where each device ended up. Accepts 'example.com', \
'localhost:3000', full URLs and file:/// addresses.\n\
Example: navigate { \"url\": \"localhost:5173/pricing\" }",
          "inputSchema": { "type": "object", "properties": {
              "url": { "type": "string", "description": "e.g. 'https://example.com/page' or 'localhost:3000'" },
              "timeout_ms": { "type": "integer", "minimum": 1000, "maximum": 60000, "description": "How long to wait for loading (default 15000)." } },
            "required": ["url"] } },
        { "name": "reload",
          "description": "Reload the page in the devices and wait until they have loaded. Without `device`: every device \
(only the focused one in Focus layout).\nExample: reload { \"device\": \"iphone-15\" }",
          "inputSchema": { "type": "object", "properties": { "device": device_arg("every device") } } },
        { "name": "screenshot",
          "description": "PNG screenshot(s), at most 1000px wide, each preceded by a text line naming the device, browser and \
viewport. `full_page: true` captures the whole scrollable page (up to 16000px tall) instead of what is visible.\n\
Example: screenshot { \"device\": \"pixel-8\", \"full_page\": true }  ·  screenshot { \"device\": \"all\" }",
          "annotations": read_only(),
          "inputSchema": { "type": "object", "properties": {
              "device": device_arg("every device"),
              "full_page": { "type": "boolean", "description": "Whole page instead of the visible part (default false)." } } } },
        { "name": "read_page",
          "description": "Title, actual address and visible text (first 20000 characters) of the page. Returns one JSON object \
{ device, title, url, text } for a single device, or an array of them when several devices match (e.g. 'all').\n\
Example: read_page {}  ·  read_page { \"device\": \"all\" }",
          "annotations": read_only(),
          "inputSchema": { "type": "object", "properties": { "device": device_arg("the first device") } } },
        { "name": "click",
          "description": "Scroll the first element matching a CSS selector into view and click it. Reports per device \
'clicked' or 'not found'.\nExample: click { \"selector\": \"button[type=submit]\" }  ·  click { \"selector\": \"nav a[href='/pricing']\", \"device\": \"iphone-15\" }",
          "inputSchema": { "type": "object", "properties": {
              "selector": { "type": "string", "description": "CSS selector, e.g. '#menu-toggle' or 'a[href=\"/login\"]'" },
              "device": device_arg("every device") },
            "required": ["selector"] } },
        { "name": "type_text",
          "description": "Set the value of the input/textarea matching a CSS selector and fire input and change events \
(replaces the current value). Reports per device 'typed' or 'not found'.\n\
Example: type_text { \"selector\": \"input[name=email]\", \"text\": \"test@example.com\" }",
          "inputSchema": { "type": "object", "properties": {
              "selector": { "type": "string", "description": "CSS selector of the field" },
              "text": { "type": "string", "description": "The new value" },
              "device": device_arg("every device") },
            "required": ["selector", "text"] } },
        { "name": "run_script",
          "description": "Run JavaScript in the page of a device. `code` is the body of an async function: use `return` to \
send a value back (`await` works); a single expression without `return` or `;` is returned as-is. The value is \
converted with JSON.stringify (DOM nodes and functions do not survive: return plain data). \
Result: for one device the JSON value itself (undefined becomes null); for several devices a JSON array of \
{ device, value } or { device, error }. A thrown error or a timeout (default 10000 ms, max 60000) is \
reported as an error with the message.\n\
Examples: run_script { \"code\": \"document.querySelectorAll('img:not([alt])').length\" }  ·  \
run_script { \"device\": \"all\", \"code\": \"const r = document.querySelector('header').getBoundingClientRect(); return { h: r.height, w: r.width };\" }",
          "inputSchema": { "type": "object", "properties": {
              "device": device_arg("the first device"),
              "code": { "type": "string", "description": "JavaScript function body or a single expression" },
              "timeout_ms": { "type": "integer", "minimum": 100, "maximum": 60000, "description": "Give up after this long (default 10000)." } },
            "required": ["code"] } },
        { "name": "check_layout",
          "description": "Automatic layout check of the current page: horizontal scrolling, elements sticking out of the \
viewport (with CSS selectors), text smaller than `min_font_px`, and (on touch devices) tap targets smaller than \
`min_tap_px`. Returns per device JSON: { device, viewport:{width,height}, pageWidth, horizontalScroll, \
overflowPx, wideElements:[{selector,left,right,width,text}], smallText:[{selector,fontSize,text}], \
smallTapTargets:[{selector,width,height,text}], counts, ok }. Lists are capped at 15 entries each (counts has \
the totals). Elements clipped by an overflow:hidden/auto parent are not reported.\n\
Example: check_layout {}  ·  check_layout { \"device\": \"galaxy-s24\", \"min_font_px\": 14 }",
          "annotations": read_only(),
          "inputSchema": { "type": "object", "properties": {
              "device": device_arg("every device"),
              "min_font_px": { "type": "number", "description": "Smallest acceptable font size in CSS px (default 12)." },
              "min_tap_px": { "type": "number", "description": "Smallest acceptable tap target side in CSS px on touch devices (default 24)." } } } }
    ])
}

fn tool_error(text: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": text }], "isError": true })
}

/// Ask the interface to run a tool and wait for its answer.
fn ask_ui(app: &AppHandle, name: &str, args: Value, wait: Duration) -> Option<Value> {
    let id = NEXT_CALL.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = std::sync::mpsc::channel();
    if let Ok(mut p) = pending().lock() {
        p.insert(id, tx);
    }
    let _ = app.emit_to(
        EventTarget::webview(crate::UI_LABEL),
        "mcp-call",
        json!({ "id": id, "name": name, "arguments": args }),
    );
    match rx.recv_timeout(wait) {
        Ok(v) => Some(v),
        Err(_) => {
            if let Ok(mut p) = pending().lock() {
                p.remove(&id);
            }
            None
        }
    }
}

fn started() -> &'static std::time::Instant {
    static T: OnceLock<std::time::Instant> = OnceLock::new();
    T.get_or_init(std::time::Instant::now)
}

fn get_status(app: &AppHandle) -> Value {
    let ui = ask_ui(app, "get_status", json!({}), Duration::from_secs(3));
    let mut status = json!({
        "running": true,
        "version": env!("CARGO_PKG_VERSION"),
        "uptimeSeconds": started().elapsed().as_secs(),
        "windowResponding": ui.is_some(),
    });
    match ui
        .as_ref()
        .and_then(|v| v.pointer("/content/0/text"))
        .and_then(|t| t.as_str())
        .and_then(|t| serde_json::from_str::<Value>(t).ok())
    {
        Some(Value::Object(extra)) => {
            for (k, v) in extra {
                status[k] = v;
            }
        }
        _ => {
            status["hint"] = json!("DeviceDeck is running but its window did not answer within 3 seconds. It may still be starting; try again in a moment.");
        }
    }
    json!({ "content": [{ "type": "text", "text": serde_json::to_string_pretty(&status).unwrap_or_default() }], "isError": false })
}

fn call_tool(app: &AppHandle, name: &str, args: Value) -> Value {
    if name == "get_status" {
        return get_status(app);
    }
    if !tools().as_array().is_some_and(|t| t.iter().any(|x| x["name"] == name)) {
        return tool_error(&format!("Unknown tool '{name}'. Call tools/list to see the available tools."));
    }
    ask_ui(app, name, args, Duration::from_secs(90)).unwrap_or_else(|| {
        tool_error("DeviceDeck did not answer within 90 seconds. Its window may be busy or still starting. Call get_status to check, then try again.")
    })
}

fn handle_rpc(app: &AppHandle, req: &Value) -> Option<Value> {
    let id = req.get("id").cloned();
    let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let result = match method {
        "initialize" => {
            let version = req
                .pointer("/params/protocolVersion")
                .and_then(|v| v.as_str())
                .unwrap_or("2025-03-26")
                .to_string();
            json!({
                "protocolVersion": version,
                "capabilities": { "tools": { "listChanged": false } },
                "serverInfo": { "name": "devicedeck", "version": env!("CARGO_PKG_VERSION") },
                "instructions": "DeviceDeck previews one website on many phones, tablets and computers at once; every device is a real \
browser view that the site sees as that device (user agent, client hints, touch, screen size, pixel ratio). \
It is a desktop app: this server only exists while DeviceDeck is open on this computer. If a call fails, use \
get_status; if the server cannot be reached at all, ask the person to start DeviceDeck.\n\
Typical layout review: get_app_state (or list_devices + set_devices) -> navigate -> check_layout -> screenshot \
the devices with problems -> fix the code -> reload -> check_layout again.\n\
Device targeting: tools that take `device` accept 'all', a pane id, a device id or part of a device name. When it \
is omitted they use the focused device if the person is in Focus layout; otherwise screenshot, click, type_text, \
reload and check_layout use every device, while read_page and run_script use the first one."
            })
        }
        "ping" => json!({}),
        "tools/list" => json!({ "tools": tools() }),
        "tools/call" => {
            let name = req.pointer("/params/name").and_then(|v| v.as_str()).unwrap_or("");
            let args = req.pointer("/params/arguments").cloned().unwrap_or(json!({}));
            call_tool(app, name, args)
        }
        m if m.starts_with("notifications/") => return None,
        _ => {
            return Some(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": format!("unknown method {method}") } }));
        }
    };
    id.map(|id| json!({ "jsonrpc": "2.0", "id": id, "result": result }))
}

/// `localhost`, `127.0.0.1` or `[::1]`, with or without a port — nothing else (not `localhost.evil.com`).
fn is_loopback_host(host: &str) -> bool {
    let name = if let Some(rest) = host.strip_prefix('[') {
        match rest.split_once(']') {
            Some((h, tail)) if tail.is_empty() || tail.strip_prefix(':').is_some_and(|p| p.parse::<u16>().is_ok()) => return h == "::1",
            _ => return false,
        }
    } else {
        match host.split_once(':') {
            Some((h, p)) if p.parse::<u16>().is_ok() => h,
            Some(_) => return false,
            None => host,
        }
    };
    name == "localhost" || name == "127.0.0.1"
}

/// `http://` + a loopback host. `null` (sandboxed frames, file pages) is refused.
fn is_loopback_origin(origin: &str) -> bool {
    origin.strip_prefix("http://").is_some_and(is_loopback_host)
}

fn respond(stream: &mut TcpStream, status: &str, body: &str) {
    let msg = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(msg.as_bytes());
}

fn serve(app: AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });
    let mut first = String::new();
    if reader.read_line(&mut first).is_err() {
        return;
    }
    let mut len = 0usize;
    let mut origin_ok = true;
    let mut host_ok = false;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            break;
        }
        let l = line.trim_end();
        if l.is_empty() {
            break;
        }
        let lower = l.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            len = v.trim().parse().unwrap_or(0);
        }
        if let Some(v) = lower.strip_prefix("origin:") {
            // Only local tools may talk to it (blocks web pages from driving the app).
            // Browsers always send Origin on cross-site POSTs; command-line clients send none.
            origin_ok = is_loopback_origin(v.trim());
        }
        if let Some(v) = lower.strip_prefix("host:") {
            // Blocks DNS rebinding: a page on evil.example resolving to 127.0.0.1 still says Host: evil.example.
            host_ok = is_loopback_host(v.trim());
        }
    }
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");
    if !origin_ok || !host_ok {
        return respond(&mut stream, "403 Forbidden", "{}");
    }
    if method == "GET" && (path == "/health" || path == "/status") {
        // Plain health check for scripts and people: `curl http://127.0.0.1:12721/health`.
        let body = json!({ "status": "ok", "app": "DeviceDeck", "version": env!("CARGO_PKG_VERSION"),
                           "uptimeSeconds": started().elapsed().as_secs(), "mcp": format!("http://127.0.0.1:{}/mcp", mcp_port()) });
        return respond(&mut stream, "200 OK", &body.to_string());
    }
    if path != "/mcp" && path != "/" {
        return respond(&mut stream, "404 Not Found", "{}");
    }
    if method != "POST" {
        return respond(&mut stream, "405 Method Not Allowed", "{}");
    }
    let mut body = vec![0u8; len.min(10 * 1024 * 1024)];
    if reader.read_exact(&mut body).is_err() {
        return respond(&mut stream, "400 Bad Request", "{}");
    }
    let req: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return respond(&mut stream, "400 Bad Request", r#"{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"parse error"}}"#),
    };
    let reply = if let Some(batch) = req.as_array() {
        let out: Vec<Value> = batch.iter().filter_map(|r| handle_rpc(&app, r)).collect();
        if out.is_empty() { None } else { Some(Value::Array(out)) }
    } else {
        handle_rpc(&app, &req)
    };
    match reply {
        Some(v) => respond(&mut stream, "200 OK", &v.to_string()),
        None => {
            let _ = stream.write_all(b"HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        }
    }
}

/// Listens on http://127.0.0.1:12721/mcp while DeviceDeck is open.
pub fn start_mcp_server(app: AppHandle) {
    started();
    std::thread::spawn(move || {
        let port = mcp_port();
        let listener = match TcpListener::bind(("127.0.0.1", port)) {
            Ok(l) => {
                MCP_LISTENING.store(true, Ordering::Relaxed);
                l
            }
            Err(e) => {
                // Usually another DeviceDeck is already open and owns the port.
                eprintln!("DeviceDeck: MCP server not started, port {port} unavailable: {e}");
                return;
            }
        };
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            std::thread::spawn(move || serve(app, stream));
        }
    });
}
