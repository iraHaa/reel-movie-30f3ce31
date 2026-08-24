import { supabase } from "@/integrations/supabase/client";
import type { Movie } from "@/components/MovieCard";

export interface PublicProfileCard {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface PublicProfileDetail extends PublicProfileCard {
  is_public: boolean;
  show_followers: boolean;
  show_following: boolean;
}

export async function avatarSrc(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

export async function fetchPublicProfiles(limit = 100): Promise<PublicProfileCard[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, created_at")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as PublicProfileCard[];
}

export async function fetchPublicProfileByUsername(username: string): Promise<PublicProfileDetail | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, created_at, is_public, show_followers, show_following")
    .ilike("username", username)
    .eq("is_public", true)
    .maybeSingle();
  return (data as PublicProfileDetail | null) ?? null;
}

export async function fetchPublicMoviesForUser(userId: string, limit = 60): Promise<Movie[]> {
  const { data } = await supabase
    .from("movies")
    .select("*")
    .eq("user_id", userId)
    .order("watched_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as Movie[];
}

export async function fetchFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const [{ count: followers }, { count: following }] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
  ]);
  return { followers: followers ?? 0, following: following ?? 0 };
}

export async function fetchPublicMoviePage(id: string): Promise<{
  movie: Movie;
  profile: Pick<PublicProfileDetail, "id" | "username" | "display_name" | "is_public">;
  more: Movie[];
} | null> {
  const { data: movie } = await supabase.from("movies").select("*").eq("id", id).maybeSingle();
  if (!movie) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, is_public")
    .eq("id", movie.user_id)
    .eq("is_public", true)
    .maybeSingle();
  if (!profile) return null;

  const { data: more } = await supabase
    .from("movies")
    .select("*")
    .eq("user_id", profile.id)
    .neq("id", id)
    .order("watched_at", { ascending: false, nullsFirst: false })
    .limit(6);

  return {
    movie: movie as Movie,
    profile: profile as Pick<PublicProfileDetail, "id" | "username" | "display_name" | "is_public">,
    more: (more ?? []) as Movie[],
  };
}

export async function fetchSitemapPaths(): Promise<{ path: string; lastmod?: string }[]> {
  const [{ data: profiles }, { data: movies }] = await Promise.all([
    supabase.from("profiles").select("username, updated_at").eq("is_public", true).limit(5000),
    supabase.from("movies").select("id, created_at").limit(5000),
  ]);

  const profilePaths = (profiles ?? []).map((p) => ({
    path: `/u/${p.username}`,
    lastmod: p.updated_at?.slice(0, 10),
  }));
  const moviePaths = (movies ?? []).map((m) => ({
    path: `/movie/${m.id}`,
    lastmod: m.created_at?.slice(0, 10),
  }));
  return [...profilePaths, ...moviePaths];
}
