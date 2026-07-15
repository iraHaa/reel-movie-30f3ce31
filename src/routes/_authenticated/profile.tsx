import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  created_at: string;
}

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setDisplayName(data.display_name ?? "");
        setBio(data.bio ?? "");
        if (data.avatar_url) {
          const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(data.avatar_url, 60 * 60);
          setAvatarUrl(signed?.signedUrl ?? null);
        }
      }
    })();
  }, [user.id]);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null, bio: bio.trim() || null })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
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
  }

  const initial = (displayName || user.email || "?").charAt(0).toUpperCase();
  const joined = profile
    ? new Date(profile.created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : "";

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader user={user} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="font-display text-4xl mb-8">Profile</h1>

        <section className="border border-border rounded-lg bg-card p-6 space-y-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your profile" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <div className="h-20 w-20 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-display text-3xl">
                  {initial}
                </div>
              )}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" /> {uploading ? "Uploading…" : "Change picture"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">JPG or PNG.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dn">Display name</Label>
            <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} placeholder="A few words about your taste in movies…" />
          </div>

          <div className="text-sm text-muted-foreground border-t border-border pt-4">
            <span className="font-medium text-foreground">Email:</span> {user.email}
            <br />
            <span className="font-medium text-foreground">Joined Reel Movie:</span> {joined || "—"}
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </section>
      </main>
    </div>
  );
}
