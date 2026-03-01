import sql from '../../lib/db.js';
import crypto from 'crypto';
import { sendInviteEmail } from '../../lib/mailer.js';

function isAdmin(req) {
  return req.headers['x-admin-key'] === process.env.ADMIN_SECRET;
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { action } = req.query;

  // ─── GET OVERVIEW ─────────────────────────────────────────────────────────
  if (req.method === 'GET' && action === 'overview') {
    const users = await sql`
      SELECT email, name, zoom_user_id, google_access_token, fireflies_api_key,
             group_name, template_id, connected_at, is_active,
             invite_token, invite_sent_at, onboarded
      FROM users ORDER BY connected_at DESC
    `;
    const settings = await sql`SELECT * FROM settings`;
    const templates = await sql`SELECT * FROM templates WHERE is_active=TRUE ORDER BY id DESC`;
    const recentMeetings = await sql`SELECT * FROM meetings ORDER BY created_at DESC LIMIT 50`;
    const stats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE is_active) as active_users,
        COUNT(*) FILTER (WHERE zoom_user_id IS NOT NULL) as zoom_connected,
        COUNT(*) FILTER (WHERE google_access_token IS NOT NULL) as google_connected,
        COUNT(*) FILTER (WHERE fireflies_api_key IS NOT NULL) as fireflies_connected,
        COUNT(*) FILTER (WHERE onboarded = TRUE) as onboarded_count,
        COUNT(*) FILTER (WHERE invite_token IS NOT NULL AND onboarded = FALSE) as pending_invites
      FROM users
    `;
    const meetingStats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE draft_created) as drafts_sent,
        COUNT(*) FILTER (WHERE error IS NOT NULL) as errors
      FROM meetings
    `;
    return res.json({
      users: users.map(u => ({
        ...u,
        zoom_connected: !!u.zoom_user_id,
        google_connected: !!u.google_access_token,
        fireflies_connected: !!u.fireflies_api_key,
        invite_url: u.invite_token ? `${process.env.APP_URL}/join/${u.invite_token}` : null,
        google_access_token: undefined,
        fireflies_api_key: undefined,
      })),
      settings: Object.fromEntries(settings.map(s => [s.key, s.value])),
      templates,
      recentMeetings,
      stats: { ...stats[0], ...meetingStats[0] }
    });
  }

  // ─── INVITE USER ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'invite_user') {
    const { email, name, group_name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const token = crypto.randomBytes(24).toString('hex');
    await sql`
      INSERT INTO users (email, name, group_name, invite_token, invite_sent_at)
      VALUES (${email}, ${name || null}, ${group_name || 'default'}, ${token}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        invite_token = ${token},
        invite_sent_at = NOW(),
        name = COALESCE(EXCLUDED.name, users.name),
        group_name = COALESCE(EXCLUDED.group_name, users.group_name)
    `;

    const inviteUrl = `${process.env.APP_URL}/join/${token}`;
    try {
      await sendInviteEmail({ to: email, name: name || email.split('@')[0], inviteUrl });
    } catch (e) {
      console.error('Email send failed:', e.message);
    }
    return res.json({ ok: true, invite_url: inviteUrl });
  }

  // ─── BULK INVITE ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'bulk_invite') {
    const { emails, group_name } = req.body;
    const results = [];
    for (const { email, name } of emails) {
      const token = crypto.randomBytes(24).toString('hex');
      await sql`
        INSERT INTO users (email, name, group_name, invite_token, invite_sent_at)
        VALUES (${email}, ${name || null}, ${group_name || 'default'}, ${token}, NOW())
        ON CONFLICT (email) DO UPDATE SET invite_token=${token}, invite_sent_at=NOW()
      `;
      const inviteUrl = `${process.env.APP_URL}/join/${token}`;
      try { await sendInviteEmail({ to: email, name: name || email.split('@')[0], inviteUrl }); } catch {}
      results.push({ email, invite_url: inviteUrl });
    }
    return res.json({ ok: true, results });
  }

  // ─── RESEND INVITE ────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'resend_invite') {
    const { email } = req.body;
    const rows = await sql`SELECT * FROM users WHERE email=${email}`;
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    let token = rows[0].invite_token || crypto.randomBytes(24).toString('hex');
    await sql`UPDATE users SET invite_token=${token}, invite_sent_at=NOW() WHERE email=${email}`;
    const inviteUrl = `${process.env.APP_URL}/join/${token}`;
    try { await sendInviteEmail({ to: email, name: rows[0].name || email.split('@')[0], inviteUrl }); } catch {}
    return res.json({ ok: true, invite_url: inviteUrl });
  }

  // ─── REVOKE INVITE ────────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'revoke_invite') {
    const { email } = req.body;
    await sql`UPDATE users SET invite_token=NULL WHERE email=${email}`;
    return res.json({ ok: true });
  }

  // ─── UPDATE SETTING ───────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'setting') {
    const { key, value } = req.body;
    await sql`
      INSERT INTO settings (key, value, updated_at) VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE SET value=excluded.value, updated_at=NOW()
    `;
    return res.json({ ok: true });
  }

  // ─── CREATE / UPDATE TEMPLATE ─────────────────────────────────────────────
  if (req.method === 'POST' && action === 'template') {
    const { id, name, description, subject, sections, assigned_to, assigned_group } = req.body;
    if (id) {
      await sql`
        UPDATE templates SET name=${name}, description=${description}, subject=${subject},
          sections=${JSON.stringify(sections)}, assigned_to=${assigned_to},
          assigned_group=${assigned_group || null}, updated_at=NOW()
        WHERE id=${id}
      `;
    } else {
      await sql`
        INSERT INTO templates (name, description, subject, sections, assigned_to, assigned_group)
        VALUES (${name}, ${description}, ${subject}, ${JSON.stringify(sections)}, ${assigned_to}, ${assigned_group || null})
      `;
    }
    return res.json({ ok: true });
  }

  // ─── DELETE TEMPLATE ──────────────────────────────────────────────────────
  if (req.method === 'DELETE' && action === 'template') {
    const { id } = req.body;
    await sql`UPDATE templates SET is_active=FALSE WHERE id=${id}`;
    return res.json({ ok: true });
  }

  // ─── ASSIGN TEMPLATE ─────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'assign_template') {
    const { template_id, user_emails } = req.body;
    if (user_emails === 'all') {
      await sql`UPDATE users SET template_id=${template_id}`;
    } else {
      for (const email of user_emails) {
        await sql`UPDATE users SET template_id=${template_id} WHERE email=${email}`;
      }
    }
    return res.json({ ok: true });
  }

  // ─── UPDATE USER GROUP ────────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'user_group') {
    const { email, group_name } = req.body;
    await sql`UPDATE users SET group_name=${group_name} WHERE email=${email}`;
    return res.json({ ok: true });
  }

  // ─── TOGGLE USER ACTIVE ───────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'toggle_user') {
    const { email } = req.body;
    await sql`UPDATE users SET is_active = NOT is_active WHERE email=${email}`;
    return res.json({ ok: true });
  }

  return res.status(404).json({ error: 'Unknown action' });
}
