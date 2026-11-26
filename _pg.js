const fs = require('fs');
let h = fs.readFileSync('client/src/App.jsx', 'utf8');
const R = (a, b) => { if (!h.includes(a)) console.log('MISS:', a.slice(0, 70)); else h = h.replace(a, b); };

R('AUDIENCE — {state.recipients.length} RECORDS', 'AUDIENCE — {state.recipientTotal || 0} RECORDS');
R('disabled={busy || !state.recipients.length} onClick={() => run(async () => {\n                          const r = await api(token, \'/api/recipients/verify\', { method: \'POST\', body: { emails: state.recipients.map((x) => x.email) } });',
  'disabled={busy || !state.recipientTotal} onClick={() => run(async () => {\n                          const r = await api(token, \'/api/recipients/verify\', { method: \'POST\', body: { all: true } });');
R('Delete ALL ${state.recipients.length} recipients?', 'Delete ALL ${state.recipientTotal} recipients?');
R('confirmLabel: `DELETE ${state.recipients.length}`', 'confirmLabel: `DELETE ${state.recipientTotal}`');
R('disabled={busy || !state.recipients.length} onClick={async () => {\n                          if (await uiConfirm(`Delete ALL', 'disabled={busy || !state.recipientTotal} onClick={async () => {\n                          if (await uiConfirm(`Delete ALL');
R("setExtraRecipients([]); showNotice(`${r.deleted} recipients deleted.`);", "showNotice(`${r.deleted} recipients deleted.`);");
R('setExtraRecipients((prev) => prev.map((x) => x.id === r.id ? { ...x, suppressed: false } : x)); await refresh();', 'await refresh();');
R('setExtraRecipients((prev) => prev.map((x) => x.id === r.id ? { ...x, suppressed: true } : x)); await refresh();', 'await refresh();');
R('setExtraRecipients((prev) => prev.filter((x) => x.id !== r.id)); await refresh();', 'await refresh();');
// classify button disable
R("disabled={busy || !state.recipients.length} onClick={() => run(async () => {\n                          const r = await api(token, '/api/recipients/classify'",
  "disabled={busy || !state.recipientTotal} onClick={() => run(async () => {\n                          const r = await api(token, '/api/recipients/classify'");
// bounce retry — lazy lookup instead of state.recipients.find
R(`const rec = state.recipients.find((r) => r.email.toLowerCase() === b.email.toLowerCase());
                              return rec ? <button className="btn-xs" onClick={() => run(async () => {
                                const r = await api(token, \`/api/recipients/\${rec.id}/retry-soft-bounce\`, { method: 'POST', body: {} });
                                showNotice(r.rescheduled ? \`\${r.rescheduled} deliveries rescheduled (+\${r.backoffMinutes}m backoff).\` : 'No failed deliveries to retry.');
                              })}>RETRY</button> : null;`,
`<button className="btn-xs" onClick={() => run(async () => {
                                const q = await api(token, \`/api/recipients?email=\${encodeURIComponent(b.email)}&limit=1\`);
                                const rec = q.recipients?.[0];
                                if (!rec) return showNotice('Recipient not found on the list.', 'err');
                                const r = await api(token, \`/api/recipients/\${rec.id}/retry-soft-bounce\`, { method: 'POST', body: {} });
                                showNotice(r.rescheduled ? \`\${r.rescheduled} deliveries rescheduled (+\${r.backoffMinutes}m backoff).\` : 'No failed deliveries to retry.');
                              })}>RETRY</button>;`);

fs.writeFileSync('client/src/App.jsx', h);
console.log('state.recipients left:', (h.match(/state\.recipients\b/g) || []).length,
  '| setExtraRecipients left:', (h.match(/setExtraRecipients/g) || []).length);
