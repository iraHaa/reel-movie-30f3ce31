import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GENRES } from "@/lib/genres";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Movie } from "@/components/MovieCard";

interface Props {
  defaultStatus: "watched" | "watchlist";
  userId: string;
  movie?: Movie | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function MovieForm({ defaultStatus, userId, movie, onSaved, onCancel }: Props) {
  const editing = !!movie;
  const [title, setTitle] = useState(movie?.title ?? "");
  const [genre, setGenre] = useState<string>(movie?.genre ?? "");
  const [status, setStatus] = useState<"watched" | "watchlist">(
    movie?.status ?? defaultStatus,
  );
  const [score, setScore] = useState(movie?.rating_score?.toString() ?? "");
  const [max, setMax] = useState(movie?.rating_max?.toString() ?? "10");
  const [watchedAt, setWatchedAt] = useState(
    movie?.watched_at ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(movie?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const isWatched = status === "watched";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !genre) {
      toast.error("Please add a title and genre.");
      return;
    }
    setSaving(true);
    const payload = {
      user_id: userId,
      title: title.trim(),
      genre,
      status,
      notes: notes.trim() || null,
      rating_score: isWatched && score ? Number(score) : null,
      rating_max: isWatched && score ? Number(max) || 10 : null,
      watched_at: isWatched ? watchedAt || null : null,
    };
    const { error } = editing
      ? await supabase.from("movies").update(payload).eq("id", movie!.id)
      : await supabase.from("movies").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      editing
        ? "Movie updated."
        : isWatched
          ? "Added to your journal."
          : "Added to your watchlist.",
    );
    onSaved();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. In the Mood for Love"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Genre</Label>
          <Select value={genre} onValueChange={setGenre}>
            <SelectTrigger><SelectValue placeholder="Pick a genre" /></SelectTrigger>
            <SelectContent>
              {GENRES.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as "watched" | "watchlist")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="watched">Watched</SelectItem>
              <SelectItem value="watchlist">Watchlist</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isWatched && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Your rating</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                min="0"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="8.5"
                className="w-20"
              />
              <span className="text-muted-foreground font-display text-xl">/</span>
              <Input
                type="number"
                step="1"
                min="1"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className="w-20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="watched_at">Watched on</Label>
            <Input
              id="watched_at"
              type="date"
              value={watchedAt}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setWatchedAt(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="A line you loved, the night you saw it…"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}
