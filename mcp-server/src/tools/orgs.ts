import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const orgTools = [
  {
    name: 'rally_list_orgs',
    description: 'List all softball organizations in the platform',
    inputSchema: z.object({
      active_only: z.boolean().default(true).describe('Filter to active orgs only'),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    handler: ({ active_only, limit }: { active_only: boolean; limit: number }) => {
      const sql = active_only
        ? 'SELECT * FROM orgs WHERE active = 1 ORDER BY name LIMIT ?'
        : 'SELECT * FROM orgs ORDER BY name LIMIT ?';
      return rows(sql, [limit]);
    },
  },
  {
    name: 'rally_get_org',
    description: 'Get full details for a specific organization',
    inputSchema: z.object({
      org_id: z.string().describe('Organization ID or slug'),
    }),
    handler: ({ org_id }: { org_id: string }) =>
      row('SELECT * FROM orgs WHERE id = ? OR slug = ?', [org_id, org_id]),
  },
  {
    name: 'rally_create_org',
    description: 'Create a new softball organization',
    inputSchema: z.object({
      name: z.string().min(1),
      slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      age_group: z.string().optional().describe('e.g. 10U, 12U, 14U'),
      circuit: z.string().optional().describe('USSSA, NCS, NSA'),
      head_coach: z.string().optional(),
      contact_email: z.string().email().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO orgs (id, name, slug, city, state, age_group, circuit, head_coach, contact_email, active, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
        [input.name, input.slug, input.city ?? null, input.state ?? null,
         input.age_group ?? null, input.circuit ?? null, input.head_coach ?? null,
         input.contact_email ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_update_org',
    description: 'Update fields on an existing organization',
    inputSchema: z.object({
      org_id: z.string(),
      name: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      age_group: z.string().optional(),
      circuit: z.string().optional(),
      head_coach: z.string().optional(),
      contact_email: z.string().email().optional(),
      active: z.boolean().optional(),
    }),
    handler: ({ org_id, ...fields }: { org_id: string } & Record<string, unknown>) => {
      const allowed = ['name','city','state','age_group','circuit','head_coach','contact_email','active'];
      const updates = Object.entries(fields)
        .filter(([k]) => allowed.includes(k) && fields[k] !== undefined)
        .map(([k, v]) => ({ col: k, val: v }));
      if (updates.length === 0) return { updated: false, reason: 'no fields to update' };
      const set = updates.map(u => `${u.col} = ?`).join(', ');
      const vals = [...updates.map(u => u.val), org_id];
      run(`UPDATE orgs SET ${set}, updated_at = datetime('now') WHERE id = ? OR slug = ?`, [...vals, org_id]);
      return { updated: true };
    },
  },
];
