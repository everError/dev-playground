# 01. 셋업 — Nuxt 4 + trpc-nuxt v2

> **목표**: Nuxt 풀스택 앱에서 가장 작은 tRPC 호출 (`hello` query)을 클라이언트→서버로 한 바퀴 돌려서, 셋업이 정상임을 검증.

## 환경

| 항목 | 버전 |
|------|------|
| Node | v22.14.0 |
| npm | 10.9.2 |
| Nuxt | 4.4.2 |
| Vue | 3.5.33 |
| trpc-nuxt | 2.0.2 |
| @trpc/server / @trpc/client | 11.16.0 |
| zod | 4.3.6 |

---

## 1. 프로젝트 생성

```bash
npx nuxi@latest init trpc-nuxt-app -t minimal --packageManager npm --no-install --gitInit false
```

### 📌 시행착오: 인터랙티브 프롬프트
- `nuxi init`은 옵션 없이 실행하면 **template 선택 / 모듈 선택 프롬프트**가 뜸. 비대화식 환경에서는 hang.
- **해결**: `-t minimal`로 템플릿 명시. (다른 옵션: `content`, `module`, `ui`)
- `--no-install`로 의존성 설치는 분리 (한 번에 추가 패키지까지 같이 install하기 위함).
- `--gitInit false`로 git init 스킵 (이미 상위 레포에 속해 있음).

### 📌 Nuxt 4 디렉터리 구조 (Nuxt 3과의 차이)
- 클라이언트 코드는 **`app/` 폴더 안**으로 들어감 (`app/app.vue`, `app/pages/`, `app/plugins/` 등).
- 서버 코드는 여전히 **루트의 `server/`** 폴더.
- alias:
  - `~/` / `@/` → `app/` (srcDir)
  - `~~/` / `@@/` → 프로젝트 루트
  - 따라서 **클라이언트에서 서버 라우터 타입을 import하려면 `~~/server/...`** 사용.

---

## 2. 의존성 설치

```bash
cd trpc-nuxt-app
npm install trpc-nuxt @trpc/server @trpc/client zod
```

`postinstall`에 `nuxt prepare`가 걸려 있어 자동으로 alias / type 정의가 생성됨.

---

## 3. 핵심 발견: `trpc-nuxt` v2는 Nuxt 모듈이 아니다

`trpc-nuxt`의 `package.json`을 보면 `exports`가 두 개뿐:

```json
"./client": { "types": "./dist/client/index.d.ts", "import": "./dist/client/index.js" },
"./server": { "types": "./dist/server/index.d.ts", "import": "./dist/server/index.js" }
```

- **`nuxt.config.ts`의 `modules` 배열에 등록할 필요 없음.**
- 그냥 `trpc-nuxt/server`에서 `createTRPCNuxtHandler`를 import해서 `server/api/trpc/[...trpc].ts`에 export하고, `trpc-nuxt/client`에서 `createTRPCNuxtClient`를 import해서 plugin에 provide하는 구조.
- "모듈 자동 마운트"를 기대했다면 어긋남. **헬퍼 라이브러리**로 보는 게 정확.

---

## 4. 서버 골격

### `server/trpc/trpc.ts` — tRPC 인스턴스
```ts
import { initTRPC } from '@trpc/server'
import type { Context } from './context'

const t = initTRPC.context<Context>().create()
export const router = t.router
export const publicProcedure = t.procedure
```

### `server/trpc/context.ts` — 요청 단위 컨텍스트
```ts
export async function createContext(event: H3Event, _opts: FetchCreateContextFnOptions) {
  return { event }
}
export type Context = Awaited<ReturnType<typeof createContext>>
```
> 여기에 인증된 사용자 / DB 핸들 / 로거를 추가하면 모든 procedure가 `ctx.user` / `ctx.db`로 접근 가능. 이번 단계에선 `event`만.

### `server/trpc/routers/index.ts` — 라우터
```ts
export const appRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string().min(1) }).optional())
    .query(({ input }) => ({
      greeting: `Hello, ${input?.name ?? 'world'}!`,
      timestamp: new Date().toISOString(),
    })),
})
export type AppRouter = typeof appRouter
```
> **`AppRouter` 타입만이 클라이언트로 흐른다.** 구현 코드는 클라이언트 번들에 포함되지 않음 (tRPC의 핵심).

### `server/api/trpc/[...trpc].ts` — 핸들러 마운트
```ts
import { createTRPCNuxtHandler } from 'trpc-nuxt/server'
import { appRouter } from '~~/server/trpc/routers'
import { createContext } from '~~/server/trpc/context'

export default createTRPCNuxtHandler({
  router: appRouter,
  createContext,
})
```
> `[...trpc].ts`는 Nuxt server route의 catch-all. `/api/trpc/hello`, `/api/trpc/todo.list` 등 모든 procedure 경로를 한 핸들러가 받음.

