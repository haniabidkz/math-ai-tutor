import { CheckCircle2 } from "lucide-react";
import { vennRegions } from "@/lib/lesson-visual";
import { cn } from "@/lib/utils";
import type { LessonVisual, LessonVisualSpec, LocalizedText, WorkedExample } from "@/types/curriculum";

type Language = "english" | "roman-urdu" | null;
const read = (language: Language, value: LocalizedText) => (language === "roman-urdu" && value.romanUrdu ? value.romanUrdu : value.english);

const INK = "#1e293b";
const MUTED = "#64748b";
const LINE = "#94a3b8";
const FILL = "#c7d2fe";
const ACCENT = "#4f46e5";
const SOFT = "#ccfbf1";
const TEAL = "#0f766e";

/** Words laid out in short rows, centred on a point, for the inside of a shape. */
function WordRows({ words, x, y, perRow = 3, size = 13 }: { words: string[]; x: number; y: number; perRow?: number; size?: number }) {
    const rows: string[][] = [];
    for (let index = 0; index < words.length; index += perRow) rows.push(words.slice(index, index + perRow));
    const top = y - ((rows.length - 1) * (size + 4)) / 2;
    return (
        <>
            {rows.map((row, index) => (
                <text key={index} x={x} y={top + index * (size + 4)} fontSize={size} textAnchor="middle" dominantBaseline="middle" fill={INK}>{row.join("  ")}</text>
            ))}
        </>
    );
}

function NumberLine({ spec }: { spec: Extract<LessonVisualSpec, { type: "number_line" }> }) {
    const width = 340, pad = 22, y = 62;
    const x = (value: number) => pad + ((value - spec.min) / (spec.max - spec.min)) * (width - 2 * pad);
    const ticks: number[] = [];
    for (let value = spec.min; value <= spec.max + 1e-9; value += spec.step) ticks.push(Number(value.toFixed(6)));
    const showEvery = ticks.length > 11 ? 2 : 1;
    return (
        <svg viewBox={`0 0 ${width} 100`} role="img" className="h-auto w-full">
            <defs><marker id="nl-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={ACCENT} /></marker></defs>
            <line x1={pad - 12} y1={y} x2={width - pad + 12} y2={y} stroke={INK} strokeWidth="2" />
            {ticks.map((value, index) => (
                <g key={value}>
                    <line x1={x(value)} y1={y - 6} x2={x(value)} y2={y + 6} stroke={INK} strokeWidth="1.5" />
                    {index % showEvery === 0 ? <text x={x(value)} y={y + 22} fontSize="12" textAnchor="middle" fill={MUTED}>{value}</text> : null}
                </g>
            ))}
            {spec.jumps.map((jump, index) => {
                const from = x(jump.from), to = x(jump.to), mid = (from + to) / 2;
                return (
                    <g key={`j${index}`}>
                        <path d={`M ${from} ${y - 4} Q ${mid} ${y - 46} ${to} ${y - 4}`} fill="none" stroke={ACCENT} strokeWidth="2" markerEnd="url(#nl-arrow)" />
                        {jump.label ? <text x={mid} y={y - 34} fontSize="12" fontWeight="700" textAnchor="middle" fill={ACCENT}>{jump.label}</text> : null}
                    </g>
                );
            })}
            {spec.points.map((point, index) => (
                <g key={`p${index}`}>
                    <circle cx={x(point.value)} cy={y} r="6" fill={TEAL} />
                    {point.label && !spec.jumps.length ? <text x={x(point.value)} y={y - 14} fontSize="12" fontWeight="700" textAnchor="middle" fill={TEAL}>{point.label}</text> : null}
                </g>
            ))}
        </svg>
    );
}

