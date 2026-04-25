# 03. Mutation + Zod로 Todo CRUD 완성

> **목표**: `todoRouter`에 `add` / `toggle` / `remove` mutation을 추가하고, 클라이언트에서 `useMutation` + `refresh()`로 자동 재조회까지. Zod 검증 깊이(`refine`, 커스텀 메시지)와 `TRPCError` 매핑도 함께 본다.

---

## 1. Query vs Mutation의 차이 (tRPC 관점)

| 항목 | Query | Mutation |
|------|-------|----------|
| 의미상 | 읽기 (idempotent) | 쓰기 (side-effect) |
| HTTP method | GET | **POST** |
| 빌더 | `.query(fn)` | `.mutation(fn)` |
| 클라이언트 호출 | `useQuery(input)` (반응형, AsyncData) | `useMutation()` → `mutate(input)` (명령형) |
| SSR prerender | ✅ 자동 | ❌ (의도한 동작 — 쓰기는 사용자 트리거 시점에만) |

📌 **정확히 같은 input/output 시그니처를 query로 둘지 mutation으로 둘지의 선택은 *의미*에 의해 결정됨.** wire format은 그저 GET vs POST일 뿐.

---

## 2. 도메인 단위 Zod 스키마 재사용

```ts
const todoIdInput = z.object({ id: z.string().min(1) })

const addTodoInput = z.object({
  text: z
    .string()
    .trim()                                                // 1) 양 끝 공백 제거 (transform)
    .min(1, '내용을 입력해주세요.')                         // 2) 길이 검증 + 커스텀 메시지
    .max(120, '120자 이하로 입력해주세요.')
    .refine(v => !/^\s*$/.test(v), '공백만으로는 작성할 수 없습니다.'),  // 3) 도메인 룰
})
```

여러 procedure에서 같은 input shape를 쓸 때 **모듈 스코프 변수로 빼두면 한 곳에서 변경 가능**.
이 레포의 [Zod 폴더](../../Zod/)에서 익힌 chain 패턴이 그대로 활용됨.

📌 **Zod는 모든 룰을 평가해 전체 에러 배열을 반환** (abort-early 아님). 빈 문자열 입력 시 `min(1)`과 `refine` 둘 다 발동된 것을 검증에서 확인.

---

## 3. mutation procedure

```ts
add: publicProcedure
  .input(addTodoInput)
  .mutation(({ input }): Todo => {
    const todo: Todo = {
      id: crypto.randomUUID(),     // Web standards (Node 의존성 X — 02 단계의 cross-runtime 원칙 유지)
      text: input.text,
      completed: false,
      createdAt: new Date().toISOString(),
    }
    todos.push(todo)
    return todo                    // 반환값이 그대로 클라이언트의 mutate Promise resolve 값
  }),
```

📌 **`.query()` ↔ `.mutation()` 외에는 builder 사용법이 동일.** input 검증, 반환 타입 추론, context 주입(다음 단계) 모두 같은 방식.

---

## 4. `TRPCError`로 도메인 에러 표현

```ts
toggle: publicProcedure
  .input(todoIdInput)
  .mutation(({ input }) => {
    const target = todos.find(t => t.id === input.id)
    if (!target) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `해당 id의 todo를 찾을 수 없습니다: ${input.id}`,
      })
    }
    target.completed = !target.completed
    return target
  }),
```

### TRPCError code → HTTP status 자동 매핑

| `code` | HTTP status |
|---|---|
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `PRECONDITION_FAILED` | 412 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `UNPROCESSABLE_CONTENT` | 422 |
| `TOO_MANY_REQUESTS` | 429 |
| `INTERNAL_SERVER_ERROR` | 500 |
| `NOT_IMPLEMENTED` | 501 |
| ... | ... |

📌 **REST처럼 status code를 직접 신경 쓸 필요 없이 의미 있는 enum만 던지면 됨.** 클라이언트는 `error.data.code`로 받아서 분기 가능 (다음 단계에서 시연).

---

## 5. 클라이언트 — `useMutation` 패턴

```ts
const { mutate: addTodo, status: addStatus, error: addError } = $trpc.todo.add.useMutation()

async function onSubmit() {
  if (!newText.value.trim()) return
  await addTodo({ text: newText.value })   // mutate 호출 → 서버에 POST
  newText.value = ''
  await refresh()                           // list query 재조회
}
```

