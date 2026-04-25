# 05. 에러 처리 — errorFormatter, Zod 정규화, 클라이언트 분기

> **목표**: 서버에서 `errorFormatter`로 에러 응답 모양을 일정하게 다듬고(특히 Zod 에러), 클라이언트는 `error.data.code`만 보고 일관된 UX 분기를 만들 수 있도록 한다.

---

## 1. 03 단계의 미해결 문제

03에서 Zod 검증 실패 시 클라이언트가 받는 모양은 다음과 같았다:

```json
{
  "error": {
    "message": "[\n  {\"code\":\"too_small\", \"path\":[\"text\"], \"message\":\"...\"},\n  {\"code\":\"custom\", \"path\":[\"text\"], \"message\":\"...\"}\n]",
    "data": { "code": "BAD_REQUEST", "httpStatus": 400 }
  }
}
```

문제:
- **`message`가 JSON-stringified Zod issue 배열** — 화면에 그대로 못 띄움.
- 클라이언트가 `JSON.parse(error.message)` 해서 issue 구조 파싱해야 함 → 매 호출부에서 반복.
- `path`, `code` 같은 Zod 내부 모양에 클라이언트가 결합됨.

**해결 방향**: 서버에서 한 번만 정규화해 클라이언트가 쓰기 좋은 모양으로 흘려보내자.

---

## 2. `errorFormatter` 한 곳에서 응답 모양 통제

`initTRPC.create()`에 `errorFormatter` 옵션을 주면 모든 procedure의 에러 응답 `data`를 가공할 수 있다.

```ts
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodFieldErrors:
          error.code === 'BAD_REQUEST' && error.cause instanceof z.ZodError
            ? (z.flattenError(error.cause).fieldErrors as Record<string, string[] | undefined>)
            : null,
      },
    }
  },
})
```

### 핵심
- **`shape`에는 tRPC가 만든 기본 응답**(message / code / data 등). 그 위에 키를 더하거나 덮어씀.
- **`error.cause`에 throw된 원본 객체가 들어 있다.** Zod 검증 실패 시 cause는 `ZodError` 인스턴스 → `instanceof z.ZodError`로 분기.
- `z.flattenError(zodError)` (Zod v4 표준 함수) → `{ formErrors: string[], fieldErrors: { [key]: string[] } }`로 변환.
- `cause`가 `unknown` 타입이라 `flattenError`의 fieldErrors가 `{}` 로 떨어짐 → `Record<string, string[] | undefined>`로 캐스팅해 클라이언트에서 인덱싱 가능하게 함.

### 한 곳에서 통제하는 의미
- 서버 어디서 `TRPCError`나 Zod 검증을 일으켜도 **동일한 응답 모양**.
- 클라이언트는 `error.data.code` + `error.data.zodFieldErrors`만 알면 됨 → 호출부에 분기 로직이 흩어지지 않음.
- 변경(예: 추후 `requestId` 추가)이 errorFormatter 한 곳에서 끝남.

---

## 3. 응답 모양 비교 (전/후)

### Before — 03 단계
```json
{ "data": { "code": "BAD_REQUEST", "httpStatus": 400 } }
```

### After — errorFormatter 통과
```json
{
  "data": {
    "code": "BAD_REQUEST",
    "httpStatus": 400,
    "path": "todo.add",
    "zodFieldErrors": {
      "text": ["내용을 입력해주세요.", "공백만으로는 작성할 수 없습니다."]
    }
  }
}
```

### 다른 에러는 zodFieldErrors: null
```json
{ "data": { "code": "UNAUTHORIZED", "httpStatus": 401, "zodFieldErrors": null } }
{ "data": { "code": "FORBIDDEN",    "httpStatus": 403, "zodFieldErrors": null } }
{ "data": { "code": "NOT_FOUND",    "httpStatus": 404, "zodFieldErrors": null } }
```

📌 **모든 에러가 같은 키 집합을 가짐** → 클라이언트가 `data?.zodFieldErrors ? 필드별 표시 : 일반 메시지` 같은 단일 분기를 쓸 수 있음.

