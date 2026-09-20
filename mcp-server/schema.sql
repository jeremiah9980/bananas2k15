-- RallyIQ / DugoutOS SQLite schema
-- Run once to create all tables: sqlite3 dev.db < schema.sql

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  city TEXT,
  state TEXT,
  age_group TEXT,
  circuit TEXT,
  head_coach TEXT,
  contact_email TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  season TEXT,
  age_group TEXT,
  head_coach_id TEXT,
  record_wins INTEGER DEFAULT 0,
  record_losses INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  team_id TEXT REFERENCES teams(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  jersey_number TEXT,
  position TEXT,
  bats TEXT CHECK(bats IN ('L','R','S')),
  throws TEXT CHECK(throws IN ('L','R')),
  grad_year INTEGER,
  parent_email TEXT,
  parent_phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  recruiting_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS player_stats (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  season TEXT NOT NULL,
  stat_type TEXT NOT NULL CHECK(stat_type IN ('batting','pitching','fielding')),
  games INTEGER DEFAULT 0,
  at_bats INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  doubles INTEGER DEFAULT 0,
  triples INTEGER DEFAULT 0,
  home_runs INTEGER DEFAULT 0,
  rbi INTEGER DEFAULT 0,
  walks INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  stolen_bases INTEGER DEFAULT 0,
  batting_avg REAL,
  on_base_pct REAL,
  slugging_pct REAL,
  innings_pitched REAL DEFAULT 0,
  earned_runs INTEGER DEFAULT 0,
  era REAL,
  strikeouts_pitched INTEGER DEFAULT 0,
  walks_allowed INTEGER DEFAULT 0,
  putouts INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  fielding_pct REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS player_notes (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  note_text TEXT NOT NULL,
  note_type TEXT NOT NULL DEFAULT 'general'
    CHECK(note_type IN ('development','behavioral','medical','recruiting','general')),
  authored_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS practices (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  practice_date TEXT NOT NULL,
  start_time TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 90,
  location TEXT,
  focus_areas TEXT,
  plan_notes TEXT,
  phase TEXT CHECK(phase IN ('preseason','regular','postseason','offseason')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  circuit TEXT NOT NULL DEFAULT 'other' CHECK(circuit IN ('USSSA','NCS','NSA','other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  city TEXT,
  state TEXT,
  venue_name TEXT,
  hotel_name TEXT,
  hotel_address TEXT,
  hotel_check_in TEXT,
  entry_fee REAL,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournament_games (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  opponent_name TEXT NOT NULL,
  game_date TEXT NOT NULL,
  game_time TEXT,
  game_type TEXT NOT NULL DEFAULT 'pool' CHECK(game_type IN ('pool','bracket','championship','consolation')),
  field_name TEXT,
  our_score INTEGER,
  opponent_score INTEGER,
  outcome TEXT CHECK(outcome IN ('W','L','T')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_results (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  tournament_id TEXT REFERENCES tournaments(id),
  opponent_name TEXT NOT NULL,
  game_date TEXT NOT NULL,
  our_score INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('W','L','T')),
  innings INTEGER NOT NULL DEFAULT 7,
  game_notes TEXT,
  season TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recruiting_pipeline (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  grad_year INTEGER,
  position TEXT,
  stage TEXT NOT NULL DEFAULT 'identified'
    CHECK(stage IN ('identified','contacted','evaluated','offered','committed','declined')),
  stage_notes TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tryout_candidates (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  season TEXT,
  age_group TEXT,
  position_interest TEXT,
  parent_name TEXT,
  parent_email TEXT,
  parent_phone TEXT,
  referral_source TEXT,
  evaluated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scout_reports (
  id TEXT PRIMARY KEY,
  authored_by TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  subject_type TEXT NOT NULL DEFAULT 'prospect' CHECK(subject_type IN ('prospect','opponent_player','our_player')),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  position TEXT,
  overall_grade TEXT CHECK(overall_grade IN ('A','B','C','D','F')),
  hitting_notes TEXT,
  fielding_notes TEXT,
  pitching_notes TEXT,
  intangibles_notes TEXT,
  recommendation TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  circuit TEXT NOT NULL DEFAULT 'other' CHECK(circuit IN ('USSSA','NCS','NSA','other')),
  age_group TEXT,
  home_city TEXT,
  home_state TEXT,
  coach_name TEXT,
  notes TEXT,
  roster_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS team_communications (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  channel TEXT NOT NULL DEFAULT 'band' CHECK(channel IN ('band','email','sms','announcement')),
  post_type TEXT NOT NULL DEFAULT 'general_update',
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_approval','sent','scheduled')),
  scheduled_at TEXT,
  authored_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  name TEXT NOT NULL,
  goal_amount REAL,
  raised_amount REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  donor_name TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'other',
  campaign_id TEXT REFERENCES campaigns(id),
  donor_email TEXT,
  donor_phone TEXT,
  is_anonymous INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  received_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  tier TEXT NOT NULL DEFAULT 'community' CHECK(tier IN ('platinum','gold','silver','bronze','community')),
  amount_committed REAL,
  amount_received REAL DEFAULT 0,
  season TEXT,
  logo_received INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  type TEXT NOT NULL CHECK(type IN ('revenue','expense')),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dues_status (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  family_name TEXT NOT NULL,
  player_id TEXT REFERENCES players(id),
  season TEXT,
  amount_due REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  waiver INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','error')),
  config_json TEXT,
  last_sync_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS branding_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  name TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK(template_type IN ('email','band','flyer','certificate')),
  subject TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT REFERENCES orgs(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin','director','coach','parent','viewer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  config_path TEXT,
  status TEXT NOT NULL CHECK(status IN ('success','failed','pending')),
  stdout TEXT,
  stderr TEXT,
  created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_players_team   ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_org    ON players(org_id);
CREATE INDEX IF NOT EXISTS idx_notes_player   ON player_notes(player_id);
CREATE INDEX IF NOT EXISTS idx_stats_player   ON player_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_games_team     ON game_results(team_id);
CREATE INDEX IF NOT EXISTS idx_tgames_tourn   ON tournament_games(tournament_id);
CREATE INDEX IF NOT EXISTS idx_comms_team     ON team_communications(team_id);
CREATE INDEX IF NOT EXISTS idx_donations_org  ON donations(org_id);
CREATE INDEX IF NOT EXISTS idx_sponsors_org   ON sponsors(org_id);
CREATE INDEX IF NOT EXISTS idx_deploys_org    ON deployments(org_id);
