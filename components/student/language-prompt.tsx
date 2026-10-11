"use client";

import { Languages } from "lucide-react";
import { PiSays } from "@/components/student/pi-mascot";
import type { AidLanguage } from "@/lib/aid-language";

/**
 * Asked once before the first quiz or lesson: which language hints, reasons and solutions
 * should be in. The choice is kept on the device and can be changed from the menu later.
 */
export function LanguagePrompt({ onChoose, title = "Choose your language" }: { onChoose: (value: AidLanguage) => void; title?: string }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#F4F6FB] p-4 font-body text-slate-900">
            <div className="w-full max-w-lg">
                <PiSays mood="happy">Which language should I explain in? · Main kis zuban mein samjhaun?</PiSays>
                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 text-center md:p-8">
                    <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1 text-xs font-extrabold uppercase text-indigo-800"><Languages className="h-3.5 w-3.5" />{title}</span>
                    <h1 className="mt-3 font-display text-2xl font-semibold">Hints, reasons and solutions in...</h1>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => onChoose("roman-urdu")}
                            className="rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200">
                            <span className="block font-display text-2xl font-bold">Roman Urdu</span>
                            <span className="mt-1 block text-sm text-slate-600">Hint, wajah aur solution Roman Urdu mein. Sawal English mein rehte hain.</span>
                        </button>
                        <button type="button" onClick={() => onChoose("english")}
                            className="rounded-2xl border-2 border-slate-200 bg-white p-5 text-left transition hover:border-indigo-400 hover:bg-indigo-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200">
                            <span className="block font-display text-2xl font-bold">English</span>
                            <span className="mt-1 block text-sm text-slate-600">Hints, reasons and solutions in English.</span>
                        </button>
                    </div>
                    <p className="mt-4 text-xs font-bold text-slate-500">You can change this any time from the menu. · Menu se kabhi bhi badal sakte ho.</p>
                </div>
            </div>
        </main>
    );
}
