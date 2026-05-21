import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface PageHeaderProps {
    title: ReactNode;
    description?: string;
    icon?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function PageHeader({ title, description, icon, action, className }: PageHeaderProps) {
    return (
        <div className={cn("flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8", className)}>
            <div className="flex items-start gap-4">
                {icon && (
                    <div className="mt-1 p-2 bg-primary/10 rounded-lg text-primary">
                        {icon}
                    </div>
                )}
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-muted-foreground text-sm sm:text-base">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {action && <div className="flex items-center gap-2">{action}</div>}
        </div>
    );
}
