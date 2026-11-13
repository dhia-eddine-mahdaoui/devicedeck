//! DeviceDeck desktop: the interface runs in the main view, and every device
//! preview is its own native browser view with that device's identity
//! (browser name, system, screen, touch…), so any website sees the chosen device.

use serde::Deserialize;
use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};
mod extra;

use tauri::{
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Url, Webview,
    WebviewBuilder, WebviewUrl, WebviewWindowBuilder,
};

static POPUPS: AtomicU32 = AtomicU32::new(1);
const UI_LABEL: &str = "ui";
const WINDOW_LABEL: &str = "main";

#[derive(Deserialize)]
struct Bounds {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    zoom: f64,
}

#[derive(Deserialize)]
struct LayoutItem {
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    zoom: f64,
    visible: bool,
    shape: Option<Shape>,
    /// The part of the view that is inside the stage, in view pixels (`None`: all of it).
    clip: Option<Clip>,
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
struct Clip {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// The real screen outline in interface pixels: rounded corners and the camera cutout.
#[derive(Deserialize, Clone, Copy, PartialEq)]
struct Shape {
    r: f64,
    cut: Option<Cut>,
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
struct Cut {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    round: CutKind,
}

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
enum CutKind {
    Pill,
    Circle,
}

/// Cut a view to the device's screen outline, so the frame's rounded corners and the camera
/// cutout drawn by the interface underneath show through (`None`: a plain rectangle), and to the
/// part of it that is on screen when the Free layout canvas has moved it past the stage's edge.
#[cfg(windows)]
fn set_shape(wv: &Webview, w: f64, h: f64, shape: Option<Shape>, clip: Option<Clip>) {
    let scale = wv.window().scale_factor().unwrap_or(1.0);
    let _ = wv.with_webview(move |platform| unsafe {
        use windows::Win32::Graphics::Gdi::{
            CombineRgn, CreateEllipticRgn, CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn, HRGN,
            RGN_AND, RGN_DIFF,
        };
        let mut hwnd = windows::Win32::Foundation::HWND::default();
        if platform.controller().ParentWindow(&mut hwnd).is_err() || hwnd.is_invalid() {
            return;
        }
        if shape.is_none() && clip.is_none() {
            SetWindowRgn(hwnd, None, true);
            return;
        }
        let px = |v: f64| (v * scale).round() as i32;
        let (pw, ph) = (px(w), px(h));
        let shape = shape.unwrap_or(Shape { r: 0.0, cut: None });
        let d = px(shape.r * 2.0).max(0);
        let rgn: HRGN = if d > 0 { CreateRoundRectRgn(0, 0, pw + 1, ph + 1, d, d) } else { CreateRectRgn(0, 0, pw, ph) };
        if let Some(c) = clip {
            let keep = CreateRectRgn(px(c.x), px(c.y), px(c.x + c.w), px(c.y + c.h));
            CombineRgn(Some(rgn), Some(rgn), Some(keep), RGN_AND);
            let _ = DeleteObject(keep.into());
        }
        if let Some(c) = shape.cut {
            let (x1, y1, x2, y2) = (px(c.x), px(c.y), px(c.x + c.w) + 1, px(c.y + c.h) + 1);
            let hole = match c.round {
                CutKind::Circle => CreateEllipticRgn(x1, y1, x2, y2),
                CutKind::Pill => {
                    let k = px(c.w.min(c.h));
                    CreateRoundRectRgn(x1, y1, x2, y2, k, k)
                }
            };
            CombineRgn(Some(rgn), Some(rgn), Some(hole), RGN_DIFF);
            let _ = DeleteObject(hole.into());
        }
        // The system owns the region from here on.
        SetWindowRgn(hwnd, Some(rgn), true);
    });
}

#[cfg(not(windows))]
fn set_shape(_wv: &Webview, _w: f64, _h: f64, _shape: Option<Shape>, _clip: Option<Clip>) {}

fn parse_url(url: &str) -> Result<Url, String> {
    url.parse::<Url>().map_err(|e| format!("Not a valid address: {e}"))
}

fn place(wv: &Webview, x: f64, y: f64, w: f64, h: f64, zoom: f64) {
    let _ = wv.set_position(LogicalPosition::new(x, y));
    let _ = wv.set_size(LogicalSize::new(w.max(1.0), h.max(1.0)));
    let _ = wv.set_zoom(zoom.clamp(0.05, 4.0));
}

/// Pages that ship inside the program (the built-in test page) load through the app itself.
fn webview_url(url: &str) -> Result<WebviewUrl, String> {
    for prefix in ["http://tauri.localhost/", "https://tauri.localhost/", "tauri://localhost/"] {
        if let Some(rest) = url.strip_prefix(prefix) {
            return Ok(WebviewUrl::App(rest.into()));
        }
    }
    Ok(WebviewUrl::External(parse_url(url)?))
}

/// One request header to force on everything a device view sends: `None` removes it.
#[derive(Deserialize, Clone)]
struct HeaderRule {
    name: String,
    value: Option<String>,
}

/// Rewrites the request headers of every request a view makes (page, pictures, scripts, data),
/// so servers see the device's own browser name and "client hints" (system, mobile, model)
/// instead of the real Windows/Edge ones.
#[cfg(windows)]
fn install_header_rules(wv: &Webview, rules: Vec<HeaderRule>) {
    if rules.is_empty() {
        return;
    }
    let _ = wv.with_webview(move |platform| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL;
        use webview2_com::WebResourceRequestedEventHandler;
        use windows::core::HSTRING;

        let Ok(core) = platform.controller().CoreWebView2() else { return };
        let _ = core.AddWebResourceRequestedFilter(&HSTRING::from("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
        let handler = WebResourceRequestedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else { return Ok(()) };
            let headers = args.Request()?.Headers()?;
            for rule in &rules {
                let name = HSTRING::from(rule.name.as_str());
                match &rule.value {
                    Some(v) => {
                        let _ = headers.SetHeader(&name, &HSTRING::from(v.as_str()));
                    }
                    None => {
                        let _ = headers.RemoveHeader(&name);
                    }
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_WebResourceRequested(&handler, &mut token);
    });
}

#[cfg(not(windows))]
fn install_header_rules(_wv: &Webview, _rules: Vec<HeaderRule>) {}

fn blank() -> WebviewUrl {
    WebviewUrl::External("about:blank".parse().expect("valid url"))
}

/// Start loading the real address once the header rules are in place.
fn go(wv: &Webview, url: &str) -> Result<(), String> {
    match webview_url(url)? {
        WebviewUrl::External(u) => wv.navigate(u).map_err(|e| e.to_string()),
        WebviewUrl::App(path) => {
            let u = format!("http://tauri.localhost/{}", path.to_string_lossy().replace('\\', "/"));
            wv.navigate(parse_url(&u)?).map_err(|e| e.to_string())
        }
        _ => Ok(()),
    }
}

/// Open a device preview inside the main window.
/// (Async: creating views from a synchronous command can stall them on Windows.)
#[tauri::command]
async fn pane_open(
    app: AppHandle,
    label: String,
    url: String,
    ua: String,
    init: String,
    headers: Vec<HeaderRule>,
    bounds: Bounds,
    defer: Option<bool>,
) -> Result<(), String> {
    if !label.starts_with("pane-") {
        return Err("bad label".into());
    }
    let window = app.get_window(WINDOW_LABEL).ok_or("main window missing")?;
    if let Some(old) = app.get_webview(&label) {
        let _ = old.close();
    }
    let builder = WebviewBuilder::new(&label, blank())
        .user_agent(&ua)
        .initialization_script_for_all_frames(&init)
        .zoom_hotkeys_enabled(false);
    let wv = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.w.max(1.0), bounds.h.max(1.0)),
        )
        .map_err(|e| e.to_string())?;
    let _ = wv.set_zoom(bounds.zoom.clamp(0.05, 4.0));
    install_header_rules(&wv, headers);
    if defer.unwrap_or(false) {
        // The interface first switches on the browser's own device emulation, then navigates.
        return Ok(());
    }
    go(&wv, &url)
}

/// Move, resize, zoom or hide all previews at once.
#[tauri::command]
fn pane_layout(app: AppHandle, items: Vec<LayoutItem>) {
    for it in items {
        if let Some(wv) = app.get_webview(&it.label) {
            if it.visible {
                place(&wv, it.x, it.y, it.w, it.h, it.zoom);
                set_shape(&wv, it.w, it.h, it.shape, it.clip);
            } else {
                // Native views always sit on top, so park them off-screen while menus are open.
                let _ = wv.set_position(LogicalPosition::new(-30000.0, -30000.0));
            }
        }
    }
}

#[tauri::command]
fn pane_eval(app: AppHandle, label: String, js: String) {
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.eval(&js);
    }
}

#[tauri::command]
fn pane_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    if let Some(wv) = app.get_webview(&label) {
        go(&wv, &url)?;
    }
    Ok(())
}

#[tauri::command]
fn pane_close(app: AppHandle, label: String) {
    if let Some(wv) = app.get_webview(&label) {
        let _ = wv.close();
    }
}

/// Open one device in its own window at its own size.
#[tauri::command]
async fn pane_popup(
    app: AppHandle,
    url: String,
    ua: String,
    init: String,
    headers: Vec<HeaderRule>,
    title: String,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let label = format!("popup-{}", POPUPS.fetch_add(1, Ordering::Relaxed));
    let win = WebviewWindowBuilder::new(&app, &label, blank())
        .title(title)
        .inner_size(w, h)
        .user_agent(&ua)
        .initialization_script_for_all_frames(&init)
        .build()
        .map_err(|e| e.to_string())?;
    let wv = app.get_webview(&label).ok_or("window missing")?;
    let _ = win;
    install_header_rules(&wv, headers);
    go(&wv, &url)
}

/// Let the person choose an HTML file; returns its address.
#[tauri::command]
async fn pick_html_file() -> Option<String> {
    let file = rfd::AsyncFileDialog::new()
        .set_title("Open an HTML file")
        .add_filter("Web page", &["html", "htm", "xhtml"])
        .pick_file()
        .await?;
    Url::from_file_path(file.path()).ok().map(|u| u.to_string())
}

/// Messages from inside a preview (scrolling, clicks, page changes) go to the interface.
#[tauri::command]
fn dd_event(app: AppHandle, webview: Webview, payload: serde_json::Value) {
    let _ = app.emit_to(
        EventTarget::webview(UI_LABEL),
        "dd-event",
        json!({ "label": webview.label(), "data": payload }),
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Updates: checks the latest GitHub release, verifies its signature, installs and restarts.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            pane_open,
            pane_layout,
            pane_eval,
            pane_navigate,
            pane_close,
            pane_popup,
            pick_html_file,
            dd_event,
            extra::pane_cdp,
            extra::pane_devtools,
            extra::pane_raise,
            extra::save_screenshot,
            extra::open_path,
            extra::app_info,
            extra::open_shots_dir,
            extra::open_url,
            extra::clear_browsing_data,
            extra::mcp_reply
        ])
        .setup(|app| {
            let builder = tauri::window::WindowBuilder::new(app, WINDOW_LABEL)
                .title("DeviceDeck")
                .inner_size(1440.0, 900.0)
                .min_inner_size(900.0, 600.0)
                .maximized(true);
            // No separate system title bar: the tab strip is the title bar.
            // macOS keeps its own traffic-light buttons, drawn over the tab strip;
            // Windows and Linux get minimize / maximize / close buttons drawn by the interface.
            #[cfg(target_os = "macos")]
            let builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true);
            #[cfg(not(target_os = "macos"))]
            let builder = builder.decorations(false).shadow(true);
            let window = builder.build()?;
            let size = window.inner_size()?.to_logical::<f64>(window.scale_factor()?);
            // `DeviceDeck.exe https://example.com` opens that address straight away.
            let mut start = String::from("index.html");
            if let Some(arg) = std::env::args().skip(1).find(|a| !a.starts_with('-')) {
                let encoded: String = Url::parse_with_params("http://x/", &[("url", arg.as_str())])
                    .map(|u| u.query().unwrap_or_default().to_string())
                    .unwrap_or_default();
                if !encoded.is_empty() {
                    start = format!("index.html?{encoded}");
                }
            }
            window.add_child(
                WebviewBuilder::new(UI_LABEL, WebviewUrl::App(start.into())).auto_resize(),
                LogicalPosition::new(0.0, 0.0),
                size,
            )?;
            extra::start_mcp_server(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeviceDeck");
}
