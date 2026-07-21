import type { ConceptFamily, LocalizedText, MicroConcept, StudentClassLevel } from "@/types/curriculum";

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

interface TopicSeed {
    classLevel: 6 | 7 | 8;
    topicId: string;
    title: LocalizedText;
    family: ConceptFamily;
    visualKind: MicroConcept["visualKind"];
    concepts: Array<[string, string, string, string, string | null]>;
}

const foundations: MicroConcept[] = [
    ["c5-whole-number-operations", null, "Whole Number Operations", "Pooray numbers ke amal", "Use addition, subtraction, multiplication, and division with whole numbers."],
    ["c5-factors-multiples", "c5-whole-number-operations", "Factors and Multiples", "Factors aur multiples", "Recognize factors, multiples, and common divisibility patterns."],
    ["c5-fractions", "c5-whole-number-operations", "Fraction Foundations", "Kasron ki bunyaad", "Read fractions as equal parts of a whole and compare simple fractions."],
    ["c5-decimals", "c5-fractions", "Decimal Foundations", "Ashariya ki bunyaad", "Read place value and connect common decimals with fractions."],
    ["c5-number-line", "c5-whole-number-operations", "Number Line Foundations", "Number line ki bunyaad", "Locate, order, and compare values on a number line."],
    ["c5-ratios", "c5-fractions", "Ratio Foundations", "Nisbat ki bunyaad", "Compare two quantities using simple ratios."],
    ["c5-simple-patterns", "c5-whole-number-operations", "Number Patterns", "Number patterns", "Identify a rule and continue a simple number pattern."],
    ["c5-word-problems", "c5-whole-number-operations", "Word Problem Foundations", "Lafzi sawalat ki bunyaad", "Choose the correct operation from a short real-life problem."],
].map(([microTag, prerequisiteTag, title, romanTitle, concept], order) => ({
    microTag: microTag as string,
    prerequisiteTag: prerequisiteTag as string | null,
    classLevel: 5,
    topicId: "class5-foundations",
    topicTitle: text("Class 5 Foundations", "Class 5 ki bunyaad"),
    title: text(title as string, romanTitle as string),
    concept: text(concept as string, `${concept as string} Is bunyaad ko choti misaalon se samjhein.`),
    family: "foundation" as const,
    visualKind: microTag === "c5-fractions" || microTag === "c5-decimals" ? "fraction" as const : microTag === "c5-ratios" ? "ratio" as const : "pattern" as const,
    order,
    foundationOnly: true,
    status: "published" as const,
}));

