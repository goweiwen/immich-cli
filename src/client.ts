import { init, isHttpError, AssetTypeEnum } from "@immich/sdk";

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

// A share key must be passed as a query param here (rather than requiring the
// viewer to be logged in) since shared links grant access without an account.
// Videos link to the playback endpoint rather than the thumbnail, which is a
// still frame, so the URL points at actual video content. A trailing ".mp4"
// query key (harmless to the server) makes clients that sniff the URL's
// extension, e.g. chat apps generating link previews, recognize it as video.
export function rawUrl(assetId: string, shareKey?: string, assetType?: AssetTypeEnum): string {
  const apiBase = withApiSuffix(process.env.IMMICH_INSTANCE_URL ?? "");
  const params = new URLSearchParams(shareKey ? { key: shareKey } : {});
  if (assetType === AssetTypeEnum.Video) {
    const query = params.toString();
    return `${apiBase}/assets/${assetId}/video/playback?${query}${query ? "&" : ""}.mp4`;
  }
  params.set("size", "preview");
  return `${apiBase}/assets/${assetId}/thumbnail?${params}`;
}

export function formatError(err: unknown): string {
  if (isHttpError(err)) {
    const detail = err.data?.message ?? err.data?.error ?? JSON.stringify(err.data);
    return `HTTP ${err.status}: ${detail}`;
  }
  return err instanceof Error ? err.message : String(err);
}
