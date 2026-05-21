"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    LayoutDashboard,
    BookOpen,
    History,
    LogOut,
    Users,
    AlertTriangle,
    Menu,
    X,
    GraduationCap
} from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
    user: {
        name: string;
        email: string;
        role: "student" | "parent" | "teacher";
        classLevel?: number;
    };
    onSignOut: () => void;
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    const navItems = {
        student: [
            { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
            { href: "/learn", label: "Learn Topics", icon: BookOpen },
            { href: "/quiz-history", label: "Quiz History", icon: History },
        ],
        parent: [
            { href: "/parent-dashboard", label: "Overview", icon: LayoutDashboard },
            { href: "/parent-settings", label: "Settings", icon: Users },
        ],
        teacher: [
            { href: "/teacher-dashboard", label: "Class Overview", icon: LayoutDashboard },
            { href: "/teacher-attention", label: "Attention Needed", icon: AlertTriangle },
            { href: "/teacher-students", label: "All Students", icon: GraduationCap },
        ],
    };

    const routes = navItems[user.role] || [];

    return (
        <>
            {/* Mobile Toggle */}
            <Button
                variant="ghost"
                size="icon"
                className="lg:hidden fixed top-4 left-4 z-50 rounded-full bg-white/90 backdrop-blur shadow-sm border dark:bg-slate-900/90"
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            {/* Sidebar Container */}
            <aside
                className={cn(
                    "fixed top-0 left-0 z-40 h-screen w-72 bg-card border-r transition-transform duration-300 ease-in-out lg:translate-x-0 shadow-lg lg:shadow-none",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50">
                    {/* Header */}
                    <div className="p-6 border-b flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                            🧮
                        </div>
                        <span className="font-bold text-xl tracking-tight text-foreground">
                            SMART <span className="text-primary">Tutor</span>
                        </span>
                    </div>

                    {/* Nav Links */}
                    <nav className="flex-1 p-4 space-y-2 overflow-y-auto py-6">
                        {routes.map((route) => {
                            const Icon = route.icon;
                            // Match exact path or subpaths if needed
                            const isActive = pathname === route.href || pathname?.startsWith(`${route.href}/`);

                            return (
                                <Button
                                    key={route.href}
                                    variant={isActive ? "secondary" : "ghost"}
                                    asChild
                                    className={cn(
                                        "w-full justify-start gap-3 h-11 cursor-pointer",
                                        isActive && "bg-white shadow-sm border border-slate-200/60 dark:bg-slate-800 dark:border-slate-700 font-semibold text-primary",
                                        !isActive && "text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800"
                                    )}
                                >
                                    <Link href={route.href} onClick={() => setIsOpen(false)}>
                                        <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground/70")} />
                                        {route.label}
                                    </Link>
                                </Button>
                            );
                        })}
                    </nav>

                    {/* User Profile Footer */}
                    <div className="p-4 border-t bg-background/50 backdrop-blur">
                        <div className="bg-card border rounded-xl p-3 shadow-sm mb-3">
                            <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 border-2 border-white dark:border-slate-700 shadow-sm">
                                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-xs ring-1 ring-white/20">
                                        {user.name.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    <p className="text-sm font-semibold truncate leading-none mb-1">
                                        {user.name}
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <Badge variant="secondary" className="text-[9px] h-4 px-1 rounded-[4px] uppercase tracking-wider font-bold text-muted-foreground">
                                            {user.role}
                                        </Badge>
                                        {user.classLevel && (
                                            <span className="text-[10px] text-muted-foreground font-medium">Class {user.classLevel}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button
                            variant="outline"
                            className="w-full gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/5 hover:border-destructive/20 h-9 text-xs font-semibold"
                            onClick={onSignOut}
                        >
                            <LogOut className="h-3.5 w-3.5" />
                            Sign Out
                        </Button>
                    </div>
                </div>
            </aside>

            {/* Overlay for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-30 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    );
}
