import { defineCollection, z } from 'astro:content';

// CTF Writeup collection schema
const ctfCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
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
    section: z.string(), // e.g. "Red-Teaming", "Web-Attacks"
    order: z.number().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const collections = {
  ctf: ctfCollection,
  handbook: handbookCollection,
};