---

## 4. 클라이언트 — code별 분기 + 필드 에러 표시

### 타입 흐름
errorFormatter의 반환 모양은 `AppRouter`의 `errorShape`에 자동 반영 → 클라이언트 `useMutation().error`의 타입에도 `data.zodFieldErrors`가 등장.

```ts
import type { TRPCClientErrorLike } from '@trpc/client'
import type { AppRouter } from '~~/server/trpc/routers'

type AppError = TRPCClientErrorLike<AppRouter>
```

### 일반 메시지 변환 헬퍼
```ts
function explainError(err: AppError | null): string | null {
  if (!err) return null
  switch (err.data?.code) {
    case 'UNAUTHORIZED': return '로그인 후 다시 시도해주세요.'
    case 'FORBIDDEN':    return '권한이 없습니다.'
    case 'NOT_FOUND':    return '항목을 찾을 수 없습니다.'
    case 'BAD_REQUEST':  return '입력값을 확인해주세요.'
    default:             return err.message
  }
}
```
> `error.data.code`가 enum-like 문자열이라 **REST의 status code 분기보다 가독성↑**, 정합성↑ (오타 시 TS가 잡음).

### 필드별 Zod 에러 표시
```vue
<ul v-if="addFieldErrors?.text" style="color: crimson;">
  <li v-for="msg in addFieldErrors.text" :key="msg">{{ msg }}</li>
</ul>
```
```ts
const addFieldErrors = computed(() => addError.value?.data?.zodFieldErrors ?? null)
```

### 표시 우선순위
- `addFieldErrors`가 있으면 → input 옆에 필드별 메시지
- 그 외 → 화면 상단 일반 에러 박스 (`explainError(lastError)`)

---

## 5. 검증 (curl, stack 제거 후)

| 케이스 | code | httpStatus | zodFieldErrors |
|---|---|---|---|
| 빈 text로 add | `BAD_REQUEST` | 400 | `{ text: ['내용을 입력해주세요.', '공백만으로는...'] }` |
| 익명 add | `UNAUTHORIZED` | 401 | `null` |
| user-2가 user-1 todo toggle | `FORBIDDEN` | 403 | `null` |
| 존재하지 않는 id toggle | `NOT_FOUND` | 404 | `null` |

---

## 6. 이 단계에서 배운 것

- **에러 응답의 모양은 한 곳(`errorFormatter`)에서 통제하라.** 호출부마다 파싱 로직이 흩어지면 변경 비용이 폭발.
- **`error.cause`로 throw된 원본 접근.** Zod 외에도 DB-specific 에러(예: Prisma의 `P2002` 유니크 위반) 등을 같은 패턴으로 정규화 가능.
- **서버 errorFormatter의 반환 타입이 클라이언트 `error.data` 타입에 자동 반영**된다 (router의 `_def._config.$types.errorShape`로 흐름). 한 번 정의하면 호출부 자동완성에 즉시 등장.
- **`unknown`인 cause 위에서 `z.flattenError`는 `{}`로 추론**. 사용처에서 인덱싱하려면 `Record<string, string[] | undefined>`로 단언 필요.
- **모든 에러가 동일 키 집합을 가지도록 설계**(예: 항상 `zodFieldErrors`를 포함하되 해당 없으면 `null`) → 클라이언트의 분기 로직이 단순해짐.
- **REST의 HTTP status 분기와 같은 자리**를 `error.data.code`가 담당하지만, *문자열 enum + TS 자동완성* 덕에 안전성/가독성이 더 높음.

---

## 7. 다음 단계

- [06. SSR & 캐싱 — Nuxt useAsyncData 통합 깊이](./06-ssr-prefetch.md)
  - SSR 단계에서 procedure가 어떻게 prefetch되는지 (`useQuery`가 `useAsyncData` 위에 올라간 구조)
  - `queryKey` / `mutationKey`로 더 정교한 invalidation
  - `lazy`, `server`, `watch` 옵션이 의미하는 바
  - hydration mismatch가 일어나는 시나리오와 회피 방법
