fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "pane_open",
            "pane_layout",
            "pane_eval",
            "pane_navigate",
            "pane_close",
            "pane_popup",
            "pick_html_file",
            "dd_event",
            "pane_cdp",
            "pane_devtools",
            "pane_raise",
            "save_screenshot",
            "open_path",
            "mcp_reply",
        ])),
    )
    .expect("failed to run tauri-build");
}
