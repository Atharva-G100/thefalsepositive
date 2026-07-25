import { getCollection } from 'astro:content';

export async function GET() {
  const ctf = await getCollection('ctf');
  const handbook = await getCollection('handbook');

  const results = [
    ...ctf.map(entry => ({
      title: entry.data.title,
      type: 'Writeup',
      url: `/ctf/${entry.slug}`,
      tags: entry.data.tags || [],
      context: entry.data.ctf || ''
    })),
    ...handbook.map(entry => ({
      title: entry.data.title,
      type: 'Handbook',
      url: `/pentest/${entry.slug}`,
      tags: entry.data.tags || [],
      context: entry.data.section || ''
    }))
  ];

  return new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
