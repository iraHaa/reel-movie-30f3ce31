import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, UserPlus, UserMinus, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import type { Movie } from "@/components/MovieCard";

export const Route = createFileRoute("/_authenticated/u/$username")({
  head: ({ params }) => ({ meta: [{ title: `@${params.username} – Reel Movie` }, { name: "robots", content: "noindex" }] }),
  component: PublicProfile,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="font-display text-3xl mb-2">Profile unavailable</h1>
        <p className="text-muted-foreground text-sm mb-6">{error?.message ?? "Something went wrong."}</p>
        <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="font-display text-3xl mb-2">Profile not found</h1>
        <p className="text-muted-foreground text-sm mb-6">This user doesn't exist or their profile is private.</p>
        <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
      </div>
    </div>
  ),
});

interface PublicProfileData {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_public: boolean;
  show_followers: boolean;
  show_following: boolean;
  created_at: string;
}

function PublicProfile() {
  const { user } = Route.useRouteContext();
  const { username } = Route.useParams();
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const isSelf = profile?.id === user.id;

  async function load() {
    setLoading(true);
    const { data: p } = await supabase
      .from("profiles")
      .select("*")
      .ilike("username", username)
      .maybeSingle();

    if (!p) { setProfile(null); setLoading(false); return; }
    const prof = p as PublicProfileData;
    setProfile(prof);

    if (prof.avatar_url) {
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(prof.avatar_url, 60 * 60);
      setAvatarUrl(signed?.signedUrl ?? null);
    } else setAvatarUrl(null);

    const [{ data: mv }, { count: fc }, { count: gc }, { data: rel }] = await Promise.all([
      supabase.from("movies").select("*").eq("user_id", prof.id).order("watched_at", { ascending: false, nullsFirst: false }).limit(60),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id),
      supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle(),
    ]);
    setMovies((mv ?? []) as Movie[]);
    setFollowerCount(fc ?? 0);
    setFollowingCount(gc ?? 0);
    setIsFollowing(!!rel);
    setLoading(false);
  }

  useEffect(() => { load().catch(() => {}); /* eslint-disable-next-line */ }, [username, user.id]);

  async function follow() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setIsFollowing(true);
    setFollowerCount((c) => c + 1);
    toast.success(`Following @${profile.username}`);
  }

  async function unfollow() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setIsFollowing(false);
    setFollowerCount((c) => Math.max(0, c - 1));
  }

  const initial = (profile?.display_name || profile?.username || "?").charAt(0).toUpperCase();
  const watched = movies.filter((m) => m.status === "watched");
  const favorites = movies.filter((m) => m.is_favorite);

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/feed"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !profile ? (
          <div className="text-center py-16">
            <h2 className="font-display text-2xl mb-2">Profile not found</h2>
            <p className="text-sm text-muted-foreground">This user doesn't exist or their profile is private.</p>
          </div>
        ) : (
          <>
            <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:gap-6 mb-8">
              {avatarUrl ? (
                <img src={avatarUrl} alt={`${profile.username} profile`} className="h-20 w-20 sm:h-28 sm:w-28 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-20 w-20 sm:h-28 sm:w-28 shrink-0 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display text-3xl sm:text-4xl">
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-2xl sm:text-4xl truncate">{profile.display_name || profile.username}</h1>
                <p className="text-sm text-muted-foreground">@{profile.username}</p>
                {profile.bio && <p className="text-sm mt-3">{profile.bio}</p>}
                <div className="flex flex-wrap items-center gap-4 mt-4 text-sm">
                  <span><span className="font-display text-lg text-primary">{watched.length}</span> <span className="text-muted-foreground">watched</span></span>
                  {profile.show_followers && (
                    <span><span className="font-display text-lg text-primary">{followerCount}</span> <span className="text-muted-foreground">followers</span></span>
                  )}
                  {profile.show_following && (
                    <span><span className="font-display text-lg text-primary">{followingCount}</span> <span className="text-muted-foreground">following</span></span>
                  )}
                </div>
                {!isSelf && (
                  <div className="mt-4">
                    {isFollowing ? (
                      <Button variant="outline" size="sm" onClick={unfollow} disabled={busy}>
                        <UserMinus className="h-4 w-4 mr-2" /> Unfollow
                      </Button>
                    ) : (
                      <Button size="sm" onClick={follow} disabled={busy}>
                        <UserPlus className="h-4 w-4 mr-2" /> Follow
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </header>

            {favorites.length > 0 && (
              <section className="mb-10">
                <h2 className="font-display text-2xl mb-4 flex items-center gap-2"><Heart className="h-5 w-5 text-primary fill-primary" /> Favorites</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {favorites.slice(0, 6).map((m) => <PublicMovieCard key={m.id} movie={m} />)}
                </div>
              </section>
            )}

            <section>
              <h2 className="font-display text-2xl mb-4">Recently watched</h2>
              {watched.length === 0 ? (
                <p className="text-muted-foreground text-sm italic">No watched movies yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {watched.slice(0, 30).map((m) => <PublicMovieCard key={m.id} movie={m} />)}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PublicMovieCard({ movie }: { movie: Movie }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg truncate">{movie.title}</h3>
          <Badge variant="secondary" className="mt-1.5 font-normal">{movie.genre}</Badge>
        </div>
        {movie.rating_score != null && (
          <div className="shrink-0 font-display text-2xl text-primary leading-none">
            {movie.rating_score}<span className="text-muted-foreground text-sm">/{movie.rating_max}</span>
          </div>
        )}
      </div>
      {movie.notes && <p className="mt-2 text-xs text-muted-foreground italic line-clamp-2">"{movie.notes}"</p>}
    </article>
  );
}
