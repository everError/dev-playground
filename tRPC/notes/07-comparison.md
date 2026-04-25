# 07. 회고 — GraphQL / gRPC / REST와의 비교

> **목표**: 같은 Todo 도메인을 각 방식으로 구현한다고 가정했을 때 코드/운영 차이를 정리하고, **어떤 상황에서 무엇을 고를지** 결정 트리로 환원한다. 이 레포의 [graphql-apollo](../../graphql-apollo/) / [gRPC](../../gRPC/) 실습과 같이 보면 좋다.

---

## 1. 같은 Todo 도메인의 정의 윤곽 비교

### REST
```
GET    /todos
POST   /todos          { text: string }
PATCH  /todos/:id      { completed?: boolean }
DELETE /todos/:id
```
- 인터페이스: 컨벤션 (RESTful) — 강제 X. OpenAPI 별도.
- 검증: 핸들러 안에서 직접 (또는 Zod 등).
- 타입: 클라이언트가 수동 정의 또는 OpenAPI → codegen.

### GraphQL
```graphql
type Todo { id: ID!, text: String!, completed: Boolean! }
type Query { todos: [Todo!]! }
type Mutation { addTodo(text: String!): Todo! }
```
- 인터페이스: **SDL** 파일.
- Resolver: typedefs + resolver 함수 페어.
- 타입: codegen(`graphql-codegen` 등)으로 SDL → TS 타입 추출.

### gRPC
```proto
service TodoService {
  rpc List(Empty) returns (TodoList);
  rpc Add(AddTodoRequest) returns (Todo);
}
message Todo { string id = 1; string text = 2; bool completed = 3; }
message AddTodoRequest { string text = 1; }
message TodoList { repeated Todo items = 1; }
```
- 인터페이스: **`.proto`** 파일.
- 코드 생성: `protoc`로 서버/클라이언트 stub 강제 생성.
- 타입: 자동 생성된 stub.

### tRPC (이 레포)
```ts
export const todoRouter = router({
  list: publicProcedure.query(() => todos),
  add: protectedProcedure.input(z.object({ text: z.string()... })).mutation(...),
})
export type AppRouter = typeof appRouter
```
- 인터페이스: **TypeScript 타입 자체**.
- 코드 생성: 없음.
- 타입: 클라가 `import type { AppRouter }` 한 줄.

---

## 2. 핵심 차이 — "타입이 어디서 어떻게 흐르나"

| 방식 | 타입 정의 위치 | 타입 흐름 | 동기화 비용 |
|---|---|---|---|
| REST | (없음) | 수동 / OpenAPI codegen | 매번 수동 갱신 |
| GraphQL | SDL | codegen 후 import | 스키마 변경 → codegen 재실행 |
| gRPC | `.proto` | `protoc` → 양쪽 stub | proto 변경 → 양쪽 빌드 |
| **tRPC** | TS 라우터 | `import type` 한 줄 | **0 (TS 컴파일러가 함)** |

📌 이 레포에서 **02 단계에서 sub-router 추가하면서 클라이언트 자동완성에 즉시 반영**되는 걸 확인 — 이게 tRPC의 결정적 차이.

---

## 3. 카테고리별 비교

| 항목 | REST | GraphQL | gRPC | **tRPC** |
|---|---|---|---|---|
| 인터페이스 정의 | 없음 | SDL | `.proto` | TS 타입 |
| 코드 생성 | 선택 | 보통 사용 | **필수** | **불필요** |
| 직렬화 | JSON | JSON | Protobuf (binary) | JSON |
| 타입 안전성 | 약함 | 중간 (codegen 시 강) | 강함 (codegen) | **매우 강함 (네이티브)** |
| 다언어 클라이언트 | ✅ | ✅ | ✅ | ❌ TS 전용 |
| 스트리밍 | ❌ | Subscription | 양방향 | Subscription (제한적) |
| HTTP 캐싱 | ✅ (URL/method 기반) | △ (POST 위주라 약함) | ❌ (HTTP/2 binary) | △ (query는 GET → 가능) |
| 부분 필드 응답 | ❌ | ✅ (over-fetch 방지) | ❌ | ❌ |
| 도구/생태계 | 매우 풍부 | 풍부 (인스펙터 등) | 충분 | TS 한정 풍부 |
| 학습 곡선 | 낮음 | 중간 | 중간~높음 | TS 익숙하면 매우 낮음 |
| 운영 복잡도 | 낮음 | 중간 (캐싱/Persisted Query 등) | 높음 (HTTP/2 / Envoy) | 낮음 |
| 모바일 native | ✅ | ✅ | ✅ (성능 우수) | ❌ |
| **빌드 파이프라인** | 가벼움 | codegen 단계 | codegen + binary | **가장 가벼움** |

