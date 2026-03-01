import crypto from 'crypto';
import sql from '../../lib/db.js';
import { getZoomToken, fetchParticipants, fetchZoomSummary } from '../../lib/zoom.js';
import { fetchFirefliesSummary } from '../../lib/fireflies.js';
import { createGmailDraft, renderTemplate } from '../../lib/gmail.js';

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = req.body;

  // Zoom URL validation handshake
  if (body.event === 'endpoint.url_validation') {
    const hash = crypto
      .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET)
      .update(body.payload.plainToken)
      .digest('hex');
    return res.json({ plainToken: body.payload.plainToken, encryptedToken: hash });
  }

  // Verify webhook signature
  const signature = req.headers['x-zm-signature'];
  const timestamp = req.headers['x-zm-request-timestamp'];
  const message = `v0:${timestamp}:${JSON.stringify(body)}`;
  const expected = 'v0=' + crypto.createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET).update(message).digest('hex');
  if (signature !== expected) return res.status(401).json({ error: 'Invalid signature' });

  res.status(200).json({ ok: true }); // Respond immediately

  if (body.event !== 'recording.completed') return;

  // zoom_host_email = the Zoom account email that hosted this meeting
  const zoomHostEmail = body.payload?.object?.host_email;
  const meetingId     = body.payload?.object?.id;
  const meetingUUID   = body.payload?.object?.uuid;
  const topic         = body.payload?.object?.topic;
  const startTime     = body.payload?.object?.start_time;
  const duration      = body.payload?.object?.duration;

  if (!zoomHostEmail || !meetingId) return;

  // ── KEY CHANGE: look up by zoom_email, not email ─────────────────────────
  // This handles the case where multiple people share a Zoom account:
  // each person has their own Gmail (email) but same zoom_email.
  // We match on zoom_email to find ALL users on that Zoom account,
  // then use the meeting's organizer logic to pick the right one.
  const matchedUsers = await sql`
    SELECT * FROM users
    WHERE zoom_email = ${zoomHostEmail}
      AND is_active = TRUE
      AND google_refresh_token IS NOT NULL
    ORDER BY connected_at ASC
  `;

  if (!matchedUsers.length) {
    console.log(`No active user found for zoom_email=${zoomHostEmail}`);
    return;
  }

  // ── ORGANIZER RESOLUTION ─────────────────────────────────────────────────
  // Zoom's host_email is the Zoom account owner. For scheduled meetings,
  // the person who *created* the meeting is the organizer.
  // Strategy:
  //   1. If only one user maps to this zoom_email → use them (simple case)
  //   2. If multiple users share this zoom_email (shared account):
  //      → Fetch meeting details from Zoom API to get creator/scheduler
  //      → Match against registered users' emails
  //      → Fall back to first registered user if no match found

  let organizer = matchedUsers[0]; // default

  if (matchedUsers.length > 1) {
    try {
      const token = await getZoomToken(matchedUsers[0]); // use any user's token to call API
      const meetingDetails = await fetch(
        `https://api.zoom.us/v2/past_meetings/${meetingId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json());

      // Zoom returns creator_email or scheduled_by (email of person who scheduled it)
      const creatorEmail = meetingDetails.creator?.email
        || meetingDetails.scheduled_by
        || meetingDetails.host_email;

      if (creatorEmail) {
        const byCreator = matchedUsers.find(u => u.email === creatorEmail);
        if (byCreator) organizer = byCreator;
        else {
          // Creator not in our system — try matching by name or use first user
          console.log(`Creator ${creatorEmail} not found in users, using first match`);
        }
      }
    } catch (e) {
      console.log('Could not resolve organizer from meeting details, using first match:', e.message);
    }
  }

  // Log the meeting
  const [meeting] = await sql`
    INSERT INTO meetings (zoom_meeting_id, zoom_host_email, organizer_email, topic, start_time, duration_minutes)
    VALUES (${meetingId}, ${zoomHostEmail}, ${organizer.email}, ${topic}, ${startTime}, ${duration})
    RETURNING id
  `;

  try {
    const settingRows = await sql`SELECT value FROM settings WHERE key='summary_source'`;
    const summarySource = settingRows[0]?.value || 'zoom';

    // Get template for this organizer
    let template = null;
    if (organizer.template_id) {
      const tRows = await sql`SELECT * FROM templates WHERE id=${organizer.template_id} AND is_active=TRUE LIMIT 1`;
      template = tRows[0];
    }
    if (!template) {
      const tRows = await sql`
        SELECT * FROM templates WHERE is_active=TRUE AND (
          assigned_to='all' OR
          (assigned_to='group' AND assigned_group=${organizer.group_name || 'default'})
        ) ORDER BY id DESC LIMIT 1
      `;
      template = tRows[0];
    }
    if (!template) {
      await sql`UPDATE meetings SET error='No template found' WHERE id=${meeting.id}`;
      return;
    }

    // Fetch summary
    let summaryData = null;
    if (summarySource === 'fireflies' && organizer.fireflies_api_key) {
      await new Promise(r => setTimeout(r, 60000));
      summaryData = await fetchFirefliesSummary(topic, organizer.fireflies_api_key);
    }
    if (!summaryData) {
      await new Promise(r => setTimeout(r, 30000));
      const token = await getZoomToken(organizer);
      summaryData = await fetchZoomSummary(meetingUUID || meetingId, token);
    }

    // Fetch participants
    const token = await getZoomToken(organizer);
    const participants = await fetchParticipants(meetingId, token);

    // Draft goes to organizer's Gmail, To: all other participants
    const toEmails = participants.filter(e => e !== organizer.email);

    const meetingData = {
      topic,
      start_time: startTime,
      duration_minutes: duration,
      host_email: organizer.email  // use Gmail, not Zoom email, in the template
    };

    const { subject, body: emailBody } = renderTemplate(template, meetingData, summaryData);

    // Creates draft in organizer's Gmail inbox
    await createGmailDraft(organizer, toEmails, subject, emailBody);

    await sql`
      UPDATE meetings SET
        participants    = ${participants},
        summary_source  = ${summarySource},
        summary         = ${summaryData?.summary || null},
        draft_created   = TRUE,
        draft_created_at = NOW()
      WHERE id=${meeting.id}
    `;

  } catch (err) {
    console.error('Webhook processing error:', err);
    await sql`UPDATE meetings SET error=${err.message} WHERE id=${meeting.id}`;
  }
}
