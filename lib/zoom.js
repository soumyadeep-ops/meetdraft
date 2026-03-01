import axios from 'axios';
import sql from './db.js';

const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────────────────────
export async function refreshZoomToken(user) {
  const creds = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await axios.post(
    'https://zoom.us/oauth/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: user.zoom_refresh_token }),
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const { access_token, refresh_token, expires_in } = res.data;
  const expiry = Date.now() + expires_in * 1000;
  await sql`
    UPDATE users SET zoom_access_token=${access_token}, zoom_refresh_token=${refresh_token || user.zoom_refresh_token}, zoom_token_expiry=${expiry}
    WHERE email=${user.email}
  `;
  return access_token;
}

export async function getZoomToken(user) {
  if (!user.zoom_token_expiry || Date.now() > user.zoom_token_expiry - 60000) {
    return refreshZoomToken(user);
  }
  return user.zoom_access_token;
}

// ─── FETCH PARTICIPANTS ────────────────────────────────────────────────────────
export async function fetchParticipants(meetingId, token) {
  try {
    const res = await axios.get(
      `https://api.zoom.us/v2/past_meetings/${meetingId}/participants?page_size=300`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return [...new Set(
      (res.data.participants || []).map(p => p.user_email).filter(e => e?.includes('@'))
    )];
  } catch { return []; }
}

// ─── FETCH ZOOM AI SUMMARY ────────────────────────────────────────────────────
export async function fetchZoomSummary(meetingId, token) {
  try {
    // Zoom AI Companion summary endpoint
    const res = await axios.get(
      `https://api.zoom.us/v2/meetings/${meetingId}/meeting_summary`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = res.data;
    return {
      summary: data.summary_overview || '',
      action_items: (data.next_steps || []).map(s => s.summary || s),
      next_steps: [],
      raw: data
    };
  } catch (e) {
    // Fallback: get transcript and return raw text
    try {
      const uuid = encodeURIComponent(encodeURIComponent(meetingId));
      const recRes = await axios.get(
        `https://api.zoom.us/v2/meetings/${uuid}/recordings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const transcriptFile = (recRes.data.recording_files || []).find(f => f.file_type === 'TRANSCRIPT');
      if (!transcriptFile) return null;
      const vttRes = await axios.get(`${transcriptFile.download_url}?access_token=${token}`);
      return {
        summary: parseVTTToText(vttRes.data),
        action_items: [],
        next_steps: [],
        raw: null
      };
    } catch { return null; }
  }
}

function parseVTTToText(vtt) {
  if (!vtt) return '';
  return vtt.split('\n')
    .filter(l => l.trim() && !l.startsWith('WEBVTT') && !/^\d+$/.test(l.trim()) && !l.includes('-->'))
    .join('\n');
}

// ─── ZOOM OAUTH EXCHANGE ──────────────────────────────────────────────────────
export async function exchangeZoomCode(code, redirectUri) {
  const creds = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await axios.post(
    'https://zoom.us/oauth/token',
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return res.data;
}

export async function getZoomProfile(token) {
  const res = await axios.get('https://api.zoom.us/v2/users/me', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}
