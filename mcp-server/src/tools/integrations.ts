import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const integrationTools = [
  {
    name: 'rally_list_integrations',
    description: 'List configured third-party integrations for an org',
    inputSchema: z.object({ org_id: z.string() }),
    handler: ({ org_id }: { org_id: string }) =>
      rows('SELECT id, org_id, provider, status, last_sync_at, created_at FROM integrations WHERE org_id = ?', [org_id]),
  },
  {
    name: 'rally_get_integration_status',
    description: 'Get connection status and last sync time for a specific integration',
    inputSchema: z.object({
      org_id: z.string(),
      provider: z.enum(['gamechanger','band','usssa','ncs','nsa','stripe','custom']),
    }),
    handler: ({ org_id, provider }: { org_id: string; provider: string }) =>
      row('SELECT * FROM integrations WHERE org_id = ? AND provider = ?', [org_id, provider]),
  },
  {
    name: 'rally_upsert_integration',
    description: 'Add or update an integration configuration for an org',
    inputSchema: z.object({
      org_id: z.string(),
      provider: z.enum(['gamechanger','band','usssa','ncs','nsa','stripe','custom']),
      status: z.enum(['active','inactive','error']).default('active'),
      config_json: z.string().optional().describe('JSON config blob (no secrets)'),
      notes: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const existing = row<{ id: string }>(
        'SELECT id FROM integrations WHERE org_id = ? AND provider = ?',
        [input.org_id, input.provider]
      );
      if (existing) {
        run(
          `UPDATE integrations SET status=?, config_json=?, notes=?, updated_at=datetime('now') WHERE id=?`,
          [input.status, input.config_json ?? null, input.notes ?? null, existing.id]
        );
        return { action: 'updated', id: existing.id };
      }
      const result = run(
        `INSERT INTO integrations (id, org_id, provider, status, config_json, notes, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, datetime('now'))`,
        [input.org_id, input.provider, input.status, input.config_json ?? null, input.notes ?? null]
      );
      return { action: 'created', lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_list_branding_templates',
    description: 'List branding / communication templates available to an org',
    inputSchema: z.object({
      org_id: z.string(),
      template_type: z.enum(['email','band','flyer','certificate','all']).default('all'),
    }),
    handler: ({ org_id, template_type }: { org_id: string; template_type: string }) => {
      let sql = 'SELECT * FROM branding_templates WHERE (org_id = ? OR org_id IS NULL)';
      const params: unknown[] = [org_id];
      if (template_type !== 'all') { sql += ' AND template_type = ?'; params.push(template_type); }
      return rows(sql + ' ORDER BY template_type, name', params);
    },
  },
  {
    name: 'rally_get_branding_template',
    description: 'Get a branding/communication template with its full body content',
    inputSchema: z.object({ template_id: z.string() }),
    handler: ({ template_id }: { template_id: string }) =>
      row('SELECT * FROM branding_templates WHERE id = ?', [template_id]),
  },
];
