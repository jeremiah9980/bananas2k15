import { z } from 'zod';
import { rows, run } from '../db/client.js';

export const gameResultTools = [
  {
    name: 'rally_list_game_results',
    description: 'List game results for a team with W/L record',
    inputSchema: z.object({
      team_id: z.string(),
      tournament_id: z.string().optional(),
      season: z.string().optional(),
      limit: z.number().int().default(20),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM game_results WHERE team_id = ?';
      const params: unknown[] = [input.team_id];
      if (input.tournament_id) { sql += ' AND tournament_id = ?'; params.push(input.tournament_id); }
      if (input.season) { sql += ' AND season = ?'; params.push(input.season); }
      sql += ' ORDER BY game_date DESC LIMIT ?';
      params.push(input.limit);
      return rows(sql, params);
    },
  },
  {
    name: 'rally_record_game_result',
    description: 'Record the result of a completed game',
    inputSchema: z.object({
      team_id: z.string(),
      tournament_id: z.string().optional(),
      opponent_name: z.string().min(1),
      game_date: z.string().describe('ISO date'),
      our_score: z.number().int().min(0),
      opponent_score: z.number().int().min(0),
      innings: z.number().int().min(1).max(15).default(7),
      game_notes: z.string().optional(),
      season: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const outcome = (input.our_score as number) > (input.opponent_score as number) ? 'W'
        : (input.our_score as number) < (input.opponent_score as number) ? 'L' : 'T';
      const result = run(
        `INSERT INTO game_results
           (id, team_id, tournament_id, opponent_name, game_date, our_score, opponent_score, outcome, innings, game_notes, season, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.team_id, input.tournament_id ?? null, input.opponent_name,
         input.game_date, input.our_score, input.opponent_score, outcome,
         input.innings, input.game_notes ?? null, input.season ?? null]
      );
      return { created: true, outcome, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_get_team_record',
    description: 'Get overall W-L-T record for a team, optionally filtered by season',
    inputSchema: z.object({
      team_id: z.string(),
      season: z.string().optional(),
    }),
    handler: ({ team_id, season }: { team_id: string; season?: string }) => {
      let sql = `SELECT outcome, COUNT(*) as count FROM game_results WHERE team_id = ?`;
      const params: unknown[] = [team_id];
      if (season) { sql += ' AND season = ?'; params.push(season); }
      sql += ' GROUP BY outcome';
      const counts = rows<{ outcome: string; count: number }>(sql, params);
      const record = { W: 0, L: 0, T: 0 };
      counts.forEach(r => { record[r.outcome as keyof typeof record] = r.count; });
      return record;
    },
  },
];
