// Stackd Insights — generate the clinic-ready PDF.
// mode "download": returns the PDF as base64 JSON for the client to save.
// mode "email": attaches the PDF to a SendEmail (recipient + optional copy to self).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { buildInsights } from '../../shared/insightsLoader.ts';
import { renderInsightsPdf } from '../../shared/insightsPdf.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    const mode = body.mode || 'download';
    const result = await buildInsights(base44, body.windowDays || 14, Number(body.tzOffsetMinutes) || 0);
    if (result.status !== 200) return Response.json({ error: result.error }, { status: result.status });

    const insights = result.data;
    const b64 = renderInsightsPdf(insights);
    const filename = `stackd-insights-${insights.windowDays}d-${new Date().toISOString().slice(0, 10)}.pdf`;

    if (mode !== 'email') {
      return Response.json({ base64: b64, filename, contentType: 'application/pdf' });
    }

    // Email mode: send to the entered recipient, with a copy to self if asked.
    const recipient = String(body.recipient || '').trim().toLowerCase();
    const copySelf = body.copySelf === true;
    const selfEmail = String(insights.meta?.email || '').trim().toLowerCase();
    if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
      return Response.json({ error: 'Enter a valid recipient email address.' }, { status: 400 });
    }

    const subject = `Stackd Insights Report — ${insights.windowDays} days`;
    const text = 'Your Stackd Insights report is attached. ' + buildBody(insights);
    const attachment = { filename, content: b64 };

    const targets = [recipient];
    if (copySelf && selfEmail && selfEmail !== recipient) {
      targets.push(selfEmail);
    }

    await base44.integrations.Core.SendEmail({
      to: targets[0],
      subject,
      text,
      attachments: [attachment],
    });
    if (targets.length > 1) {
      await base44.integrations.Core.SendEmail({
        to: targets[1],
        subject,
        text,
        attachments: [attachment],
      });
    }

    return Response.json({ sent: true, to: targets, filename });
  } catch (error) {
    console.error('[generateInsightsPdf] failed:', error?.message || error);
    return Response.json({ error: error.message || 'Unable to send the report.' }, { status: 500 });
  }
}

function buildBody(insights) {
  const lines = [];
  if (insights.gates?.passTir) {
    lines.push(`GMI ${insights.tir.gmi}% · mean ${insights.tir.mean} mg/dL`);
  } else {
    lines.push(insights.gates.tirMessage + '.');
  }
  lines.push(`Time in range: ${percentPairs(insights.tir?.bandPercentages)}`);
  return lines.join(' ');
}

function percentPairs(bands) {
  if (!bands) return '—';
  return bands.map((b) => `${b.label} ${b.percent}%`).join(', ');
}