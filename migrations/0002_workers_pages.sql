CREATE TABLE IF NOT EXISTS page_projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_projects_owner_slug ON page_projects(owner_id,slug);
CREATE TABLE IF NOT EXISTS page_files (
  project_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT 'text/plain',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(project_id,path)
);
CREATE TABLE IF NOT EXISTS compilation_logos (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS page_deployments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  url TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_files_project ON page_files(project_id);
CREATE INDEX IF NOT EXISTS idx_compilation_logos_project ON compilation_logos(project_id);
CREATE INDEX IF NOT EXISTS idx_page_deployments_project ON page_deployments(project_id);