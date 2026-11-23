import { getCollection } from 'astro:content';

// Adapt the existing collection to Nayuta's presentation fields.
export async function getPosts(collection: 'ctf' | 'blog' = 'ctf') {
  const entries = await getCollection(collection);
  return entries
    .filter(entry => !('draft' in entry.data && entry.data.draft))
    .map(entry => ({
      ...entry,
      id: entry.slug,
      href: `/${collection}/${entry.slug}`,
      data: {
        ...entry.data,
        ctf: 'ctf' in entry.data ? entry.data.ctf : undefined,
        category: 'category' in entry.data ? entry.data.category : undefined,
        publishDate: entry.data.date ?? '',
        tags: entry.data.tags ?? [],
        draft: false,
      },
    }));
}
