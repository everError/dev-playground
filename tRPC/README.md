# tRPC + Nuxt 풀스택 실습

## 프로젝트 개요

이 프로젝트는 **tRPC**를 **Nuxt 풀스택** 환경에서 학습하는 것을 목표로 합니다.
별도의 스키마(IDL)나 코드 생성 단계 없이, **TypeScript 타입만으로 클라이언트-서버 간 end-to-end 타입 안전성**을 확보하는 흐름을 직접 구현합니다.
같은 레포의 [GraphQL/Apollo](../graphql-apollo/), [gRPC](../gRPC/) 실습과 비교 학습 가능하도록 단계별로 기록합니다.

## 사용 기술

- **Framework**: Nuxt 3 (풀스택, `server/` 디렉터리에 라우터 마운트)
- **RPC**: tRPC v11 (`trpc-nuxt`)
- **Validation**: [Zod](../Zod/) (입력 스키마 + 타입 추론)
- **Server-side state**: TanStack Query (Vue Query) — `trpc-nuxt`가 내부적으로 통합

---

## 📌 tRPC란?

**tRPC** (TypeScript Remote Procedure Call) 는 TypeScript 환경에서
**별도 코드 생성 단계 없이** 서버에 정의한 함수를 클라이언트에서 직접 호출할 수 있게 해주는 RPC 프레임워크입니다.

### ✅ 핵심 특징

- **No codegen, no schema files**
  `.proto`나 GraphQL SDL 같은 별도 IDL이 없습니다. **서버 라우터의 타입이 그대로 클라이언트로 흐름.**
- **End-to-end type safety**
  서버 procedure를 추가/변경하면 클라이언트 호출부에서 **즉시 타입 오류로 잡힘**.
- **Zod 기반 input validation**
  런타임 검증과 컴파일 타임 타입을 **한 번에 정의** (이 레포의 [Zod](../Zod/) 폴더와 직결).
- **Pure TypeScript**
  다른 언어 클라이언트는 지원하지 않음 → **TS 풀스택 전용**.

### ✅ 핵심 용어

| 용어 | 설명 |
|------|------|
| **Router** | procedure들을 묶은 단위. 중첩 가능 (`appRouter.todo.list`). |
| **Procedure** | 서버에 정의된 단일 함수. `query`(읽기) / `mutation`(쓰기) / `subscription`(스트리밍). |
| **Input** | Zod 스키마로 정의 → 런타임 검증 + 타입 추론을 한 번에. |
| **Context** | 모든 procedure가 공유하는 요청 단위 객체 (인증 정보, DB 핸들 등). |
| **Middleware** | procedure 실행 전후에 끼어드는 함수 (인증 가드, 로깅 등). |

---

## 📌 왜 Nuxt 풀스택과 짝인가?

tRPC는 **같은 레포에 서버와 클라이언트가 공존**할 때 가치가 극대화됩니다.
서버 라우터의 *타입*을 클라이언트가 직접 import해서 쓰는 구조라, **단일 코드베이스일수록 자연스럽기** 때문입니다.

Nuxt는 이 형태에 잘 맞습니다.

- `server/` 디렉터리에서 server routes를 바로 마운트할 수 있고,
- `trpc-nuxt`가 client(`useNuxtApp().$client`)와 server를 자동 연결,
- **SSR 단계에서 procedure를 미리 호출**해 hydration까지 매끄럽게 이어집니다.

→ 별도 BE/FE 폴더 분리 없이 한 앱에서 모든 흐름을 다룰 수 있어, **tRPC가 가장 빛나는 형태**입니다.
(반대로 다른 언어/팀이 클라이언트가 되어야 한다면 tRPC 대신 GraphQL이나 gRPC가 적합합니다.)

---

## 📌 GraphQL / REST / gRPC와 비교

| 항목 | REST | GraphQL | gRPC | **tRPC** |
|------|------|---------|------|------|
| 인터페이스 정의 | 없음 (OpenAPI 별도) | SDL | `.proto` | **TS 타입 자체** |
| 코드 생성 | 선택 | 선택 | 필수 | **불필요** |
| 직렬화 | JSON | JSON | Protobuf (binary) | JSON |
| 타입 안전성 | 약함 | 중간 (codegen 시 강함) | 강함 (codegen) | **매우 강함 (네이티브 TS)** |
| 다언어 클라이언트 | ✅ | ✅ | ✅ | ❌ (TS 전용) |
| 스트리밍 | ❌ | Subscription | 양방향 | Subscription (제한적) |
| 적합한 곳 | 공개 API | 다양한 클라이언트 / 가변 데이터 셋 | MSA 내부 통신 | **TS 풀스택 모노레포 / 단일 앱** |

> 자세한 회고/비교는 마지막 단계 [`notes/07-comparison.md`](./notes/07-comparison.md)에서 정리합니다.

---

## 🛠️ 학습 흐름

각 단계의 결정·시행착오·핵심 코드 스니펫을 `notes/`에 기록합니다.
처음 들어왔다면 **00 입문**부터 읽고 단계별 노트로 진입하면 좋습니다.

0. **입문 (개념 + 함정 한 번에)** — tRPC가 무엇이고 이 레포가 어떻게 짜였는지 풀어쓴 가이드 → [notes/00-overview.md](./notes/00-overview.md)
1. **셋업** — Nuxt 3 + `trpc-nuxt` 설치, 기본 라우터 마운트 → [notes/01-setup.md](./notes/01-setup.md)
2. **첫 procedure** — query 하나로 클라이언트→서버 호출 흐름 보기 → [notes/02-first-procedure.md](./notes/02-first-procedure.md)
3. **Zod input + mutation** — Todo CRUD 구현 → [notes/03-mutation-zod.md](./notes/03-mutation-zod.md)
4. **Context & Middleware** — 인증 컨텍스트, 가드 → [notes/04-context-middleware.md](./notes/04-context-middleware.md)
5. **에러 처리** — `TRPCError`, 커스텀 에러 코드, 클라이언트에서의 처리 → [notes/05-error-handling.md](./notes/05-error-handling.md)
6. **SSR & 캐싱** — Nuxt SSR 단계의 procedure 사전 호출, hydration → [notes/06-ssr-prefetch.md](./notes/06-ssr-prefetch.md)
7. **회고** — GraphQL/gRPC 대비 장단점 회고 → [notes/07-comparison.md](./notes/07-comparison.md)

---

## 📁 폴더 구조

```
tRPC/
├── README.md           # ← 지금 이 파일
├── notes/              # 단계별 학습 기록
└── trpc-nuxt-app/      # Nuxt 풀스택 앱 (다음 단계에서 생성)
```

---

## 📚 학습 도메인

**Todo CRUD** — 가장 작은 도메인에서 출발해 단계별로 인증·에러·SSR 같은 요소를 덧붙여 갑니다.
