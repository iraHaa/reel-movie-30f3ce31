// Temporary local verification helper: a minimal PostgREST mock so the SSR
// pipeline (movie page head, JSON-LD, sitemap, legacy redirect) can be tested
// without production credentials. Not part of the app.
const http = require("http");

const inception = {
  imdb_id: "tt1375666",
  title: "Inception",
  release_year: 2010,
  runtime: 148,
  genres: ["Action", "Sci-Fi", "Thriller"],
  overview:
    "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O., but his tragic past may doom the project and his team to disaster.",
  director: "Christopher Nolan",
  actors: "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page",
  poster_url: "https://example.com/inception.jpg",
  backdrop_url: null,
  imdb_rating: 8.8,
  media_type: "movie",
  raw: { imdbVotes: "2,514,783", imdbRating: "8.8", Released: "16 Jul 2010" },
  created_at: "2026-07-01T10:00:00Z",
  updated_at: "2026-08-20T12:34:56Z",
};

const legacyRow = {
  imdb_id: "tt1375666",
  title: "Inception",
  release_year: 2010,
  runtime: 148,
  genres: ["Action", "Sci-Fi", "Thriller"],
  overview: "A thief who steals corporate secrets...",
  director: "Christopher Nolan",
  actors: "Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page",
  poster_url: "https://example.com/inception.jpg",
  imdb_rating: 8.8,
  media_type: "movie",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const accept = req.headers["accept"] || "";
  const single = accept.includes("application/vnd.pgrst.object");

  const send = (code, body) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.method === "GET" && path === "/rest/v1/movie_cache") {
    const eq = url.searchParams.get("imdb_id"); // e.g. eq.tt1375666
    if (eq === "eq.tt1375666") {
      return single ? send(200, inception) : send(200, [inception]);
    }
    // sitemap query: select=imdb_id,updated_at (no imdb_id filter)
    return send(200, [
      { imdb_id: "tt1375666", updated_at: "2026-08-20T12:34:56Z" },
      { imdb_id: "tt0111161", updated_at: "2026-08-01T08:00:00Z" },
    ]);
  }

  if (req.method === "GET" && path === "/rest/v1/movies") {
    const eq = url.searchParams.get("id");
    if (eq === "eq.11111111-1111-1111-1111-111111111111") {
      return single ? send(200, legacyRow) : send(200, [legacyRow]);
    }
    return single ? send(406, { message: "0 rows", code: "PGRST116" }) : send(200, []);
  }

  if (req.method === "POST" && path === "/rest/v1/movie_cache") {
    return send(201, []);
  }

  send(404, { message: "not mocked: " + req.method + " " + path });
});

server.listen(54321, () => console.log("mock postgrest on http://localhost:54321"));
