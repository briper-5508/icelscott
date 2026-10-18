import { getStore } from "@netlify/blobs";

const COUNTRIES = ["iceland", "scotland"];
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5.5 * 1024 * 1024; // Netlify function request limit is ~6 MB

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\//, "");
  const store = getStore("photos");

  const password = process.env.UPLOAD_PASSWORD;
  const authed = () => !!password && req.headers.get("x-password") === password;

  // List photos
  if (route === "photos" && req.method === "GET") {
    const { blobs } = await store.list();
    const photos = blobs
      .map(({ key }) => {
        const [country, rest] = [key.split("/")[0], key.slice(key.indexOf("/") + 1)];
        const m = rest.match(/^(\d+)-(.*?)(\.[^.]+)?$/);
        return {
          id: key,
          country,
          caption: m ? m[2] : rest,
          time: m ? Number(m[1]) : 0,
          src: `/api/photo?key=${encodeURIComponent(key)}`,
        };
      })
      .sort((a, b) => a.time - b.time);
    return json(photos);
  }

  // Serve a photo
  if (route === "photo" && req.method === "GET") {
    const key = url.searchParams.get("key") || "";
    if (!COUNTRIES.includes(key.split("/")[0])) return new Response("Not found", { status: 404 });
    const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!res) return new Response("Not found", { status: 404 });
    return new Response(res.data, {
      headers: {
        "content-type": res.metadata?.type || "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Upload (password required)
  if (route === "upload" && req.method === "POST") {
    if (!authed()) return json({ error: "unauthorized" }, 401);
    const country = url.searchParams.get("country");
    const type = (req.headers.get("content-type") || "").split(";")[0];
    if (!COUNTRIES.includes(country)) return json({ error: "bad country" }, 400);
    if (!TYPES.includes(type)) return json({ error: "not an image" }, 400);
    const body = await req.arrayBuffer();
    if (body.byteLength > MAX_BYTES) return json({ error: "too large" }, 413);
    const name = (url.searchParams.get("name") || "photo").replace(/[^\w.\- ]/g, "_").slice(0, 100);
    await store.set(`${country}/${Date.now()}-${name}`, body, { metadata: { type } });
    return json({ ok: true });
  }

  // Delete (password required)
  if (route === "delete" && req.method === "POST") {
    if (!authed()) return json({ error: "unauthorized" }, 401);
    const key = url.searchParams.get("key") || "";
    if (COUNTRIES.includes(key.split("/")[0])) await store.delete(key);
    return json({ ok: true });
  }

  return json({ error: "not found" }, 404);
};

export const config = { path: "/api/*" };
