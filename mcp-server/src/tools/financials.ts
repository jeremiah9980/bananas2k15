import { z } from 'zod';
import { rows, row, run } from '../db/client.js';

export const financialTools = [
  {
    name: 'rally_get_financial_summary',
    description: 'Get financial summary: balance, revenue by category, expenses, YTD vs budget',
    inputSchema: z.object({
      org_id: z.string(),
      period: z.enum(['month','quarter','ytd','all']).default('ytd'),
    }),
    handler: (input: Record<string, unknown>) => {
      const dateFilter: Record<string, string> = {
        month: "AND date >= date('now', 'start of month')",
        quarter: "AND date >= date('now', '-3 months')",
        ytd: "AND date >= date('now', 'start of year')",
        all: '',
      };
      const filter = dateFilter[input.period as string];
      const revenue = rows(
        `SELECT category, SUM(amount) as total FROM transactions WHERE org_id = ? AND type = 'revenue' ${filter} GROUP BY category`,
        [input.org_id]
      );
      const expenses = rows(
        `SELECT category, SUM(amount) as total FROM transactions WHERE org_id = ? AND type = 'expense' ${filter} GROUP BY category`,
        [input.org_id]
      );
      const totals = row<{ revenue: number; expenses: number }>(
        `SELECT SUM(CASE WHEN type='revenue' THEN amount ELSE 0 END) as revenue,
                SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expenses
         FROM transactions WHERE org_id = ? ${filter}`,
        [input.org_id]
      );
      return { period: input.period, revenue_breakdown: revenue, expense_breakdown: expenses, totals };
    },
  },
  {
    name: 'rally_get_dues_status',
    description: 'Per-family dues payment status with amounts owed, paid, and waiver flags',
    inputSchema: z.object({
      org_id: z.string(),
      season: z.string().optional(),
      include_waivers: z.boolean().default(true),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM dues_status WHERE org_id = ?';
      const params: unknown[] = [input.org_id];
      if (input.season) { sql += ' AND season = ?'; params.push(input.season); }
      if (!input.include_waivers) { sql += ' AND waiver = 0'; }
      return rows(sql + ' ORDER BY family_name', params);
    },
  },
  {
    name: 'rally_list_campaigns',
    description: 'List fundraising campaigns for an org',
    inputSchema: z.object({
      org_id: z.string(),
      active_only: z.boolean().default(false),
    }),
    handler: ({ org_id, active_only }: { org_id: string; active_only: boolean }) => {
      let sql = 'SELECT * FROM campaigns WHERE org_id = ?';
      const params: unknown[] = [org_id];
      if (active_only) { sql += ' AND status = "active"'; }
      return rows(sql + ' ORDER BY created_at DESC', params);
    },
  },
  {
    name: 'rally_record_donation',
    description: 'Record an incoming donation with donor info and campaign attribution',
    inputSchema: z.object({
      org_id: z.string(),
      donor_name: z.string().min(1),
      amount: z.number().positive(),
      method: z.enum(['check','cash','venmo','zelle','paypal','card','other']).default('other'),
      campaign_id: z.string().optional(),
      donor_email: z.string().email().optional(),
      donor_phone: z.string().optional(),
      is_anonymous: z.boolean().default(false),
      notes: z.string().optional(),
      received_date: z.string().optional().describe('ISO date, defaults to today'),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO donations
           (id, org_id, donor_name, amount, method, campaign_id, donor_email, donor_phone, is_anonymous, notes, received_date, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, coalesce(?, date('now')), datetime('now'))`,
        [input.org_id, input.donor_name, input.amount, input.method,
         input.campaign_id ?? null, input.donor_email ?? null, input.donor_phone ?? null,
         input.is_anonymous ? 1 : 0, input.notes ?? null, input.received_date ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
  {
    name: 'rally_list_sponsors',
    description: 'List sponsors for an org with tier, amount, and fulfillment status',
    inputSchema: z.object({
      org_id: z.string(),
      season: z.string().optional(),
      tier: z.enum(['platinum','gold','silver','bronze','community']).optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      let sql = 'SELECT * FROM sponsors WHERE org_id = ?';
      const params: unknown[] = [input.org_id];
      if (input.season) { sql += ' AND season = ?'; params.push(input.season); }
      if (input.tier) { sql += ' AND tier = ?'; params.push(input.tier); }
      return rows(sql + ' ORDER BY tier, company_name', params);
    },
  },
  {
    name: 'rally_add_sponsor',
    description: 'Add a new sponsor commitment to an org',
    inputSchema: z.object({
      org_id: z.string(),
      company_name: z.string().min(1),
      contact_name: z.string().optional(),
      contact_email: z.string().email().optional(),
      tier: z.enum(['platinum','gold','silver','bronze','community']).default('community'),
      amount_committed: z.number().positive().optional(),
      amount_received: z.number().default(0),
      season: z.string().optional(),
      logo_received: z.boolean().default(false),
      notes: z.string().optional(),
    }),
    handler: (input: Record<string, unknown>) => {
      const result = run(
        `INSERT INTO sponsors
           (id, org_id, company_name, contact_name, contact_email, tier, amount_committed, amount_received, season, logo_received, notes, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [input.org_id, input.company_name, input.contact_name ?? null, input.contact_email ?? null,
         input.tier, input.amount_committed ?? null, input.amount_received,
         input.season ?? null, input.logo_received ? 1 : 0, input.notes ?? null]
      );
      return { created: true, lastInsertRowid: result.lastInsertRowid };
    },
  },
];
