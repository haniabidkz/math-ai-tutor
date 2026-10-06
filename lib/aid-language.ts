"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The language a student wants hints, solutions and explanations in. Chosen once when the
 * first learning aid opens, remembered for the browser session, and shared by every aid on
 * the page so one switch changes them all.
 */
export type AidLanguage = "english" | "roman-urdu";

const KEY = "learningAidLanguage";
const EVENT = "aid-language-change";

export function readAidLanguage(): AidLanguage | null {
    try {
        const value = window.sessionStorage.getItem(KEY);
        return value === "english" || value === "roman-urdu" ? value : null;
    } catch {
        return null;
    }
}

export function storeAidLanguage(value: AidLanguage) {
    try {
        window.sessionStorage.setItem(KEY, value);
    } catch {
        // A blocked store only means the choice is asked again next time.
    }
    window.dispatchEvent(new CustomEvent<AidLanguage>(EVENT, { detail: value }));
}

export function useAidLanguage(): [AidLanguage | null, (value: AidLanguage) => void] {
    const [language, setLanguage] = useState<AidLanguage | null>(null);
    useEffect(() => {
        setLanguage(readAidLanguage());
        const onChange = (event: Event) => setLanguage((event as CustomEvent<AidLanguage>).detail);
        window.addEventListener(EVENT, onChange);
        return () => window.removeEventListener(EVENT, onChange);
    }, []);
    const choose = useCallback((value: AidLanguage) => storeAidLanguage(value), []);
    return [language, choose];
}
