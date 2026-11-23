import { describe, expect, it } from "vitest";
import { authErrorMessage, safeNext } from "./auth";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/karya/wayang?x=1")).toBe("/karya/wayang?x=1");
    expect(safeNext("/admin")).toBe("/admin");
  });
  it("rejects other sites and empty values", () => {
    expect(safeNext("https://jahat.example")).toBe("/galeri");
    expect(safeNext("//jahat.example")).toBe("/galeri");
    expect(safeNext(String.raw`/\jahat.example`)).toBe("/galeri");
    expect(safeNext(null)).toBe("/galeri");
    expect(safeNext("", "/")).toBe("/");
  });
});

describe("authErrorMessage", () => {
  it("maps Supabase Auth codes to Indonesian messages", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Email atau kata sandi salah.");
    expect(authErrorMessage({ code: "user_already_exists" })).toMatch(/sudah terdaftar/);
    expect(authErrorMessage({ code: "weak_password" })).toMatch(/terlalu lemah/);
  });
  it("falls back for unknown errors", () => {
    expect(authErrorMessage(new Error("boom"), "Gagal.")).toBe("Gagal.");
    expect(authErrorMessage(undefined)).toBe("Terjadi kesalahan. Coba lagi.");
  });
});
