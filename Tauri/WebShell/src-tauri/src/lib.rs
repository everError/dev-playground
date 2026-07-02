//! WebShell — 서버 배포 웹을 감싸는 웹뷰 셸.
//!
//! 모듈 구성:
//! - `config`  : 셸 설정(config.json) 읽기/쓰기/초기화
//! - `windows` : 메인/설정 창 관리, Ctrl+F12 진입, origin 추적
//! - (예정) `print` : 라벨 무인 인쇄 브릿지 (M2)
//!
//! 커맨드를 추가할 때는 세 곳을 함께 갱신할 것:
//! 1. 모듈에 `#[tauri::command] pub fn` 정의
//! 2. 아래 `generate_handler!` 목록
//! 3. `build.rs` 의 app_manifest commands + `capabilities/*.json` 권한
//!    (원격 사이트에 노출할 커맨드만 `remote.json` 에 추가 — 최소 노출 원칙)

mod config;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::save_config,
            config::reset_config,
            windows::report_app_origin,
            windows::open_settings,
            windows::close_settings,
            windows::reload_main,
            windows::exit_app
        ])
        .setup(windows::setup)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
