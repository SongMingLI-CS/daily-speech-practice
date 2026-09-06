import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/auth-validation";

describe("registerSchema", () => {
  it("accepts valid input and normalizes email and name", () => {
    const result = registerSchema.parse({
      email: "  Test@Example.com ",
      name: "  Alice  ",
      password: "Password1",
    });
    expect(result.email).toBe("test@example.com");
    expect(result.name).toBe("Alice");
  });

  it("rejects an invalid email", () => {
    expect(
      registerSchema.safeParse({ email: "nope", name: "A", password: "Password1" })
        .success,
    ).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(
      registerSchema.safeParse({ email: "a@b.com", name: "A", password: "Ab1" })
        .success,
    ).toBe(false);
  });

  it("rejects a password without a letter", () => {
    expect(
      registerSchema.safeParse({
        email: "a@b.com",
        name: "A",
        password: "12345678",
      }).success,
    ).toBe(false);
  });

  it("rejects a password without a number", () => {
    expect(
      registerSchema.safeParse({
        email: "a@b.com",
        name: "A",
        password: "onlyletters",
      }).success,
    ).toBe(false);
  });

  it("rejects an empty or oversized name", () => {
    expect(
      registerSchema.safeParse({
        email: "a@b.com",
        name: "   ",
        password: "Password1",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "a@b.com",
        name: "x".repeat(41),
        password: "Password1",
      }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    expect(loginSchema.parse({ email: "a@b.com", password: "Password1" })).toBeTruthy();
  });

  it("rejects an invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "bad", password: "Password1" }).success,
    ).toBe(false);
  });
});
