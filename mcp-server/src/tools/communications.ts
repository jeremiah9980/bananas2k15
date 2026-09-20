import { z } from 'zod';
import { rows, run } from '../db/client.js';

export const communicationTools = [
  {
    name: 'rally_list_communications',
    description: 'List team communications (BAND posts, emails, announcements)',
    inputSchema: z.object({
      team_id: z.string(),
      status: z.enum(['draft','pending_approval','sent','scheduled']).optional(),
      limit: z.number().int().default(20),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM team_communications WHERE team_id = ?';
      const params: unknown[] = [input.team_id];
      if (input.status) { sql += ' AND status = ?'; params.push(input.status); }
      return rows(sql + ' ORDER BY created_at DESC LIMIT ?', [...params, input.limit]);
    },
  },
  {
    name: 'rally_create_communication',
    description: 'Draft a team communication — BAND post, email, or announcement',
    inputSchema: z.object({
      team_id: z.string(),
      channel: z.enum(['band','email','sms','announcement']).default('band'),
      post_type: z.enum([
        'practice_reminder','game_day','cancellation','fundraiser',
        'milestone','general_update','tournament_info','tryout_announcement',
      ]).default('general_update'),
      subject: z.string().optional(),
      body: z.string().min(1),
      scheduled_at: z.string().optional().describe('ISO datetime for scheduled send'),
      authored_by: z.string(),
    }),
    handler: (input: Record<string, unknown>) => {
      const status = input.scheduled_at ? 'scheduled' : 'draft';
      const result = run(
        `INSERT INTO team_communications
           (id, team_id, channel, post_type, subject, body, status, scheduled_at, authored_by, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.team_id, input.channel, input.post_type, input.subject ?? null,
         input.body, status, input.scheduled_at ?? null, input.authored_by]
      );
      return { created: true, status, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_approve_communication',
    description: 'Mark a drafted communication as approved for sending',
    inputSchema: z.object({
      comm_id: z.string(),
      approved_by: z.string(),
    }),
    handler: ({ comm_id, approved_by }: { comm_id: string; approved_by: string }) => {
      run(
        `UPDATE team_communications SET status = 'pending_approval', approved_by = ?, approved_at = datetime('now') WHERE id = ?`,
        [approved_by, comm_id]
      );
      return { approved: true };
    },
  },
];
