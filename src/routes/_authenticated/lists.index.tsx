import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Globe, Lock, Link2, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { EMOJI_CHOICES, newShareSlug, type ListVisibility, type MovieList } from "@/lib/lists";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lists/")({
  head: () => ({ meta: [{ title: "Your lists – Reel Movie" }, { name: "robots", content: "noindex" }] }),
  component: ListsPage,
});

interface RowWithCount extends MovieList { count: number }
type SaveMode = "created" | "updated";

function ListsPage() {
  const { user } = Route.useRouteContext();
  const [rows, setRows] = useState<RowWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MovieList | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("lists").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      const lists = (data ?? []) as MovieList[];
      const counts = await Promise.all(lists.map(async (l) => {
        const { count, error: countError } = await supabase
          .from("list_items")
          .select("*", { count: "exact", head: true })
          .eq("list_id", l.id);
        if (countError) throw countError;
        return count ?? 0;
      }));
      setRows(lists.map((l, i) => ({ ...l, count: counts[i] })));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load your lists.");
      throw error;
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function remove(l: MovieList) {
    if (!confirm(`Delete list "${l.title}"? This can't be undone.`)) return;
    const { error } = await supabase.from("lists").delete().eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success("List deleted");
    load();
  }

  return (
    <div className="min-h-screen">
      <Toaster theme="dark" position="top-center" />
      <AppHeader
        user={user}
        action={<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> New list</Button>}
      />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="font-display text-4xl mb-2">Your lists</h1>
        <p className="text-muted-foreground mb-8">Curate custom collections — private, public, or share-only.</p>

        {loading ? (
          <p className="text-muted-foreground text-sm py-12 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-20 text-center">
            <p className="text-muted-foreground italic mb-4">You haven't created any lists yet.</p>
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> Create your first list</Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((l) => (
              <article key={l.id} className="group relative rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
                <Link to="/lists/$id" params={{ id: l.id }} className="block">
                  <div className="flex items-start gap-3">
                    <div className="text-4xl leading-none">{l.emoji ?? "🎬"}</div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-xl truncate">{l.title}</h2>
                      <p className="text-xs text-muted-foreground mt-1">{l.count} {l.count === 1 ? "movie" : "movies"}</p>
                    </div>
                    <VisibilityIcon v={l.visibility} />
                  </div>
                  {l.description && <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{l.description}</p>}
                </Link>
                <div className="mt-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setEditing(l); setOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(l)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <ListDialog
        open={open}
        onOpenChange={setOpen}
        userId={user.id}
        list={editing}
        onSaved={(saved, mode) => {
          setOpen(false);
          setRows((current) => {
            if (mode === "created") return [{ ...saved, count: 0 }, ...current];
            return current.map((row) => row.id === saved.id ? { ...saved, count: row.count } : row);
          });
          void load().catch(() => undefined);
        }}
      />
    </div>
  );
}

function VisibilityIcon({ v }: { v: ListVisibility }) {
  const cls = "h-4 w-4 text-muted-foreground";
  if (v === "public") return <Globe className={cls} aria-label="Public" />;
  if (v === "shared") return <Link2 className={cls} aria-label="Shared" />;
  return <Lock className={cls} aria-label="Private" />;
}

function ListDialog({
  open, onOpenChange, userId, list, onSaved,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string; list: MovieList | null; onSaved: (list: MovieList, mode: SaveMode) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🎬");
  const [visibility, setVisibility] = useState<ListVisibility>("private");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(list?.title ?? "");
      setDescription(list?.description ?? "");
      setEmoji(list?.emoji ?? "🎬");
      setVisibility((list?.visibility as ListVisibility) ?? "private");
    }
  }, [open, list]);

  async function save() {
    if (!title.trim()) return toast.error("Give the list a title.");
    setSaving(true);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      emoji,
      visibility,
      share_slug: visibility === "shared" ? (list?.share_slug ?? newShareSlug()) : (list?.share_slug ?? null),
    };
    try {
      if (list) {
        const { data, error } = await supabase
          .from("lists")
          .update(payload)
          .eq("id", list.id)
          .select()
          .single();
        if (error) throw error;
        toast.success("List updated");
        onSaved(data as MovieList, "updated");
      } else {
        const { data, error } = await supabase
          .from("lists")
          .insert({ ...payload, user_id: userId })
          .select()
          .single();
        if (error) throw error;
        toast.success("List created");
        onSaved(data as MovieList, "created");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the list.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{list ? "Edit list" : "New list"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Emoji</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMOJI_CHOICES.map((e) => (
                <button key={e} type="button" onClick={() => setEmoji(e)}
                  className={`h-9 w-9 rounded-md border text-xl leading-none ${emoji === e ? "border-primary bg-primary/10" : "border-border"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="ltitle">Title</Label>
            <Input id="ltitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Best sci-fi of the 2000s" />
          </div>
          <div>
            <Label htmlFor="ldesc">Description (optional)</Label>
            <Textarea id="ldesc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={(v) => setVisibility(v as ListVisibility)}>
              <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="private">🔒 Private — only you</SelectItem>
                <SelectItem value="public">🌍 Public — anyone signed in</SelectItem>
                <SelectItem value="shared">🔗 Shared — invite or link only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : list ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
