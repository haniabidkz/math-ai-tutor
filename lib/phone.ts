/**
 * Phone numbers as sign-in identities. Firebase Auth signs in with an email and a password,
 * so every phone gets a synthetic email on a domain the product owns; the real email, when a
 * user has one, lives on the profile. Numbers are stored in E.164 (+923001234567).
 */

export const PHONE_EMAIL_DOMAIN = "phone.learnaitutor.com";

/** Accepts 03001234567, 0300-1234567, +92 300 1234567, 923001234567 and 0092…; returns E.164 or null. */
export function normalizePhone(input: string | null | undefined): string | null {
    const raw = String(input ?? "").trim();
    if (!raw) return null;
    const plus = raw.startsWith("+");
    let digits = raw.replace(/\D/g, "");
    if (!plus) {
        if (digits.startsWith("00")) digits = digits.slice(2);
        else if (digits.startsWith("0") && digits.length === 11) digits = `92${digits.slice(1)}`;
        else if (digits.length === 10 && digits.startsWith("3")) digits = `92${digits}`;
    }
    // A local number that is not eleven digits (03001234567) cannot be a mobile.
    if (!plus && digits.startsWith("0")) return null;
    if (!/^\d{10,15}$/.test(digits)) return null;
    // A Pakistani mobile number is 92 followed by 3 and nine more digits.
    if (digits.startsWith("92") && !/^923\d{9}$/.test(digits)) return null;
    return `+${digits}`;
}

/** True when the sign-in box holds something shaped like a phone rather than an email. */
export function looksLikePhone(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("@")) return false;
    return /^\+?[\d\s()-]{4,20}$/.test(trimmed) && trimmed.replace(/\D/g, "").length >= 4;
}

export function phoneToEmail(e164: string): string {
    return `${e164.replace(/^\+/, "")}@${PHONE_EMAIL_DOMAIN}`;
}

export function isPhoneEmail(email: string | null | undefined): boolean {
    return typeof email === "string" && email.toLowerCase().endsWith(`@${PHONE_EMAIL_DOMAIN}`);
}

export function phoneFromEmail(email: string | null | undefined): string | null {
    if (!isPhoneEmail(email)) return null;
    const local = String(email).split("@")[0];
    return /^\d{10,15}$/.test(local) ? `+${local}` : null;
}

/** The sign-in identity for a phone or an email typed into the login box. */
export function signInEmailFor(identifier: string): { email: string; phone: string | null } | { error: string } {
    const trimmed = identifier.trim();
    if (!trimmed) return { error: "Enter your phone number or email" };
    if (looksLikePhone(trimmed)) {
        const phone = normalizePhone(trimmed);
        if (!phone) return { error: "Enter a valid mobile number, like 03001234567" };
        return { email: phoneToEmail(phone), phone };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: "Enter a valid email address or mobile number" };
    return { email: trimmed.toLowerCase(), phone: null };
}

/** 0300 1234567 for Pakistani numbers, the E.164 form for others. */
export function formatPhone(e164: string | null | undefined): string {
    if (!e164) return "";
    const digits = e164.replace(/\D/g, "");
    if (digits.startsWith("92") && digits.length === 12) return `0${digits.slice(2, 5)} ${digits.slice(5)}`;
    return `+${digits}`;
}

/** What to show for a user: their real email, else their phone, never the synthetic email. */
export function displayContact(profile: { email?: string | null; phone?: string | null }): string {
    const email = String(profile.email ?? "").trim();
    if (email && !isPhoneEmail(email)) return email;
    const phone = profile.phone ?? phoneFromEmail(email);
    return phone ? formatPhone(phone) : "";
}
