````markdown
# Tauri

웹 기술(HTML/CSS/JS)로 UI를 만들고 Rust 코어가 네이티브 기능을 담당하는
크로스플랫폼 앱 프레임워크. 데스크톱(Windows/macOS/Linux)과 모바일(Android/iOS)을
하나의 코드베이스로 지원한다. 읽기는 "타우리" (황소자리 별 Alpha Tauri에서 유래).

## 핵심 개념

Electron과 같은 "웹 프론트 + 네이티브 셸" 계열이지만, 결정적 차이는
**브라우저 엔진을 번들하지 않고 OS 내장 웹뷰를 쓴다**는 것.

| OS | 사용하는 웹뷰 |
|---|---|
| Windows | WebView2 (Chromium 기반, Win10/11 기본 탑재) |
| macOS / iOS | WKWebView (Safari 엔진) |
| Linux | WebKitGTK |
| Android | System WebView (Chromium 기반) |

그 결과:
- 배포물 5~10MB (Electron 150MB+), 낮은 메모리 사용, 빠른 시작
- 대신 OS·PC마다 웹뷰 버전이 다를 수 있음 (Electron은 Chromium 고정이라 렌더링이 완전 동일)

## 아키텍처

```
┌────────────── Tauri 앱 (단일 프로세스) ──────────────┐
│  Rust 코어 (src-tauri/)                              │
│   ├ tao  : 창 생성/이벤트 루프                        │
│   ├ wry  : OS 웹뷰 추상화 레이어                      │
│   ├ #[tauri::command] 함수  ← 네이티브 기능 노출       │
│   └ 플러그인                                          │
│           ↕ IPC                                       │
│  웹뷰 — 프론트엔드 (로컬 정적 파일 or 원격 URL)         │
└──────────────────────────────────────────────────────┘
```

- **프론트엔드 불가지론**: Vue/React/Svelte/바닐라 무엇이든. 빌드 결과(정적 파일)만 있으면 됨.
  원격 사이트 URL을 직접 로드할 수도 있다(웹뷰 셸 형태).
- Node.js 없음. OS 접근은 전부 Rust 코어를 통해서만 이뤄진다.
- Rust를 몰라도 시작 가능 — 공식 플러그인들이 JS API를 제공해서 창 제어, 파일,
  알림, 설정 저장 등은 JS만으로 처리. 커스텀 네이티브 기능이 필요할 때만 Rust 커맨드 작성.

## IPC (웹 ↔ Rust 통신)

세 가지 채널:

1. **커맨드 (요청/응답)** — JS `invoke()` → Rust `#[tauri::command]` 함수, 결과는 Promise로.

```rust
#[tauri::command]
fn greet(name: String) -> String { format!("Hello, {name}") }
```

```ts
import { invoke } from '@tauri-apps/api/core';
const msg = await invoke<string>('greet', { name: 'World' });
```

2. **이벤트 (푸시)** — `emit()` / `listen()`. Rust→JS, JS→Rust 양방향, 창 간 브로드캐스트 가능.
3. **채널(Channel)** — 대량/스트리밍 데이터 전송용 (다운로드 진행률 등).

## 보안 모델 (v2)

Tauri 2의 대표 특징. "웹뷰 안의 코드가 네이티브에 뭘 시킬 수 있는가"를 선언적으로 통제한다.

- **Permission**: 개별 API 단위 허용 (예: `fs:allow-read`, 특정 커맨드).
- **Capability**: permission 묶음을 "어떤 창, 어떤 URL"에 부여할지 선언
  (`src-tauri/capabilities/*.json`). 선언 안 된 API는 호출 자체가 차단.
- **Scope**: 허용 범위 제한 (예: fs는 `$APPDATA/**` 만).
- 원격 URL에서 실행되는 JS는 기본적으로 invoke 불가 — capability에 `remote.urls` 를
  명시해야 열린다. CSP 설정도 tauri.conf.json에서 관리.

## 플러그인 생태계

기능 대부분이 코어가 아닌 공식 플러그인으로 분리돼 있다 (`tauri-plugin-*`).

| 공통 | 데스크톱 전용 | 모바일 전용 |
|---|---|---|
| fs, store(키-값 설정), dialog, notification, http, shell, os, log, deep-link, websocket | **updater**(자동 업데이트), single-instance, autostart, global-shortcut, window-state, tray | **barcode-scanner**, nfc, biometric, haptics, geolocation |

## 개발 흐름

```bash
npm create tauri-app@latest   # 골격 생성 (프론트 프레임워크 선택)
npm run tauri dev             # 개발 실행 (프론트 핫리로드 + Rust 재컴파일)
npm run tauri build           # 릴리스 빌드 + 플랫폼별 인스톨러 생성

npm run tauri android init    # 모바일 타깃 추가 (ios 동일, iOS 빌드는 macOS 필요)
```

- 프로젝트 구조: 프론트엔드(루트) + `src-tauri/`(Rust 코어, 설정, 아이콘, capabilities).
- 설정 파일: `src-tauri/tauri.conf.json` — 창 옵션(크기, decorations, fullscreen 등),
  번들, 보안, 업데이터 설정.
- 사전 요구: Rust 툴체인 (+ Android는 Android Studio/NDK).

## 배포

- **번들 포맷**: Windows NSIS(.exe)/MSI, macOS .app/.dmg, Linux .deb/.rpm/AppImage,
  Android APK/AAB, iOS IPA — `tauri build` 한 번에 생성.
- **자동 업데이트**(데스크톱 전용): updater 플러그인. 정적 파일 서버에 `latest.json` +
  서명된 설치본만 올리면 동작 — 전용 업데이트 서버 불필요, 자체 호스팅 가능.
  업데이트 파일은 개인키 서명이 필수(위변조 방지). 모바일은 스토어/APK 배포.

## vs Electron 요약

| | Tauri | Electron |
|---|---|---|
| 웹 엔진 | OS 웹뷰 (환경따라 버전 가변) | Chromium 번들 (고정) |
| 백엔드 언어 | Rust | Node.js |
| 배포물 / 메모리 | 5~10MB / 낮음 | 150MB+ / 높음 |
| 모바일 | ○ (v2부터) | ✗ |
| 보안 모델 | capability 선언적 통제 내장 | 직접 설계 |
| 생태계 | 성장 중 | 매우 성숙 (사례·패키지 풍부) |

## 참고

- 공식 사이트/문서: https://tauri.app
- 예제·앱 모음: https://github.com/tauri-apps/awesome-tauri
````