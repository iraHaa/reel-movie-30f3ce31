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

interface Props {
  defaultStatus: "watched" | "watchlist";
  onSaved: () => void;
  onCancel: () => void;
}

export function MovieForm({ defaultStatus, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [score, setScore] = useState("");
  const [max, setMax] = useState("10");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const isWatched = defaultStatus === "watched";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !genre) {
      toast.error("Please add a title and genre.");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title: title.trim(),
      genre,
      status: defaultStatus,
      notes: notes.trim() || null,
    };
    if (isWatched && score) {
      payload.rating_score = Number(score);
      payload.rating_max = Number(max) || 10;
    }
    const { error } = await supabase.from("movies").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isWatched ? "Added to your journal." : "Added to your watchlist.");
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

      {isWatched && (
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
              className="w-24"
            />
            <span className="text-muted-foreground font-display text-xl">/</span>
            <Input
              type="number"
              step="1"
              min="1"
              value={max}
              onChange={(e) => setMax(e.target.value)}
              className="w-24"
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
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
