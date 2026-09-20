import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const recruitingTools = [
  {
    name: 'rally_list_recruiting_pipeline',
    description: 'List all prospects in the recruiting pipeline',
    inputSchema: z.object({
      org_id: z.string(),
      stage: z.enum(['identified','contacted','evaluated','offered','committed','declined']).optional(),
      grad_year: z.number().int().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM recruiting_pipeline WHERE org_id = ?';
      const params: unknown[] = [input.org_id];
      if (input.stage) { sql += ' AND stage = ?'; params.push(input.stage); }
      if (input.grad_year) { sql += ' AND grad_year = ?'; params.push(input.grad_year); }
      return rows(sql + ' ORDER BY last_name', params);
    },
  },
  {
    name: 'rally_get_recruit',
    description: 'Get full profile for a recruiting prospect',
    inputSchema: z.object({ recruit_id: z.string() }),
    handler: ({ recruit_id }: { recruit_id: string }) =>
      row('SELECT * FROM recruiting_pipeline WHERE id = ?', [recruit_id]),
  },
  {
    name: 'rally_update_recruit_stage',
    description: 'Advance or update the stage of a recruiting prospect',
    inputSchema: z.object({
      recruit_id: z.string(),
      stage: z.enum(['identified','contacted','evaluated','offered','committed','declined']),
      notes: z.string().optional(),
    }),
    handler: ({ recruit_id, stage, notes }: { recruit_id: string; stage: string; notes?: string }) => {
      run(
        `UPDATE recruiting_pipeline SET stage = ?, stage_notes = ?, updated_at = datetime('now') WHERE id = ?`,
        [stage, notes ?? null, recruit_id]
      );
      return { updated: true, stage };
    },
  },
  {
    name: 'rally_list_tryout_candidates',
    description: 'List tryout candidates for an upcoming season',
    inputSchema: z.object({
      org_id: z.string(),
      season: z.string().optional(),
      evaluated: z.boolean().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM tryout_candidates WHERE org_id = ?';
      const params: unknown[] = [input.org_id];
      if (input.season) { sql += ' AND season = ?'; params.push(input.season); }
      if (input.evaluated !== undefined) {
        sql += ' AND evaluated = ?';
        params.push(input.evaluated ? 1 : 0);
      }
      return rows(sql + ' ORDER BY last_name', params);
    },
  },
  {
    name: 'rally_add_tryout_candidate',
    description: 'Register a player as a tryout candidate',
    inputSchema: z.object({
      org_id: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      season: z.string().optional(),
      age_group: z.string().optional(),
      position_interest: z.string().optional(),
      parent_name: z.string().optional(),
      parent_email: z.string().email().optional(),
      parent_phone: z.string().optional(),
      referral_source: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO tryout_candidates
           (id, org_id, first_name, last_name, season, age_group, position_interest, parent_name, parent_email, parent_phone, referral_source, evaluated, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`,
        [input.org_id, input.first_name, input.last_name, input.season ?? null,
         input.age_group ?? null, input.position_interest ?? null, input.parent_name ?? null,
         input.parent_email ?? null, input.parent_phone ?? null, input.referral_source ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_create_scout_report',
    description: 'Create a scouting report on a player or prospect',
    inputSchema: z.object({
      authored_by: z.string(),
      subject_name: z.string(),
      subject_type: z.enum(['prospect','opponent_player','our_player']).default('prospect'),
      org_id: z.string(),
      position: z.string().optional(),
      overall_grade: z.enum(['A','B','C','D','F']).optional(),
      hitting_notes: z.string().optional(),
      fielding_notes: z.string().optional(),
      pitching_notes: z.string().optional(),
      intangibles_notes: z.string().optional(),
      recommendation: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO scout_reports
           (id, authored_by, subject_name, subject_type, org_id, position, overall_grade, hitting_notes, fielding_notes, pitching_notes, intangibles_notes, recommendation, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.authored_by, input.subject_name, input.subject_type, input.org_id,
         input.position ?? null, input.overall_grade ?? null, input.hitting_notes ?? null,
         input.fielding_notes ?? null, input.pitching_notes ?? null,
         input.intangibles_notes ?? null, input.recommendation ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
];
