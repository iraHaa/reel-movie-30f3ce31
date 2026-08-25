// Temporary local verification helper: Node 20 has no global WebSocket, which
// the supabase realtime client wants at createClient time. Production runs on
// Cloudflare Workers where WebSocket exists.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = require("ws");
}