function FractionModel({ spec }: { spec: Extract<LessonVisualSpec, { type: "fraction_model" }> }) {
    const { numerator, denominator } = spec;
    if (spec.shape === "circle") {
        const cx = 90, cy = 80, r = 62;
        const slice = (index: number) => {
            const start = (index / denominator) * 2 * Math.PI - Math.PI / 2;
            const end = ((index + 1) / denominator) * 2 * Math.PI - Math.PI / 2;
            const large = end - start > Math.PI ? 1 : 0;
            return `M ${cx} ${cy} L ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)} Z`;
        };
        return (
            <svg viewBox="0 0 300 160" role="img" className="h-auto w-full">
                {denominator === 1
                    ? <circle cx={cx} cy={cy} r={r} fill={numerator ? FILL : "white"} stroke={INK} strokeWidth="2" />
                    : Array.from({ length: denominator }, (_, index) => <path key={index} d={slice(index)} fill={index < numerator ? FILL : "white"} stroke={INK} strokeWidth="2" />)}
                <text x="220" y="70" fontSize="30" fontWeight="700" textAnchor="middle" fill={ACCENT}>{numerator}</text>
                <line x1="196" y1="82" x2="244" y2="82" stroke={ACCENT} strokeWidth="2.5" />
                <text x="220" y="112" fontSize="30" fontWeight="700" textAnchor="middle" fill={ACCENT}>{denominator}</text>
            </svg>
        );
    }
    const width = 300, part = (width - 20) / denominator;
    return (
        <svg viewBox={`0 0 ${width} 110`} role="img" className="h-auto w-full">
            {Array.from({ length: denominator }, (_, index) => (
                <rect key={index} x={10 + index * part} y={14} width={part} height={44} fill={index < numerator ? FILL : "white"} stroke={INK} strokeWidth="2" />
            ))}
            <text x={width / 2} y={92} fontSize="20" fontWeight="700" textAnchor="middle" fill={ACCENT}>{`${numerator}/${denominator}`}</text>
        </svg>
    );
}

function AreaModel({ spec }: { spec: Extract<LessonVisualSpec, { type: "area_model" }> }) {
    const cell = Math.min(30, 240 / spec.cols, 150 / spec.rows);
    const left = 40, top = 26;
    return (
        <svg viewBox={`0 0 ${left + spec.cols * cell + 20} ${top + spec.rows * cell + 14}`} role="img" className="h-auto w-full max-h-64">
            {spec.colLabel ? <text x={left + (spec.cols * cell) / 2} y={16} fontSize="13" fontWeight="700" textAnchor="middle" fill={MUTED}>{spec.colLabel}</text> : null}
            {spec.rowLabel ? <text x={22} y={top + (spec.rows * cell) / 2} fontSize="13" fontWeight="700" textAnchor="middle" dominantBaseline="middle" fill={MUTED}>{spec.rowLabel}</text> : null}
            {Array.from({ length: spec.rows * spec.cols }, (_, index) => (
                <rect key={index} x={left + (index % spec.cols) * cell} y={top + Math.floor(index / spec.cols) * cell} width={cell} height={cell} fill={index < spec.shaded ? FILL : "white"} stroke={INK} strokeWidth="1.5" />
            ))}
        </svg>
    );
}

function BalanceScale({ spec }: { spec: Extract<LessonVisualSpec, { type: "balance_scale" }> }) {
    const tilt = spec.balanced ? 0 : 10;
    const pan = (items: string[], cx: number, cy: number) => (
        <g>
            <line x1={cx - 48} y1={cy} x2={cx + 48} y2={cy} stroke={INK} strokeWidth="3" />
            {items.map((item, index) => {
                const perRow = 3, row = Math.floor(index / perRow), column = index % perRow, inRow = Math.min(perRow, items.length - row * perRow);
                const x = cx - (inRow * 30) / 2 + column * 30;
                return (
                    <g key={index}>
                        <rect x={x} y={cy - 26 - row * 26} width="28" height="24" rx="5" fill={SOFT} stroke={TEAL} strokeWidth="1.5" />
                        <text x={x + 14} y={cy - 13 - row * 26} fontSize="12" fontWeight="700" textAnchor="middle" dominantBaseline="middle" fill={TEAL}>{item}</text>
                    </g>
                );
            })}
        </g>
    );
    return (
        <svg viewBox="0 0 320 170" role="img" className="h-auto w-full">
            <polygon points="160,120 140,160 180,160" fill={LINE} />
            <g transform={`rotate(${tilt} 160 116)`}>
                <line x1="60" y1="116" x2="260" y2="116" stroke={INK} strokeWidth="3" />
                {pan(spec.left, 75, 116)}
                {pan(spec.right, 245, 116)}
            </g>
            <circle cx="160" cy="116" r="5" fill={INK} />
            <text x="160" y="22" fontSize="16" fontWeight="700" textAnchor="middle" fill={ACCENT}>{spec.balanced ? "=" : "≠"}</text>
        </svg>
    );
}

