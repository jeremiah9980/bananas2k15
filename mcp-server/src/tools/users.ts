import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const userTools = [
  {
    name: 'rally_list_users',
    description: 'List platform users with roles (coach, director, parent, admin)',
    inputSchema: z.object({
      org_id: z.string().optional(),
      role: z.enum(['admin','director','coach','parent','viewer']).optional(),
      active_only: z.boolean().default(true),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT id, org_id, name, email, role, active, created_at FROM users WHERE 1=1';
      const params: unknown[] = [];
      if (input.org_id) { sql += ' AND org_id = ?'; params.push(input.org_id); }
      if (input.role) { sql += ' AND role = ?'; params.push(input.role); }
      if (input.active_only) { sql += ' AND active = 1'; }
      return rows(sql + ' ORDER BY name', params);
    },
  },
  {
    name: 'rally_get_user',
    description: 'Get a user profile by ID or email',
    inputSchema: z.object({
      user_id: z.string().optional(),
      email: z.string().email().optional(),
    }),
    handler: ({ user_id, email }: { user_id?: string; email?: string }) => {
      if (user_id) return row('SELECT id, org_id, name, email, role, active, created_at FROM users WHERE id = ?', [user_id]);
      if (email) return row('SELECT id, org_id, name, email, role, active, created_at FROM users WHERE email = ?', [email]);
      return null;
    },
  },
  {
    name: 'rally_upsert_user',
    description: 'Create or update a platform user and their role',
    inputSchema: z.object({
      org_id: z.string(),
      name: z.string().min(1),
      email: z.string().email(),
      role: z.enum(['admin','director','coach','parent','viewer']).default('viewer'),
      active: z.boolean().default(true),
    }),
    handler: (input: Record<string, unknown>) => {
      const existing = row<{ id: string }>(
        'SELECT id FROM users WHERE email = ? AND org_id = ?',
        [input.email, input.org_id]
      );
      if (existing) {
        run(
          `UPDATE users SET name=?, role=?, active=?, updated_at=datetime('now') WHERE id=?`,
          [input.name, input.role, input.active ? 1 : 0, existing.id]
        );
        return { action: 'updated', id: existing.id };
      }
      const result = run(
        `INSERT INTO users (id, org_id, name, email, role, active, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, datetime('now'))`,
        [input.org_id, input.name, input.email, input.role, input.active ? 1 : 0]
      );
      return { action: 'created', lastInsertRowid: result.lastInsertRowid };
    },
  },
];
