import { z } from 'zod';
import { rows, run } from '../db/client.js';

export const playerNoteTools = [
  {
    name: 'rally_list_player_notes',
    description: 'List coaching notes for a player',
    inputSchema: z.object({
      player_id: z.string(),
      note_type: z.enum(['development','behavioral','medical','recruiting','general']).optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    handler: ({ player_id, note_type, limit }: { player_id: string; note_type?: string; limit: number }) => {
      let sql = 'SELECT * FROM player_notes WHERE player_id = ?';
      const params: unknown[] = [player_id];
      if (note_type) { sql += ' AND note_type = ?'; params.push(note_type); }
      sql += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);
      return rows(sql, params);
    },
  },
  {
    name: 'rally_add_player_note',
    description: 'Append a coaching note to a player record',
    inputSchema: z.object({
      player_id: z.string(),
      note_text: z.string().min(1),
      note_type: z.enum(['development','behavioral','medical','recruiting','general']).default('general'),
      authored_by: z.string().describe('Coach name or user ID'),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO player_notes (id, player_id, note_text, note_type, authored_by, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, datetime('now'))`,
        [input.player_id, input.note_text, input.note_type, input.authored_by]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_get_development_summary',
    description: 'Get an AI-friendly development summary for a player: recent notes, stat trends, focus areas',
    inputSchema: z.object({
      player_id: z.string(),
      season: z.string().optional(),
    }),
    handler: ({ player_id, season }: { player_id: string; season?: string }) => {
      const notes = rows(
        `SELECT * FROM player_notes WHERE player_id = ? AND note_type = 'development'
         ORDER BY created_at DESC LIMIT 10`,
        [player_id]
      );
      let statSql = 'SELECT * FROM player_stats WHERE player_id = ?';
      const p: unknown[] = [player_id];
      if (season) { statSql += ' AND season = ?'; p.push(season); }
      statSql += ' ORDER BY season DESC LIMIT 3';
      const stats = rows(statSql, p);
      return { development_notes: notes, recent_stats: stats };
    },
  },
];
