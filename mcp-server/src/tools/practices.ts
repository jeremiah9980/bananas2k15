import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const practiceTools = [
  {
    name: 'rally_list_practices',
    description: 'List scheduled practices for a team',
    inputSchema: z.object({
      team_id: z.string(),
      upcoming_only: z.boolean().default(true),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    handler: ({ team_id, upcoming_only, limit }: { team_id: string; upcoming_only: boolean; limit: number }) => {
      let sql = 'SELECT * FROM practices WHERE team_id = ?';
      const params: unknown[] = [team_id];
      if (upcoming_only) { sql += " AND practice_date >= date('now')"; }
      sql += ' ORDER BY practice_date ASC LIMIT ?';
      params.push(limit);
      return rows(sql, params);
    },
  },
  {
    name: 'rally_get_practice',
    description: 'Get full plan for a specific practice',
    inputSchema: z.object({ practice_id: z.string() }),
    handler: ({ practice_id }: { practice_id: string }) =>
      row('SELECT * FROM practices WHERE id = ?', [practice_id]),
  },
  {
    name: 'rally_create_practice',
    description: 'Create a practice session with an AI-generated or custom plan',
    inputSchema: z.object({
      team_id: z.string(),
      practice_date: z.string().describe('ISO date YYYY-MM-DD'),
      start_time: z.string().optional().describe('HH:MM 24h'),
      duration_minutes: z.number().int().min(30).max(240).default(90),
      location: z.string().optional(),
      focus_areas: z.array(z.string()).optional().describe('e.g. ["hitting","base running"]'),
      plan_notes: z.string().optional(),
      phase: z.enum(['preseason','regular','postseason','offseason']).optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const focus = Array.isArray(input.focus_areas)
        ? JSON.stringify(input.focus_areas)
        : null;
      const result = run(
        `INSERT INTO practices
           (id, team_id, practice_date, start_time, duration_minutes, location, focus_areas, plan_notes, phase, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.team_id, input.practice_date, input.start_time ?? null,
         input.duration_minutes, input.location ?? null, focus,
         input.plan_notes ?? null, input.phase ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_list_schedules',
    description: 'List the full season schedule (practices + tournaments) for a team',
    inputSchema: z.object({
      team_id: z.string(),
      from_date: z.string().optional().describe('ISO date'),
      to_date: z.string().optional().describe('ISO date'),
    }),
    handler: ({ team_id, from_date, to_date }: { team_id: string; from_date?: string; to_date?: string }) => {
      let pSql = 'SELECT *, "practice" as event_type FROM practices WHERE team_id = ?';
      let tSql = 'SELECT *, "tournament" as event_type FROM tournaments WHERE team_id = ?';
      const params: unknown[] = [team_id];
      if (from_date) {
        pSql += ' AND practice_date >= ?'; tSql += ' AND start_date >= ?';
        params.push(from_date);
      }
      if (to_date) {
        pSql += ' AND practice_date <= ?'; tSql += ' AND end_date <= ?';
        params.push(to_date);
      }
      const practices = rows(pSql, params);
      const tournaments = rows(tSql, params);
      return { practices, tournaments };
    },
  },
];
