import { Badge } from "@/components/ui/badge";
import type { PlanState } from "@/lib/access";

/** The school's plan in one word, coloured by how urgent it is. */
export function PlanBadge({ plan, trialDaysLeft, status }: { plan: PlanState; trialDaysLeft?: number; status?: "active" | "suspended" }) {
    if (status === "suspended") return <Badge className="bg-red-600 text-white hover:bg-red-600">Suspended</Badge>;
    if (plan === "paid") return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Paid plan</Badge>;
    if (plan === "trial") {
        const days = trialDaysLeft ?? 0;
        return <Badge className={days <= 3 ? "bg-amber-500 text-white hover:bg-amber-500" : "bg-sky-600 text-white hover:bg-sky-600"}>Trial · {days} {days === 1 ? "day" : "days"} left</Badge>;
    }
    return <Badge variant="secondary" className="bg-slate-200 text-slate-800">Free (trial ended)</Badge>;
}

export function AccessBadge({ premium }: { premium: boolean }) {
    return premium
        ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Paid</Badge>
        : <Badge variant="outline" className="border-slate-300 text-slate-600">Free</Badge>;
}
