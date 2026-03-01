import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
export default sql;

export async function initSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      zoom_email TEXT,
      zoom_user_id TEXT,
      zoom_access_token TEXT,
      zoom_refresh_token TEXT,
      zoom_token_expiry BIGINT,
      google_access_token TEXT,
      google_refresh_token TEXT,
      fireflies_api_key TEXT,
      group_name TEXT DEFAULT 'default',
      template_id INTEGER,
      invite_token TEXT UNIQUE,
      invite_sent_at TIMESTAMPTZ,
      onboarded BOOLEAN DEFAULT FALSE,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_users_zoom_email ON users(zoom_email)`;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`INSERT INTO settings (key, value) VALUES ('summary_source', 'zoom') ON CONFLICT (key) DO NOTHING`;

  await sql`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      subject TEXT NOT NULL,
      sections JSONB NOT NULL DEFAULT '[]',
      assigned_to TEXT DEFAULT 'all',
      assigned_group TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT TRUE
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS meetings (
      id SERIAL PRIMARY KEY,
      zoom_meeting_id TEXT,
      zoom_host_email TEXT NOT NULL,
      organizer_email TEXT,
      topic TEXT,
      start_time TIMESTAMPTZ,
      duration_minutes INTEGER,
      participants TEXT[],
      summary_source TEXT,
      summary TEXT,
      draft_created BOOLEAN DEFAULT FALSE,
      draft_created_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO templates (name, description, subject, sections, assigned_to)
    SELECT
      'Default Meeting Summary',
      'Standard post-meeting summary email',
      'Meeting Summary: {{meeting_topic}} — {{meeting_date}}',
      '[
        {"id":"intro","type":"text","label":"Opening","content":"Hi,\n\nPlease find the summary of our recent meeting below."},
        {"id":"details","type":"meeting_details","label":"Meeting Details","enabled":true},
        {"id":"summary","type":"summary","label":"Summary","enabled":true},
        {"id":"action_items","type":"action_items","label":"Action Items","enabled":true},
        {"id":"next_steps","type":"next_steps","label":"Next Steps","enabled":true},
        {"id":"closing","type":"text","label":"Closing","content":"Best regards"}
      ]'::jsonb,
      'all'
    WHERE NOT EXISTS (SELECT 1 FROM templates LIMIT 1)
  `;
}
