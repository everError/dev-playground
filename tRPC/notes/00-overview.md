# 00. tRPC 개념 입문 — 이 레포로 학습한 내용 정리

> 이 문서는 다음에 이 코드를 다시 봤을 때 **한 번에 다시 떠올릴 수 있도록** 핵심 개념과 함정을 풀어 설명한 입문 가이드입니다.
> 단계별 노트(01~07)로 들어가기 전에 먼저 읽으면 좋습니다.

---

## 들어가며

이 레포는 **tRPC를 Nuxt 풀스택 환경에 얹어 Todo CRUD를 구현하면서 학습한 기록**입니다.
tRPC라는 게 한 줄로 무엇인지부터 이야기하자면 — **"TypeScript로 작성한 서버 함수를, 클라이언트가 별도 스키마/코드 생성 없이 그대로 호출할 수 있게 해주는 RPC 프레임워크"** 입니다.

여기서 핵심은 *"별도 스키마 없이"* 라는 부분입니다. GraphQL이라면 SDL(스키마 정의 언어)을 따로 작성해야 하고, gRPC라면 `.proto` 파일을 만들고 `protoc`로 코드 생성을 돌려야 합니다. tRPC는 이런 **중간 단계가 통째로 사라집니다.** 서버 라우터의 *타입* 그 자체가 클라이언트 자동완성의 원천이 되거든요.

이 문서는 그 핵심을 다시 풀어 정리하면서, 학습 도중 만났던 함정과 코드 구조까지 한꺼번에 묶어 둡니다.

---

## 1. tRPC가 풀려는 문제

전형적인 풀스택 프로젝트에서 서버와 클라이언트의 통신은 보통 이렇게 굴러갑니다.

1. 서버에 새 엔드포인트를 만든다 (예: `POST /todos`)
2. 응답/요청 모양을 어딘가에 정의한다 (OpenAPI 스펙, GraphQL 스키마, 또는 그냥 문서)
3. 클라이언트는 그 정의를 보고 타입을 만든다 (수동, 또는 codegen)
4. 새 필드가 생기면 → 서버 변경 → 정의 갱신 → 클라이언트 codegen 다시 → import 갱신

**이 동기화 비용이 매번 들어가고, 빼먹으면 런타임 에러로 직행합니다.**

tRPC의 발상은 단순합니다.

> "어차피 풀스택 모노레포면 서버 코드를 클라가 import할 수 있잖아. 그럼 서버 라우터의 *타입*을 그대로 import해서 쓰자. 코드 본체는 어차피 트리쉐이킹으로 빠질 거고, 타입은 컴파일 시점에만 쓰이니 런타임에는 영향 없음."

이게 잘 작동하려면 클라이언트와 서버가 같은 언어(=TypeScript)여야 합니다. 그래서 tRPC는 **TS 풀스택 전용**입니다. 다른 언어 클라이언트를 지원해야 한다면 즉시 후보에서 제외됩니다 — 그 점만 합의되면 강력한 도구.

---

## 2. 핵심 개념 5가지

### ① Router와 Procedure

tRPC에서 서버 코드의 기본 단위는 두 개입니다.

- **Procedure**: 클라이언트가 호출할 단일 함수. `query`(읽기) / `mutation`(쓰기) / `subscription`(스트리밍) 셋 중 하나.
- **Router**: procedure들을 묶은 묶음. 안에 다른 router를 또 넣을 수 있음 (nested).

이 레포의 경우 최상위 라우터 모양은 이렇습니다.

```ts
// server/trpc/routers/index.ts
export const appRouter = router({
  system: systemRouter,   // hello, serverInfo
  todo: todoRouter,       // list, add, toggle, remove
})
```

클라이언트는 이걸 **그대로 객체 경로로 호출**합니다.

```ts
$trpc.system.hello.useQuery({ name: 'tRPC' })
$trpc.todo.list.useQuery()
$trpc.todo.add.useMutation()
```

