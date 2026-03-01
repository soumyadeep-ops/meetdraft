import axios from 'axios';

const FIREFLIES_API = 'https://api.fireflies.ai/graphql';

// ─── FETCH SUMMARY FROM FIREFLIES ─────────────────────────────────────────────
export async function fetchFirefliesSummary(meetingTitle, hostApiKey) {
  if (!hostApiKey) return null;

  // Search for the most recent transcript matching the meeting
  const query = `
    query {
      transcripts(limit: 5) {
        id
        title
        date
        summary {
          overview
          action_items
          keywords
        }
        sentences {
          speaker_name
          text
        }
      }
    }
  `;

  try {
    const res = await axios.post(
      FIREFLIES_API,
      { query },
      { headers: { Authorization: `Bearer ${hostApiKey}`, 'Content-Type': 'application/json' } }
    );

    const transcripts = res.data?.data?.transcripts || [];
    // Find best match by title similarity
    const match = transcripts.find(t =>
      t.title?.toLowerCase().includes(meetingTitle?.toLowerCase()) ||
      meetingTitle?.toLowerCase().includes(t.title?.toLowerCase())
    ) || transcripts[0];

    if (!match) return null;

    return {
      summary: match.summary?.overview || '',
      action_items: (match.summary?.action_items || '').split('\n').filter(Boolean),
      next_steps: [],
      raw: match
    };
  } catch (e) {
    console.error('Fireflies fetch error:', e?.response?.data || e.message);
    return null;
  }
}

// ─── VALIDATE FIREFLIES API KEY ───────────────────────────────────────────────
export async function validateFirefliesKey(apiKey) {
  try {
    const res = await axios.post(
      FIREFLIES_API,
      { query: `query { user { user_id name email } }` },
      { headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } }
    );
    return !!res.data?.data?.user;
  } catch { return false; }
}
