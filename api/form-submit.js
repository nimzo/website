// Receives the waitlist/demo form POST ({ formName, pageUrl, data }) and
// forwards it as JSON to FORM_WEBHOOK_URL (Slack, Zapier, HubSpot, ...).
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body.formName !== 'string' || typeof body.data !== 'object' || body.data === null) {
    return res.status(400).json({ error: 'Invalid payload' });
  }
  const url = process.env.FORM_WEBHOOK_URL;
  if (!url) {
    console.error('FORM_WEBHOOK_URL is not set; submission dropped');
    return res.status(503).json({ error: 'Form backend not configured' });
  }
  const { formName, pageUrl, data } = body;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formName, pageUrl, data, receivedAt: new Date().toISOString() }),
  }).catch(() => null);
  if (!upstream || !upstream.ok) return res.status(502).json({ error: 'Upstream failed' });
  return res.status(200).json({ ok: true });
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
