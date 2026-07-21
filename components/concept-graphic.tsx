import { cn } from "@/lib/utils";

export function ConceptGraphic({ kind, className }: { kind: string; className?: string }) {
    if (kind === "balance") {
        return (
            <div className={cn("relative h-28 w-full overflow-hidden bg-amber-50", className)} aria-label="Balanced equation visual">
                <div className="absolute left-1/2 top-5 h-16 w-1 -translate-x-1/2 bg-slate-700" />
                <div className="absolute left-1/2 top-7 h-1 w-48 -translate-x-1/2 bg-slate-700" />
                <div className="absolute left-[23%] top-8 h-12 w-20 border-b-4 border-amber-600" />
                <div className="absolute right-[23%] top-8 h-12 w-20 border-b-4 border-emerald-600" />
            </div>
        );
    }
    if (kind === "fraction" || kind === "ratio") {
        return (
            <div className={cn("grid h-28 grid-cols-8 gap-1 bg-emerald-50 p-6", className)} aria-label="Equal parts visual">
                {Array.from({ length: 8 }, (_, index) => <div key={index} className={cn("border border-emerald-700", index < 5 ? "bg-emerald-500" : "bg-white")} />)}
            </div>
        );
    }
    if (kind === "number-line") {
        return (
            <div className={cn("relative h-28 bg-sky-50", className)} aria-label="Number line visual">
                <div className="absolute left-8 right-8 top-1/2 h-1 bg-slate-700" />
                {[-3, -2, -1, 0, 1, 2, 3].map((number, index) => (
                    <div key={number} className="absolute top-[43%] text-center text-xs font-semibold" style={{ left: `${12 + index * 12.5}%` }}>
                        <span className="block h-4 w-0.5 bg-slate-700" />{number}
                    </div>
                ))}
            </div>
        );
    }
    return (
        <div className={cn("flex h-28 items-center justify-center gap-3 bg-indigo-50 text-xl font-semibold text-indigo-800", className)} aria-label="Algebra pattern visual">
            <span>x</span><span>+</span><span className="border border-indigo-300 bg-white px-4 py-2">3</span><span>=</span><span>?</span>
        </div>
    );
}
