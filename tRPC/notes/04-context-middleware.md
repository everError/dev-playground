# 04. Context & Middleware로 인증 가드

> **목표**: 모든 procedure가 공유하는 **context**에 인증된 사용자를 주입하고, **middleware**로 procedure 실행 전후에 끼어들어 로깅 / 인증 가드 / 권한 체크를 분리. 클라이언트는 cookie 기반 "로그인" 데모로 흐름을 검증.

---

## 1. Context — 요청 단위 의존성 주입

`createContext`는 **매 요청마다** 호출되어, 그 procedure 호출 동안 `ctx`로 접근할 수 있는 객체를 만듦.

```ts
// server/trpc/context.ts
const fakeUsers: Record<string, { id: string, name: string }> = {
  'user-1': { id: 'user-1', name: '홍길동' },
  'user-2': { id: 'user-2', name: '김철수' },
}

export async function createContext(event: H3Event, _opts) {
  const cookieValue = getCookie(event, 'demo-user-id')
  const user = cookieValue && fakeUsers[cookieValue] ? fakeUsers[cookieValue] : null

  return { event, user }
}
export type Context = Awaited<ReturnType<typeof createContext>>
```

📌 **`Context` 타입이 자동으로 모든 procedure의 `ctx` 타입이 된다.** `initTRPC.context<Context>().create()`로 한 번 바인딩하면 끝.

📌 **DB 핸들 / 로거 / 인증된 사용자 / feature flag 등 — 요청 단위로 변하는 모든 것**을 여기서 주입. 실제 앱에선 cookie 대신 JWT, 세션 스토어, OAuth 토큰 검증 등이 들어감.

---

## 2. Middleware — procedure 실행을 감싸는 함수

```ts
// server/trpc/trpc.ts
const t = initTRPC.context<Context>().create()

const loggerMiddleware = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  console.log(`[trpc] ${type} ${path} ${result.ok ? 'ok' : 'err'} (${Date.now() - start}ms)`)
  return result
})

const authedMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' })
  }
  return next({
    ctx: { ...ctx, user: ctx.user },  // ⬅ 핵심: ctx를 narrow해서 다음 단계에 전달
  })
})
```

### `next({ ctx })`의 마법 — 타입 narrow

`authedMiddleware`가 `ctx.user`가 null이면 throw하므로, `next()`까지 도달했다면 `user`는 non-null.
이 사실을 **`next({ ctx: { user: ctx.user } })`로 다음 단계의 `ctx` 타입에 반영**하면, 그 뒤 procedure 핸들러에서는 `ctx.user`가 자동으로 non-null로 추론된다.

```ts
add: protectedProcedure.input(addTodoInput).mutation(({ input, ctx }) => {
  // ctx.user는 non-null (TS narrowing) — 옵셔널 체이닝 불필요
  return { ...input, ownerId: ctx.user.id }
})
```

📌 **이게 tRPC middleware의 진짜 가치.** Express middleware는 ctx 변화를 타입에 반영 못 해서 `req.user!.id`처럼 단언으로 도배되지만, tRPC는 빌더가 추론.

---

## 3. Procedure 빌더 합성

```ts
export const publicProcedure = t.procedure.use(loggerMiddleware)
export const protectedProcedure = t.procedure.use(loggerMiddleware).use(authedMiddleware)
```

- `.use()`를 **체이닝하면 미들웨어가 등록된 순서대로 실행**.
- `protectedProcedure`는 `logger → auth` 순. 인증 실패 케이스도 logger는 실행 (로그에 `err` 출력 확인).
- `protectedProcedure` 자체가 또 `t.procedure`이므로, 추가로 `.use()`해서 더 좁은 빌더(`adminProcedure` 등)를 만들 수 있음.

---

## 4. 도메인 권한 체크는 procedure 안에서

미들웨어로 처리하기 어려운 것 — "이 todo의 소유자인가?"는 input과 ctx를 같이 봐야 함.

```ts
toggle: protectedProcedure.input(todoIdInput).mutation(({ input, ctx }) => {
  const target = todos.find(t => t.id === input.id)
  if (!target) throw new TRPCError({ code: 'NOT_FOUND', ... })
  if (target.ownerId !== ctx.user.id) {
    throw new TRPCError({ code: 'FORBIDDEN', message: '본인의 todo만 수정할 수 있습니다.' })
  }
  // ...
})
```

📌 **인증(authentication)은 미들웨어 / 권한(authorization)은 핸들러 안.** 권한 체크는 도메인 객체를 알아야 가능하므로 미들웨어로 일반화하기 어려움.

---

## 5. 클라이언트 — Cookie 기반 "로그인"