const topics: TopicSeed[] = [
    {
        classLevel: 6,
        topicId: "class6-integers",
        title: text("Integers", "Integers"),
        family: "integer",
        visualKind: "number-line",
        concepts: [
            ["c6-integers-intro", "Introduction to Integers", "Integers ka taaruf", "Integers include zero, positive whole numbers, and negative whole numbers.", "c5-number-line"],
            ["c6-positive-numbers", "Positive Numbers", "Musbat numbers", "Positive numbers are greater than zero and appear to the right of zero.", "c6-integers-intro"],
            ["c6-negative-numbers", "Negative Numbers", "Manfi numbers", "Negative numbers are less than zero and appear to the left of zero.", "c6-integers-intro"],
            ["c6-number-line", "Number Line Mechanics", "Number line ka istemal", "Moving right increases an integer; moving left decreases it.", "c5-number-line"],
            ["c6-integer-comparisons", "Integer Comparisons", "Integers ka muqabla", "On a number line, the value farther right is greater.", "c6-number-line"],
            ["c6-integer-addition", "Basic Integer Addition", "Integers ki jama", "Add integers by tracking direction and distance from zero.", "c6-number-line"],
            ["c6-integer-subtraction", "Basic Integer Subtraction", "Integers ki tafreeq", "Subtracting an integer is the same as adding its opposite.", "c6-integer-addition"],
        ],
    },
    {
        classLevel: 6,
        topicId: "class6-algebra-intro",
        title: text("Introduction to Algebra", "Algebra ka taaruf"),
        family: "algebra",
        visualKind: "expression",
        concepts: [
            ["c6-variable-foundations", "Variable Foundations", "Variable ki bunyaad", "A variable is a symbol that represents a value that may change.", "c5-simple-patterns"],
            ["c6-constants", "Constants", "Constants", "A constant is a fixed number whose value does not change.", "c6-variable-foundations"],
            ["c6-algebraic-expressions", "Structural Algebraic Expressions", "Algebraic expressions ki soorat", "An expression combines numbers, variables, and operation signs without an equals sign.", "c6-variable-foundations"],
            ["c6-simple-terms", "Simple Terms", "Sada terms", "Terms are the parts of an expression separated by plus or minus signs.", "c6-algebraic-expressions"],
            ["c6-like-unlike-terms", "Like vs. Unlike Terms", "Like aur unlike terms", "Like terms have the same variable part and can be combined.", "c6-simple-terms"],
            ["c6-evaluating-expressions", "Evaluating Expressions", "Expressions ki qeemat", "Evaluate an expression by replacing variables with given values.", "c6-algebraic-expressions"],
            ["c6-algebra-word-problems", "Basic Word Problems", "Algebra ke lafzi sawal", "Translate a short situation into numbers, variables, and operations.", "c5-word-problems"],
        ],
    },
    {
        classLevel: 7,
        topicId: "class7-algebraic-expressions",
        title: text("Algebraic Expressions", "Algebraic expressions"),
        family: "algebra",
        visualKind: "expression",
        concepts: [
            ["c7-variable-constant-isolation", "Variables and Constants Isolation", "Variables aur constants alag karna", "Identify variable and constant parts in an algebraic expression.", "c6-constants"],
            ["c7-term-segmentation", "Term Segmentation", "Terms ko alag karna", "Separate an expression into terms while keeping each sign attached.", "c6-simple-terms"],
            ["c7-coefficients", "Coefficient Identification", "Coefficient pehchan", "A coefficient is the numerical factor multiplying a variable.", "c6-simple-terms"],
            ["c7-complex-expressions", "Structural Complex Expressions", "Mushkil expressions ki soorat", "Read expressions with several terms, coefficients, and operations accurately.", "c7-term-segmentation"],
            ["c7-grouping-terms", "Grouping Like and Unlike Terms", "Like aur unlike terms ki grouping", "Group terms with identical variable parts before simplifying.", "c6-like-unlike-terms"],
            ["c7-linear-simplification", "Linear Simplification", "Linear expression sada karna", "Combine like terms to write an equivalent simpler expression.", "c7-grouping-terms"],
            ["c7-algebra-word-problems", "Applied Word Problems", "Algebra ke amli sawal", "Model a real situation with an expression and simplify it.", "c6-algebra-word-problems"],
        ],
    },
    {
        classLevel: 7,
        topicId: "class7-linear-equations",
        title: text("Linear Equations", "Linear equations"),
        family: "equation",
        visualKind: "balance",
        concepts: [
            ["c7-equation-structure", "Equation Structural Logic", "Equation ki bunyadi soch", "An equation states that two expressions have equal value.", "c6-algebraic-expressions"],
            ["c7-equation-variables", "Identifying Variables", "Equation mein variable pehchan", "Identify the unknown value that the equation asks you to find.", "c6-variable-foundations"],
            ["c7-one-step-equations", "Solving One-Step Equations", "Aik qadam equations", "Use one inverse operation on both sides to isolate the variable.", "c7-equation-structure"],
            ["c7-two-step-equations", "Solving Two-Step Equations", "Do qadam equations", "Undo addition or subtraction, then multiplication or division.", "c7-one-step-equations"],
            ["c7-equation-verification", "Mathematical Verification Foundations", "Jawab ki tasdeeq", "Substitute the solution back into the equation to verify it.", "c7-one-step-equations"],
            ["c7-equation-word-problems", "Applied Word Problems", "Equation ke amli sawal", "Build and solve an equation from a real-life relationship.", "c7-two-step-equations"],
        ],
    },
    {
        classLevel: 8,
        topicId: "class8-linear-equations",
        title: text("Linear Equations", "Linear equations"),
        family: "equation",
        visualKind: "balance",
        concepts: [
            ["c8-equation-revision", "Revision of Linear Equations", "Linear equations ka dohrao", "Review inverse operations and balanced equation solving.", "c7-two-step-equations"],
            ["c8-one-two-step-systems", "One-Step and Two-Step Systems", "Aik aur do qadam systems", "Select and apply the correct sequence of inverse operations.", "c8-equation-revision"],
            ["c8-multi-step-equations", "Multi-Step Equation Isolation", "Kai qadam equations", "Simplify both sides and use several inverse operations to isolate the variable.", "c8-one-two-step-systems"],
            ["c8-equation-applications", "Practical Applications", "Equation ke amli istemal", "Represent practical quantities and constraints with linear equations.", "c7-equation-word-problems"],
            ["c8-advanced-word-problems", "Advanced Word Problems", "Mushkil lafzi sawal", "Translate multi-stage situations into equations and solve logically.", "c8-equation-applications"],
            ["c8-proof-verification", "Proof and Verification Formulas", "Saboot aur tasdeeq", "Verify solutions and explain why each transformation preserves equality.", "c7-equation-verification"],
        ],
    },
    {
        classLevel: 8,
        topicId: "class8-ratio-proportion",
        title: text("Ratio and Proportion", "Ratio aur proportion"),
        family: "ratio",
        visualKind: "ratio",
        concepts: [
            ["c8-ratio-basics", "Ratio Basics", "Ratio ki bunyaad", "A ratio compares two quantities measured in compatible units.", "c5-ratios"],
            ["c8-multi-variable-ratios", "Comparing Multi-Variable Ratios", "Kai quantities ke ratios", "Compare more than two related quantities in a consistent order.", "c8-ratio-basics"],
            ["c8-equivalent-ratios", "Equivalent Ratio Structures", "Barabar ratios", "Equivalent ratios are formed by multiplying or dividing every term by the same value.", "c8-ratio-basics"],
            ["c8-proportion-basics", "Proportion Basics", "Proportion ki bunyaad", "A proportion states that two ratios are equal.", "c8-equivalent-ratios"],
            ["c8-solving-proportions", "Solving Core Proportions", "Proportion hal karna", "Use equivalent ratios or cross multiplication to find a missing value.", "c8-proportion-basics"],
            ["c8-direct-proportion", "Direct Proportion Applications", "Direct proportion ka istemal", "In direct proportion, both quantities change by the same scale factor.", "c8-solving-proportions"],
            ["c8-ratio-word-problems", "Applied Word Problems", "Ratio ke amli sawal", "Model real-life comparisons and scaling with ratios and proportions.", "c8-direct-proportion"],
        ],
    },
];

