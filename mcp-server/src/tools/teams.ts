import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const teamTools = [
  {
    name: 'rally_list_teams',
    description: 'List all teams, optionally filtered by org',
    inputSchema: z.object({
      org_id: z.string().optional(),
      season: z.string().optional().describe('Season label e.g. "2025-spring"'),
    }),
    handler: ({ org_id, season }: { org_id?: string; season?: string }) => {
      let sql = 'SELECT * FROM teams WHERE 1=1';
      const params: unknown[] = [];
      if (org_id) { sql += ' AND org_id = ?'; params.push(org_id); }
      if (season) { sql += ' AND season = ?'; params.push(season); }
      sql += ' ORDER BY name';
      return rows(sql, params);
    },
  },
  {
    name: 'rally_get_team',
    description: 'Get full details for a specific team',
    inputSchema: z.object({ team_id: z.string() }),
    handler: ({ team_id }: { team_id: string }) =>
      row('SELECT * FROM teams WHERE id = ?', [team_id]),
  },
  {
    name: 'rally_create_team',
    description: 'Create a new team within an organization',
    inputSchema: z.object({
      org_id: z.string(),
      name: z.string().min(1),
      season: z.string().optional(),
      age_group: z.string().optional(),
      head_coach_id: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO teams (id, org_id, name, season, age_group, head_coach_id, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, datetime('now'))`,
        [input.org_id, input.name, input.season ?? null, input.age_group ?? null, input.head_coach_id ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_update_team',
    description: 'Update fields on a team record',
    inputSchema: z.object({
      team_id: z.string(),
      name: z.string().optional(),
      season: z.string().optional(),
      age_group: z.string().optional(),
      head_coach_id: z.string().optional(),
      record_wins: z.number().int().optional(),
      record_losses: z.number().int().optional(),
    }),
    handler: ({ team_id, ...fields }: { team_id: string } & Record<string, unknown>) => {
      const allowed = ['name','season','age_group','head_coach_id','record_wins','record_losses'];
      const updates = Object.entries(fields)
        .filter(([k]) => allowed.includes(k) && fields[k] !== undefined);
      if (updates.length === 0) return { updated: false };
      const set = updates.map(([k]) => `${k} = ?`).join(', ');
      run(`UPDATE teams SET ${set}, updated_at = datetime('now') WHERE id = ?`,
        [...updates.map(([, v]) => v), team_id]);
      return { updated: true };
    },
  },
];
