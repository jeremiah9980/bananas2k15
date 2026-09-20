import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const tournamentTools = [
  {
    name: 'rally_list_tournaments',
    description: 'List tournaments for a team or org',
    inputSchema: z.object({
      team_id: z.string().optional(),
      org_id: z.string().optional(),
      upcoming_only: z.boolean().default(false),
      circuit: z.enum(['USSSA','NCS','NSA','other']).optional(),
      limit: z.number().int().default(20),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM tournaments WHERE 1=1';
      const params: unknown[] = [];
      if (input.team_id)  { sql += ' AND team_id = ?';  params.push(input.team_id); }
      if (input.org_id)   { sql += ' AND org_id = ?';   params.push(input.org_id); }
      if (input.circuit)  { sql += ' AND circuit = ?';  params.push(input.circuit); }
      if (input.upcoming_only) { sql += " AND start_date >= date('now')"; }
      sql += ' ORDER BY start_date DESC LIMIT ?';
      params.push(input.limit);
      return rows(sql, params);
    },
  },
  {
    name: 'rally_get_tournament',
    description: 'Get full tournament details including hotel, field, and schedule info',
    inputSchema: z.object({ tournament_id: z.string() }),
    handler: ({ tournament_id }: { tournament_id: string }) => {
      const tournament = row('SELECT * FROM tournaments WHERE id = ?', [tournament_id]);
      if (!tournament) return null;
      const games = rows('SELECT * FROM tournament_games WHERE tournament_id = ? ORDER BY game_time', [tournament_id]);
      return { ...tournament as object, games };
    },
  },
  {
    name: 'rally_create_tournament',
    description: 'Add a tournament to a team schedule',
    inputSchema: z.object({
      team_id: z.string(),
      org_id: z.string(),
      name: z.string().min(1),
      circuit: z.enum(['USSSA','NCS','NSA','other']).default('other'),
      start_date: z.string().describe('ISO date'),
      end_date: z.string().describe('ISO date'),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      venue_name: z.string().optional(),
      hotel_name: z.string().optional(),
      hotel_address: z.string().optional(),
      hotel_check_in: z.string().optional(),
      entry_fee: z.number().optional(),
      notes: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO tournaments
           (id, team_id, org_id, name, circuit, start_date, end_date, city, state, venue_name, hotel_name, hotel_address, hotel_check_in, entry_fee, notes, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.team_id, input.org_id, input.name, input.circuit,
         input.start_date, input.end_date, input.city ?? null, input.state ?? null,
         input.venue_name ?? null, input.hotel_name ?? null, input.hotel_address ?? null,
         input.hotel_check_in ?? null, input.entry_fee ?? null, input.notes ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_log_tournament_game',
    description: 'Log a single game within a tournament (bracket game, pool play, etc.)',
    inputSchema: z.object({
      tournament_id: z.string(),
      team_id: z.string(),
      opponent_name: z.string(),
      game_date: z.string(),
      game_time: z.string().optional(),
      game_type: z.enum(['pool','bracket','championship','consolation']).default('pool'),
      field_name: z.string().optional(),
      our_score: z.number().int().min(0).optional(),
      opponent_score: z.number().int().min(0).optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const outcome = input.our_score !== undefined && input.opponent_score !== undefined
        ? ((input.our_score as number) > (input.opponent_score as number) ? 'W'
          : (input.our_score as number) < (input.opponent_score as number) ? 'L' : 'T')
        : null;
      const result = run(
        `INSERT INTO tournament_games
           (id, tournament_id, team_id, opponent_name, game_date, game_time, game_type, field_name, our_score, opponent_score, outcome, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.tournament_id, input.team_id, input.opponent_name, input.game_date,
         input.game_time ?? null, input.game_type, input.field_name ?? null,
         input.our_score ?? null, input.opponent_score ?? null, outcome]
      );
      return { created: true, outcome, lastInsertRowid: result.lastInsertRowid };
    },
  },
];
