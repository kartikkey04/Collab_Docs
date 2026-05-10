/**
 * src/schemas/auth.schema.ts
 *
 * Zod schemas for authentication inputs.
 * Validates before any DB or crypto operation runs.
 */

import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password cannot exceed 72 characters"), // bcrypt/scrypt limit
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address").toLowerCase(),
  password: z.string().min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
