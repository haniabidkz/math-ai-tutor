"use client";

import { Languages, SlidersHorizontal } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Difficulty, Locale } from "@/types/curriculum";

interface SessionControlsProps {
    locale: Locale;
    onLocaleChange: (locale: Locale) => void;
    difficulty?: Difficulty;
    onDifficultyChange?: (difficulty: Difficulty) => void;
}

export function SessionControls({ locale, onLocaleChange, difficulty, onDifficultyChange }: SessionControlsProps) {
    return (
        <div className="flex flex-wrap items-center gap-2" aria-label="Session preferences">
            <Select value={locale} onValueChange={(value) => {
                const next = value as Locale;
                localStorage.setItem("mathTutorLocale", next);
                onLocaleChange(next);
            }}>
                <SelectTrigger className="min-w-36" aria-label="Language">
                    <Languages className="h-4 w-4" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="roman-urdu">Roman Urdu</SelectItem>
                </SelectContent>
            </Select>
            {difficulty && onDifficultyChange ? (
                <Select value={difficulty} onValueChange={(value) => {
                    const next = value as Difficulty;
                    localStorage.setItem("mathTutorDifficulty", next);
                    onDifficultyChange(next);
                }}>
                    <SelectTrigger className="min-w-32" aria-label="Difficulty">
                        <SlidersHorizontal className="h-4 w-4" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                </Select>
            ) : null}
        </div>
    );
}
