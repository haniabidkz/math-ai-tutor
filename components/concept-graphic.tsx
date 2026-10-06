import { cn } from "@/lib/utils";

/**
 * The picture for a lesson: only an image the admin uploaded for that concept. There is no
 * stand-in drawing any more, because a generic "x + 3 = ?" above a lesson on sets only confused.
 */
export function ConceptGraphic({ imageUrl, alt, className }: { imageUrl?: string | null; alt: string; className?: string }) {
    if (!imageUrl) return null;
    return (
        <div className={cn("flex max-h-56 w-full items-center justify-center overflow-hidden bg-slate-50", className)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- uploaded to Firebase Storage, not an optimisable asset */}
            <img src={imageUrl} alt={alt} className="max-h-56 w-auto object-contain" />
        </div>
    );
}