const syllabus = topics.flatMap((topic) =>
    topic.concepts.map(([microTag, title, romanTitle, concept, prerequisiteTag], index): MicroConcept => ({
        microTag,
        prerequisiteTag,
        classLevel: topic.classLevel,
        topicId: topic.topicId,
        topicTitle: topic.title,
        title: text(title, romanTitle),
        concept: text(concept, `${romanTitle}: ${concept}`),
        family: topic.family,
        visualKind: topic.visualKind,
        order: index,
        status: "published",
    }))
);

export const MICRO_CONCEPTS: MicroConcept[] = [...foundations, ...syllabus];
export const MICRO_CONCEPT_BY_TAG = new Map(MICRO_CONCEPTS.map((item) => [item.microTag, item]));

export const getConcept = (microTag: string) => MICRO_CONCEPT_BY_TAG.get(microTag);

export function getClassConcepts(classLevel: StudentClassLevel): MicroConcept[] {
    return MICRO_CONCEPTS.filter((item) => item.classLevel === classLevel && !item.foundationOnly);
}

export function getTopicsForClass(classLevel: StudentClassLevel) {
    const concepts = getClassConcepts(classLevel);
    return Array.from(new Set(concepts.map((item) => item.topicId))).map((topicId) => ({
        topicId,
        title: concepts.find((item) => item.topicId === topicId)!.topicTitle,
        concepts: concepts.filter((item) => item.topicId === topicId).sort((a, b) => a.order - b.order),
    }));
}

export function getDiagnosticPool(classLevel: StudentClassLevel): MicroConcept[] {
    if (classLevel === 6) {
        return MICRO_CONCEPTS.filter((item) => item.classLevel === 5 || (item.classLevel === 6 && item.order <= 1));
    }
    const previous = (classLevel - 1) as 6 | 7;
    return MICRO_CONCEPTS.filter((item) => item.classLevel === previous || (item.classLevel === classLevel && item.order <= 1));
}