서버 트리 구조 ⇄ 클라이언트 호출 경로가 **1:1**입니다. `system` 도메인을 추가하는 즉시 클라이언트 IDE 자동완성에 `$trpc.system.*`이 뜨는 게 tRPC의 결정적 매력 — 별도 동기화 작업이 0입니다.

### ② Input은 Zod로 (검증과 타입 추론을 한 번에)

procedure에 입력 스키마를 다는 방법은 `.input()`에 Zod 스키마를 넘기는 것입니다.

```ts
add: publicProcedure
  .input(z.object({
    text: z.string().trim().min(1, '내용을 입력해주세요.').max(120),
  }))
  .mutation(({ input }) => {
    // 여기서 input.text는 자동으로 string 타입
    // 그리고 검증을 이미 통과한 값이라 안전
  })
```

여기서 두 가지가 동시에 일어납니다.

1. **런타임 검증**: 빈 문자열이 오면 자동으로 `BAD_REQUEST` (400) 응답. 핸들러는 호출되지도 않음.
2. **컴파일 타입 추론**: 핸들러 안의 `input`은 Zod 스키마에서 추론된 타입. `input.text`가 string이라는 걸 IDE가 안다.

**검증 코드와 타입 정의를 두 번 쓸 일이 없다**는 게 tRPC + Zod 조합의 핵심입니다. 이 레포의 [Zod 폴더](../../Zod/) 학습이 그대로 활용됩니다.

### ③ Context — 요청마다 만드는 의존성 주입 객체

REST/Express에서는 `req` 객체에 `req.user`, `req.db` 같은 걸 붙이는 식으로 요청 단위 의존성을 다뤘습니다. tRPC는 이걸 **`createContext` 함수 하나로 통일**합니다.

```ts
// server/trpc/context.ts
export async function createContext(event, _opts) {
  const cookieValue = getCookie(event, 'demo-user-id')
  const user = cookieValue && fakeUsers[cookieValue] ? fakeUsers[cookieValue] : null
  return { event, user }
}

export type Context = Awaited<ReturnType<typeof createContext>>
```

이 함수는 **HTTP 요청이 들어올 때마다 한 번 호출**되고, 반환된 객체가 그 요청 동안의 procedure 핸들러 안에서 `ctx`로 접근됩니다.

```ts
add: protectedProcedure
  .input(addTodoInput)
  .mutation(({ input, ctx }) => {
    // ctx.user는 createContext가 만든 user 객체
    return createTodo(input.text, ctx.user.id)
  })
```

여기에 들어갈 만한 것: 인증된 사용자, DB 핸들, 로거, feature flag. **요청마다 변하는 모든 것**을 한 곳(`createContext`)에서 책임집니다.

📌 `Context` 타입을 한 번 export해두면 `initTRPC.context<Context>().create()`로 바인딩되어, 모든 procedure의 `ctx` 타입이 자동으로 같은 모양이 됩니다. 즉 `ctx`에 새 필드를 추가하면 모든 procedure에서 자동으로 보입니다.

### ④ Middleware — procedure 실행을 감싸는 함수

미들웨어는 procedure 호출 전후에 끼어들어 무언가를 하는 함수입니다.

```ts
const loggerMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()         // ← 실제 procedure 실행
  console.log(`[trpc] ${type} ${path} ${result.ok ? 'ok' : 'err'} (${Date.now() - start}ms)`)
  return result
})

const authedMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' })
  }
  return next({
    ctx: { ...ctx, user: ctx.user },  // ← 핵심: ctx를 narrow해서 다음 단계로
  })
})
```

#### 왜 `next({ ctx })`가 핵심인가

`authedMiddleware`는 `ctx.user`가 없으면 throw하고, 있으면 통과시킵니다. 그러니 미들웨어를 통과한 후의 procedure 핸들러에선 `ctx.user`가 절대 null이 아니죠.

