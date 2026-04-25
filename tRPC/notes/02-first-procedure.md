# 02. 라우터 분리와 Nested Router

> **목표**: hello 하나만 있던 단일 라우터를 **도메인별 sub-router**로 쪼개고, nested 호출(`$trpc.system.hello`, `$trpc.todo.list`)이 어떻게 구성되는지 본다. 다음 단계인 Todo CRUD를 위한 토대 작업.

---

## 왜 분리하는가?

01 단계에선 모든 procedure를 단일 `appRouter` 안에 평면적으로 두었다.
도메인이 늘어날수록 한 파일이 거대해지고, 같은 도메인의 procedure들 사이에서 store/유틸을 공유하기도 어색해진다.

tRPC는 **router 자체를 합성 가능한 단위**로 다룬다.
`router({ ... })`가 반환하는 라우터를 다시 다른 라우터의 필드로 넣으면 nested 구조가 만들어지고,
**클라이언트 호출 경로가 자동으로 그 구조를 따른다** (`$trpc.<도메인>.<procedure>`).

---

## 변경된 폴더 구조

```
server/trpc/routers/
├── index.ts      # appRouter — system + todo 합침
├── system.ts     # systemRouter (hello, serverInfo)
└── todo.ts       # todoRouter (list, in-memory store 포함)
```

---

## 1. 도메인별 router

### `system.ts` — 입력이 없는 procedure 패턴
```ts
export const systemRouter = router({
  hello: publicProcedure
    .input(z.object({ name: z.string().min(1) }).optional())
    .query(({ input }) => ({ ... })),

  // 입력이 없으면 .input() 자체를 생략
  serverInfo: publicProcedure.query(() => ({
    runtime: `Node ${process.version}`,
    uptimeSeconds: Math.round(process.uptime()),
  })),
})
```
> 📌 **`.input()`은 필수가 아님.** 호출하지 않으면 input 타입은 `void`로 추론되고, 클라이언트에서도 인자 없이 `useQuery()` 호출 가능.

### `todo.ts` — 도메인 데이터 소유
```ts
const todos: Todo[] = [ /* seed */ ]

export const todoRouter = router({
  list: publicProcedure.query((): Todo[] => {
    return [...todos].sort(/* 미완료 우선 */)
  }),
})
```
> 📌 **store(`todos`)가 router와 같은 파일에 산다.** 모듈 스코프 변수라 dev 서버가 살아 있는 동안만 유지됨 — 03 단계의 mutation 실험에 충분하지만 영속성은 없음. 실 프로젝트에선 DB 핸들을 context로 주입하는 형태가 자연스럽다 (04 단계).

---

## 2. 라우터 합성

### `index.ts`
```ts
export const appRouter = router({
  system: systemRouter,
  todo: todoRouter,
})

export type AppRouter = typeof appRouter
```
> 📌 **`AppRouter` 타입의 모양은 `{ system: { hello, serverInfo }, todo: { list } }`** 와 같이 sub-router의 키를 포함하도록 자동으로 추론된다. 클라이언트는 이 타입만 import하므로 *수동으로 갱신할 게 없음*.

---

## 3. 클라이언트 호출

### `app.vue`
```ts
const { data: hello } = await $trpc.system.hello.useQuery({ name: 'tRPC' })
const { data: info }  = await $trpc.system.serverInfo.useQuery()
const { data: todos } = await $trpc.todo.list.useQuery()
```

- 호출 경로가 **서버 라우터 트리 구조와 1:1 대응**.
- IDE에서 `$trpc.` 입력 시 `system` / `todo`가 자동완성으로 뜸 → `$trpc.system.` 입력 시 `hello` / `serverInfo`로 좁혀짐.
- 새 procedure를 server에서 추가하면 **재시작 / codegen / 별도 동기화 없이** 클라이언트 자동완성에 즉시 반영.

---

## 4. 동작 검증

### Wire format에서 nested 경로
```bash
curl "http://localhost:3000/api/trpc/system.hello?input=%7B%22name%22%3A%22nested%22%7D"
# → {"result":{"data":{"greeting":"Hello, nested!", ...}}}

curl "http://localhost:3000/api/trpc/todo.list"
# → {"result":{"data":[{"id":"seed-2","text":"Todo CRUD 구현하기", ...}]}}

curl "http://localhost:3000/api/trpc/system.serverInfo"
# → {"result":{"data":{"runtime":"Node v22.14.0","uptimeSeconds":502}}}
```

📌 **URL 경로는 dot으로 평탄화됨**: `/api/trpc/system.hello`, `/api/trpc/todo.list`.
nested router가 깊어져도 슬래시가 늘지 않고 dot 구분자만 늘어난다 — server route는 여전히 단일 catch-all `[...trpc].ts` 하나로 처리.

---

## 5. 이 단계에서 배운 것

- **router는 값(value)이자 합성 가능한 단위**다. sub-router를 다른 router의 필드로 그냥 끼워넣으면 끝.
- **타입 흐름이 자동**이라는 게 정말 중요한 의미를 갖는다 — `system` 도메인을 추가했더니, 클라이언트 IDE 자동완성에서 `$trpc.system.*`이 즉시 떠 *동기화 작업이 0*. (GraphQL/gRPC는 schema 갱신 + codegen 필요)
- **wire format은 dot-flatten**. 깊이가 깊어져도 URL이 복잡해지지 않고 server route는 단일 catch-all 하나로 충분.
- `.input()` 생략 가능 → 입력 없는 procedure는 `void` 타입으로 추론되고 클라에서 `useQuery()` 인자 없이 호출.

---

## 6. 다음 단계

- [03. Zod input + Mutation으로 Todo CRUD 완성](./03-mutation-zod.md)
  - todoRouter에 `add`, `toggle`, `remove` mutation 추가
  - `useMutation` 사용법
  - mutation 후 `list` query 무효화/재호출 (`getQueryKey` + `refresh()`)
  - Zod로 input 검증을 어디까지 시킬 수 있는지 (e.g. `.refine()`)
