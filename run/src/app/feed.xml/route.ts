import notes from "@/lib/notes.json";

/* A feed, because the previous edition had one and this one did not.

   Two items, which is every note there is. The case studies are not in here:
   a feed item without a date is a feed item a reader cannot place, and the
   case studies carry no date that would be true. When they get one they
   belong here too.

   Written by hand rather than through a library, because it is thirty lines
   and a dependency for thirty lines is a dependency. */

export const dynamic = "force-static";

const SITE = "https://keremozdemir.de";

/* RFC 822, which is what RSS asks for and what Date.toUTCString gives. */
function rfc822(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toUTCString();
}

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function GET() {
  const items = [...notes]
    .sort((a, b) => (a.published < b.published ? 1 : -1))
    .map(
      (n) => `  <item>
    <title>${escape(n.title)}</title>
    <link>${SITE}/notes/${n.slug}/</link>
    <guid isPermaLink="true">${SITE}/notes/${n.slug}/</guid>
    <pubDate>${rfc822(n.published)}</pubDate>
    <description>${escape(n.excerpt)}</description>
  </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Kerem Özdemir, Notes</title>
  <link>${SITE}/notes/</link>
  <description>Working notes on carbon accounting, valuation, and the instruments behind them.</description>
  <language>en</language>
  <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
