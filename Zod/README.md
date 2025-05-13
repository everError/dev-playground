# Zod 기본 개념 및 문법 정리

[Zod](https://github.com/colinhacks/zod)는 **TypeScript-first**를 지향하는 스키마 선언 및 유효성 검사(validation) 라이브러리입니다. 런타임에서 객체의 구조를 검사하면서 동시에 TypeScript의 타입 추론을 지원합니다.

---

## ✨ Zod의 핵심 특징

- **TypeScript와의 강력한 통합**
  Zod 스키마로부터 TypeScript 타입을 자동 유추할 수 있습니다 (`z.infer` 사용).

- **런타임 유효성 검사**
  API 요청, 사용자 입력 등 외부 데이터에 대해 안전하게 타입을 확인하고 구조를 검증합니다.

- **간결한 문법**
  객체, 배열, 열거형, 유니언 등 복잡한 구조도 쉽게 선언할 수 있습니다.

- **동기 / 비동기 검증 지원**
  `parse` / `safeParse` 뿐 아니라 `parseAsync`도 제공되어, 서버 또는 DB 요청이 필요한 검증도 가능합니다.

---

## 📦 설치 방법

```bash
npm install zod
```

---

## 🧩 기본 문법 예시

```ts
import { z } from "zod";

// 사용자 정보 스키마 정의
const userSchema = z.object({
  name: z.string(), // 문자열
  age: z.number().min(0), // 0 이상의 숫자
  email: z.string().email(), // 이메일 형식
  isAdmin: z.boolean().optional(), // 선택적 불리언
});

// Zod 스키마로부터 TypeScript 타입 유추
export type UserInput = z.infer<typeof userSchema>;

// 유효성 검사
const result = userSchema.safeParse({
  name: "abc",
  age: 25,
  email: "abc@example.com",
});

if (result.success) {
  console.log("✅ 유효한 입력:", result.data);
} else {
  console.error("❌ 오류:", result.error.format());
}
```

> 🔍 `z.infer<typeof userSchema>`는 해당 Zod 스키마에서 TypeScript 타입을 자동으로 유추합니다. 이를 통해 타입을 중복으로 선언하지 않고, Zod 스키마 기반으로 타입 안정성을 유지할 수 있습니다.

---

## 🧱 스키마 정의 자세히 보기

### 🔹 기본 타입 선언

```ts
z.string(); // 문자열
z.number(); // 숫자
z.boolean(); // 불리언
z.date(); // Date 객체
z.undefined(); // undefined
z.null(); // null
z.literal("A"); // 리터럴 값 "A"
```

### 🔹 객체 스키마

```ts
z.object({
  id: z.number(),
  title: z.string(),
});
```

### 🔹 배열 스키마

```ts
z.array(z.string());
```

### 🔹 유니언 / 교차 스키마

```ts
z.union([z.string(), z.number()]);
z.intersection(z.object({ id: z.number() }), z.object({ name: z.string() }));
```

### 🔹 선택적 / nullable 필드

```ts
z.string().optional(); // 선택적
z.string().nullable(); // null 허용
```

### 🔹 커스텀 메시지 및 정제

```ts
z.string().min(3, { message: "3자 이상 입력해주세요." });
z.string().refine((val) => val.startsWith("abc"), {
  message: "abc로 시작해야 합니다.",
});
```

---

## 📌 주요 메서드 및 설명

| 메서드 / 옵션            | 설명                                     |
| ------------------------ | ---------------------------------------- |
| `z.string()`             | 문자열 타입                              |
| `z.number()`             | 숫자 타입                                |
| `z.boolean()`            | 불리언 타입                              |
| `.min(n)`                | 최소 길이 (string) 또는 최소 값 (number) |
| `.max(n)`                | 최대 길이 또는 최대 값                   |
| `.email()`               | 이메일 형식 문자열                       |
| `.optional()`            | 해당 필드를 선택적으로 설정              |
| `.nullable()`            | `null` 값을 허용                         |
| `.default(val)`          | 기본값 지정                              |
| `.refine(fn, opts)`      | 커스텀 유효성 로직 추가                  |
| `z.object({...})`        | 객체 타입 정의                           |
| `z.union([...])`         | 여러 타입 중 하나                        |
| `z.infer<typeof schema>` | Zod 스키마로부터 TypeScript 타입 추론    |
| `parse(data)`            | 유효성 검사 + 실패 시 예외 발생          |
| `safeParse(data)`        | 유효성 검사 + 성공 여부 반환 (boolean)   |