이 사실을 **`next({ ctx: { user: ctx.user } })`로 다음 단계의 ctx 타입에 반영**하면, 그 다음에 오는 procedure 핸들러에서는 `ctx.user`가 자동으로 non-null로 추론됩니다.

```ts
add: protectedProcedure.input(...).mutation(({ ctx }) => {
  // ctx.user가 non-null로 추론됨 (옵셔널 체이닝 불필요)
  return { ownerId: ctx.user.id }
})
```

Express에서 `req.user!.id` 같은 단언(!)을 쓰던 자리가 사라집니다. 미들웨어가 ctx 타입을 좁히면 그 narrowing이 후속 핸들러에 그대로 흐릅니다 — 이게 tRPC 미들웨어의 진짜 가치입니다.

#### 빌더 합성

미들웨어를 매번 procedure에 직접 거는 게 아니라, **역할별 procedure 빌더를 미리 만들어 둡니다.**

```ts
export const publicProcedure    = t.procedure.use(loggerMiddleware)
export const protectedProcedure = t.procedure.use(loggerMiddleware).use(authedMiddleware)
```

이제 router에서는 procedure마다 적절한 빌더로 시작하면 끝입니다.

```ts
list:   publicProcedure.query(...)        // 누구나 호출 가능
add:    protectedProcedure.mutation(...)  // 로그인 필요
remove: protectedProcedure.mutation(...)
```

나중에 관리자 전용 빌더(`adminProcedure`)가 필요하면 `protectedProcedure.use(isAdmin)` 식으로 한 줄 추가하면 됩니다.

### ⑤ TRPCError + errorFormatter

도메인 에러(없는 자원, 권한 없음, 검증 실패 등)는 `TRPCError`를 throw하면 됩니다.

```ts
throw new TRPCError({
  code: 'NOT_FOUND',
  message: '해당 id의 todo를 찾을 수 없습니다.',
})
```

여기서 `code`는 enum-like 문자열인데, **HTTP status로 자동 매핑**됩니다.

| code | HTTP |
|---|---|
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `INTERNAL_SERVER_ERROR` | 500 |
| ... 등등 ... | |

REST 핸들러에서 매번 `res.status(404).json(...)`을 직접 쓰던 부분이 **의미 있는 enum 하나로 압축**됩니다. 클라이언트는 `error.data.code`로 분기 — REST의 status code 분기와 같은 자리지만 가독성과 안전성이 모두 더 높습니다.

#### errorFormatter — 응답 모양을 한 곳에서 통제

`initTRPC.create()`에 `errorFormatter`를 주면 모든 에러 응답의 `data` 필드를 가공할 수 있습니다.

```ts
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodFieldErrors:
          error.code === 'BAD_REQUEST' && error.cause instanceof z.ZodError
            ? z.flattenError(error.cause).fieldErrors as Record<string, string[] | undefined>
            : null,
      },
    }
  },
})
```

이 레포에서 한 일은: **Zod 검증 실패 시 issue 배열을 `{ 필드: [메시지...] }` 형태로 평탄화**해서 클라이언트로 보냅니다. 그 외 에러는 `zodFieldErrors: null`. 모든 에러가 같은 키 집합을 갖게 되니 클라가 한 줄로 분기할 수 있습니다.

```ts
// 클라이언트
if (error.data?.zodFieldErrors) {
  // 필드별로 메시지 표시
} else {
  // explainError(error.data?.code) 같은 일반 메시지
}
```

**핵심은 "응답 모양을 한 곳에서 통제한다"** 는 점입니다. 호출부마다 파싱 로직을 흩뿌리지 않으니, 나중에 응답 shape을 바꿔야 할 때(예: `requestId` 추가) errorFormatter 한 곳만 수정하면 됩니다.

---

## 3. Nuxt와 결합했을 때 (`trpc-nuxt` v2)

