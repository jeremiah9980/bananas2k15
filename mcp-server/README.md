# RallyIQ MCP Server

47 tools across 18 groups — connects Claude Desktop to the full DugoutOS / RallyIQ platform via SQLite + the rally-org-builder engine.

## Prerequisites

- Node.js ≥ 18
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- The RallyIQ database at the path in `RALLYIQ_DB_PATH`

## Setup

```bash
cd mcp-server
npm install      # compiles better-sqlite3 native addon (~30–60s first time)
npm run build    # TypeScript → dist/
```

If `npm install` fails on Apple Silicon: `arch -arm64 npm install`

## Database

Create the schema in a fresh SQLite file:

```bash
sqlite3 /path/to/dev.db < schema.sql
```

The default DB path the server looks for:

```
~/Documents/GitHub/rallyiq/prisma/prisma/dev.db
```

Override with the `RALLYIQ_DB_PATH` env var.

## Claude Desktop Config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rallyiq": {
      "command": "node",
      "args": [
        "/Users/jeremiahcargill/Documents/GitHub/rallyiq/mcp-server/dist/index.js"
      ],
      "env": {
        "RALLYIQ_DB_PATH": "/Users/jeremiahcargill/Documents/GitHub/rallyiq/prisma/prisma/dev.db",
        "RALLY_ENGINE_PATH": "/Users/jeremiahcargill/Documents/GitHub/rally-org-builder",
        "RALLY_DASHBOARD_REPO": "jeremiah9980/rally-dashboard",
        "RALLY_SLACK_TOKEN": "xoxb-YOUR-TOKEN-HERE",
        "RALLY_SLACK_CHANNEL": "#rally-deploys"
      }
    }
  }
}
```

Fully quit and reopen Claude Desktop after saving.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `RALLYIQ_DB_PATH` | Yes | Absolute path to the SQLite database |
| `RALLY_ENGINE_PATH` | Deployment tools only | Path to `rally-org-builder` repo |
| `RALLY_DASHBOARD_REPO` | Deployment tools only | GitHub repo slug |
| `RALLY_SLACK_TOKEN` | Optional | Slack bot token (`xoxb-…`) |
| `RALLY_SLACK_CHANNEL` | Optional | Slack channel for deploy notifications |

## Tools (47 total)

### Platform tools (37)

| Group | Tools |
|---|---|
| Orgs | `rally_list_orgs`, `rally_get_org`, `rally_create_org`, `rally_update_org` |
| Teams | `rally_list_teams`, `rally_get_team`, `rally_create_team`, `rally_update_team` |
| Players | `rally_list_players`, `rally_get_player`, `rally_create_player`, `rally_update_player` |
| Player Notes | `rally_list_player_notes`, `rally_add_player_note`, `rally_get_development_summary` |
| Practices | `rally_list_practices`, `rally_get_practice`, `rally_create_practice`, `rally_list_schedules` |
| Game Results | `rally_list_game_results`, `rally_record_game_result`, `rally_get_team_record` |
| Tournaments | `rally_list_tournaments`, `rally_get_tournament`, `rally_create_tournament`, `rally_log_tournament_game` |
| Recruiting | `rally_list_recruiting_pipeline`, `rally_get_recruit`, `rally_update_recruit_stage` |
| Tryouts | `rally_list_tryout_candidates`, `rally_add_tryout_candidate` |
| Scout Reports | `rally_create_scout_report` |
| Competitors | `rally_list_competitors`, `rally_get_competitor`, `rally_upsert_competitor` |
| Communications | `rally_list_communications`, `rally_create_communication`, `rally_approve_communication` |
| Financials | `rally_get_financial_summary`, `rally_get_dues_status`, `rally_list_campaigns`, `rally_record_donation`, `rally_list_sponsors`, `rally_add_sponsor` |
| Integrations | `rally_list_integrations`, `rally_get_integration_status`, `rally_upsert_integration` |
| Branding | `rally_list_branding_templates`, `rally_get_branding_template` |
| Users | `rally_list_users`, `rally_get_user`, `rally_upsert_user` |

### Deployment tools (10)

| Tool | Description |
|---|---|
| `rally_deploy_org` | Deploy org config via rally-org-builder |
| `rally_dry_run` | Dry-run validation before deploy |
| `rally_check_deployment` | Check deployment history for an org |
| `rally_list_deployments` | List all recent deployments |
| `rally_retrigger_deploy` | Retrigger last failed deploy |
| `rally_intake_to_config` | Convert intake form → config JSON |
| `rally_validate_config` | Validate config against schema |
| `rally_slack_notify` | Send custom Slack message |
| `rally_slack_deploy_update` | Structured deploy status to Slack |
| `rally_slack_webhook` | Trigger any Slack Incoming Webhook |

## Troubleshooting

**Tools not showing in Claude Desktop:**
- Validate JSON: `cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | python3 -m json.tool`
- Test server directly: `node dist/index.js` (should hang silently waiting on stdio — that's correct)

**`SQLITE_CANTOPEN`:**
```bash
ls ~/Documents/GitHub/rallyiq/prisma/prisma/dev.db
find ~/Documents/GitHub/rallyiq -name "*.db"
```
Update `RALLYIQ_DB_PATH` to the correct path.

**`better-sqlite3` binding error after Node upgrade:**
```bash
npm rebuild better-sqlite3 && npm run build
```

**Source-only changes (no new deps):**
```bash
npm run build   # no npm install needed
```
Then fully restart Claude Desktop.
