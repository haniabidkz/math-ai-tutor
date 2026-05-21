"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX } from "lucide-react";

export function TextToSpeech({ text }: { text: string }) {
    const [speaking, setSpeaking] = useState(false);
    const [supported, setSupported] = useState(false);

    useEffect(() => {
        if ("speechSynthesis" in window) {
            setSupported(true);
        }
    }, []);

    const toggleSpeech = () => {
        if (!supported) return;

        if (speaking) {
            window.speechSynthesis.cancel();
            setSpeaking(false);
        } else {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = () => setSpeaking(false);
            window.speechSynthesis.speak(utterance);
            setSpeaking(true);
        }
    };

    // Stop speaking when component unmounts or text changes
    useEffect(() => {
        window.speechSynthesis.cancel();
        setSpeaking(false);
        return () => window.speechSynthesis.cancel();
    }, [text]);

    if (!supported) return null;

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleSpeech}
            className={speaking ? "text-primary animate-pulse" : "text-muted-foreground"}
            title={speaking ? "Stop reading" : "Read aloud"}
        >
            {speaking ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </Button>
    );
}
