import { getAllAlbums, getAllTags, searchPerson, type AlbumResponseDto, type PersonResponseDto, type TagResponseDto } from "@immich/sdk";

function pickUnique<T>(matches: T[], name: (t: T) => string, query: string, kind: string): T {
  if (matches.length === 0) {
    throw new Error(`no ${kind} matching "${query}"`);
  }
  if (matches.length === 1) return matches[0]!;
  const exact = matches.find((m) => name(m).toLowerCase() === query.toLowerCase());
  if (exact) return exact;
  const candidates = matches.map((m) => name(m)).join(", ");
  throw new Error(`"${query}" matches multiple ${kind}s: ${candidates}; use a more specific name`);
}

export async function resolvePerson(query: string): Promise<PersonResponseDto> {
  const matches = await searchPerson({ name: query });
  return pickUnique(matches, (p) => p.name, query, "person");
}

export async function resolveAlbum(query: string): Promise<AlbumResponseDto> {
  const all = await getAllAlbums({});
  const matches = all.filter((a) => a.albumName.toLowerCase().includes(query.toLowerCase()));
  return pickUnique(matches, (a) => a.albumName, query, "album");
}

export async function resolveTag(query: string): Promise<TagResponseDto> {
  const all = await getAllTags();
  const matches = all.filter(
    (t) => t.name.toLowerCase().includes(query.toLowerCase()) || t.value.toLowerCase().includes(query.toLowerCase()),
  );
  return pickUnique(matches, (t) => t.value, query, "tag");
}
