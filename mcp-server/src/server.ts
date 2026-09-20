import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { orgTools } from './tools/orgs.js';
import { teamTools } from './tools/teams.js';
import { playerTools } from './tools/players.js';
import { playerNoteTools } from './tools/player-notes.js';
import { practiceTools } from './tools/practices.js';
import { gameResultTools } from './tools/game-results.js';
import { tournamentTools } from './tools/tournaments.js';
import { recruitingTools } from './tools/recruiting.js';
import { competitorTools } from './tools/competitors.js';
import { communicationTools } from './tools/communications.js';
import { financialTools } from './tools/financials.js';
import { integrationTools } from './tools/integrations.js';
import { userTools } from './tools/users.js';
import { deploymentTools } from './tools/deployment.js';

type ToolDef = {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (input: Record<string, unknown>) => unknown;
};

const ALL_TOOLS: ToolDef[] = [
  ...orgTools,
  ...teamTools,
  ...playerTools,
  ...playerNoteTools,
  ...practiceTools,
  ...gameResultTools,
  ...tournamentTools,
  ...recruitingTools,
  ...competitorTools,
  ...communicationTools,
  ...financialTools,
  ...integrationTools,
  ...userTools,
  ...deploymentTools,
] as ToolDef[];

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'rallyiq-mcp-server',
    version: '1.0.0',
  });

  for (const tool of ALL_TOOLS) {
    server.tool(
      tool.name,
      tool.description,
      tool.inputSchema.shape,
      async (input: Record<string, unknown>) => {
        try {
          const parsed = tool.inputSchema.parse(input);
          const result = await Promise.resolve(tool.handler(parsed));
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: 'text' as const, text: `Error: ${msg}` }],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

export { ALL_TOOLS };
