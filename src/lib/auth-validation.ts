import { z } from "zod";

const email = z.string().trim().toLowerCase().email("请输入有效的邮箱地址");
const password = z
  .string()
  .min(8, "密码至少需要 8 个字符")
  .max(72, "密码不能超过 72 个字符")
  .regex(/[A-Za-z]/, "密码必须包含字母")
  .regex(/[0-9]/, "密码必须包含数字");

export const loginSchema = z.object({ email, password });

export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(1, "请输入昵称").max(40, "昵称不能超过 40 个字符"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
