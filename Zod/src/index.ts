import { userSchema } from "./schemas/user.schema";
import { z } from "zod";

/**
 * 문자열 검증
 */
const stringSchema = z
  .string()
  .min(3, "최소 3자 이상이어야 합니다")
  .max(10, "최대 10자까지 입력 가능합니다")
  .regex(/^[a-z]+$/, "소문자 알파벳만 허용됩니다");

console.log(stringSchema.safeParse("abc")); // ✅
console.log(stringSchema.safeParse("A123")); // ❌

/**
 * 숫자 검증
 */
const numberSchema = z
  .number()
  .int("정수만 가능합니다")
  .positive("양수여야 합니다")
  .lt(1000); // 1000 미만

console.log(numberSchema.safeParse(999)); // ✅
console.log(numberSchema.safeParse(-5)); // ❌

/**
 * 배열 검사
 */
const stringArray = z.array(z.string()).nonempty("최소 한 개 이상 필요합니다");

console.log(stringArray.safeParse(["hello", "world"])); // ✅
console.log(stringArray.safeParse([]).error); // ❌

/**
 * 객체 스키마 (중첩 구조 포함)
 */

console.log(
  userSchema.safeParse({
    name: "ABC",
    age: 20,
    address: { street: "Main St", zipcode: "12345" },
  })
); // ✅

/**
 * 유니언 타입
 */
const unionSchema = z.union([z.string(), z.number()]);
console.log(unionSchema.safeParse("hi")); // ✅
console.log(unionSchema.safeParse(123)); // ✅

/**
 * 리터럴 타입
 */
const literalSchema = z.literal("admin");
console.log(literalSchema.safeParse("admin")); // ✅
console.log(literalSchema.safeParse("user").error?.issues); // ❌

/**
 * enum 타입
 */
const roleEnum = z.enum(["admin", "user", "guest"]);
console.log(roleEnum.safeParse("user")); // ✅
console.log(
  roleEnum.safeParse("manager").error?.issues.map((issue) => issue.message)
); // ❌

/**
 * nullable / optional
 */
const nullableString = z.string().nullable();
console.log(nullableString.safeParse(null)); // ✅

const optionalString = z.string().optional();
console.log(optionalString.safeParse(undefined)); // ✅

/**
 * refine – 커스텀 조건
 */
const passwordSchema = z.string().refine((pw) => pw.includes("!"), {
  message: "특수문자 '!'가 포함되어야 합니다",
});
console.log(passwordSchema.safeParse("abc!def")); // ✅
console.log(
  passwordSchema.safeParse("abcdef").error?.issues.map((issue) => issue.message)
); // ❌

const sampleInput = {
  username: "abc",
  email: "abc@example.com",
  password: "secure123",
};

const result = userSchema.safeParse(sampleInput);

if (result.success) {
  console.log("✅ 유효한 입력:", result.data);
} else {
  console.error("❌ 오류:", result.error.format());
}
const dateSchema = z.date(); // Date 객체만 허용

console.log(dateSchema.safeParse(new Date())); // ✅
console.log(dateSchema.safeParse("2023-01-01")); // ❌ (string은 안 됨)

// 문자열 → Date 변환 후 검증
const dateStringSchema = z.string().transform((val) => new Date(val));
console.log(dateStringSchema.parse("2023-01-01")); // ✅ Date 객체 반환

// 최소 1개 이상의 문자열을 가진 Set
const nonEmptySet = z.set(z.string()).nonempty();
nonEmptySet.parse(new Set(["apple"])); // ✅
nonEmptySet.parse(new Set()); // ❌ 오류: 최소 1개의 항목이 필요합니다.

// 최소 5개 이상의 항목을 가진 Set
const minSet = z.set(z.string()).min(5);
minSet.parse(new Set(["a", "b", "c", "d", "e"])); // ✅
minSet.parse(new Set(["a", "b"])); // ❌ 오류: 최소 5개의 항목이 필요합니다.

// 최대 5개 이하의 항목을 가진 Set
const maxSet = z.set(z.string()).max(5);
maxSet.parse(new Set(["a", "b", "c", "d", "e"])); // ✅
maxSet.parse(new Set(["a", "b", "c", "d", "e", "f"])); // ❌ 오류: 최대 5개의 항목까지 허용됩니다.

// 정확히 5개의 항목을 가진 Set
const exactSet = z.set(z.string()).size(5);
exactSet.parse(new Set(["a", "b", "c", "d", "e"])); // ✅
exactSet.parse(new Set(["a", "b", "c"])); // ❌ 오류: 정확히 5개의 항목이 필요합니다.

// 키: string, 값: number인 Map
const stringNumberMap = z.map(z.string(), z.number());
stringNumberMap.parse(
  new Map([
    ["one", 1],
    ["two", 2],
  ])
); // ✅
stringNumberMap.parse(new Map([["one", "1"]])); // ❌ 오류: 값이 숫자가 아닙니다.
