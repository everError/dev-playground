**Title:** Vue 3 반응성이 동작하지 않는 경우 (reactive/ref 사용 시 주의점)

**Category:** Frontend

**Stack:** Vue

**Status:** Resolved

**Priority:** High

---

## Environment

- Framework: Vue 3 (Composition API)
- 상태 관리에 `ref()`, `reactive()`를 사용하는 구조

## Symptom

데이터를 분명히 변경했는데 화면이 갱신되지 않는다. `console.log`로 찍어보면 값은 바뀌어 있지만, 템플릿에는 이전 값이 그대로 표시된다. 특정 조작에서만 반응성이 깨지고, 다른 조작에서는 정상 동작하여 원인 파악이 어렵다.

## Cause

Vue 3의 반응성 시스템은 Proxy 기반으로 동작한다. Proxy는 객체의 프로퍼티 접근과 변경을 가로채서 추적하는데, 이 Proxy 연결이 끊어지는 방식으로 데이터를 조작하면 반응성이 깨진다.

**패턴 1. reactive() 객체를 통째로 재할당**

```javascript
const state = reactive({ name: "홍길동", age: 30 });

// 이렇게 하면 반응성이 깨진다
state = { name: "김철수", age: 25 }; // ❌ Proxy 객체 자체를 버리고 새 객체로 교체
```

`reactive()`는 전달된 객체를 Proxy로 감싸서 반환한다. 변수 자체를 새 객체로 재할당하면 원래의 Proxy 객체와의 연결이 끊어진다. 템플릿은 여전히 이전 Proxy를 바라보고 있으므로 화면이 갱신되지 않는다.

**패턴 2. reactive() 객체를 구조 분해 할당**

```javascript
const state = reactive({ name: "홍길동", age: 30 });

// 구조 분해하는 순간 반응성이 끊긴다
const { name, age } = state; // ❌ 일반 문자열/숫자로 복사됨
```

구조 분해 할당은 해당 시점의 값을 꺼내는 것이지, Proxy의 추적 연결을 유지하지 않는다. 원시 타입(string, number)은 참조가 아닌 값 복사이므로 반응성이 완전히 끊어진다.

**패턴 3. reactive() 배열을 통째로 교체**

```javascript
const list = reactive([]);

// API 응답을 받아서 교체하려는 의도
list = response.data; // ❌ 재할당이므로 Proxy 연결 끊김
```

**패턴 4. ref()의 .value를 빠뜨림**

```javascript
const count = ref(0);

// script 내에서 .value 없이 접근
count = 10; // ❌ ref 객체 자체를 덮어씀
console.log(count); // 10 (일반 숫자가 되어버림)
```

`ref()`는 `{ value: 0 }` 형태의 래퍼 객체를 반환한다. 템플릿에서는 자동 언래핑되어 `.value` 없이 사용할 수 있지만, script 내에서는 반드시 `.value`를 통해 접근해야 한다.

## Solution

**원칙: reactive()는 프로퍼티를 변경하고, ref()는 .value를 변경한다**

**패턴 1 해결. reactive() 객체는 프로퍼티 단위로 수정한다**

```javascript
const state = reactive({ name: "홍길동", age: 30 });

// 프로퍼티를 개별적으로 변경 → Proxy가 감지
state.name = "김철수";
state.age = 25;

// 여러 필드를 한 번에 바꿔야 한다면 Object.assign 사용
Object.assign(state, { name: "김철수", age: 25 });
```

**패턴 2 해결. 구조 분해가 필요하면 toRefs()를 사용한다**

```javascript
import { reactive, toRefs } from "vue";

const state = reactive({ name: "홍길동", age: 30 });

// toRefs()는 각 프로퍼티를 ref로 변환하여 반응성을 유지
const { name, age } = toRefs(state);
// name.value === "홍길동" (ref이므로 .value로 접근)
```

**패턴 3 해결. 배열 교체는 ref()를 쓰거나 splice로 처리한다**

```javascript
// 방법 A: 배열은 ref()로 선언 (권장)
const list = ref([]);
list.value = response.data; // .value 재할당은 정상 동작

// 방법 B: reactive 배열이면 splice로 교체
const list = reactive([]);
list.splice(0, list.length, ...response.data);
```

**패턴 4 해결. ref()는 script에서 항상 .value를 붙인다**

```javascript
const count = ref(0);

count.value = 10; // ✅
console.log(count.value); // ✅ 10
```

**ref()와 reactive() 사용 기준 정리**

- 원시 타입(string, number, boolean)이나 통째로 교체해야 하는 값(배열, API 응답 등) → `ref()`
- 프로퍼티 단위로만 수정하는 고정된 구조의 객체(폼 데이터, 설정 등) → `reactive()`
- 판단이 애매하면 `ref()`를 쓰는 것이 안전하다. `ref()`는 `.value` 재할당이 가능하므로 통째로 교체해도 반응성이 유지된다

## Notes

- `reactive()`는 깊은 반응성(deep reactivity)을 제공하므로 중첩 객체의 프로퍼티 변경도 감지한다. 얕은 반응성이 필요하면 `shallowReactive()`를 사용한다
- `watch()`로 `reactive()` 객체의 특정 프로퍼티를 감시할 때는 getter 함수 형태로 전달해야 한다: `watch(() => state.name, (newVal) => { ... })`
- Pinia에서도 동일한 원칙이 적용된다. store의 `$state`를 통째로 교체하는 것보다 `$patch()`로 프로퍼티 단위 수정이 권장된다