### plugin: SSR 단계 cookie 포워딩
```ts
httpBatchLink({
  url: '/api/trpc',
  pickHeaders: ['cookie'],   // ⬅ SSR 시 incoming request의 cookie 헤더를 server route 호출에 그대로 전달
})
```

📌 **CSR 단계에선 별도 설정 없이 브라우저가 same-origin cookie를 자동 첨부**. 신경 쓸 곳은 SSR뿐 — Nitro server route 호출은 같은 프로세스 안의 함수 호출이라 cookie가 자동 따라가지 않으므로 명시적으로 picksharing.

### app.vue: useCookie로 set/clear
```ts
const userIdCookie = useCookie<string | null>('demo-user-id', {
  default: () => null,
  sameSite: 'lax',
})

function login(id: string) { userIdCookie.value = id }
function logout() { userIdCookie.value = null }
```

다음 mutation부터 cookie가 자동 첨부 → `ctx.user`에 반영.

### error.data.code로 분기
```ts
const lastError = computed(() => addError.value || toggleError.value || removeError.value)
// 템플릿에서:
// [{{ lastError.data?.code ?? 'ERROR' }}] {{ lastError.message }}
```

`error.data.code`가 `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `BAD_REQUEST` 등으로 와서 분기 가능 (REST의 status code 분기와 같은 자리).

---

## 6. 동작 검증 (curl)

### 익명 mutation → 401
```bash
curl -X POST .../api/trpc/todo.add -d '{"text":"x"}'
# → { "error": { "data": { "code": "UNAUTHORIZED", "httpStatus": 401 }, "message": "로그인이 필요합니다." } }
```

### user-1 cookie → 정상
```bash
curl -X POST .../api/trpc/todo.add -H "Cookie: demo-user-id=user-1" -d '{"text":"y"}'
# → { "result": { "data": { "id":"<uuid>", "ownerId": "user-1", ... } } }
```

### 다른 사용자의 todo 수정 → 403
```bash
curl -X POST .../api/trpc/todo.toggle -H "Cookie: demo-user-id=user-2" -d '{"id":"seed-1"}'
# → { "error": { "data": { "code": "FORBIDDEN", "httpStatus": 403 }, ... } }
```

### list는 publicProcedure → 익명도 OK
```bash
curl .../api/trpc/todo.list
# → { "result": { "data": [...] } }
```

### 로거 미들웨어 출력 (dev 서버 stdout)
```
[trpc] query    todo.list   ok  (0ms)
[trpc] mutation todo.add    err (0ms)   ← 익명 시도
[trpc] mutation todo.add    ok  (2ms)   ← user-1
[trpc] mutation todo.toggle err (1ms)   ← user-2의 권한 없음
```
📌 인증 실패한 호출도 logger는 실행됨 (체이닝 순서 `logger → auth` 확인).

---

## 7. 이 단계에서 배운 것

- **Context = 요청 단위 의존성 주입**. DB / 사용자 / feature flag — 요청마다 변하는 모든 것을 여기에 넣음.
- **Middleware의 `next({ ctx })` 패턴이 핵심**. ctx를 narrow한 새 객체로 넘기면 빌더가 그 narrowing을 추론해 다음 단계 핸들러에 반영. Express의 `req.user!` 단언이 사라짐.
- **`.use()` 체이닝**으로 빌더 합성. `publicProcedure` / `protectedProcedure` / (필요 시) `adminProcedure` 등 *역할별 빌더*를 만들고, router에서 procedure마다 적절한 빌더로 시작.
- **인증 ≠ 권한**. 인증(누구인지)은 미들웨어로 일반화 가능, 권한(이 자원에 접근 가능한지)은 도메인 객체를 알아야 하므로 핸들러 안에서.
- **클라이언트의 cookie 흐름은 SSR과 CSR이 다르다**. CSR은 브라우저가 자동, SSR은 `pickHeaders: ['cookie']`로 명시적 포워딩 필요. 같은 origin 안 server route 호출도 함수 호출이지 HTTP가 아니므로 cookie가 자동으로 따라가지 않음.
- **에러 분기는 `error.data.code` 하나로 끝**. REST의 HTTP status 분기와 같은 자리지만 enum-like 문자열이라 가독성↑.

---

## 8. 다음 단계

- [05. 에러 처리 — errorFormatter, 클라이언트 분기, Zod 메시지 정규화](./05-error-handling.md)
  - `initTRPC.create({ errorFormatter })`로 에러 응답 모양 커스터마이즈
  - Zod issue 배열을 클라이언트 친화적 형태로 변환
  - 클라이언트에서 `code`별 UX 분기 (toast / form field 표시 / redirect)