| 반환값 | 역할 |
|---|---|
| `mutate(input)` | 명령형 호출 함수. Promise 반환. |
| `status` | `'idle' | 'pending' | 'success' | 'error'` ref. 버튼 disable에 활용. |
| `error` | 실패 시 `TRPCClientError`. `.message`, `.data.code`, `.data.httpStatus` 접근. |
| `data` | 마지막 성공 시점의 반환값 (AsyncData ref). |

### 재조회 전략 — 이 단계에선 `refresh()` 직접 호출

```ts
const { data: todos, refresh } = await $trpc.todo.list.useQuery()
// ...
await refresh()  // mutation 후 단순히 다시 조회
```

📌 가장 단순한 방법. 작은 도메인엔 충분.
**더 정교한 패턴**(다음 단계 이후 다룸):
- `getQueryKey($trpc.todo.list)` → key를 알아내 같은 key를 가진 모든 useQuery 자동 invalidate
- optimistic update — mutate 직전에 클라이언트 ref를 미리 업데이트하고, 실패 시 롤백

---

## 6. Wire format 검증 (curl)

### add (POST)
```bash
curl -X POST http://localhost:3000/api/trpc/todo.add \
  -H "Content-Type: application/json" \
  -d '{"text":"새 할 일"}'
# → {"result":{"data":{"id":"<uuid>","text":"새 할 일","completed":false,"createdAt":"..."}}}
```
> 📌 mutation의 input은 **request body의 JSON 그대로**. (query처럼 `?input=...` 인코딩 X)

### TRPCError 매핑
```bash
curl -X POST http://localhost:3000/api/trpc/todo.remove \
  -H "Content-Type: application/json" -d '{"id":"does-not-exist"}'
```
응답:
```json
{
  "error": {
    "message": "해당 id의 todo를 찾을 수 없습니다: does-not-exist",
    "code": -32004,
    "data": {
      "code": "NOT_FOUND",
      "httpStatus": 404,
      "path": "todo.remove",
      "stack": "..."
    }
  }
}
```
> 📌 `code: -32004`는 JSON-RPC 2.0 spec의 에러 코드. 사람이 보는 건 `data.code` (`NOT_FOUND`) / `data.httpStatus` (404).
> **stack은 dev 모드에서만 노출**됨 (production 빌드에선 자동 제거).

### Zod 검증 실패
```bash
curl -X POST http://localhost:3000/api/trpc/todo.add \
  -H "Content-Type: application/json" -d '{"text":""}'
```
응답:
```json
{
  "error": {
    "message": "[{...too_small...},{...custom...}]",
    "data": {
      "code": "BAD_REQUEST",
      "httpStatus": 400
    }
  }
}
```
> 📌 **Zod 에러가 자동으로 `BAD_REQUEST` (400)로 매핑됨.** message 필드에 Zod issue 배열이 JSON-stringified로 들어 있어, 클라이언트에서 `JSON.parse(error.message)`로 issue별 처리 가능.

---

## 7. 이 단계에서 배운 것

- **query/mutation 구분은 의미일 뿐** — wire format 차이(GET vs POST)는 부수적. 같은 builder 패턴.
- **`TRPCError`가 HTTP layer를 추상화**한다. enum-like `code` 하나만 던지면 status code, 클라이언트 에러 모양까지 자동 정합. REST 핸들러처럼 status를 직접 쓰지 않음.
- **Zod 검증 → 자동 `BAD_REQUEST` 매핑.** procedure 안에서 input 유효성 코드를 짤 일이 사실상 없음 (Zod chain 한 줄로 끝).
- **Zod는 abort-early 아님** — 모든 룰을 평가해 issue 배열 반환. 한 입력에 대해 여러 위반을 한꺼번에 보여줄 수 있음.
- **재조회의 가장 단순한 형태는 `useAsyncData.refresh()`** — mutation 직후 호출하면 list가 갱신. 더 정교한 invalidation은 후속 단계.
- **Web standards 우선 원칙 유지**: 02에서 `process.uptime()`을 뺐듯이, 여기서도 id 생성에 `crypto.randomUUID()` 사용 (Node, Workers, Deno 모두 동작).

---

## 8. 다음 단계

- [04. Context & Middleware로 인증 가드](./04-context-middleware.md)
  - `createContext`에 가짜 사용자 주입
  - `protectedProcedure` 정의 (인증 필요 procedure)
  - middleware 체이닝 (로깅 → 인증)
  - 클라이언트에서 `UNAUTHORIZED` 에러 처리
