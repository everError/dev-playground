//! 창 관리 — 메인 창(웹뷰), 설정 창, 앱 origin 추적.
//!
//! 창 구조:
//! - `main`: 로더(index.html) → 서버 배포 사이트를 로드하는 메인 웹뷰
//! - `settings`: 서버 설정 별도 창 — 메인을 건드리지 않아 작업 상태가 보존된다
//!
//! ⚠️ 창을 생성/조작하는 커맨드는 반드시 `async` 로 선언할 것.
//! 동기 커맨드는 메인 스레드에서 실행되어 Windows 에서 창 생성이 데드락된다.

use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 앱 로컬 origin — 로컬 페이지(로더/설정)가 로드될 때 자기 URL 을 등록한다.
/// dev(내장 dev 서버)와 프로덕션(tauri.localhost)의 주소가 달라서 고정할 수 없다.
pub struct AppOrigin(Mutex<Option<Url>>);

/// 등록된 origin 이 없을 때의 폴백 (프로덕션 기준 주소).
fn fallback_app_url(page: &str) -> Url {
    let base = if cfg!(any(target_os = "windows", target_os = "android")) {
        "http://tauri.localhost/"
    } else {
        "tauri://localhost/"
    };
    Url::parse(base)
        .and_then(|b| b.join(page))
        .expect("fallback app url must be valid")
}

/// 모든 페이지(원격 포함)에 주입되는 스크립트 — Ctrl+F12 로 설정 창 열기.
const INIT_SCRIPT: &str = r#"
(function () {
  function openSettings() {
    var t = window.__TAURI__;
    if (t && t.core && t.core.invoke) { t.core.invoke('open_settings'); return; }
    var i = window.__TAURI_INTERNALS__;
    if (i && i.invoke) i.invoke('open_settings');
  }
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.key === 'F12') { e.preventDefault(); openSettings(); }
  }, true);
})();
"#;

/// 앱 시작 시 1회 — origin 상태 등록 + 메인 창 생성.
pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(AppOrigin(Mutex::new(None)));
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("WebShell")
        .inner_size(1100.0, 750.0)
        .initialization_script(INIT_SCRIPT)
        .build()?;
    Ok(())
}

/// 로컬 페이지(로더/설정)가 로드 시 호출 — 현재 앱 origin 을 기록해 둔다.
#[tauri::command]
pub fn report_app_origin(window: WebviewWindow, origin: State<'_, AppOrigin>) {
    if let Ok(url) = window.url() {
        *origin.0.lock().unwrap() = Some(url);
    }
}

/// 설정을 별도 창으로 연다 — 이미 열려 있으면 포커스만.
#[tauri::command]
pub async fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window("settings") {
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("서버 설정")
        .inner_size(560.0, 460.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn close_settings(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        window.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 메인 창을 로더로 되돌린다 — 서버 URL 이 바뀌었을 때만 설정 창이 호출.
#[tauri::command]
pub async fn reload_main(app: AppHandle, origin: State<'_, AppOrigin>) -> Result<(), String> {
    let url = origin
        .0
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|base| base.join("index.html").ok())
        .unwrap_or_else(|| fallback_app_url("index.html"));
    if let Some(window) = app.get_webview_window("main") {
        window.navigate(url).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}