여기서 한 가지 짚고 넘어가야 할 게 있는데, **`trpc-nuxt` v2는 Nuxt 모듈이 아닙니다.**
이름만 보면 `nuxt.config.ts`의 `modules` 배열에 등록할 것 같지만, 실제로는 그냥 두 개의 import 경로를 가진 헬퍼 라이브러리예요.

```ts
import { createTRPCNuxtHandler } from 'trpc-nuxt/server'   // 서버 마운트용
import { createTRPCNuxtClient, httpBatchLink } from 'trpc-nuxt/client'  // 클라용
```

그래서 셋업할 때 `nuxt.config.ts`는 손대지 않습니다. 대신:

- **서버 쪽**: `server/api/trpc/[...trpc].ts`에 `createTRPCNuxtHandler({ router, createContext })`를 export.
  - `[...trpc]`는 Nuxt server route의 catch-all. 모든 procedure 경로(`/api/trpc/system.hello`, `/api/trpc/todo.add` 등)를 한 핸들러가 처리합니다.
- **클라 쪽**: `app/plugins/trpc.ts`에서 `createTRPCNuxtClient<AppRouter>({ links: [httpBatchLink({ url: '/api/trpc' })] })`로 클라이언트를 만들고 `provide`로 등록.
  - 이걸로 Nuxt 어디서나 `useNuxtApp().$trpc`로 접근할 수 있게 됩니다.

`trpc-nuxt`가 한 일은 표준 tRPC 클라이언트의 fetcher를 Nuxt의 `$fetch`로 바꿔주고, `useQuery`/`useMutation`을 Nuxt의 `useAsyncData` 위에 얹어주는 것입니다. **얇은 어댑터**라고 보면 정확해요.

### Nuxt 4 디렉터리 구조 차이

이 레포는 Nuxt 4를 씁니다. Nuxt 3과의 가장 큰 차이는 **클라이언트 코드가 `app/` 폴더 안으로 들어간다**는 것.

```
trpc-nuxt-app/
├── app/                         ← 클라이언트 (app.vue, plugins/, pages/, composables/)
├── server/                      ← 서버 (api/, trpc/)
└── nuxt.config.ts
```

별칭(alias)도 이에 맞춰 정리됩니다.

| 별칭 | 가리키는 곳 |
|---|---|
| `~/` 또는 `@/` | `app/` (srcDir) |
| `~~/` 또는 `@@/` | 프로젝트 루트 |

그래서 클라이언트에서 서버 라우터 타입을 import할 때는 `~~/server/trpc/routers`를 씁니다. 이 한 줄이 *서버 라우터 타입 → 클라이언트 자동완성* 을 잇는 다리입니다.

```ts
import type { AppRouter } from '~~/server/trpc/routers'
```

---

## 4. 클라이언트 사용법 — useQuery / useMutation

### useQuery (읽기)

```ts
const { data, pending, error, refresh } = await $trpc.todo.list.useQuery()
```

이 한 줄이 하는 일:
1. `/api/trpc/todo.list` 로 GET 호출
2. 결과를 `data`에 ref로 담음
3. SSR 단계라면 결과를 `__NUXT_DATA__`에 직렬화 → hydrate 시 자동 복원 (재요청 안 함)
4. `refresh()`로 수동 재조회 가능

input이 있는 경우엔 첫 인자로 넘깁니다.

```ts
const { data } = await $trpc.system.hello.useQuery({ name: 'tRPC' })
```

`useQuery`는 사실 **Nuxt의 `useAsyncData`를 fetcher로 tRPC 호출을 박은 것뿐**이에요. 반환 모양도 `useAsyncData`와 동일해서, Nuxt 문서의 useAsyncData 지식이 그대로 유효합니다. 옵션도 마찬가지(`lazy`, `server`, `watch`, `transform`, `default` 등).

### useMutation (쓰기)

