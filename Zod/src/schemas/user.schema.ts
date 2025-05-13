import { z } from "zod";

// 사용자 입력 스키마
const addressSchema = z.object({
  street: z.string(),
  zipcode: z.string().length(5),
});

export const userSchema = z.object({
  name: z.string(),
  age: z.number().gte(18),
  address: addressSchema,
});

export type UserInput = z.infer<typeof userSchema>;
