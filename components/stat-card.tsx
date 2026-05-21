import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    description?: string;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    className?: string;
    color?: "default" | "primary" | "success" | "warning" | "danger";
}

export function StatCard({
    title,
    value,
    icon: Icon,
    description,
    trend,
    trendValue,
    className,
    color = "default",
}: StatCardProps) {
    const colorStyles = {
        default: "border-t-slate-200 dark:border-t-slate-800",
        primary: "border-t-indigo-500",
        success: "border-t-emerald-500",
        warning: "border-t-amber-500",
        danger: "border-t-red-500",
    };

    const iconStyles = {
        default: "text-slate-500 bg-slate-100 dark:bg-slate-800",
        primary: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20",
        success: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20",
        warning: "text-amber-600 bg-amber-50 dark:bg-amber-900/20",
        danger: "text-red-600 bg-red-50 dark:bg-red-900/20",
    };

    return (
        <Card className={cn("overflow-hidden border-t-4 shadow-sm hover:shadow-md transition-shadow", colorStyles[color], className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
                    {title}
                </CardTitle>
                <div className={cn("p-2 rounded-full", iconStyles[color])}>
                    <Icon className="h-4 w-4" />
                </div>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold tracking-tight">{value}</div>
                {(description || trend) && (
                    <div className="flex items-center gap-2 mt-1">
                        {trend && (
                            <span
                                className={cn(
                                    "text-xs font-medium px-1.5 py-0.5 rounded",
                                    trend === "up" && "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30",
                                    trend === "down" && "text-red-700 bg-red-100 dark:bg-red-900/30",
                                    trend === "neutral" && "text-slate-600 bg-slate-100 dark:bg-slate-800"
                                )}
                            >
                                {trend === "up" ? "↑" : trend === "down" ? "↓" : "•"} {trendValue}
                            </span>
                        )}
                        {description && (
                            <p className="text-xs text-muted-foreground truncate" title={description}>
                                {description}
                            </p>
                        )}
                    </div>
                )}
            </CardContent>
            {/* Decorative Background Icon */}
            <Icon className="absolute -bottom-4 -right-4 h-24 w-24 text-slate-100 dark:text-slate-800/50 opacity-20 -z-10 transform rotate-12" />
        </Card>
    );
}
