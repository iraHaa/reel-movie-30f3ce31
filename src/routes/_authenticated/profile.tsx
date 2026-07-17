import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Upload, Copy, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

interface Profile {
  id: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  username: string;
  is_public: boolean;
  show_followers: boolean;
  show_following: boolean;
  created_at: string;
}

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [showFollowers, setShowFollowers] = useState(true);
  const [showFollowing, setShowFollowing] = useState(true);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (data) {
      const p = data as Profile;
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setUsername(p.username);
      setBio(p.bio ?? "");
      setIsPublic(p.is_public);
      setShowFollowers(p.show_followers);
      setShowFollowing(p.show_following);
      if (p.avatar_url) {
        const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(p.avatar_url, 60 * 60);
        setAvatarUrl(signed?.signedUrl ?? null);
      } else {
        setAvatarUrl(null);
      }
    }
    const [{ count: fc }, { count: gc }] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);
    setFollowerCount(fc ?? 0);
    setFollowingCount(gc ?? 0);
  }

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user.id]);

  async function save() {
    const trimmedUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!trimmedUsername) return toast.error("Username can't be empty.");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        username: trimmedUsername,
        bio: bio.trim() || null,
        is_public: isPublic,
        show_followers: showFollowers,
        show_following: showFollowing,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message.includes("unique") || error.code === "23505" ? "That username is taken." : error.message);
    toast.success("Profile saved.");
    reload();
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (upErr) { setUploading(false); return toast.error(upErr.message); }
    const { error: updErr } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
    if (updErr) { setUploading(false); return toast.error(updErr.message); }
    const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
    setAvatarUrl(signed?.signedUrl ?? null);
    setUploading(false);
    toast.success("Profile picture updated.");
    reload();
  }

  async function deleteAvatar() {
    if (!profile?.avatar_url) return;
    if (!confirm("Remove your profile picture?")) return;
    const path = profile.avatar_url;
    await supabase.storage.from("avatars").remove([path]);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (error) return toast.error(error.message);
    setAvatarUrl(null);
    toast.success("Profile picture removed.");
    reload();
  }

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/u/${username || profile?.username || ""}` : "";

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Couldn't copy link."); }
  }

  const initial = (displayName || user.email || "?").charAt(0).toUpperCase();
  const joined = profile
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-8 sm:py-10">
        <h1 className="font-display text-3xl sm:text-4xl mb-6 sm:mb-8">Profile</h1>

        <section className="border border-border rounded-lg bg-card p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your profile" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display text-3xl">
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  <Upload className="h-4 w-4 mr-2" /> {uploading ? "Uploading…" : "Change picture"}
                </Button>
                {profile?.avatar_url && (
                  <Button variant="ghost" size="sm" onClick={deleteAvatar} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">JPG or PNG.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="un">Username</Label>
            <Input id="un" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your_handle" />
            <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and underscores.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="A few words about your taste in movies…" />
          </div>
        </section>

        <section className="mt-6 border border-border rounded-lg bg-card p-4 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display text-xl">Privacy &amp; sharing</h2>
            <p className="text-sm text-muted-foreground mt-1">Control who can find you and what they can see.</p>
          </div>

          <ToggleRow
            title="Public profile"
            desc="Let anyone signed in view your profile, movies and ratings."
            checked={isPublic}
            onChange={setIsPublic}
          />
          <ToggleRow
            title="Show follower count"
            desc="Display how many people follow you."
            checked={showFollowers}
            onChange={setShowFollowers}
          />
          <ToggleRow
            title="Show following count"
            desc="Display how many people you follow."
            checked={showFollowing}
            onChange={setShowFollowing}
          />

          <div className="border-t border-border pt-4 space-y-2">
            <Label>Shareable profile URL</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input readOnly value={shareUrl} className="flex-1 text-sm" />
              <Button variant="outline" onClick={copyShare} disabled={!isPublic} className="shrink-0">
                {copied ? <><Check className="h-4 w-4 mr-2" /> Copied</> : <><Copy className="h-4 w-4 mr-2" /> Copy</>}
              </Button>
            </div>
            {!isPublic && (
              <p className="text-xs text-muted-foreground">Turn on "Public profile" to share this link.</p>
            )}
            {isPublic && (
              <p className="text-xs text-muted-foreground">
                Preview it at <Link to="/u/$username" params={{ username: profile?.username ?? "" }} className="underline hover:text-primary">/u/{profile?.username}</Link>.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Followers</p>
              <p className="font-display text-2xl text-primary mt-1">{followerCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Following</p>
              <p className="font-display text-2xl text-primary mt-1">{followingCount}</p>
            </div>
          </div>
        </section>

        <section className="mt-6 text-sm text-muted-foreground border border-border rounded-lg bg-card p-4 sm:p-6">
          <span className="font-medium text-foreground">Email:</span> {user.email}
          <br />
          <span className="font-medium text-foreground">Joined Reel Movie:</span> {joined || "—"}
        </section>

        <div className="mt-6 flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </div>
      </main>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-1 shrink-0" />
    </div>
  );
}