```ts
const { mutate, status, error, data } = $trpc.todo.add.useMutation()

async function onSubmit() {
  await mutate({ text: '...' })   // POST 호출
  if (!error.value) {
    await refreshList()           // 성공이면 list 갱신
  }
}
```

| 반환값 | 역할 |
|---|---|
| `mutate(input)` | 명령형 호출 함수. Promise 반환. |
| `status` | `'idle' \| 'pending' \| 'success' \| 'error'` |
| `error` | 실패 시 `TRPCClientError`. `.message`, `.data.code`, `.data.httpStatus` 접근. |
| `data` | 마지막 성공 시점의 반환값 |

mutation은 **사용자 트리거 시점에 명령형으로** 호출하는 게 자연스럽습니다 (버튼 클릭 등). 그래서 `mutate` 함수를 직접 호출하는 형태.

### 정교한 invalidation — `getQueryKey + refreshNuxtData`

mutation 후에 list query를 다시 받아오려면 두 가지 방법이 있습니다.

**단순 방법**: `useQuery`가 반환한 `refresh()`를 호출.

```ts
const { data, refresh } = await $trpc.todo.list.useQuery()
await refresh()
```
이건 **그 useQuery 인스턴스만** 재조회합니다. 헤더의 todo 카운트, 사이드바 등 다른 컴포넌트가 같은 query를 호출했다면 그쪽은 갱신되지 않아요.

**정교한 방법**: `getQueryKey`로 키를 얻어 `refreshNuxtData`로 일괄 갱신.

```ts
import { getQueryKey } from 'trpc-nuxt/client'

const todoListKey = getQueryKey($trpc.todo.list)
const refreshList = () => refreshNuxtData(todoListKey)
```

`refreshNuxtData(key)`는 **같은 key의 모든 `useAsyncData` 인스턴스**를 한 번에 갱신합니다. 컴포넌트가 분리될수록 이게 의미가 있어요. 한 곳에서 mutate한 결과가 다른 곳의 표시까지 일관되게 흐릅니다.

---

## 5. SSR 동작 흐름 (이 부분이 처음에 가장 헷갈림)

Nuxt SSR 환경에서 `useQuery`가 어떻게 동작하는지 정리해 둡니다.

### 기본 흐름 (eager — 옵션 없이)

```
브라우저: GET /
  ↓
서버: app.vue 렌더 시작
  ↓ (useQuery가 await됨)
서버: /api/trpc/todo.list 호출 → JSON 결과 받음
  ↓
서버: HTML에 결과를 인라인 + __NUXT_DATA__에 직렬화
  ↓
브라우저: HTML 도착, 즉시 화면 표시 (이미 데이터 들어 있음)
  ↓
브라우저: hydrate 시 __NUXT_DATA__에서 복원 → 같은 호출을 다시 안 함
```

**SSR로 미리 받아둔 데이터를 클라가 다시 받으러 가지 않는다**는 게 핵심. 이게 자동으로 일어납니다.

### CSR-only로 만들고 싶을 때 (`server: false`)

비핵심 정보(예: 서버 가동 시간), 또는 사용자 상태에 따라 매번 달라지는 데이터는 SSR로 prerender할 의미가 없습니다. 이때:

```ts
const { data } = await $trpc.system.serverInfo.useQuery(
  undefined,
  { lazy: true, server: false },
)
```

이러면:
- SSR에선 fetch 자체를 건너뜀 → HTML에 자리표시자만
- 브라우저가 hydrate 후 fetch 시작 → 데이터 채워지면 화면 갱신

#### ⚠️ 흔한 오해: `lazy: true` ≠ "SSR 끄기"

처음에 `lazy: true`만 쓰면 SSR에서 fetch가 안 일어날 거라 기대했는데, 실제로는 **여전히 prerender됩니다.**

`lazy`의 진짜 의미는 *"이 query 때문에 navigation/렌더 진입을 막지 않는다"* 입니다. SSR에서 fetch 자체는 일어나요. 진짜 CSR-only는 **`server: false`**.

