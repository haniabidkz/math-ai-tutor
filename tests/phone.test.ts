import { describe, expect, it } from "vitest";
import { displayContact, formatPhone, isPhoneEmail, looksLikePhone, normalizePhone, phoneFromEmail, phoneToEmail, signInEmailFor } from "@/lib/phone";

describe("phone numbers", () => {
    it("normalises the ways Pakistani numbers are written", () => {
        expect(normalizePhone("03001234567")).toBe("+923001234567");
        expect(normalizePhone("0300-1234567")).toBe("+923001234567");
        expect(normalizePhone("+92 300 1234567")).toBe("+923001234567");
        expect(normalizePhone("923001234567")).toBe("+923001234567");
        expect(normalizePhone("00923001234567")).toBe("+923001234567");
        expect(normalizePhone("3001234567")).toBe("+923001234567");
    });

    it("rejects numbers that cannot be a mobile", () => {
        expect(normalizePhone("")).toBeNull();
        expect(normalizePhone("12345")).toBeNull();
        expect(normalizePhone("0300123456")).toBeNull();
        expect(normalizePhone("+92 21 1234567")).toBeNull();
        expect(normalizePhone("abc")).toBeNull();
    });

    it("keeps other countries in E.164", () => {
        expect(normalizePhone("+971501234567")).toBe("+971501234567");
    });

    it("maps a phone to its sign-in email and back", () => {
        expect(phoneToEmail("+923001234567")).toBe("923001234567@phone.learnaitutor.com");
        expect(isPhoneEmail("923001234567@phone.learnaitutor.com")).toBe(true);
        expect(isPhoneEmail("ali@gmail.com")).toBe(false);
        expect(phoneFromEmail("923001234567@phone.learnaitutor.com")).toBe("+923001234567");
        expect(phoneFromEmail("ali@gmail.com")).toBeNull();
    });

    it("tells a typed phone from a typed email at sign-in", () => {
        expect(looksLikePhone("0300 1234567")).toBe(true);
        expect(looksLikePhone("ali@gmail.com")).toBe(false);
        expect(signInEmailFor("03001234567")).toEqual({ email: "923001234567@phone.learnaitutor.com", phone: "+923001234567" });
        expect(signInEmailFor("Ali@Gmail.com")).toEqual({ email: "ali@gmail.com", phone: null });
        expect(signInEmailFor("0300")).toEqual({ error: "Enter a valid mobile number, like 03001234567" });
        expect(signInEmailFor("not an email")).toEqual({ error: "Enter a valid email address or mobile number" });
    });

    it("shows a readable contact, never the synthetic email", () => {
        expect(formatPhone("+923001234567")).toBe("0300 1234567");
        expect(displayContact({ email: "923001234567@phone.learnaitutor.com", phone: "+923001234567" })).toBe("0300 1234567");
        expect(displayContact({ email: "923001234567@phone.learnaitutor.com" })).toBe("0300 1234567");
        expect(displayContact({ email: "ali@gmail.com", phone: "+923001234567" })).toBe("ali@gmail.com");
        expect(displayContact({})).toBe("");
    });
});