---

## 4. 어떤 상황에 무엇을 고를지 — 결정 트리

```
Q1. 클라이언트가 TypeScript 외 언어도 있는가?
  ├─ YES → tRPC 후보에서 제외
  │   │
  │   ├─ Q2a. 같은 조직 내부 마이크로서비스 통신?
  │   │   ├─ YES (지연/대역폭 중요) ─────────────────► gRPC
  │   │   └─ NO (외부/다양한 클라) ┐
  │   │                            │
  │   └─ Q2b. 클라이언트가 필드를 가변적으로 골라야 함?
  │       ├─ YES (모바일/대시보드 등) ────────────────► GraphQL
  │       └─ NO (단순 CRUD, HTTP 캐싱 가치) ─────────► REST
  │
  └─ NO (TS 풀스택) → tRPC가 강력한 후보
      │
      ├─ Q3a. 같은 모노레포 / Next.js·Nuxt 풀스택?
      │   └─ YES ─────────────────────────────────► tRPC (이 레포의 형태)
      │
      ├─ Q3b. 외부에 공개 API도 노출해야 하는가?
      │   └─ YES → tRPC + (trpc-openapi로 동일 라우터를 OpenAPI도 export)
      │           또는 별도 공개 API 레이어 (REST/GraphQL) 분리
      │
      └─ Q3c. 클라가 매번 다른 필드 조합을 원함?
          └─ YES → GraphQL이 더 자연스러움 (tRPC는 procedure 단위 응답)
```

### 한 줄 가이드
- **TS 풀스택 + 모노레포** → tRPC가 거의 최적.
- **다언어/공개 API** → tRPC X.
- **마이크로서비스 binary 통신** → gRPC.
- **가변 필드 요구** → GraphQL.
- **단순/캐싱 중요** → REST.

---

## 5. 이 실습에서 느낀 강한 인상

### 좋았던 점
1. **빌드 파이프라인이 사라짐.** GraphQL의 codegen, gRPC의 protoc 같은 별도 단계가 없음. 라우터 변경 → 클라 IDE 자동완성에 즉시 반영. *02 단계에서 직접 체감*.
2. **Zod와의 결합이 자연스러움.** 입력 검증 = 런타임 가드 + 컴파일 타입. 두 번 쓸 일 없음. *03 단계*.
3. **에러 모양 한 곳 통제.** `errorFormatter` 한 곳만 바꾸면 응답 shape이 일관되게 변경. REST에서 핸들러마다 status code/메시지를 결정하는 것보다 변경 비용이 낮음. *05 단계*.
4. **middleware의 `next({ ctx })`로 타입 narrowing.** Express의 `req.user!.id` 단언 패턴이 사라짐. ctx narrowing이 다음 핸들러 타입 추론에 자동 반영. *04 단계*.
5. **`useQuery`가 `useAsyncData` 얇은 래퍼.** Nuxt를 알면 추가 학습이 거의 없음. *06 단계*.

### 헷갈렸거나 함정이었던 것
1. **`trpc-nuxt` v2는 Nuxt 모듈이 아님.** 그냥 `/server`, `/client` 헬퍼. `nuxt.config.ts` modules에 등록할 필요 없음. *01 단계*.
2. **Nuxt 4 server tsconfig가 Node 전역 타입을 노출하지 않음** (Nitro의 cross-runtime 설계). `process.uptime()` 같은 Node 전용 API 쓰면 IDE 빨간 줄. *01 단계 보강*.
3. **`error.cause`가 `unknown`이라 `z.flattenError(cause).fieldErrors`가 `{}`로 추론**. 사용처에서 인덱싱하려면 `Record<string, string[] | undefined>`로 캐스팅 필요. *05 단계*.
4. **`lazy: true`만으로는 SSR fetch 안 막힘.** lazy = "navigation 차단 안 함"의 의미일 뿐. 진짜 CSR-only는 `server: false`. *06 단계*.
5. **Cookie 포워딩**. CSR은 브라우저가 자동, SSR은 `pickHeaders: ['cookie']`로 명시. server route 호출은 함수 호출이라 자동 첨부 안 됨. *04 단계*.

