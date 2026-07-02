//! 셸 설정(config.json) 관리.
//!
//! 저장 위치: OS 표준 앱 설정 디렉토리 (Windows: `%AppData%\com.xxxx.webshell\config.json`,
//! Android: 앱 전용 데이터 디렉토리) — `identifier` 기준으로 Tauri 가 정한다.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// 셸 설정 스키마. 항목 추가 시 `#[serde(default)]` 덕에 기존 파일과 호환된다.
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ShellConfig {
    /// 웹뷰가 접속할 사이트 주소. 비어 있으면 최초 설정이 필요한 상태.
    pub server_url: Option<String>,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn get_config(app: AppHandle) -> Result<ShellConfig, String> {
    let path = config_path(&app)?;
    if !path.exists() {
        return Ok(ShellConfig::default());
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: ShellConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    let text = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())
}

/// 설정 파일 삭제 — 미설정(최초 실행) 상태로 되돌린다.
#[tauri::command]
pub fn reset_config(app: AppHandle) -> Result<(), String> {
    let path = config_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
