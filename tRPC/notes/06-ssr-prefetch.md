# 06. SSR & 캐싱 — useAsyncData 통합 깊이

> **목표**: `$trpc.*.useQuery()`가 Nuxt의 `useAsyncData` 위에 어떻게 올라가는지 이해하고, 그 위에서 가능한 옵션(`lazy` / `server` / `watch`)과 정교한 invalidation(`getQueryKey + refreshNuxtData`)을 시연한다.

---

## 1. `useQuery`는 `useAsyncData`의 얇은 래퍼다

trpc-nuxt v2의 `useQuery` 시그니처를 다시 보면:

```ts
useQuery: (
  input,
  opts?: Omit<AsyncDataOptions<...>, 'watch'> & {
    queryKey?: string
    watch?: AsyncDataOptions<...>['watch'] | false
    trpc?: TRPCRequestOptions
  }
) => AsyncData<...>
```

- 반환 타입이 그대로 `AsyncData` → `data` / `pending` / `error` / `refresh()` / `execute()` 모두 Nuxt의 `useAsyncData`와 동일.
- `opts`도 대부분이 `AsyncDataOptions`. **즉 `useQuery`는 "tRPC 호출을 fetcher로 박은 useAsyncData"**.
- 추가된 것은 `queryKey` (커스텀 키), `trpc` (request 단위 옵션 — 헤더 추가 등) 정도.

이걸 한 번 인지하고 나면, **Nuxt 문서의 `useAsyncData` 지식이 그대로 유효**해진다 (lazy/server/watch/transform 등).

---

## 2. SSR Prefetch 흐름

이 단계의 `app.vue`엔 두 종류 호출이 있다.

```ts
// (a) eager — SSR에서 fetch + prerender
const { data: todos } = await $trpc.todo.list.useQuery()

// (b) CSR-only — SSR에서 건너뛰고 hydrate 후 클라가 fetch
const { data: serverInfo } = await $trpc.system.serverInfo.useQuery(
  undefined,
  { lazy: true, server: false },
)
```

### 검증된 결과 (curl `/`)
| 항목 | (a) todos | (b) serverInfo |
|---|---|---|
| SSR HTML에 데이터 인라인 | ✅ "tRPC 셋업 완료하기" 등 | ❌ "로딩 중..." 자리표시자 |
| `__NUXT_DATA__`에 직렬화 | ✅ | ❌ |
| 클라이언트가 마운트 후 추가 요청 | ❌ (prerender 재사용) | ✅ |

### 흐름 다이어그램

```
[SSR step]                                   [Hydration]                 [CSR step]
서버에 들어온 GET /
  ├─ todo.list 호출 → JSON 결과를 HTML과 __NUXT_DATA__에 직렬화
  └─ serverInfo 는 server:false → 스킵
                                             브라우저에 HTML 도착
                                             __NUXT_DATA__에서 todos 복원
                                                                       마운트 직후
                                                                         serverInfo fetch 시작
                                                                         (data 채워짐, 화면 갱신)
```

📌 **`useAsyncData`가 `__NUXT_DATA__` 직렬화/역직렬화까지 책임진다.** SSR fetch 결과는 hydration 데이터로 자동 흘러 가서 클라이언트가 똑같은 호출을 또 하지 않음.

---

## 3. ⚠️ `lazy: true`의 흔한 오해

처음에 `lazy: true`만 줘서 SSR에서 비어있길 기대했지만, **여전히 prerender됨**.

```ts
// ❌ 의도와 다른 동작
{ lazy: true }
// → SSR에서도 fetch 발생 → 결과가 HTML에 prerender됨
```

### `lazy`의 진짜 의미
- "이 query 때문에 navigation/렌더 트리 진입을 **막지 않는다**" (= 페이지의 다른 부분이 이걸 기다리지 않음).
- **SSR에서 fetch는 여전히 일어난다**. 결과가 HTML에 들어갈 수 있음.

### "SSR에서 fetch 자체를 끄려면"
```ts
// ✅ 진짜 CSR-only
{ server: false }       // 또는 { lazy: true, server: false }
```

| 옵션 | SSR fetch | 첫 paint에 데이터 포함 | navigation 차단 |
|---|---|---|---|
| 기본 | ✅ | ✅ | ✅ |
| `lazy: true` | ✅ | ✅ (시점 따라) | ❌ |
| `server: false` | ❌ | ❌ | (서버에선 의미 X) |
| `server: false, lazy: true` | ❌ | ❌ | ❌ |

### 어떤 걸 언제?
- **SEO / 첫 paint 중요한 데이터** → 기본값 (eager + SSR).
- **첫 paint 후 채워도 되는 큰 페이로드** → `lazy: true` (SSR 응답을 늦추지 않음).
- **로그인 사용자에게만 의미 있는 정보 / 매번 다른 클라이언트 상태에 의존** → `server: false`.

---

## 4. 정교한 Invalidation — `getQueryKey + refreshNuxtData`

### 단순 패턴 (03~05 단계)
```ts
const { data, refresh } = await $trpc.todo.list.useQuery()
await refresh()
```
> **이 useQuery 인스턴스만** 재조회. 같은 query를 다른 컴포넌트에서 호출했다면 그쪽은 갱신 안 됨.

