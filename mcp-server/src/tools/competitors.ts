import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const competitorTools = [
  {
    name: 'rally_list_competitors',
    description: 'List known competitor teams tracked by the org',
    inputSchema: z.object({
      org_id: z.string(),
      circuit: z.enum(['USSSA','NCS','NSA','all']).default('all'),
      age_group: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM competitors WHERE org_id = ?';
      const params: unknown[] = [input.org_id];
      if (input.circuit !== 'all') { sql += ' AND circuit = ?'; params.push(input.circuit); }
      if (input.age_group) { sql += ' AND age_group = ?'; params.push(input.age_group); }
      return rows(sql + ' ORDER BY name', params);
    },
  },
  {
    name: 'rally_get_competitor',
    description: 'Get competitor profile with known roster and game history against us',
    inputSchema: z.object({
      competitor_id: z.string(),
      team_id: z.string().optional().describe('Our team id to pull head-to-head record'),
    }),
    handler: ({ competitor_id, team_id }: { competitor_id: string; team_id?: string }) => {
      const competitor = row('SELECT * FROM competitors WHERE id = ?', [competitor_id]);
      if (!competitor) return null;
      let h2h = null;
      if (team_id) {
        h2h = rows(
          `SELECT * FROM game_results WHERE team_id = ? AND opponent_name = (SELECT name FROM competitors WHERE id = ?)
           ORDER BY game_date DESC LIMIT 10`,
          [team_id, competitor_id]
        );
      }
      return { ...competitor as object, head_to_head: h2h };
    },
  },
  {
    name: 'rally_upsert_competitor',
    description: 'Add or update a competitor team in the intelligence database',
    inputSchema: z.object({
      org_id: z.string(),
      name: z.string(),
      circuit: z.enum(['USSSA','NCS','NSA','other']).default('other'),
      age_group: z.string().optional(),
      home_city: z.string().optional(),
      home_state: z.string().length(2).optional(),
      coach_name: z.string().optional(),
      notes: z.string().optional(),
      roster_json: z.string().optional().describe('JSON array of player names'),
    }),
    handler: (input: Record<string, unknown>) => {
      const existing = row<{ id: string }>(
        'SELECT id FROM competitors WHERE org_id = ? AND name = ?',
        [input.org_id, input.name]
      );
      if (existing) {
        run(
          `UPDATE competitors SET circuit=?, age_group=?, home_city=?, home_state=?, coach_name=?, notes=?, roster_json=?, updated_at=datetime('now') WHERE id=?`,
          [input.circuit, input.age_group ?? null, input.home_city ?? null, input.home_state ?? null,
           input.coach_name ?? null, input.notes ?? null, input.roster_json ?? null, existing.id]
        );
        return { action: 'updated', id: existing.id };
      }
      const result = run(
        `INSERT INTO competitors (id, org_id, name, circuit, age_group, home_city, home_state, coach_name, notes, roster_json, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.org_id, input.name, input.circuit, input.age_group ?? null, input.home_city ?? null,
         input.home_state ?? null, input.coach_name ?? null, input.notes ?? null, input.roster_json ?? null]
      );
      return { action: 'created', lastInsertRowid: result.lastInsertRowid };
    },
  },
];
