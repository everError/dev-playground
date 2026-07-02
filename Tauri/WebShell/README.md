# WebShell

서버에 배포된 웹을 웹뷰로 감싸 **설치형 프로그램**으로 만들어 주는 범용 셸 앱.
[Tauri 2](https://tauri.app) 기반 — Windows와 Android를 같은 코드베이스로 지원한다.

## 동작 개요

```
시작 → 로더(index.html)
        ├ 설정 없음  → "서버 주소를 설정해 주세요" + 설정 창 자동 오픈
        ├ 접속 실패  → 오류 안내 + [다시 시도] [설정 열기]
        └ 접속 성공  → 서버 사이트로 이동 (메인 웹뷰 = 업무 화면)

어느 화면에서든 Ctrl+F12 → 설정 창(별도 창, 메인 상태 보존)
  ├ 저장: URL 변경 시에만 메인 리로드
  ├ 설정 초기화: config.json 삭제 → 미설정 상태로
  └ 프로그램 종료
```

## 최초 개발 환경 세팅 (init)

| 도구                       | 설치                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Visual Studio C++ 워크로드 | VS Installer → "C++를 사용한 데스크톱 개발" 체크 (MSVC + Windows 11 SDK). VS 없으면 Build Tools 2022 로 대체 |
| Rust                       | `winget install Rustlang.Rustup` → 새 터미널에서 `rustc --version` 확인                                      |
| Node.js 22 + pnpm          | 프로젝트 공통 환경 그대로                                                                                    |
| WebView2 런타임            | Windows 10/11 기본 탑재 — 별도 설치 불필요                                                                   |

VS Code 확장: **rust-analyzer**, **Tauri**, **Even Better TOML**

```powershell
pnpm install        # 의존성 설치 (@tauri-apps/cli)
```

## 실행 / 빌드

```powershell
pnpm tauri dev      # 개발 실행 — src/ 는 저장 즉시, src-tauri/ 는 재컴파일 후 반영
pnpm tauri build    # 릴리스 빌드 + 설치본 생성
                    # 산출물: src-tauri/target/release/bundle/nsis/*.exe
```

## 디렉토리 구조

```
WebShell/
  src/                        # 셸 로컬 페이지 (바닐라 HTML/JS — 번들러 없음)
    index.html / main.js      #   로더: 설정 확인 → 접속 확인 → 사이트 이동
    settings.html / settings.js #  설정 창: URL 편집/저장/초기화/종료
    styles.css
  src-tauri/
    src/
      lib.rs                  #   엔트리 — 모듈/커맨드 배선
      config.rs               #   설정 파일 읽기/쓰기/초기화
      windows.rs              #   창 관리 (메인/설정), Ctrl+F12, origin 추적
      main.rs                 #   (자동 생성 — 손대지 않음)
    capabilities/
      default.json            #   로컬 페이지(main/settings 창) 권한
      remote.json             #   원격 사이트에 노출할 커맨드 — 최소 노출 원칙
    build.rs                  #   앱 커맨드 ACL 매니페스트 선언
    tauri.conf.json           #   앱 식별자/번들/창 설정
    icons/                    #   앱 아이콘 (원본: icon.png)
```

## 셸 설정 파일

- 위치: `%AppData%\com.xxxx.webshell\config.json` (Android 는 앱 데이터 디렉토리 — Tauri 가 identifier 기준 자동 결정)
- 스키마:
  ```json
  { "serverUrl": "http://localhost:9060" }
  ```
- 파일을 지우면 최초 설정 상태로 돌아간다.

## 커맨드 추가 절차 (중요)

커맨드 하나를 추가하려면 **세 곳**을 함께 갱신해야 한다:

1. `src-tauri/src/{모듈}.rs` — `#[tauri::command] pub fn` 정의
2. `src-tauri/src/lib.rs` — `generate_handler!` 목록에 추가
3. `src-tauri/build.rs` 의 `app_manifest` commands 목록 + `capabilities/*.json` 에 `allow-{커맨드-케밥케이스}` 권한
   - 로컬 페이지용 → `default.json`
   - **원격 사이트가 호출해야 하는 커맨드만** → `remote.json` (최소 노출 원칙)

## 개발하며 확인된 함정 (재발 방지)

| 함정                             | 내용                                                                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **창 생성 커맨드는 async 필수**  | 동기 커맨드는 메인 스레드에서 실행 → 창 생성 시 Windows 데드락(빈 창 + 전체 멈춤). `open_settings` 등 창을 만들거나 조작하는 커맨드는 `async fn` 으로 선언                         |
| **원격 URL 패턴의 포트 함정**    | capability `remote.urls` 는 URLPattern 규격 — `http://*` 는 포트가 **기본값(80)으로 고정**된다. `:9060` 같은 포트를 허용하려면 `http://*:*/*` 형태로 포트·경로까지 와일드카드 명시 |
| **원격 invoke 는 2중 허용 필요** | 원격 사이트에서 커맨드 호출 = build.rs `app_manifest` 선언 + `remote.json` 권한. 둘 중 하나라도 빠지면 "not allowed. Plugin not found"                                             |
| **앱 origin 은 고정이 아님**     | dev 는 내장 dev 서버, 프로덕션은 `http://tauri.localhost` — 로컬 페이지 복귀 URL 을 하드코딩하지 말고 `report_app_origin` 으로 런타임에 등록                                       |
| **설정은 별도 창으로**           | 메인 웹뷰를 설정 페이지로 navigate 하면 작업 상태가 그 즉시 날아간다. 설정은 `settings` 창으로 분리, URL 변경 시에만 메인 리로드                                                   |

## 아이콘 교체

```powershell
pnpm tauri icon <정사각형-PNG-경로>   # ico/icns/android/ios 전체 재생성
```

원본은 투명 배경 정사각형 PNG(1024px 권장). 생성물 중 `icons/icon.png|ico|icns` 와 `android/`, `ios/` 만 유지하면 된다.
