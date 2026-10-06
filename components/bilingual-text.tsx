"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAidLanguage, type AidLanguage } from "@/lib/aid-language";
import { cn } from "@/lib/utils";
import type { LocalizedText } from "@/types/curriculum";

const NAMES: Record<AidLanguage, string> = { english: "English", "roman-urdu": "Roman Urdu" };

/**
 * A learning aid (hint, solution, explanation, concept) in the language the student chose.
 * The first aid of the session asks which language to read in; after that every aid renders
 * in that language at once, with a switch that changes the choice for the whole session.
 */
export function BilingualText({
    text,
    markdown = false,
    className,
    children,
    prompt = "Read this in",
    switcher = true,
}: {
    text: LocalizedText;
    markdown?: boolean;
    className?: string;
    children?: ReactNode;
    /** The question asked before the first aid is shown, e.g. "Read the hint in". */
    prompt?: string;
    /** Off when the screen has one language switch for all its aids; the chooser is then not shown. */
    switcher?: boolean;
}) {
    const [language, choose] = useAidLanguage();
    const hasTranslation = text.romanUrdu.trim().length > 0 && text.romanUrdu.trim() !== text.english.trim();

    // Larger type and generous line height, so explanations read easily on a phone or a laptop.
    const render = (value: string, lang?: string) => markdown
        ? <div lang={lang} className="prose prose-lg max-w-none break-words leading-8"><ReactMarkdown>{value}</ReactMarkdown></div>
        : <p lang={lang} className="whitespace-pre-line break-words text-base leading-8 md:text-lg">{value}</p>;

    if (!hasTranslation) {
        return <div className={cn("space-y-2", className)}>{children}{render(text.english)}</div>;
    }

    if (!language) {
        // A screen with one switch for all its aids reads in English until the student switches.
        if (!switcher) return <div className={cn("space-y-2", className)}>{children}{render(text.english)}</div>;
        return (
            <div className={cn("space-y-3", className)}>
                {children}
                <div role="group" aria-label={prompt} className="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/70 p-3">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900"><Languages className="h-4 w-4" />{prompt}:</p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={() => choose("english")}>English</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => choose("roman-urdu")}>Roman Urdu</Button>
                    </div>
                </div>
            </div>
        );
    }

    const other: AidLanguage = language === "english" ? "roman-urdu" : "english";
    return (
        <div className={cn("space-y-2", className)}>
            {children}
            {language === "english" ? render(text.english) : render(text.romanUrdu, "ur-Latn")}
            {switcher ? (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => choose(other)}>
                    <Languages className="h-3.5 w-3.5" />Read in {NAMES[other]}
                </Button>
            ) : null}
        </div>
    );
}
