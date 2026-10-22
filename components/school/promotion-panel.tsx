"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { formatDate, jsonInit, schoolApi } from "@/components/school/school-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PromotionPlan } from "@/lib/schools";

/** One click moves every class up a year; the admin sees the plan first and confirms with the school code. */
export function PromotionPanel({ schoolId, schoolCode, onDone }: { schoolId?: string | null; schoolCode: string; onDone: () => Promise<void> | void }) {
    const [plan, setPlan] = useState<PromotionPlan | null>(null);
    const [lastPromotedAt, setLastPromotedAt] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [confirmCode, setConfirmCode] = useState("");
    const [askDiagnosticAgain, setAskDiagnosticAgain] = useState(true);
    const [force, setForce] = useState(false);
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState<{ moved: number; graduated: number; createdSections: string[] } | null>(null);

    const api = <T,>(path: string, init?: RequestInit) => schoolApi<T>(path, init, schoolId);

    useEffect(() => { void load(); }, [schoolId]);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const data = await api<{ plan: PromotionPlan; lastPromotedAt: number | null }>("/api/school/promote");
            setPlan(data.plan);
            setLastPromotedAt(data.lastPromotedAt);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "The preview could not be loaded"); }
        finally { setLoading(false); }
    }

    async function run() {
        if (!plan || !window.confirm(`Promote ${plan.moves.length} students and graduate ${plan.graduates.length}? This cannot be undone.`)) return;
        setBusy(true);
        setError("");
        try {
            const data = await api<{ result: { moved: number; graduated: number; createdSections: string[] } }>("/api/school/promote", jsonInit("POST", { confirmCode, askDiagnosticAgain, force }));
            setResult(data.result);
            setConfirmCode("");
            await load();
            await onDone();
        } catch (caught) { setError(caught instanceof Error ? caught.message : "The promotion failed"); }
        finally { setBusy(false); }
    }

    const recent = lastPromotedAt !== null && Date.now() - lastPromotedAt < 180 * 86_400_000;
    const total = plan ? plan.moves.length + plan.graduates.length : 0;

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><ArrowUpRight className="h-4 w-4" />Annual promotion</CardTitle>
                    <CardDescription>Every Class 6 student becomes Class 7, Class 7 becomes Class 8, and Class 8 students graduate. Section names stay (6-A becomes 7-A). Nothing is deleted: every quiz, lesson and point is kept.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                    {result ? (
                        <Alert className="border-emerald-300 bg-emerald-50">
                            <AlertTitle>Promotion complete</AlertTitle>
                            <AlertDescription>{result.moved} students moved up, {result.graduated} graduated{result.createdSections.length ? `, new sections: ${result.createdSections.join(", ")}` : ""}.</AlertDescription>
                        </Alert>
                    ) : null}
                    <p className="text-sm text-muted-foreground">Last promotion: {lastPromotedAt ? formatDate(lastPromotedAt) : "never"}.</p>
                    {loading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Preparing the preview…</p> : plan ? (
                        <div className="overflow-auto rounded-md border">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Students</th></tr></thead>
                                <tbody className="divide-y">
                                    {plan.summary.length === 0 ? <tr><td colSpan={3} className="p-3 text-muted-foreground">No students to promote.</td></tr> : null}
                                    {plan.summary.map((row) => <tr key={`${row.from}-${row.to}`}><td className="p-3 font-semibold">{row.from}</td><td className="p-3">{row.to}</td><td className="p-3">{row.students}</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                    ) : null}
                    {plan?.sectionsToCreate.length ? <p className="text-sm">New sections that will be created: {plan.sectionsToCreate.map((section) => `${section.classLevel}-${section.name}`).join(", ")}.</p> : null}
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={askDiagnosticAgain} onChange={(event) => setAskDiagnosticAgain(event.target.checked)} />Ask promoted students to take the diagnostic test of their new class</label>
                    {recent ? <label className="flex items-center gap-2 text-sm text-amber-800"><input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} />I understand this school was promoted less than six months ago and I want to run it again</label> : null}
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="promo-code">Type the school code <strong>{schoolCode}</strong> to confirm</Label>
                            <Input id="promo-code" value={confirmCode} onChange={(event) => setConfirmCode(event.target.value)} placeholder={schoolCode} />
                        </div>
                        <Button onClick={run} disabled={busy || loading || total === 0 || confirmCode.trim().toUpperCase() !== schoolCode || (recent && !force)}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}Promote all classes
                        </Button>
                        <Button variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className="mr-1 h-4 w-4" />Refresh preview</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
