import { useNavigate } from "@tanstack/react-router";
import { Film, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Path to come back to after sign in (defaults to current location). */
  redirectTo?: string;
}

export function AuthGateDialog({ open, onOpenChange, redirectTo }: Props) {
  const navigate = useNavigate();

  function go(mode: "login" | "signup") {
    const redirect =
      redirectTo ??
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/discover");
    navigate({ to: "/auth", search: { mode, redirect } });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Film className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="font-display text-2xl">Join Reel Movie</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Create a free account to follow movie lovers, build your watchlist, rate films,
            discover new people, and personalize your movie journey.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2 mt-2">
          <Button onClick={() => go("signup")}>
            <UserPlus className="h-4 w-4 mr-2" /> Sign Up
          </Button>
          <Button variant="outline" onClick={() => go("login")}>
            <LogIn className="h-4 w-4 mr-2" /> Log In
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
