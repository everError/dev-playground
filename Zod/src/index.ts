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
