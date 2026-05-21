import OpenAI from "openai";

// OpenAI client initialization (server-only)
// NEVER import this file on the client side

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// AI Personality - calm, patient, encouraging, NEVER says "wrong"
const AI_PERSONALITY = `You are a kind, patient, and encouraging math tutor for children aged 6-16.

PERSONALITY RULES (MUST FOLLOW):
- Be calm and patient in every response
- NEVER use the word "wrong" or "incorrect"
- Instead of "wrong", say things like:
  - "That's a good try! Let's think about it together."
  - "You're on the right track! Let me help you."
  - "Great effort! Let's look at this another way."
- Praise effort, not intelligence
- Use simple, age-appropriate language
- Be encouraging even when the student struggles
- Celebrate small wins enthusiastically

LANGUAGE STYLE:
- Keep sentences short and clear
- Use everyday examples children can relate to
- Avoid complex mathematical jargon unless explaining it`;

// Teaching level configurations
type TeachingLevel = 1 | 2 | 3;

export type ExplanationLanguage = "english" | "roman-urdu";

const TEACHING_PROMPTS: Record<TeachingLevel, string> = {
    1: `Explain using SIMPLE ENGLISH only:
- Use step-by-step explanation
- Use very basic vocabulary (a 6-year-old should understand)
- Break complex ideas into tiny pieces
- Use numbered steps`,

    2: `Explain using SIMPLE URDU with daily life examples:
- Mix simple Urdu words where helpful for Pakistani students
- Use examples from daily life: shopping, fruits, money, time, cooking
- Make it relatable to a child's everyday experience
- Keep sentences short and simple`,

    3: `Explain using a STORY-based approach:
- Create a short, engaging story involving the math concept
- Use characters a child would enjoy (animals, kids, heroes)
- Make the math concept part of the adventure
- Use visual imagination (ask them to picture things)
- Make it fun and memorable`,
};

const LANGUAGE_PROMPTS: Record<ExplanationLanguage, string> = {
    english: `LANGUAGE: Write your entire response in simple, clear English.`,
    "roman-urdu": `LANGUAGE: Write your entire response in Roman Urdu (Urdu written using English/Latin letters). 
For example: "Aao milkar seekhtay hain!" instead of "Let's learn together!"
Use Roman Urdu for all explanations, examples, and encouragements.
Only use English for math symbols and numbers.`,
};

export interface TeachingRequest {
    topic: string;
    classLevel: number;
    teachingLevel: TeachingLevel;
    previousExplanations?: string[];
    language?: ExplanationLanguage;
}

export interface TeachingResponse {
    content: string;
    teachingLevel: TeachingLevel;
}

/**
 * Generate teaching content for a math topic
 */
export async function generateTeaching(
    request: TeachingRequest
): Promise<TeachingResponse> {
    const { topic, classLevel, teachingLevel, previousExplanations = [], language = "english" } = request;

    const levelPrompt = TEACHING_PROMPTS[teachingLevel];
    const languagePrompt = LANGUAGE_PROMPTS[language];

    let context = "";
    if (previousExplanations.length > 0) {
        context = `\n\nPrevious explanations that didn't work:\n${previousExplanations
            .map((exp, i) => `${i + 1}. ${exp.substring(0, 200)}...`)
            .join("\n")}\n\nTry a DIFFERENT approach this time.`;
    }

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `${AI_PERSONALITY}\n\n${levelPrompt}\n\n${languagePrompt}`,
            },
            {
                role: "user",
                content: `Teach this math topic to a Class ${classLevel} student: "${topic}"${context}`,
            },
        ],
        temperature: 0.7,
        max_tokens: 1000,
    });

    return {
        content: completion.choices[0]?.message?.content || "Let me think of another way to explain this...",
        teachingLevel,
    };
}

export interface QuizGenerationRequest {
    topic: string;
    classLevel: number;
    difficulty: "easy" | "medium" | "hard";
    count: number;
}

export interface GeneratedQuestion {
    question: string;
    correctAnswer: string;
    hint: string;
    encouragement: string;
    options?: string[];
    difficulty?: "easy" | "medium" | "hard";
}

/**
 * Generate quiz questions for a topic
 */
export async function generateQuizQuestions(
    request: QuizGenerationRequest
): Promise<GeneratedQuestion[]> {
    const { topic, classLevel, difficulty, count } = request;

    const difficultyGuide = {
        easy: "Simple, single-step problems. Very straightforward.",
        medium: "Two-step problems. Requires some thinking.",
        hard: "Multi-step problems. Challenging but achievable.",
    };

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `${AI_PERSONALITY}

You are generating quiz questions for children. 
Generate exactly ${count} questions in valid JSON format.

RULES:
- Questions must be age-appropriate for Class ${classLevel}
- Difficulty: ${difficultyGuide[difficulty]}
- Hints should guide without giving the answer
- Encouragement should be warm and supportive
- For multiple choice, provide 4 options

Return ONLY a JSON array with NO markdown formatting.`,
            },
            {
                role: "user",
                content: `Generate ${count} ${difficulty} math questions about "${topic}" for Class ${classLevel} students.

JSON format:
[
  {
    "question": "...",
    "correctAnswer": "...",
    "hint": "...",
    "encouragement": "...",
    "options": ["A", "B", "C", "D"]
  }
]`,
            },
        ],
        temperature: 0.8,
        max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content || "[]";

    try {
        // Try to parse the JSON, handling potential markdown code blocks
        const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleanContent) as GeneratedQuestion[];
    } catch {
        console.error("Failed to parse quiz questions:", content);
        return [];
    }
}

