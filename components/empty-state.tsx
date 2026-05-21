import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
    title: string;
    description: string;
    icon: LucideIcon;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
    children?: React.ReactNode;
}

export function EmptyState({
    title,
    description,
    icon: Icon,
    action,
    className,
    children,
}: EmptyStateProps) {
    return (
        <Card className={cn("flex flex-col items-center justify-center p-8 text-center min-h-[300px] border-dashed", className)}>
            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-full mb-4 ring-8 ring-slate-50/50 dark:ring-slate-800/50">
                <Icon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
                {description}
            </p>
            {children}
            {action && (
                <Button onClick={action.onClick} className="mt-2">
                    {action.label}
                </Button>
            )}
        </Card>
    );
}
