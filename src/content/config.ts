import { defineCollection, z } from 'astro:content';

// CTF Writeup collection schema
const ctfCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string().optional(),
    ctf: z.string().optional(),
    category: z.enum(['ctf', 'machine']).default('ctf'),
    description: z.string().optional(),
    icon: z.string().optional(),
    points: z.number().optional(),
    solves: z.number().optional(),
    placement: z.string().optional(),
    totalTeams: z.number().optional(),
    team: z.string().optional(),
    ctftimeUrl: z.string().url().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

// Pentest Handbook collection schema
const handbookCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    section: z.string(), // Series name e.g. "Network Recon", "Web Attacks"
    order: z.number().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = {
  ctf: ctfCollection,
  handbook: handbookCollection,
  blog: blogCollection,
};