export interface MixedQuizRequest {
    topic: string;
    classLevel: number;
    counts: {
        easy: number;
        medium: number;
        hard: number;
    };
}

/**
 * Generate a mixed-difficulty quiz in a SINGLE request to reduce latency
 */
export async function generateMixedQuiz(
    request: MixedQuizRequest
): Promise<GeneratedQuestion[]> {
    const { topic, classLevel, counts } = request;
    const totalCount = counts.easy + counts.medium + counts.hard;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `${AI_PERSONALITY}

You are generating a balanced math quiz for children.
Generate exacly ${totalCount} questions in valid JSON format.

DIFFICULTY DISTRIBUTION:
- ${counts.easy} Easy questions (Simple, single-step)
- ${counts.medium} Medium questions (Two-step, requires thinking)
- ${counts.hard} Hard questions (Challenging, multi-step)

RULES:
- Questions must be age-appropriate for Class ${classLevel}
- Hints should guide without giving the answer
- Encouragement should be warm and supportive
- For multiple choice, provide 4 options
- Tag each question with its difficulty ("easy", "medium", or "hard") in the JSON

Return ONLY a JSON array with NO markdown formatting.`,
            },
            {
                role: "user",
                content: `Generate a mixed quiz about "${topic}" for Class ${classLevel}.
Counts: ${counts.easy} Easy, ${counts.medium} Medium, ${counts.hard} Hard.

JSON format:
[
  {
    "question": "...",
    "difficulty": "easy", // or "medium", "hard"
    "correctAnswer": "...",
    "hint": "...",
    "encouragement": "...",
    "options": ["A", "B", "C", "D"]
  }
]`,
            },
        ],
        temperature: 0.8,
        max_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content || "[]";

    try {
        const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleanContent) as GeneratedQuestion[];
    } catch {
        console.error("Failed to parse mixed quiz questions:", content);
        return [];
    }
}

/**
 * Generate a placement test to determine student's starting level (1-3)
 */
export async function generatePlacementTest(classLevel: number): Promise<GeneratedQuestion[]> {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `${AI_PERSONALITY}

You are generating a 10-question placement test to assess a student's math level.
Generate exactly 10 questions in valid JSON format.

DIFFICULTY DISTRIBUTION:
- 4 Easy questions (Basic arithmetic, simple logic)
- 3 Medium questions (Word problems, fractions, beginner ratios)
- 3 Hard questions (Basic algebra, multi-step word problems)

RULES:
- Questions must be age-appropriate for Class ${classLevel}
- Keep it broad (mix different topics) to test overall math readiness
- For multiple choice, provide 4 options
- Tag each question with its difficulty ("easy", "medium", or "hard") in the JSON

Return ONLY a JSON array with NO markdown formatting.`,
            },
            {
                role: "user",
                content: `Generate a 10-question math placement test for Class ${classLevel} (4 Easy, 3 Medium, 3 Hard).

JSON format:
[
  {
    "question": "...",
    "difficulty": "easy",
    "correctAnswer": "...",
    "hint": "...",
    "encouragement": "...",
    "options": ["A", "B", "C", "D"]
  }
]`,
            },
        ],
        temperature: 0.8,
        max_tokens: 3000,
    });

    const content = completion.choices[0]?.message?.content || "[]";

    try {
        const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
        return JSON.parse(cleanContent) as GeneratedQuestion[];
    } catch {
        console.error("Failed to parse placement test:", content);
        return [];
    }
}

/**
 * Generate encouraging feedback for quiz answers
 * Now includes step-by-step reasoning for wrong answers
 */
export async function generateFeedback(
    question: string,
    studentAnswer: string,
    correctAnswer: string,
    isCorrect: boolean,
    attemptNumber: number,
    isLastAttempt: boolean = false
): Promise<string> {
    if (isCorrect) {
        const praises = [
            "🌟 Wonderful! You got it right! You're doing amazing!",
            "⭐ Excellent work! That's the correct answer! Keep it up!",
            "🎉 Perfect! You nailed it! I'm so proud of you!",
            "💪 You did it! That's absolutely right! Great effort!",
            "✨ Brilliant! You solved it perfectly! You're a math star!",
        ];
        return praises[Math.floor(Math.random() * praises.length)];
    }

    const revealInstruction = isLastAttempt
        ? `This is the student's LAST attempt (attempt ${attemptNumber} of 3). 
           You MUST now reveal the correct answer and explain the solution step by step.
           Start with something encouraging like "Great effort trying this!" then explain the correct answer.`
        : `This is attempt ${attemptNumber} of 3. DO NOT reveal the correct answer.
           Instead, explain WHY their answer doesn't work using simple reasoning.
           Give them a helpful nudge in the right direction.
           End with encouragement to try again.`;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `${AI_PERSONALITY}

Generate a helpful, encouraging response for a student who got a math question wrong.
${revealInstruction}

IMPORTANT RULES:
- Be warm and supportive
- Explain step-by-step reasoning in simple language
- Keep it concise (3-4 sentences max)
- NEVER use the word "wrong" or "incorrect"`,
            },
            {
                role: "user",
                content: `Question: ${question}
Student's answer: ${studentAnswer}
Correct answer: ${correctAnswer}

Provide encouraging feedback with reasoning.`,
            },
        ],
        temperature: 0.7,
        max_tokens: 250,
    });

    return completion.choices[0]?.message?.content || "Good try! Let's think about this together. 💪";
}

export default openai;
