import { weekLabel } from "@/lib/leaderboard";
import type { LocalizedText } from "@/types/curriculum";

export type NotificationType = "content" | "leaderboard" | "reward";

/** What a student sees under the bell. Stored under students/{uid}/notifications. */
export interface NotificationInput {
    id: string;
    type: NotificationType;
    title: LocalizedText;
    body: LocalizedText;
    link?: string;
}

export interface StudentNotification extends NotificationInput {
    read: boolean;
    /** UTC milliseconds. */
    createdAt: number;
}

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

/** A lesson (with its quiz) was published for the class; one notice per lesson per day. */
export function contentNotification(concept: { microTag: string; title: LocalizedText; classLevel: number }, dateKey: string): NotificationInput {
    return {
        id: `content_${concept.microTag}_${dateKey}`,
        type: "content",
        title: text("New lesson and quiz", "Naya lesson aur quiz"),
        body: text(`"${concept.title.english}" is ready for Class ${concept.classLevel}. Learn it, then play the quiz.`,
            `"${concept.title.english}" Class ${concept.classLevel} ke liye tayyar hai. Seekho, phir quiz khelo.`),
        link: `/learn?microTag=${encodeURIComponent(concept.microTag)}&class=${concept.classLevel}`,
    };
}

/** The week closed and the ranks are final. */
export function resultsNotification(weekKey: string, standing: { rank: number; points: number; participants: number }): NotificationInput {
    const label = weekLabel(weekKey);
    return {
        id: `leaderboard_${weekKey}`,
        type: "leaderboard",
        title: text("Weekly leaderboard results", "Hafte ke leaderboard ke natayij"),
        body: text(`Week of ${label}: you finished #${standing.rank} of ${standing.participants} with ${standing.points} points. A new week has started.`,
            `${label} ka hafta: tum ${standing.participants} mein se #${standing.rank} rahe, ${standing.points} points. Naya hafta shuru ho gaya.`),
        link: "/leaderboard",
    };
}

/** The admin approved this student as a weekly winner. */
export function rewardNotification(weekKey: string, place: number): NotificationInput {
    const label = weekLabel(weekKey);
    const ordinal = place === 1 ? "1st" : place === 2 ? "2nd" : place === 3 ? "3rd" : `${place}th`;
    return {
        id: `reward_${weekKey}`,
        type: "reward",
        title: text("You won a weekly reward!", "Tum ne hafte ka inaam jeet liya!"),
        body: text(`Congratulations! You finished ${ordinal} in the week of ${label}, and your reward has been approved.`,
            `Mubarak ho! ${label} ke hafte mein tum ${ordinal} aaye, aur tumhara inaam approve ho gaya.`),
        link: "/leaderboard",
    };
}
