export interface PendingAction {
  type: "follow";
  profileId: string;
  username?: string;
}

const KEY = "reelmovie.pendingAction";

export function setPendingAction(action: PendingAction) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(action));
  } catch {
    /* ignore */
  }
}

export function takePendingAction(): PendingAction | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as PendingAction;
  } catch {
    return null;
  }
}

export function clearPendingAction() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
