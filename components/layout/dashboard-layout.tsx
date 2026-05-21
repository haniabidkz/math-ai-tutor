"use client";

import { Sidebar } from "./sidebar";
import { cn } from "@/lib/utils";

interface DashboardLayoutProps {
    children: React.ReactNode;
    user: {
        name: string;
        email: string;
        role: "student" | "parent" | "teacher";
        classLevel?: number;
    };
    onSignOut: () => void;
    className?: string; // For main content area custom classes
}

export function DashboardLayout({
    children,
    user,
    onSignOut,
    className,
}: DashboardLayoutProps) {
    return (
        <div className="min-h-screen bg-slate-50/50 dark:bg-slate-900/50">
            {/* Sidebar */}
            <Sidebar user={user} onSignOut={onSignOut} />

            {/* Main Content Area */}
            <main
                className={cn(
                    "lg:pl-72 min-h-screen transition-all duration-300 ease-in-out",
                    "flex flex-col",
                    className
                )}
            >
                <div className="flex-1 p-4 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
