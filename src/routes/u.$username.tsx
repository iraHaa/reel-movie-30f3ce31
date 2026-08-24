import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, UserPlus, UserMinus, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { AuthGateDialog } from "@/components/AuthGateDialog";
import { useAuth } from "@/hooks/useAuth";
import { setPendingAction, takePendingAction } from "@/lib/auth-gate";
import { MovieCard, type Movie } from "@/components/MovieCard";

export const Route = createFileRoute("/u/$username")({
  head: ({ params }) => {
    const title = `@${params.username} on Reel Movie`;
    const description = `See what @${params.username} is watching, their ratings and favorite movies on Reel Movie.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PublicProfile,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="font-display text-3xl mb-2">Profile unavailable</h1>
        <p className="text-muted-foreground text-sm mb-6">{error?.message ?? "Something went wrong."}</p>
        <Button asChild variant="outline"><Link to="/discover">Back to Discover</Link></Button>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="font-display text-3xl mb-2">Profile not found</h1>
        <p className="text-muted-foreground text-sm mb-6">This user doesn't exist or their profile is private.</p>
        <Button asChild variant="outline"><Link to="/discover">Back to Discover</Link></Button>
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
  const { user } = useAuth();
  const { username } = Route.useParams();
  const [profile, setProfile] = useState<PublicProfileData | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  const isSelf = !!user && profile?.id === user.id;

  const load = useCallback(async () => {
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

    const [{ data: mv }, { count: fc }, { count: gc }, rel] = await Promise.all([
      supabase.from("movies").select("*").eq("user_id", prof.id).order("watched_at", { ascending: false, nullsFirst: false }).limit(60),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", prof.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", prof.id),
      user
        ? supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", prof.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setMovies((mv ?? []) as Movie[]);
    setFollowerCount(fc ?? 0);
    setFollowingCount(gc ?? 0);
    setIsFollowing(!!rel.data);
    setLoading(false);
  }, [username, user]);

  useEffect(() => { load().catch(() => setLoading(false)); }, [load]);

  const doFollow = useCallback(async (target: PublicProfileData) => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: target.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setIsFollowing(true);
    setFollowerCount((c) => c + 1);
    toast.success(`Following @${target.username}`);
  }, [user]);

  // Resume a follow that was attempted before signing in.
  useEffect(() => {
    if (!user || loading || !profile || isFollowing) return;
    const pending = takePendingAction();
    if (pending?.type === "follow" && pending.profileId === profile.id) {
      doFollow(profile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, profile?.id]);

  function onFollowClick() {
    if (!profile) return;
    if (!user) {
      setPendingAction({ type: "follow", profileId: profile.id, username: profile.username });
      setGateOpen(true);
      return;
    }
    doFollow(profile);
  }

  async function unfollow() {
    if (!profile || !user) return;
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
      <AuthGateDialog open={gateOpen} onOpenChange={setGateOpen} />
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/discover"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
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
                      <Button size="sm" onClick={onFollowClick} disabled={busy}>
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
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {favorites.slice(0, 6).map((m) => <MovieCard key={m.id} movie={m} onChanged={load} readOnly={!isSelf} onRequireAuth={() => setGateOpen(true)} />)}
                </div>
              </section>
            )}

            <section>
              <h2 className="font-display text-2xl mb-4">Recently watched</h2>
              {watched.length === 0 ? (
                <p className="text-muted-foreground text-sm italic">No watched movies yet.</p>
              ) : (
                <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {watched.slice(0, 30).map((m) => <MovieCard key={m.id} movie={m} onChanged={load} readOnly={!isSelf} onRequireAuth={() => setGateOpen(true)} />)}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