| 옵션 | SSR fetch | navigation 차단 |
|---|---|---|
| 기본 | ✅ | ✅ |
| `lazy: true` | ✅ | ❌ |
| `server: false` | ❌ | (서버에선 의미 X) |

### 인증된 사용자로 SSR fetch가 되려면 (`pickHeaders`)

이게 또 한 군데 헷갈리는 포인트입니다.

브라우저는 same-origin 요청에 cookie를 자동으로 첨부합니다. 그래서 CSR 단계에선 별 신경을 안 써도 인증이 잘 됩니다.

그런데 **SSR 단계의 `/api/trpc/...` 호출은 사실 HTTP가 아니라 같은 프로세스 안의 함수 호출**이에요. Nitro가 server route를 직접 호출하는 형태죠. 이때는 cookie가 자동으로 따라가지 않습니다 — 따로 챙겨야 합니다.

```ts
// app/plugins/trpc.ts
httpBatchLink({
  url: '/api/trpc',
  pickHeaders: ['cookie'],   // ← incoming request의 cookie를 server route 호출에 그대로 전달
})
```

이걸 빼먹으면 **SSR은 익명 사용자로 fetch, CSR은 인증된 사용자로 fetch** → 두 결과가 다르면 hydration mismatch가 발생합니다.

### Hydration mismatch 일반 원칙

tRPC 영역에서 mismatch가 일어나는 시나리오는 거의 모두 **"SSR과 CSR이 같은 입력으로 같은 결과를 내야 한다"** 는 일반 원칙으로 환원됩니다.

- cookie 포워딩 빠짐 → 위에서 설명
- 시간 의존 표시 (`new Date()` 등) → SSR 시점과 CSR 시점이 다름 → `<ClientOnly>` 또는 `onMounted` 이후로
- localStorage 의존 UI → SSR엔 없음, CSR엔 있음 → 마찬가지

tRPC 자체가 mismatch를 일으키는 게 아니라, *입력이 정렬되지 않으면* mismatch가 납니다.

---

## 6. 이 레포의 코드가 어디서 어떻게 연결되나

각 파일의 역할을 한 번 매핑해 두면 다음에 코드를 다시 봤을 때 빠르게 찾을 수 있습니다.

```
tRPC/trpc-nuxt-app/
│
├── app/                                 ← 클라이언트 영역
│   ├── app.vue                          UI + useQuery/useMutation 호출, 에러 분기
│   └── plugins/trpc.ts                  $trpc 클라이언트 생성 + Nuxt에 provide
│                                        (httpBatchLink, pickHeaders: ['cookie'])
│
└── server/                              ← 서버 영역
    ├── trpc/
    │   ├── trpc.ts                      initTRPC 인스턴스 + middleware (logger, authed)
    │   │                                + procedure 빌더 (publicProcedure, protectedProcedure)
    │   │                                + errorFormatter (Zod 평탄화)
    │   │
    │   ├── context.ts                   createContext (cookie → user 매핑) + Context 타입
    │   │
    │   └── routers/
    │       ├── index.ts                 appRouter (system + todo 합성) + AppRouter 타입 export
    │       ├── system.ts                hello, serverInfo (publicProcedure)
    │       └── todo.ts                  list (public) + add/toggle/remove (protected) + in-memory store
    │
    └── api/trpc/[...trpc].ts            createTRPCNuxtHandler 마운트 (catch-all)
```

- 새 도메인 추가하려면? → `routers/<도메인>.ts` 파일 만들고, `routers/index.ts`의 `appRouter`에 추가.
- 새 인증 정책 만들려면? → `trpc.ts`에 미들웨어 추가하고 새 빌더 export.
- ctx에 새 의존성 넣으려면? → `context.ts`에 한 줄 추가. 모든 procedure에 자동으로 보임.
- 에러 응답 모양 바꾸려면? → `trpc.ts`의 `errorFormatter` 수정.

