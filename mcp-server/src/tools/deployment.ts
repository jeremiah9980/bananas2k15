import { z } from 'zod';
import { execSync, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import https from 'https';
import { rows, run } from '../db/client.js';

const ENGINE_PATH = process.env.RALLY_ENGINE_PATH
  ?? path.join(process.env.HOME ?? '~', 'Documents/GitHub/rally-org-builder');

const DASHBOARD_REPO = process.env.RALLY_DASHBOARD_REPO ?? 'jeremiah9980/rally-dashboard';
const SLACK_TOKEN = process.env.RALLY_SLACK_TOKEN ?? '';
const SLACK_CHANNEL = process.env.RALLY_SLACK_CHANNEL ?? '#rally-deploys';

function runEngine(args: string[]): { stdout: string; stderr: string; code: number } {
  const result = spawnSync('node', [path.join(ENGINE_PATH, 'dist/cli.js'), ...args], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    code: result.status ?? 1,
  };
}

function sendSlack(text: string): boolean {
  if (!SLACK_TOKEN) return false;
  try {
    const body = JSON.stringify({ channel: SLACK_CHANNEL, text });
    const req = https.request({
      hostname: 'slack.com',
      path: '/api/chat.postMessage',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SLACK_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    });
    req.write(body);
    req.end();
    return true;
  } catch {
    return false;
  }
}

export const deploymentTools = [
  {
    name: 'rally_deploy_org',
    description: 'Deploy an org config to the rally-org-builder engine and trigger GitHub Actions',
    inputSchema: z.object({
      org_id: z.string(),
      config_path: z.string().optional().describe('Path to org config JSON, defaults to auto-resolve'),
      force: z.boolean().default(false).describe('Skip dry-run safety check'),
      notify_slack: z.boolean().default(true),
    }),
    handler: ({ org_id, config_path, force, notify_slack }:
      { org_id: string; config_path?: string; force: boolean; notify_slack: boolean }) => {
      const cfgPath = config_path ?? path.join(ENGINE_PATH, `configs/${org_id}.json`);
      if (!fs.existsSync(cfgPath)) {
        return { success: false, error: `Config not found: ${cfgPath}` };
      }
      if (!force) {
        const dry = runEngine(['deploy', '--dry-run', '--config', cfgPath]);
        if (dry.code !== 0) {
          return { success: false, phase: 'dry_run', stdout: dry.stdout, stderr: dry.stderr };
        }
      }
      const result = runEngine(['deploy', '--config', cfgPath]);
      const success = result.code === 0;
      run(
        `INSERT INTO deployments (id, org_id, config_path, status, stdout, stderr, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, datetime('now'))`,
        [org_id, cfgPath, success ? 'success' : 'failed', result.stdout, result.stderr]
      );
      if (notify_slack) sendSlack(`rally_deploy_org ${org_id}: ${success ? '✅ deployed' : '❌ failed'}`);
      return { success, stdout: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: 'rally_dry_run',
    description: 'Run a dry-run deployment to validate config without making changes',
    inputSchema: z.object({
      org_id: z.string(),
      config_path: z.string().optional(),
    }),
    handler: ({ org_id, config_path }: { org_id: string; config_path?: string }) => {
      const cfgPath = config_path ?? path.join(ENGINE_PATH, `configs/${org_id}.json`);
      const result = runEngine(['deploy', '--dry-run', '--config', cfgPath]);
      return { passed: result.code === 0, stdout: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: 'rally_check_deployment',
    description: 'Check the current deployment status for an org',
    inputSchema: z.object({ org_id: z.string() }),
    handler: ({ org_id }: { org_id: string }) =>
      rows(
        'SELECT * FROM deployments WHERE org_id = ? ORDER BY created_at DESC LIMIT 5',
        [org_id]
      ),
  },
  {
    name: 'rally_list_deployments',
    description: 'List all recent deployments across orgs',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).default(20),
      status: z.enum(['success','failed','pending']).optional(),
    }),
    handler: ({ limit, status }: { limit: number; status?: string }) => {
      let sql = 'SELECT * FROM deployments WHERE 1=1';
      const params: unknown[] = [];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      return rows(sql + ' ORDER BY created_at DESC LIMIT ?', [...params, limit]);
    },
  },
  {
    name: 'rally_retrigger_deploy',
    description: 'Retrigger the last failed deployment for an org',
    inputSchema: z.object({
      org_id: z.string(),
      notify_slack: z.boolean().default(true),
    }),
    handler: ({ org_id, notify_slack }: { org_id: string; notify_slack: boolean }) => {
      const last = rows<{ config_path: string }>(
        'SELECT config_path FROM deployments WHERE org_id = ? ORDER BY created_at DESC LIMIT 1',
        [org_id]
      );
      if (!last.length) return { success: false, error: 'No prior deployment found' };
      const cfgPath = last[0].config_path;
      const result = runEngine(['deploy', '--config', cfgPath]);
      const success = result.code === 0;
      run(
        `INSERT INTO deployments (id, org_id, config_path, status, stdout, stderr, created_at)
         VALUES (lower(hex(randomblob(8))), ?, ?, ?, ?, ?, datetime('now'))`,
        [org_id, cfgPath, success ? 'success' : 'failed', result.stdout, result.stderr]
      );
      if (notify_slack) sendSlack(`rally_retrigger_deploy ${org_id}: ${success ? '✅ succeeded' : '❌ still failing'}`);
      return { success, stdout: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: 'rally_intake_to_config',
    description: 'Convert an intake form payload into a rally-org-builder config JSON',
    inputSchema: z.object({
      intake_json: z.string().describe('JSON string of the intake form submission'),
      output_path: z.string().optional().describe('Where to write the generated config'),
    }),
    handler: ({ intake_json, output_path }: { intake_json: string; output_path?: string }) => {
      let intake: unknown;
      try { intake = JSON.parse(intake_json); } catch { return { success: false, error: 'Invalid JSON' }; }
      const result = runEngine(['intake-to-config', '--input', '-']);
      if (result.code !== 0) return { success: false, stderr: result.stderr };
      if (output_path) {
        fs.mkdirSync(path.dirname(output_path), { recursive: true });
        fs.writeFileSync(output_path, result.stdout);
      }
      return { success: true, config: result.stdout, written_to: output_path ?? null };
    },
  },
  {
    name: 'rally_validate_config',
    description: 'Validate an org config JSON against the rally-org-builder schema',
    inputSchema: z.object({
      config_path: z.string().describe('Absolute path to the config JSON file'),
    }),
    handler: ({ config_path }: { config_path: string }) => {
      if (!fs.existsSync(config_path)) {
        return { valid: false, error: `File not found: ${config_path}` };
      }
      const result = runEngine(['validate', '--config', config_path]);
      return { valid: result.code === 0, stdout: result.stdout, stderr: result.stderr };
    },
  },
  {
    name: 'rally_slack_notify',
    description: 'Send a custom Slack notification to the rally deploys channel',
    inputSchema: z.object({
      message: z.string().min(1),
      channel: z.string().optional().describe('Override channel, defaults to RALLY_SLACK_CHANNEL env'),
    }),
    handler: ({ message, channel }: { message: string; channel?: string }) => {
      if (!SLACK_TOKEN) return { sent: false, reason: 'RALLY_SLACK_TOKEN not configured' };
      const target = channel ?? SLACK_CHANNEL;
      const sent = sendSlack(message);
      return { sent, channel: target };
    },
  },
  {
    name: 'rally_slack_deploy_update',
    description: 'Post a structured deploy status update to Slack (org name, status, timestamp)',
    inputSchema: z.object({
      org_id: z.string(),
      status: z.enum(['started','success','failed','skipped']),
      details: z.string().optional(),
    }),
    handler: ({ org_id, status, details }: { org_id: string; status: string; details?: string }) => {
      const emoji = { started: '🚀', success: '✅', failed: '❌', skipped: '⏭️' }[status] ?? '🔔';
      const ts = new Date().toISOString();
      const msg = `${emoji} *Deploy ${status.toUpperCase()}* — org: \`${org_id}\` @ ${ts}${details ? `\n>${details}` : ''}`;
      const sent = sendSlack(msg);
      return { sent, message: msg };
    },
  },
  {
    name: 'rally_slack_webhook',
    description: 'Trigger a Slack Incoming Webhook URL with a custom payload',
    inputSchema: z.object({
      webhook_url: z.string().url(),
      text: z.string().min(1),
      username: z.string().optional().default('RallyIQ'),
      icon_emoji: z.string().optional().default(':softball:'),
    }),
    handler: ({ webhook_url, text, username, icon_emoji }:
      { webhook_url: string; text: string; username?: string; icon_emoji?: string }) => {
      try {
        const body = JSON.stringify({ text, username, icon_emoji });
        const url = new URL(webhook_url);
        const req = https.request({
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        });
        req.write(body);
        req.end();
        return { sent: true };
      } catch (e) {
        return { sent: false, error: String(e) };
      }
    },
  },
];
