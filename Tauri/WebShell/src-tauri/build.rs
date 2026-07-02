fn main() {
    // 앱 커맨드를 ACL 매니페스트에 선언 — capability 에서 allow-* 권한으로 참조 가능해진다.
    // (원격 URL 에 커맨드를 노출하려면 필수)
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_config",
            "save_config",
            "reset_config",
            "report_app_origin",
            "open_settings",
            "close_settings",
            "reload_main",
            "exit_app",
        ])),
    )
    .expect("failed to run tauri-build");
}