---

## 7. URL 매핑 규칙 — curl로 디버깅할 때

서버가 정상 응답하는지, 어떤 모양으로 오는지 확인하려면 curl이 가장 편합니다. tRPC v11 wire format은 단순합니다.

| 클라이언트 호출 | HTTP |
|---|---|
| `$trpc.todo.list.useQuery()` | `GET /api/trpc/todo.list` |
| `$trpc.system.hello.useQuery({ name: 'x' })` | `GET /api/trpc/system.hello?input={URL-encoded JSON}` |
| `$trpc.todo.add.useMutation()` + `mutate({...})` | `POST /api/trpc/todo.add` body=JSON |

**nested router는 dot으로 평탄화**됩니다. `system.hello`, `todo.list` 등. server route는 단일 catch-all `[...trpc].ts` 하나가 모두 처리해요. nested 깊이가 깊어져도 슬래시가 늘지 않고 dot 구분자만 늘어납니다.

응답 모양:

```json
// 성공
{ "result": { "data": { ... 반환값 ... } } }

// 실패
{
  "error": {
    "message": "...",
    "code": -32004,                              // JSON-RPC 2.0 코드
    "data": {
      "code": "NOT_FOUND",                       // ← 사람이 보는 건 이쪽
      "httpStatus": 404,
      "path": "todo.toggle",
      "zodFieldErrors": null,
      "stack": "..." // dev 모드에서만 노출
    }
  }
}
```

클라이언트는 `error.data.code` / `error.data.httpStatus` / `error.data.zodFieldErrors`를 사용합니다.

---

## 8. 함정 모음 — 다음에 또 만나면 기억하기

작업하면서 실제로 막혔던 지점들입니다.

### ① `trpc-nuxt`를 Nuxt 모듈로 등록하려 하면
**증상**: `nuxt.config.ts`의 `modules: ['trpc-nuxt']` 추가하면 빌드 에러.
**원인**: `trpc-nuxt` v2는 Nuxt 모듈이 아니에요. 그냥 헬퍼 패키지.
**해결**: `nuxt.config.ts`는 손대지 않고, `trpc-nuxt/server` / `trpc-nuxt/client`만 import해서 사용.

### ② server 코드에 `process.uptime()` / `process.version` 등 Node 전역
**증상**: 런타임은 정상인데 IDE에 빨간 줄 + `npx nuxi typecheck`가 `TS2591: Cannot find name 'process'` 로 실패.
**원인**: Nuxt 4의 `.nuxt/tsconfig.server.json`이 의도적으로 `types: ['node']`를 노출하지 않음. Nitro는 cross-runtime(Node/Cloudflare Workers/Deno) 설계라 Node 전용 API를 타입 단계에서 막아둔 거예요.
**해결**: Web standards 사용. `process.uptime()` → `Date.now() - serverStartedAt`, `crypto.randomUUID()` 등. 정 Node 전용으로 가야 한다면 `@types/node` 설치 + `nuxt.config.ts`에서 server tsconfig에 `types: ['node']` 추가.

### ③ `lazy: true`로 SSR fetch를 끄려고 함
**증상**: `lazy: true`만 줬는데 SSR HTML에 데이터가 그대로 들어감.
**원인**: `lazy`는 "navigation 차단 안 함"의 의미일 뿐, SSR fetch 자체는 일어남.
**해결**: `server: false`를 줘야 진짜 CSR-only.

### ④ SSR에서 인증된 사용자로 fetch 안 됨 → hydration mismatch
**증상**: CSR에선 로그인 잘 되는데, SSR 응답엔 익명 결과.
**원인**: server route 호출은 함수 호출이라 cookie가 자동으로 따라가지 않음.
**해결**: `httpBatchLink({ pickHeaders: ['cookie'] })`로 명시적 포워딩.

