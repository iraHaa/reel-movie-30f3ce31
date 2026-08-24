export const SITE_URL = "https://reel-movie.lovable.app";
export const OG_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/357267f1-21d6-49e8-bbb2-07c67db05fa8/id-preview-292d5071--bb508a7d-37d8-4c55-b97d-9a557bcb4cd5.lovable.app-1780415684573.png";

export function absoluteUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}

export function publicHead({
  title,
  description,
  path,
  jsonLd,
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noindex?: boolean;
}) {
  const url = absoluteUrl(path);
  const robots = noindex ? "noindex, nofollow" : "index, follow";
  const payloads = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: robots },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: payloads.map((data) => ({
      type: "application/ld+json",
      children: JSON.stringify(data),
    })),
  };
}
