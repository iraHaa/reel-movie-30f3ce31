import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const client = createClient(env.SUPABASE_URL, "dummy-key-for-local-verification");
try {
  const r = await client.from("movie_cache").select("*").eq("imdb_id", "tt1375666").maybeSingle();
  console.log("RESULT:", JSON.stringify(r, null, 2));
} catch (e) {
  console.log("THREW:", e.message);
}