---

## 5. 클라이언트 골격

### `app/plugins/trpc.ts`
```ts
import { createTRPCNuxtClient, httpBatchLink } from 'trpc-nuxt/client'
import type { AppRouter } from '~~/server/trpc/routers'

export default defineNuxtPlugin(() => {
  const client = createTRPCNuxtClient<AppRouter>({
    links: [httpBatchLink({ url: '/api/trpc' })],
  })
  return { provide: { trpc: client } }
})
```
> Nuxt가 `app/plugins/`를 자동으로 로드해 `useNuxtApp().$trpc`로 전역 제공.

### `app/app.vue` — 검증 페이지
```vue
<script setup lang="ts">
const { $trpc } = useNuxtApp()
const { data, error } = await $trpc.hello.useQuery({ name: 'tRPC' })
</script>

<template>
  <pre v-if="!error">{{ data }}</pre>
</template>
```

---

## 6. 동작 검증

### a. 페이지 SSR
```bash
curl -s http://localhost:3000/
```

응답 HTML에 다음이 인라인으로 포함됨:
```html
<pre>{
  "greeting": "Hello, tRPC!",
  "timestamp": "2026-04-25T18:22:33.028Z"
}</pre>
```

→ **`useQuery`가 SSR 단계에서 실행되어 결과가 HTML에 prerender됨.** Hydration 시점엔 추가 네트워크 요청 없음 (`__NUXT_DATA__`에 직렬화).

### b. 직접 HTTP 호출
```bash
curl -s "http://localhost:3000/api/trpc/hello?input=%7B%22name%22%3A%22tRPC%22%7D"
```

응답:
```json
{"result":{"data":{"greeting":"Hello, tRPC!","timestamp":"2026-04-25T18:22:37.211Z"}}}
```

→ tRPC v11 wire format. `result.data` 안에 procedure 반환값. (input은 URL의 `input` 쿼리 파라미터에 JSON-encoded)

---

## 7. ⚠️ 함정: Server tsconfig에 `types: ["node"]`가 없다

`process.uptime()` 같은 Node 전역을 server 코드에 쓰면 IDE/`nuxt typecheck`에서 다음 오류:
```
error TS2591: Cannot find name 'process'. Do you need to install type definitions for node?
```

런타임에선 정상 동작 (Nitro가 polyfill 제공)하지만, **`.nuxt/tsconfig.server.json`이 의도적으로 Node 타입을 노출하지 않음**:
```jsonc
{
  "compilerOptions": {
    "lib": ["esnext", "webworker", "dom.iterable"]
    // ⚠️ "types" 필드 자체가 없음 — @types/node가 있어도 자동 포함 X
  }
}
```

### 왜 이렇게 설계됐나
Nitro는 Node 외에도 **Cloudflare Workers / Deno / Bun** 등 다양한 런타임으로 빌드 가능하도록 설계됨.
Node 전역(`process`, `Buffer` 등)을 자유롭게 쓰면 다른 런타임으로 옮길 때 깨지기 쉬워, **타입 단계에서 미리 막아두는 것**이 의도.

### 해결 방향 (우선순위)
1. **runtime-agnostic 코드로 대체** ← 권장. (예: `process.uptime()` → `Date.now() - serverStartedAt`)
2. `import process from 'node:process'` ← `@types/node`도 없으면 import 자체가 막힘.
3. `nuxt.config.ts`에서 server tsconfig에 `types: ['node']` 강제 + `@types/node` 설치 ← Node 전용 배포가 확정일 때만.

이 레포는 1번 방향을 따라 `serverInfo`를 ES standards 만으로 구현 ([system.ts](../trpc-nuxt-app/server/trpc/routers/system.ts)).

---

## 8. 이 단계에서 배운 것

- **tRPC는 wire format이 그냥 JSON**이다 — 별도 디코더 없이 `curl`로 호출 가능. (대비: gRPC는 protobuf 바이너리라 디코더 필요)
- **`trpc-nuxt` v2는 Nuxt 모듈이 아니라 thin wrapper**다. `httpBatchLink`가 Nuxt의 `$fetch`를 사용하도록 한 것이 핵심 차이 — SSR 단계에서 같은 프로세스 내 server route를 직접 호출해 추가 HTTP round-trip을 절약함.
- **타입 흐름이 `~~/server/trpc/routers`의 `AppRouter` import 한 줄에 다 들어 있다**. GraphQL의 SDL 작성 → codegen → 클라 import 단계가 사라짐.
- **AsyncData 통합**: `useQuery`가 Nuxt의 `useAsyncData`를 그대로 활용 → SSR/hydration/캐싱이 자연스럽게 묶임.

## 9. 다음 단계

- [02. 첫 procedure를 분리된 router로](./02-first-procedure.md) — `routers/`를 도메인별로 쪼개고 nested router 구조 잡기.