### 한계로 느낀 부분
- **TS만**. 다언어 팀에서는 즉시 탈락.
- **부분 필드 응답 없음**. procedure가 반환한 모양 그대로 — 클라가 일부만 원해도 다 옴.
- **HTTP 캐싱 활용도 낮음**. 모든 mutation이 POST이고, query GET도 batch 옵션 쓰면 POST가 됨 → 표준 HTTP 캐시와 친하지 않음.
- **공개 API로 노출하기 부적합**. 라우터 타입을 외부에 줄 수 없음 → 별도 OpenAPI 레이어 필요 (`trpc-openapi` 등).

---

## 6. 같은 도메인 — 같은 줄 수, 다른 모양

가상의 *Todo의 add* 한 procedure를 각 방식으로:

### REST + Express + Zod
```ts
app.post('/todos', async (req, res) => {
  const parsed = addSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json(parsed.error.flatten())
  if (!req.user) return res.status(401).json({ message: 'unauthorized' })
  const todo = createTodo(parsed.data.text, req.user.id)
  res.status(201).json(todo)
})
```
- 핸들러 안에 검증 / 인증 / status code / 응답 모양 결정이 다 흩어짐.

### GraphQL + Apollo + Zod
```ts
// SDL
type Mutation { addTodo(text: String!): Todo! }

// Resolver
addTodo: async (_, { text }, ctx) => {
  if (!ctx.user) throw new GraphQLError('unauthorized', { extensions: { code: 'UNAUTHORIZED' } })
  const validated = addSchema.parse({ text })
  return createTodo(validated.text, ctx.user.id)
}
```
- SDL과 resolver가 분리됨. 타입은 codegen으로 동기화.

### gRPC
```proto
rpc Add(AddTodoRequest) returns (Todo);
```
```ts
// 자동 생성된 stub 위에서
async Add(call: ServerUnaryCall<AddTodoRequest, Todo>, callback) {
  if (!getUserFromMetadata(call.metadata)) {
    return callback({ code: status.UNAUTHENTICATED, message: 'unauthorized' })
  }
  // ...
}
```
- proto 변경 → 양쪽 빌드 필수. 인증 정보는 metadata로.

### tRPC (이 레포)
```ts
add: protectedProcedure
  .input(addTodoInput)
  .mutation(({ input, ctx }) => createTodo(input.text, ctx.user.id))
```
- 검증(Zod) / 인증(protectedProcedure) / 응답(반환값) / 타입 흐름이 **한 줄에 다 압축**.

📌 같은 의미의 코드가 **builder chain으로 평탄화**되어 있다는 점이 tRPC의 시각적 차이.

---

## 7. 학습 종료 — 이 레포 작업의 마무리

7단계 모두 완료:
1. [01. 셋업](./01-setup.md) — Nuxt 4 + trpc-nuxt v2, hello query
2. [02. Nested Router](./02-first-procedure.md) — 도메인별 sub-router
3. [03. Mutation + Zod](./03-mutation-zod.md) — Todo CRUD
4. [04. Context & Middleware](./04-context-middleware.md) — protectedProcedure
5. [05. Error Handling](./05-error-handling.md) — errorFormatter
6. [06. SSR & 캐싱](./06-ssr-prefetch.md) — useAsyncData 통합
7. [07. 회고](./07-comparison.md) — ← 지금 이 파일

### 더 가볼 수 있는 곳
- **Subscription** — `wss://`로 실시간 todo 변경 푸시 (`@trpc/server/adapters/standalone` + crossws)
- **Prisma 통합** — in-memory 배열 → 실 DB. context에 `db: PrismaClient` 주입.
- **`trpc-openapi`** — 같은 라우터를 OpenAPI로도 export → 외부 클라이언트에 노출.
- **모노레포 분리** — `apps/web` + `packages/api`로 라우터를 패키지화. 다른 앱에서도 같은 라우터 재사용.
- **테스트** — `appRouter.createCaller(ctx).todo.add({...})` 패턴으로 HTTP 거치지 않고 procedure 단위 테스트.

이 레포의 다른 폴더(`graphql-apollo`, `gRPC`)와 함께 보면 **같은 도메인을 4가지 방식으로 풀어본 비교 학습**이 완성됩니다.
