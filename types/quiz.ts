// Types for quiz system

export type Difficulty = "easy" | "medium" | "hard";

export interface QuizQuestion {
    id: string;
    question: string;
    difficulty: Difficulty;
    options?: string[]; // For multiple choice
    correctAnswer: string;
    hint: string;
    encouragement: string; // Shown when wrong
}

export interface QuizAttempt {
    id: string;
    studentUid: string;
    topicId: string;
    questionId: string;
    answer: string;
    isCorrect: boolean;
    hintsUsed: number;
    timeTakenSeconds: number;
    attemptNumber: number;
    createdAt: Date;
}

export interface QuizSession {
    id: string;
    studentUid: string;
    topicId: string;
    topicName: string;
    questions: QuizQuestion[];
    currentQuestionIndex: number;
    attempts: QuizAttempt[];
    startedAt: Date;
    completedAt?: Date;
    totalHintsUsed: number;
    totalTimeSeconds: number;
    score: number;
    maxScore: number;
}

export interface QuizResult {
    sessionId: string;
    studentUid: string;
    topicId: string;
    topicName: string;
    score: number;
    maxScore: number;
    percentage: number;
    totalHintsUsed: number;
    totalTimeSeconds: number;
    understandingLevel: "WEAK" | "AVERAGE" | "GOOD" | "EXCELLENT";
    feedback: string;
    completedAt: Date;
}

export interface GenerateQuizRequest {
    topicId: string;
    topicName: string;
    classLevel: number;
    questionCount?: number;
}

export interface EvaluateAnswerRequest {
    sessionId: string;
    questionId: string;
    answer: string;
    timeTakenSeconds: number;
}

export interface EvaluateAnswerResponse {
    isCorrect: boolean;
    feedback: string;
    hint?: string;
    shouldMoveNext: boolean;
    attemptNumber: number;
}

export interface StudentAdaptiveState {
    uid: string;
    adaptive_level: 1 | 2 | 3 | 4 | 5;
    correct_streak: number;
    wrong_streak: number;
    placementCompleted: boolean;
    last_level_change?: "up" | "down" | null;
    updatedAt?: Date;
}
