import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Heart, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/PublicHeader";
import { PublicMovieCard } from "@/components/PublicMovieCard";
import { useAuth } from "@/hooks/useAuth";
import { publicHead } from "@/lib/site";
import {
  avatarSrc,
  fetchFollowCounts,
  fetchPublicMoviesForUser,
  fetchPublicProfileByUsername,
} from "@/lib/public-content";
import type { Movie } from "@/components/MovieCard";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    const profile = await fetchPublicProfileByUsername(params.username);
    if (!profile) throw notFound();
    const [movies, counts, avatar] = await Promise.all([
      fetchPublicMoviesForUser(profile.id),
      fetchFollowCounts(profile.id),
      avatarSrc(profile.avatar_url),
    ]);
    return { profile, movies, counts, avatar };
  },
  head: ({ loaderData }) => {
    if (!loaderData?.profile) {
      return publicHead({
        title: "Profile not found – Reel Movie",
        description: "This profile does not exist or is private.",
        path: "/",
        noindex: true,
      });
    }
    const name = loaderData.profile.display_name || loaderData.profile.username;
    const description =
      loaderData.profile.bio?.trim() ||
      `See ${name}'s public movie collection, ratings, and watchlist on Reel Movie.`;
    return publicHead({
      title: `${name} (@${loaderData.profile.username}) – Reel Movie`,
      description,
      path: `/u/${loaderData.profile.username}`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          name,
          alternateName: `@${loaderData.profile.username}`,
          description,
          url: `https://reel-movie.lovable.app/u/${loaderData.profile.username}`,
        },
      },
    });
  },
  component: PublicProfilePage,
  notFoundComponent: ProfileNotFound,
});

function ProfileNotFound() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-16 text-center">
        <h1 className="font-display text-3xl mb-2">Profile not found</h1>
        <p className="text-sm text-muted-foreground mb-6">This user doesn't exist or their profile is private.</p>
        <Button asChild variant="outline"><Link to="/discover">Back to Discover</Link></Button>
      </main>
    </div>
  );
}

function PublicProfilePage() {
  const { profile, movies, counts, avatar } = Route.useLoaderData();
  const { user } = useAuth();
  const [followerCount, setFollowerCount] = useState(counts.followers);
  const [isFollowing, setIsFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = !!user && profile.id === user.id;

  useEffect(() => {
    if (!user || isSelf) { setIsFollowing(false); return; }
    supabase
      .from("follows")
      .select("id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .maybeSingle()
      .then(({ data }) => setIsFollowing(!!data));
  }, [user, profile.id, isSelf]);

  async function follow() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setIsFollowing(true);
    setFollowerCount((c) => c + 1);
    toast.success(`Following @${profile.username}`);
  }

  async function unfollow() {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    setIsFollowing(false);
    setFollowerCount((c) => Math.max(0, c - 1));
  }

  const initial = (profile.display_name || profile.username || "?").charAt(0).toUpperCase();
  const watched = movies.filter((m: Movie) => m.status === "watched");
  const watchlist = movies.filter((m: Movie) => m.status === "watchlist");
  const favorites = movies.filter((m: Movie) => m.is_favorite);

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/discover"><ArrowLeft className="h-4 w-4 mr-1" /> Discover</Link>
        </Button>

        <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 sm:gap-6 mb-8">
          {avatar ? (
            <img src={avatar} alt={`${profile.username} profile`} className="h-20 w-20 sm:h-28 sm:w-28 rounded-full object-cover shrink-0" />
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
                <span><span className="font-display text-lg text-primary">{counts.following}</span> <span className="text-muted-foreground">following</span></span>
              )}
            </div>
            <div className="mt-4">
              {user && !isSelf && (
                isFollowing ? (
                  <Button variant="outline" size="sm" onClick={unfollow} disabled={busy}>
                    <UserMinus className="h-4 w-4 mr-2" /> Unfollow
                  </Button>
                ) : (
                  <Button size="sm" onClick={follow} disabled={busy}>
                    <UserPlus className="h-4 w-4 mr-2" /> Follow
                  </Button>
                )
              )}
              {!user && (
                <Button asChild size="sm" variant="outline">
                  <Link to="/auth">Sign in to follow</Link>
                </Button>
              )}
            </div>
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

        <section className="mb-10">
          <h2 className="font-display text-2xl mb-4">Recently watched</h2>
          {watched.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">No watched movies yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watched.slice(0, 30).map((m) => <PublicMovieCard key={m.id} movie={m} />)}
            </div>
          )}
        </section>

        {watchlist.length > 0 && (
          <section>
            <h2 className="font-display text-2xl mb-4">Watchlist</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {watchlist.slice(0, 30).map((m) => <PublicMovieCard key={m.id} movie={m} />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