function VennDiagram({ spec }: { spec: Extract<LessonVisualSpec, { type: "venn_diagram" }> }) {
    const regions = vennRegions(spec);
    const two = spec.sets.length === 2;
    return (
        <svg viewBox="0 0 340 210" role="img" className="h-auto w-full">
            {spec.universal ? (
                <>
                    <rect x="6" y="6" width="328" height="198" rx="10" fill="white" stroke={INK} strokeWidth="2" />
                    <text x="20" y="28" fontSize="15" fontWeight="700" fill={INK}>{spec.universal.label}</text>
                </>
            ) : null}
            {two ? (
                <>
                    <circle cx="130" cy="110" r="74" fill={FILL} fillOpacity="0.55" stroke={ACCENT} strokeWidth="2" />
                    <circle cx="210" cy="110" r="74" fill={SOFT} fillOpacity="0.6" stroke={TEAL} strokeWidth="2" />
                    <text x="84" y="44" fontSize="15" fontWeight="700" textAnchor="middle" fill={ACCENT}>{spec.sets[0].label}</text>
                    <text x="256" y="44" fontSize="15" fontWeight="700" textAnchor="middle" fill={TEAL}>{spec.sets[1].label}</text>
                    <WordRows words={regions.onlyFirst} x={100} y={110} perRow={2} />
                    <WordRows words={regions.both} x={170} y={110} perRow={1} />
                    <WordRows words={regions.onlySecond} x={240} y={110} perRow={2} />
                </>
            ) : (
                <>
                    <circle cx="170" cy="110" r="78" fill={FILL} fillOpacity="0.55" stroke={ACCENT} strokeWidth="2" />
                    <text x="110" y="40" fontSize="15" fontWeight="700" textAnchor="middle" fill={ACCENT}>{spec.sets[0].label}</text>
                    <WordRows words={regions.onlyFirst} x={170} y={110} perRow={3} />
                </>
            )}
            {regions.outside.length ? <WordRows words={regions.outside} x={spec.universal ? 300 : 300} y={180} perRow={3} size={12} /> : null}
        </svg>
    );
}

function SetRoster({ spec }: { spec: Extract<LessonVisualSpec, { type: "set_roster" }> }) {
    return (
        <svg viewBox="0 0 340 170" role="img" className="h-auto w-full">
            <text x="170" y="26" fontSize="17" fontWeight="700" textAnchor="middle" fill={ACCENT}>{`${spec.name} = { ${spec.elements.join(", ")} }`}</text>
            <ellipse cx="170" cy="104" rx="140" ry="54" fill={FILL} fillOpacity="0.45" stroke={ACCENT} strokeWidth="2" />
            {spec.elements.length ? <WordRows words={spec.elements} x={170} y={104} perRow={6} size={15} /> : <text x="170" y="108" fontSize="14" textAnchor="middle" fill={MUTED}>{"{ }  (empty)"}</text>}
        </svg>
    );
}

function GeometryShape({ spec }: { spec: Extract<LessonVisualSpec, { type: "geometry_shape" }> }) {
    const side = (index: number) => spec.sideLabels[index] ?? "";
    const angle = (index: number) => spec.angleLabels[index] ?? "";
    const common = { fill: FILL, fillOpacity: 0.5, stroke: INK, strokeWidth: 2 };
    const labelProps = { fontSize: 13, fontWeight: 700, fill: ACCENT, textAnchor: "middle" as const };
    if (spec.shape === "circle") {
        return (
            <svg viewBox="0 0 300 180" role="img" className="h-auto w-full">
                <circle cx="150" cy="90" r="70" {...common} />
                <line x1="150" y1="90" x2="220" y2="90" stroke={ACCENT} strokeWidth="2" />
                <circle cx="150" cy="90" r="3" fill={INK} />
                <text x="185" y="82" {...labelProps}>{side(0)}</text>
            </svg>
        );
    }
    const shapes: Record<string, Array<[number, number]>> = {
        triangle: [[150, 20], [40, 160], [260, 160]],
        right_triangle: [[60, 20], [60, 160], [260, 160]],
        rectangle: [[50, 40], [250, 40], [250, 150], [50, 150]],
        square: [[85, 25], [215, 25], [215, 155], [85, 155]],
        parallelogram: [[90, 40], [270, 40], [210, 150], [30, 150]],
    };
    const points = shapes[spec.shape];
    const centre = points.reduce((sum, [x, y]) => [sum[0] + x / points.length, sum[1] + y / points.length], [0, 0]);
    return (
        <svg viewBox="0 0 300 180" role="img" className="h-auto w-full">
            <polygon points={points.map((point) => point.join(",")).join(" ")} {...common} />
            {spec.shape === "right_triangle" ? <polyline points="60,145 75,145 75,160" fill="none" stroke={INK} strokeWidth="1.5" /> : null}
            {points.map(([x1, y1], index) => {
                const [x2, y2] = points[(index + 1) % points.length];
                const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                const away = Math.hypot(mx - centre[0], my - centre[1]) || 1;
                const ox = ((mx - centre[0]) / away) * 12, oy = ((my - centre[1]) / away) * 14;
                // A label beside a sloping or upright side starts or ends at the side, never across it.
                const anchor = ox < -4 ? "end" : ox > 4 ? "start" : "middle";
                return side(index) ? <text key={`s${index}`} x={mx + ox} y={my + oy + 4} {...labelProps} textAnchor={anchor}>{side(index)}</text> : null;
            })}
            {points.map(([x, y], index) => {
                const dx = centre[0] - x, dy = centre[1] - y, length = Math.hypot(dx, dy) || 1;
                return angle(index) ? <text key={`a${index}`} x={x + (dx / length) * 38} y={y + (dy / length) * 38 + 4} {...labelProps} fill={TEAL} fontSize={12}>{angle(index)}</text> : null;
            })}
        </svg>
    );
}

