import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, Nunito } from "next/font/google";
import "./globals.css";
import { PageTransition } from "@/components/layout/page-transition";

const inter = Inter({ subsets: ["latin"] });
// The student screens use rounder, friendlier type; the rest of the app keeps Inter.
// The font variables live on <html> so the theme's --font-display and --font-body, declared on :root, can see them.
const fredoka = Fredoka({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-fredoka" });
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--font-nunito" });

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "white" },
        { media: "(prefers-color-scheme: dark)", color: "black" },
    ],
};

export const metadata: Metadata = {
    title: {
        template: "%s | SMART Math Tutor",
        default: "SMART Math Tutor - Learn Math with AI",
    },
    description: "A patient, encouraging AI math tutor focused on understanding, not speed or marks.",
    keywords: ["math", "tutor", "AI", "learning", "education", "children"],
    authors: [{ name: "SMART Math Tutor Team" }],
    icons: {
        icon: "/favicon.ico",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={`${fredoka.variable} ${nunito.variable}`} suppressHydrationWarning>
            <body className={`${inter.className} min-h-screen antialiased bg-background text-foreground overflow-x-hidden`} suppressHydrationWarning>
                <PageTransition>
                    {children}
                </PageTransition>
            </body>
        </html>
    );
}
