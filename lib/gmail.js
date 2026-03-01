import { google } from 'googleapis';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = `${process.env.APP_URL}/api/auth/google/callback`;

export function getGoogleClient(tokens = null) {
  const client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  if (tokens) client.setCredentials(tokens);
  return client;
}

// ─── RENDER TEMPLATE ──────────────────────────────────────────────────────────
export function renderTemplate(template, meetingData, summaryData) {
  const { topic, start_time, duration_minutes, participants } = meetingData;
  const { summary, action_items = [], next_steps = [] } = summaryData || {};

  const date = start_time
    ? new Date(start_time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })
    : 'N/A';

  // Replace subject placeholders
  const subject = template.subject
    .replace(/{{meeting_topic}}/g, topic || 'Meeting')
    .replace(/{{meeting_date}}/g, date)
    .replace(/{{host_email}}/g, meetingData.host_email || '');

  // Build body from sections
  const sections = template.sections || [];
  const bodyLines = [];

  for (const section of sections) {
    if (section.enabled === false) continue;

    switch (section.type) {
      case 'text':
        bodyLines.push(section.content || '');
        break;

      case 'meeting_details':
        bodyLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        bodyLines.push('  MEETING DETAILS');
        bodyLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        bodyLines.push(`  Topic    : ${topic || 'N/A'}`);
        bodyLines.push(`  Date     : ${date} (IST)`);
        bodyLines.push(`  Duration : ${duration_minutes ? duration_minutes + ' minutes' : 'N/A'}`);
        bodyLines.push(`  Host     : ${meetingData.host_email || 'N/A'}`);
        bodyLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        break;

      case 'summary':
        bodyLines.push('');
        bodyLines.push('  SUMMARY');
        bodyLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        bodyLines.push(summary || 'No summary available.');
        break;

      case 'action_items':
        if (action_items.length > 0) {
          bodyLines.push('');
          bodyLines.push('  ACTION ITEMS');
          bodyLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          action_items.forEach((item, i) => bodyLines.push(`  ${i + 1}. ${item}`));
        }
        break;

      case 'next_steps':
        if (next_steps.length > 0) {
          bodyLines.push('');
          bodyLines.push('  NEXT STEPS');
          bodyLines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          next_steps.forEach((item, i) => bodyLines.push(`  ${i + 1}. ${item}`));
        }
        break;
    }

    bodyLines.push('');
  }

  return { subject, body: bodyLines.join('\n') };
}

// ─── CREATE GMAIL DRAFT ───────────────────────────────────────────────────────
export async function createGmailDraft(user, toEmails, subject, body) {
  const auth = getGoogleClient({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token,
  });
  const gmail = google.gmail({ version: 'v1', auth });

  const messageParts = [
    `From: ${user.email}`,
    `To: ${toEmails.join(', ')}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body,
  ];

  const raw = Buffer.from(messageParts.join('\n'))
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw } } });
}
