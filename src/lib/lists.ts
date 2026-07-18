export type ListVisibility = "private" | "public" | "shared";
export type ListSortMode = "custom" | "date_added" | "rating" | "alpha";

export interface MovieList {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  emoji: string | null;
  visibility: ListVisibility;
  share_slug: string | null;
  sort_mode: ListSortMode;
  created_at: string;
  updated_at: string;
}

export const EMOJI_CHOICES = [
  "🎬", "🍿", "⭐", "🔥", "💀", "😂", "😱", "❤️", "🕵️", "👻",
  "🚀", "🌍", "🎭", "🎃", "🎄", "🏆", "🧠", "⚔️", "🧙", "🐉",
];

export function newShareSlug() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}
