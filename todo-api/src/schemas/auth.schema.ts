import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(50),
  email: z.email(),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "password is required"),
});
