import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const playerTools = [
  {
    name: 'rally_list_players',
    description: 'List players, optionally filtered by team or org',
    inputSchema: z.object({
      team_id: z.string().optional(),
      org_id: z.string().optional(),
      position: z.string().optional(),
      active_only: z.boolean().default(true),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM players WHERE 1=1';
      const params: unknown[] = [];
      if (input.team_id) { sql += ' AND team_id = ?'; params.push(input.team_id); }
      if (input.org_id)  { sql += ' AND org_id = ?';  params.push(input.org_id); }
      if (input.position) { sql += ' AND position = ?'; params.push(input.position); }
      if (input.active_only) { sql += ' AND active = 1'; }
      return rows(sql + ' ORDER BY last_name, first_name', params);
    },
  },
  {
    name: 'rally_get_player',
    description: 'Get full profile for a player including stats and contact info',
    inputSchema: z.object({ player_id: z.string() }),
    handler: ({ player_id }: { player_id: string }) => {
      const player = row('SELECT * FROM players WHERE id = ?', [player_id]);
      if (!player) return null;
      const stats = rows('SELECT * FROM player_stats WHERE player_id = ? ORDER BY season DESC', [player_id]);
      const notes = rows('SELECT * FROM player_notes WHERE player_id = ? ORDER BY created_at DESC LIMIT 5', [player_id]);
      return { ...player as object, stats, recent_notes: notes };
    },
  },
  {
    name: 'rally_create_player',
    description: 'Add a new player to an org/team',
    inputSchema: z.object({
      org_id: z.string(),
      team_id: z.string().optional(),
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      jersey_number: z.string().optional(),
      position: z.string().optional(),
      bats: z.enum(['L','R','S']).optional(),
      throws: z.enum(['L','R']).optional(),
      grad_year: z.number().int().min(2020).max(2040).optional(),
      parent_email: z.string().email().optional(),
      parent_phone: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO players
           (id, org_id, team_id, first_name, last_name, jersey_number, position, bats, throws, grad_year, parent_email, parent_phone, active, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
        [input.org_id, input.team_id ?? null, input.first_name, input.last_name,
         input.jersey_number ?? null, input.position ?? null, input.bats ?? null,
         input.throws ?? null, input.grad_year ?? null, input.parent_email ?? null,
         input.parent_phone ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_update_player',
    description: 'Update player record fields',
    inputSchema: z.object({
      player_id: z.string(),
      team_id: z.string().optional(),
      jersey_number: z.string().optional(),
      position: z.string().optional(),
      bats: z.enum(['L','R','S']).optional(),
      throws: z.enum(['L','R']).optional(),
      grad_year: z.number().int().optional(),
      parent_email: z.string().email().optional(),
      parent_phone: z.string().optional(),
      active: z.boolean().optional(),
      recruiting_status: z.string().optional(),
    }),
    handler: ({ player_id, ...fields }: { player_id: string } & Record<string, unknown>) => {
      const allowed = ['team_id','jersey_number','position','bats','throws','grad_year',
                       'parent_email','parent_phone','active','recruiting_status'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k) && fields[k] !== undefined);
      if (updates.length === 0) return { updated: false };
      const set = updates.map(([k]) => `${k} = ?`).join(', ');
      run(`UPDATE players SET ${set}, updated_at = datetime('now') WHERE id = ?`,
        [...updates.map(([, v]) => v), player_id]);
      return { updated: true };
    },
  },
];
