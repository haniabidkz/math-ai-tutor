import { UnderstandingLevel } from "@/types/user";

export interface UnderstandingInput {
    totalQuestions: number;
    correctAnswers: number;
    hintsUsed: number;
    totalTimeSeconds: number;
    averageTimePerQuestion: number;
}

interface ThresholdConfig {
    correctPercentage: number;
    maxHintsPerQuestion: number;
    maxAvgTimeSeconds: number;
}

const THRESHOLDS: Record<UnderstandingLevel, ThresholdConfig> = {
    EXCELLENT: {
        correctPercentage: 90,
        maxHintsPerQuestion: 0.2, // Almost no hints
        maxAvgTimeSeconds: 30, // Fast
    },
    GOOD: {
        correctPercentage: 75,
        maxHintsPerQuestion: 0.5, // Few hints
        maxAvgTimeSeconds: 60,
    },
    AVERAGE: {
        correctPercentage: 50,
        maxHintsPerQuestion: 1,
        maxAvgTimeSeconds: 90,
    },
    WEAK: {
        correctPercentage: 0,
        maxHintsPerQuestion: Infinity,
        maxAvgTimeSeconds: Infinity,
    },
};

/**
 * Calculate understanding level based on quiz performance
 * 
 * Logic:
 * - Many hints + slow → WEAK
 * - Some mistakes → AVERAGE  
 * - Few mistakes → GOOD
 * - Fast + correct → EXCELLENT
 */
export function calculateUnderstanding(input: UnderstandingInput): UnderstandingLevel {
    const { totalQuestions, correctAnswers, hintsUsed, averageTimePerQuestion } = input;

    if (totalQuestions === 0) return "WEAK";

    const correctPercentage = (correctAnswers / totalQuestions) * 100;
    const hintsPerQuestion = hintsUsed / totalQuestions;

    // Check from best to worst
    if (
        correctPercentage >= THRESHOLDS.EXCELLENT.correctPercentage &&
        hintsPerQuestion <= THRESHOLDS.EXCELLENT.maxHintsPerQuestion &&
        averageTimePerQuestion <= THRESHOLDS.EXCELLENT.maxAvgTimeSeconds
    ) {
        return "EXCELLENT";
    }

    if (
        correctPercentage >= THRESHOLDS.GOOD.correctPercentage &&
        hintsPerQuestion <= THRESHOLDS.GOOD.maxHintsPerQuestion
    ) {
        return "GOOD";
    }

    if (correctPercentage >= THRESHOLDS.AVERAGE.correctPercentage) {
        return "AVERAGE";
    }

    return "WEAK";
}

/**
 * Generate a report summary based on understanding level
 */
export function generateUnderstandingSummary(
    level: UnderstandingLevel,
    topicName: string
): {
    status: "YES" | "PARTIAL" | "NO";
    message: string;
    recommendation: string;
} {
    switch (level) {
        case "EXCELLENT":
            return {
                status: "YES",
                message: `Great news! Your child has an excellent understanding of ${topicName}.`,
                recommendation: "They're ready to move on to more advanced topics!",
            };
        case "GOOD":
            return {
                status: "YES",
                message: `Your child has a good understanding of ${topicName}.`,
                recommendation: "A little more practice will help them master this topic completely.",
            };
        case "AVERAGE":
            return {
                status: "PARTIAL",
                message: `Your child has a partial understanding of ${topicName}.`,
                recommendation: "Some concepts need reinforcement. Consider reviewing the topic together.",
            };
        case "WEAK":
            return {
                status: "NO",
                message: `Your child is still learning ${topicName} and needs more support.`,
                recommendation: "This topic needs human attention. Consider working with a tutor or teacher.",
            };
    }
}

/**
 * Calculate class/topic averages for teacher reports
 */
export function calculateClassStats(
    studentResults: Array<{
        studentUid: string;
        studentName: string;
        understandingLevel: UnderstandingLevel;
        needsAttention: boolean;
    }>
): {
    totalStudents: number;
    excellentCount: number;
    goodCount: number;
    averageCount: number;
    weakCount: number;
    studentsNeedingAttention: string[];
} {
    const stats = {
        totalStudents: studentResults.length,
        excellentCount: 0,
        goodCount: 0,
        averageCount: 0,
        weakCount: 0,
        studentsNeedingAttention: [] as string[],
    };

    for (const result of studentResults) {
        switch (result.understandingLevel) {
            case "EXCELLENT":
                stats.excellentCount++;
                break;
            case "GOOD":
                stats.goodCount++;
                break;
            case "AVERAGE":
                stats.averageCount++;
                break;
            case "WEAK":
                stats.weakCount++;
                break;
        }

        if (result.needsAttention || result.understandingLevel === "WEAK") {
            stats.studentsNeedingAttention.push(result.studentName);
        }
    }

    return stats;
}
