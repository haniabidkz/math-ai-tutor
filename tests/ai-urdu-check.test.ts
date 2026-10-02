import { describe, expect, it } from "vitest";
import { conceptPrompt, questionPrompt } from "@/lib/ai-studio/prompts";
import { findHeavyUrdu, findSpelledNumbers, missingNumbers, questionRomanUrduIssues, questionRomanUrduProblems, romanUrduIssues } from "@/lib/ai-studio/urdu-check";
import { validateDraft } from "@/lib/ai-studio/validate";
import { draftQuestion, reviewDraft } from "./fixtures/ai-draft";

describe("Roman Urdu stays very easy", () => {
    it("flags bookish Urdu words and names the simple word to use instead", () => {
        expect(findHeavyUrdu("Yeh kasr ka majmua hai, aur musawat hal karo")).toEqual([
            { word: "kasr", instead: "fraction" },
            { word: "musawat", instead: "equation" },
            { word: "majmua", instead: "set" },
        ]);
        expect(findHeavyUrdu("Nisbat 2:3 hai; tanasub likho; Ashariya 0.5")).toEqual([
            { word: "ashariya", instead: "decimal" },
            { word: "nisbat", instead: "ratio" },
            { word: "tanasub", instead: "proportion" },
        ]);
    });

    it("leaves everyday Urdu and English maths words alone", () => {
        const easy = "Dono taraf 5 jama karo, phir 2 se zarb do aur 10 se taqseem karo. Fraction 3/4 ka feesad nikalo; set ke elements barabar hain. Qeemat aadhi ho gayi.";
        expect(findHeavyUrdu(easy)).toEqual([]);
        expect(findSpelledNumbers(easy)).toEqual([]);
        // "ek" and "do" are everyday words, and "bara" means big.
        expect(findSpelledNumbers("Ek baar phir do, bara number chuno")).toEqual([]);
    });

    it("flags numbers spelled out in Urdu", () => {
        expect(findSpelledNumbers("Teen rupay aur paanch aam, phir das aur")).toEqual(["teen", "paanch", "das"]);
    });

    it("notices numbers the Roman Urdu dropped, ignoring step markers", () => {
        expect(missingNumbers("Step 1: 12 + 8 = 20.\nStep 2: 20 × 2 = 40.", "Pehla qadam: 12 + 8 = 20. Phir 20 × 2 = 40.")).toEqual([]);
        expect(missingNumbers("Find 10% of Rs. 250.", "Rs. 250 ka das feesad nikalo.")).toEqual(["10"]);
        expect(missingNumbers("1. Add 3/4 and 1/4.", "1. 3/4 aur 1/4 jama karo.")).toEqual([]);
    });

    it("reports every Roman Urdu part of a question for generation and review", () => {
        const question = draftQuestion({
            hint: { english: "Look at the fraction.", romanUrdu: "Kasr ko dekho." },
            solution: { english: "Add 3 and 5 to get 8.", romanUrdu: "Teen aur 5 jama karo, 8 milta hai." },
        });
        const problems = questionRomanUrduProblems("question 1", question);
        expect(problems).toContain('question 1 hint: the Roman Urdu uses the difficult word "kasr"; use "fraction" instead');
        expect(problems).toContain('question 1 solution: the Roman Urdu spells out the number "teen"; write every number as digits');
        const issues = questionRomanUrduIssues("The", question);
        expect(issues).toContain("The solution: the Roman Urdu is missing the number(s) 3 that the English has; keep the same numbers in both");
        expect(romanUrduIssues("The hint", { english: "Count 4 mangoes.", romanUrdu: "4 aam gino." })).toEqual([]);
    });

    it("shows the notes on review as warnings that do not block approval", () => {
        const draft = reviewDraft({ easy: 10, medium: 10, hard: 10 });
        draft.questions[0] = draftQuestion({ key: "heavy", hint: { english: "Look at the set.", romanUrdu: "Majmua ko dekho." } });
        const issues = validateDraft(draft);
        const note = issues.find((issue) => issue.where === "heavy");
        expect(note).toMatchObject({ severity: "warning" });
        expect(note?.message).toContain('"majmua"');
        expect(issues.some((issue) => issue.severity === "error")).toBe(false);
    });

    it("tells the writer the rule, and tells the concept step why its last reply was rejected", () => {
        const draft = reviewDraft({ easy: 0, medium: 0, hard: 0 });
        const prompt = questionPrompt(draft, { difficulty: "easy", count: 3, avoid: [] });
        expect(prompt.system).toContain('write "fraction" not "kasr", "equation" not "musawat", "set" not "majmua"');
        expect(prompt.system).toContain("Numbers are always digits");
        const concept = conceptPrompt(draft, ['the explanation uses the difficult word "majmua"']);
        expect(concept.user).toContain("Your previous attempt was rejected for these reasons. Fix every one:\n- the explanation uses the difficult word \"majmua\"");
        expect(conceptPrompt(draft).user).not.toContain("previous attempt");
    });
});
