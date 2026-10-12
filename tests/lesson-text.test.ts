import { describe, expect, it } from "vitest";
import { splitLesson, splitSteps } from "@/lib/lesson-steps";

describe("lesson text layout", () => {
    it("separates the definition from the examples written inside it", () => {
        const parts = splitLesson("A set is a well-defined collection of objects. We write the elements inside curly brackets, { }. Example: the set of school bags owned by Ali and Sara is {Ali's bag, Sara's bag}.");
        expect(parts.definition).toBe("A set is a well-defined collection of objects. We write the elements inside curly brackets, { }.");
        expect(parts.examples).toEqual(["The set of school bags owned by Ali and Sara is {Ali's bag, Sara's bag}."]);
    });

    it("understands 'for example' and the Roman Urdu markers, and keeps plain text whole", () => {
        expect(splitLesson("An element is an item inside a set. For example, in A = {2, 4, 6}, 4 is an element of A.").examples).toEqual(["In A = {2, 4, 6}, 4 is an element of A."]);
        const urdu = splitLesson("Set cheezon ka majmua hai. Misal ke taur par, agar A = {1, 2} ho to 1 element hai. Misal: {aam, kela}.");
        expect(urdu.definition).toBe("Set cheezon ka majmua hai.");
        expect(urdu.examples).toHaveLength(2);
        expect(splitLesson("Just a definition.")).toEqual({ definition: "Just a definition.", examples: [] });
        expect(splitLesson("Example: only an example.").definition).toBe("Example: only an example.");
    });

    it("turns a numbered explanation into steps and leaves prose alone", () => {
        expect(splitSteps("1. Brackets ke andar dekho. 2. Objects red dupatta aur blue scarf hain. 3. Red dupatta aik element hai.")).toEqual([
            "Brackets ke andar dekho.", "Objects red dupatta aur blue scarf hain.", "Red dupatta aik element hai.",
        ]);
        expect(splitSteps("1) First\n2) Second")).toEqual(["First", "Second"]);
        expect(splitSteps("Count the items.\nWrite them in brackets.")).toEqual(["Count the items.", "Write them in brackets."]);
        expect(splitSteps("The colors are green and white.")).toEqual(["The colors are green and white."]);
        expect(splitSteps("  ")).toEqual([]);
    });
});
