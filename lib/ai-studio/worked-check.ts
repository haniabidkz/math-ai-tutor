import { completeJson } from "@/lib/ai-studio/ai";
import type { WorkedExample } from "@/types/curriculum";

/**
 * Mathematical accuracy is mandatory: a second model solves the worked example from scratch and
 * says whether its steps and final answer are right. A wrong example is written again.
 */
export const workedCheckSchema = {
    type: "object",
    additionalProperties: false,
    required: ["answer", "matches", "note"],
    properties: { answer: { type: "string" }, matches: { type: "boolean" }, note: { type: "string" } },
};

export async function checkWorkedExample(example: WorkedExample, timeoutMs = 60_000) {
    const steps = example.steps.map((step, index) => `${index + 1}. ${step.text.english}`).join("\n");
    const reply = await completeJson<{ answer: string; matches: boolean; note: string }>({
        role: "verification",
        system: "You are a careful math examiner. Solve the problem yourself from scratch before you look at the given solution.",
        user: `Problem: ${example.problem.english}

Given solution:
${steps}
Final answer: ${example.finalAnswer.english}

Solve the problem independently and write your final answer in answer. Then set matches to true only if every step of the given solution is mathematically correct and its final answer equals yours. Equivalent forms count as equal (3/4 and 0.75; {1, 2} and {2, 1}). If matches is false, say in note, in one short sentence, what is wrong; otherwise leave note empty.`,
        schemaName: "worked_example_check",
        schema: workedCheckSchema,
        maxOutputTokens: 6_000,
        timeoutMs,
        budgetMs: timeoutMs + 20_000,
        reasoningEffort: "medium",
    });
    return { ...reply.data, usage: reply.usage };
}
