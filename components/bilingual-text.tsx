"use client";

import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LocalizedText } from "@/types/curriculum";

/**
 * Shows text in English, with an optional button that reveals the Roman Urdu version
 * underneath for students who want extra clarity. The English stays visible throughout.
 */
export function BilingualText({
    text,
    markdown = false,
    className,
    children,
}: {
    text: LocalizedText;
    markdown?: boolean;
    className?: string;
    children?: ReactNode;
}) {
    const [showRomanUrdu, setShowRomanUrdu] = useState(false);
    const hasTranslation = text.romanUrdu.trim().length > 0 && text.romanUrdu.trim() !== text.english.trim();

    // A new hint or explanation starts in English again.
    useEffect(() => setShowRomanUrdu(false), [text.english]);

    const render = (value: string) => markdown
        ? <div className="prose max-w-none leading-7"><ReactMarkdown>{value}</ReactMarkdown></div>
        : <p className="leading-7">{value}</p>;

    return (
        <div className={cn("space-y-2", className)}>
            {children}
            {render(text.english)}
            {hasTranslation ? (
                <>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs"
                        aria-expanded={showRomanUrdu}
                        onClick={() => setShowRomanUrdu((current) => !current)}
                    >
                        <Languages className="h-3.5 w-3.5" />
                        {showRomanUrdu ? "Hide Roman Urdu" : "Roman Urdu"}
                    </Button>
                    {showRomanUrdu ? (
                        <div lang="ur-Latn" className="rounded-md border border-dashed bg-white/70 p-3 text-sm">
                            {render(text.romanUrdu)}
                        </div>
                    ) : null}
                </>
            ) : null}
        </div>
    );
}