function BarModel({ spec }: { spec: Extract<LessonVisualSpec, { type: "bar_model" }> }) {
    const largest = Math.max(...spec.bars.map((bar) => bar.value));
    return (
        <svg viewBox={`0 0 340 ${spec.bars.length * 40 + 14}`} role="img" className="h-auto w-full">
            {spec.bars.map((bar, index) => {
                const width = Math.max(8, (bar.value / largest) * 160);
                return (
                    <g key={index}>
                        <text x="62" y={index * 40 + 30} fontSize="13" fontWeight="700" textAnchor="end" fill={INK}>{bar.label}</text>
                        <rect x="70" y={index * 40 + 12} width={width} height="26" rx="4" fill={index % 2 ? SOFT : FILL} stroke={index % 2 ? TEAL : ACCENT} strokeWidth="1.5" />
                        <text x={70 + width + 8} y={index * 40 + 30} fontSize="13" fill={MUTED}>{`${bar.value}${spec.unit ? ` ${spec.unit}` : ""}`}</text>
                    </g>
                );
            })}
        </svg>
    );
}

function Drawing({ spec }: { spec: LessonVisualSpec }) {
    switch (spec.type) {
        case "number_line": return <NumberLine spec={spec} />;
        case "fraction_model": return <FractionModel spec={spec} />;
        case "area_model": return <AreaModel spec={spec} />;
        case "balance_scale": return <BalanceScale spec={spec} />;
        case "venn_diagram": return <VennDiagram spec={spec} />;
        case "set_roster": return <SetRoster spec={spec} />;
        case "geometry_shape": return <GeometryShape spec={spec} />;
        case "bar_model": return <BarModel spec={spec} />;
        default: return null;
    }
}

/** The lesson's picture, drawn by the app; nothing when the lesson has none. */
export function LessonVisualView({ visual, language, className }: { visual: LessonVisual | null | undefined; language: Language; className?: string }) {
    if (!visual?.required || !visual.spec) return null;
    const caption = read(language, visual.caption);
    return (
        <figure className={cn("rounded-2xl border border-gray-200 bg-white p-3 md:p-4", className)}>
            <div className="mx-auto w-full max-w-md"><Drawing spec={visual.spec} /></div>
            {caption ? <figcaption className="mt-2 text-center text-sm font-semibold text-slate-600" lang={language === "roman-urdu" ? "ur-Latn" : undefined}>{caption}</figcaption> : null}
        </figure>
    );
}

/** One solved example: the problem, each step with its reason, and the answer standing out. */
export function WorkedExampleCard({ example, language, className }: { example: WorkedExample | null | undefined; language: Language; className?: string }) {
    if (!example || !example.steps.length) return null;
    const ru = language === "roman-urdu";
    return (
        <section className={cn("rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 md:p-5", className)} lang={ru ? "ur-Latn" : undefined}>
            <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-700">{ru ? "Hal shuda misaal" : "Worked example"}</p>
            <p className="mt-1 text-base font-bold leading-7 text-slate-900">{read(language, example.problem)}</p>
            <ol className="mt-3 space-y-2.5">
                {example.steps.map((step, index) => (
                    <li key={index} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-extrabold text-white">{index + 1}</span>
                        <div className="min-w-0">
                            <p className="text-base leading-7 text-slate-800">{read(language, step.text)}</p>
                            <p className="text-sm leading-6 text-slate-500"><span className="font-bold">{ru ? "Kyun: " : "Why: "}</span>{read(language, step.why)}</p>
                        </div>
                    </li>
                ))}
            </ol>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <p className="text-base font-extrabold text-emerald-900">{ru ? "Jawab: " : "Answer: "}{read(language, example.finalAnswer)}</p>
            </div>
        </section>
    );
}
