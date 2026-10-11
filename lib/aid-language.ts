"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The language a student wants hints, solutions and explanations in. Asked once, at the start
 * of the first quiz or lesson, kept on the device so every later quiz uses it without asking,
 * and changeable from the menu. Every aid on a page follows it.
 */
export type AidLanguage = "english" | "roman-urdu";

const KEY = "learningAidLanguage";
const EVENT = "aid-language-change";

function storage(): Storage | null {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

export function readAidLanguage(): AidLanguage | null {
    try {
        // Older sessions kept the choice for the tab only; honour it once, then keep it.
        const value = storage()?.getItem(KEY) ?? window.sessionStorage.getItem(KEY);
        return value === "english" || value === "roman-urdu" ? value : null;
    } catch {
        return null;
    }
}

export function storeAidLanguage(value: AidLanguage) {
    try {
        storage()?.setItem(KEY, value);
        window.sessionStorage.setItem(KEY, value);
    } catch {
        // A blocked store only means the choice is asked again next time.
    }
    window.dispatchEvent(new CustomEvent<AidLanguage>(EVENT, { detail: value }));
}

/**
 * The chosen language, a setter, and whether the stored choice has been read yet, so a
 * screen can wait for it before asking the student to choose.
 */
export function useAidLanguage(): [AidLanguage | null, (value: AidLanguage) => void, boolean] {
    const [language, setLanguage] = useState<AidLanguage | null>(null);
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
        setLanguage(readAidLanguage());
        setLoaded(true);
        const onChange = (event: Event) => setLanguage((event as CustomEvent<AidLanguage>).detail);
        window.addEventListener(EVENT, onChange);
        return () => window.removeEventListener(EVENT, onChange);
    }, []);
    const choose = useCallback((value: AidLanguage) => storeAidLanguage(value), []);
    return [language, choose, loaded];
}
