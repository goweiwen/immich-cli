import { init, isHttpError, AssetTypeEnum, type AssetResponseDto } from "@immich/sdk";

// The Immich web app and API share a host; a base URL without "/api" hits the
// SPA instead, which answers JSON requests with a 406 "text/html" HTML error
// page rather than anything recognizable as an auth or routing problem.
function withApiSuffix(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/api$/, "") + "/api";
}

export function initClient(): void {
  const rawBaseUrl = process.env.IMMICH_INSTANCE_URL;
  const apiKey = process.env.IMMICH_API_KEY;

  if (!rawBaseUrl || !apiKey) {
    console.error(
      "immich: set IMMICH_INSTANCE_URL and IMMICH_API_KEY (e.g. https://photos.example.com)",
    );
    process.exit(1);
  }

  init({ baseUrl: withApiSuffix(rawBaseUrl), apiKey });
}

function webBaseUrl(): string {
  return withApiSuffix(process.env.IMMICH_INSTANCE_URL ?? "").replace(/\/api$/, "");
}

export function assetUrl(assetId: string): string {
  return `${webBaseUrl()}/photos/${assetId}`;
}

export function shareUrl(key: string, assetId?: string): string {
  const base = `${webBaseUrl()}/share/${key}`;
  return assetId ? `${base}/photos/${assetId}` : base;
}

function thumbnailUrl(apiBase: string, assetId: string, shareKey?: string): string {
  const params = new URLSearchParams(shareKey ? { key: shareKey } : {});
  params.set("size", "preview");
  return `${apiBase}/assets/${assetId}/thumbnail?${params}`;
}

// Clients that embed a video from a URL (chat apps, link-preview generators)
// commonly fetch it server-side and only accept an MP4 body up to ~20 MB; a
// non-MP4 container or an oversized file makes them fail to find any media.
// Overridable per call (see rawUrl) since the ceiling varies by consumer.
export const DEFAULT_MAX_VIDEO_BYTES = 20 * 1024 * 1024;

// HEADs a URL and returns its served content-type (no parameters, lowercased)
// and byte length. Nulls on any failure. The API key is sent so the probe works
// for private assets; a share key already in the URL authorizes on its own.
async function probeServed(url: string): Promise<{ type: string | null; bytes: number | null }> {
  const apiKey = process.env.IMMICH_API_KEY;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: apiKey ? { "x-api-key": apiKey } : {},
    });
    if (!res.ok) return { type: null, bytes: null };
    const type = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? null;
    const len = res.headers.get("content-length");
    return { type, bytes: len ? Number(len) : null };
  } catch {
    return { type: null, bytes: null };
  }
}

// A share key must be passed as a query param here (rather than requiring the
// viewer to be logged in) since shared links grant access without an account.
//
// /video/playback streams the transcoded MP4 when Immich has made one, else the
// original container as-is (a .mov is served as video/quicktime, etc.). Since
// URL-embedding clients only ingest MP4 within a size cap (maxVideoBytes), probe
// what is actually served and link the playback URL only when it is an MP4
// within the cap, falling back to the preview thumbnail (a still frame) for
// anything else. This self-heals: once Immich transcodes the asset to a
// small-enough MP4 the video link returns. The trailing ".mp4" query key
// (harmless to the server) lets extension-sniffing clients recognize the URL as
// video.
export async function rawUrl(
  asset: AssetResponseDto,
  shareKey?: string,
  maxVideoBytes: number = DEFAULT_MAX_VIDEO_BYTES,
): Promise<string> {
  const apiBase = withApiSuffix(process.env.IMMICH_INSTANCE_URL ?? "");
  if (asset.type === AssetTypeEnum.Video) {
    const params = new URLSearchParams(shareKey ? { key: shareKey } : {});
    const query = params.toString();
    const playback = `${apiBase}/assets/${asset.id}/video/playback?${query}${query ? "&" : ""}`;
    const { type, bytes } = await probeServed(playback);
    if (type === "video/mp4" && bytes !== null && bytes <= maxVideoBytes) {
      return `${playback}.mp4`;
    }
    return thumbnailUrl(apiBase, asset.id, shareKey);
  }
  return thumbnailUrl(apiBase, asset.id, shareKey);
}

export function formatError(err: unknown): string {
  if (isHttpError(err)) {
    const detail = err.data?.message ?? err.data?.error ?? JSON.stringify(err.data);
    return `HTTP ${err.status}: ${detail}`;
  }
  return err instanceof Error ? err.message : String(err);
}