### ⑤ `z.flattenError(err.cause).fieldErrors`의 키 인덱싱이 안 됨
**증상**: `zodFieldErrors.text`로 접근하면 `Property 'text' does not exist on type '{}'`.
**원인**: tRPC의 `error.cause`가 `unknown` 타입 → `z.flattenError(unknown)` → `fieldErrors`가 `{}` 로 추론.
**해결**: errorFormatter 안에서 `as Record<string, string[] | undefined>`로 캐스팅. 그러면 클라이언트로 흐르는 타입도 정상.

### ⑥ `noUncheckedIndexedAccess`가 켜져 있어 `arr[i]`가 `T | undefined`
**증상**: 인덱스 체크(`if (idx === -1) ...`) 후에도 `arr[idx]`가 undefined로 추론.
**원인**: Nuxt 4 server tsconfig가 `noUncheckedIndexedAccess: true`. 인덱스 접근 결과는 항상 `T | undefined`.
**해결**: `find()`로 narrow된 변수를 사용. 예: `const target = arr.find(...)`로 받고, null 체크 후 그 변수만 사용.

---

## 9. 자주 쓰는 명령

```bash
cd tRPC/trpc-nuxt-app

# 개발 서버 (http://localhost:3000)
npm run dev

# 타입 체크 — IDE의 빨간 줄과 같은 결과를 한 번에 확인
npx nuxi typecheck

# 라이브러리 버전 확인 (호환성 디버깅 시)
cat package.json
```

curl 디버깅 예시:

```bash
# query (GET, input은 URL의 ?input= 파라미터)
curl "http://localhost:3000/api/trpc/system.hello?input=%7B%22name%22%3A%22x%22%7D"

# mutation (POST, input은 body의 JSON)
curl -X POST "http://localhost:3000/api/trpc/todo.add" \
  -H "Content-Type: application/json" \
  -H "Cookie: demo-user-id=user-1" \
  -d '{"text":"새 할일"}'
```

---

## 10. 학습 흐름 — 단계별 노트로 들어가기

각 단계는 *그 단계가 풀어준 문제*를 한 줄로 보면 됩니다.

| 단계 | 문제 | 해결 (노트) |
|---|---|---|
| 01 | Nuxt 4에 tRPC를 어떻게 얹나? | [01-setup.md](./01-setup.md) |
| 02 | 도메인 늘 때 router가 비대해짐 | [02-first-procedure.md](./02-first-procedure.md) (sub-router 분리) |
| 03 | 쓰기 + 검증을 어떻게 깔끔하게? | [03-mutation-zod.md](./03-mutation-zod.md) |
| 04 | 인증/권한은 어디에 둬야 하나? | [04-context-middleware.md](./04-context-middleware.md) |
| 05 | 에러 응답 모양을 일관되게 하려면? | [05-error-handling.md](./05-error-handling.md) |
| 06 | SSR 동작 / 정교한 갱신은? | [06-ssr-prefetch.md](./06-ssr-prefetch.md) |
| 07 | GraphQL/gRPC/REST와 비교하면? | [07-comparison.md](./07-comparison.md) |

막히는 곳이 생기면 [README](../README.md)의 학습 흐름 → 해당 단계 노트 → 실제 코드 순으로 보면 됩니다.

---

## 마무리 — tRPC를 한 줄로 정리하면

> **TS 풀스택에서 "타입 동기화 비용 0"으로 서버 함수를 클라가 직접 호출하게 해주는 도구.**
> Zod로 검증과 타입을 한 번에 정의하고, middleware로 ctx를 narrow하면서 인증/권한을 빌더에 압축한다.
> Nuxt와 합치면 `useAsyncData` 위에 그대로 얹혀 SSR/캐싱이 자연스러워진다.
> 단, 다언어 클라가 하나라도 끼면 즉시 후보에서 빠진다 — *TS 풀스택 전용*이라는 점만 합의되면 강력하다.