### 정교한 패턴 (06)
```ts
import { getQueryKey } from 'trpc-nuxt/client'

const todoListKey = getQueryKey($trpc.todo.list)
const refreshList = () => refreshNuxtData(todoListKey)
```

- `getQueryKey($trpc.todo.list)` → 그 procedure의 unique 문자열 키.
- `refreshNuxtData(key)` → **같은 key의 모든 `useAsyncData` 인스턴스**를 일괄 갱신 (Nuxt 표준 함수).
- 입력별로 키를 좁히려면: `getQueryKey($trpc.todo.list, partialInput)`.

### 왜 의미가 있나
컴포넌트가 분리될수록 같은 쿼리를 여러 곳에서 부르게 됨 — 헤더의 todo 카운트, 사이드바의 미완료 목록, 메인 리스트 등. mutation 후엔 **모두 한 번에 갱신**되어야 일관성 유지.
`refresh()`는 그 자리의 useQuery만, `refreshNuxtData`는 같은 키를 가진 *모든* useAsyncData를.

### `mutationKey`도 동일 패턴
```ts
import { getMutationKey } from 'trpc-nuxt/client'
const addKey = getMutationKey($trpc.todo.add)
// 글로벌 로딩 표시 / 마지막 mutation 추적 등에 활용
```

---

## 5. Hydration mismatch — tRPC 관점에서의 흔한 함정

서버 prerender 결과 ≠ 클라이언트 첫 렌더 결과면 Nuxt가 mismatch 경고를 띄움. tRPC 관련해 자주 만나는 시나리오:

### (a) Cookie 포워딩을 빼먹었을 때 (04 단계 참조)
- SSR: cookie 미전달 → ctx.user = null → `todo.list`는 익명 결과
- CSR: 브라우저가 자동 첨부 → 인증된 결과
- → 두 결과가 다르면 mismatch.
- **회피**: `httpBatchLink({ pickHeaders: ['cookie'] })` (이미 04에서 적용).

### (b) 서버에만 의존하는 값을 SSR에 넣은 뒤 클라가 다시 계산
- 예: `serverInfo.uptimeSeconds`를 SSR에 prerender하고, 클라이언트에서 setInterval로 매초 증가.
- 첫 hydrate 시점은 SSR 시점과 다름 → 시각 차이로 mismatch.
- **회피**: 시간 의존 표시는 `onMounted` 이후에 시작, 또는 `<ClientOnly>` 안에 두기.

### (c) 인증 결과에 따라 다른 컴포넌트를 SSR/CSR이 렌더
- SSR: 익명 → "로그인하세요" 표시
- CSR: 토큰이 있어서 "환영합니다" 표시
- → mismatch.
- **회피**: 인증 의존 UI는 `<ClientOnly>` 또는 SSR/CSR이 같은 결정을 내릴 만큼 cookie/토큰을 양쪽이 모두 봄.

📌 tRPC가 일으키는 mismatch는 거의 항상 **"서버와 클라이언트가 같은 결과를 내도록 입력(=cookie/헤더/시간)을 정렬해야 한다"** 는 일반 원칙으로 환원된다.

---

## 6. 추가 옵션 빠르게

### `watch` — input이 reactive면 자동 재조회
```ts
const keyword = ref('')
const { data } = $trpc.todo.list.useQuery(
  () => ({ q: keyword.value }),  // getter 형태
  { watch: [keyword] },
)
// keyword 변경 → 자동 재호출 (검색창 패턴)
// watch: false → 자동 재조회 비활성
```

### `transform` — 받은 데이터를 변형해서 캐시
```ts
$trpc.todo.list.useQuery(undefined, {
  transform: list => list.filter(t => !t.completed),
})
// data에는 변형된 결과만 흐름. 원본은 보관 안 함.
```

### `default` — 초기 placeholder
```ts
$trpc.todo.list.useQuery(undefined, { default: () => [] as Todo[] })
// data가 처음부터 빈 배열로 시작 (null 분기 줄임)
```

---

## 7. 이 단계에서 배운 것

- **`useQuery` = `useAsyncData` 위의 얇은 래퍼**. Nuxt 문서의 useAsyncData 지식이 그대로 유효 → 학습 면적이 작음.
- **`lazy`와 `server`는 다른 개념**. lazy = navigation 차단 안 함, server: false = SSR fetch 자체를 끔. 흔한 오해.
- **`getQueryKey + refreshNuxtData`** 가 컴포넌트 경계를 넘는 일관된 invalidation의 표준 패턴. 단순 `refresh()`는 그 자리의 인스턴스만.
- **hydration mismatch는 거의 모두 입력 정렬 문제**. cookie/헤더/시간이 SSR과 CSR에서 같아야 결과가 같음. tRPC-specific 한 게 아니고 SSR 일반 원칙.
- **첫 paint를 가볍게 만들고 싶다면 비핵심 query에 `server: false`** — SEO/콘텐츠 우선 데이터는 eager로 두고, 부가 정보는 CSR-only로 분리하는 게 자연스러움.

---

## 8. 다음 단계

- [07. 회고 — GraphQL/gRPC와의 비교](./07-comparison.md)
  - 같은 Todo 도메인을 세 방식으로 구현했을 때 차이
  - 타입 안전성 / 학습 곡선 / 다언어 지원 / 운영 복잡도
  - 어떤 상황에서 무엇을 고를지 결정 트리
