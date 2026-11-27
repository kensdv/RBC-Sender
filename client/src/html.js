// Small HTML helpers shared by the composer and preview.

const escapeHtmlText = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainPreviewDoc = (text) => `<!doctype html><html><body style="margin:0;background:#f4f4f5"><div style="max-width:600px;margin:24px auto;background:#fff;border:1px solid #e4e4e7;border-radius:8px;padding:32px;font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.7;color:#27272a;white-space:pre-wrap">${escapeHtmlText(text)}</div></body></html>`;

function stripPageHtml(input) {
  let out = String(input || '');
  if (!/<!doctype|<html[\s>]/i.test(out)) return out;
  const styles = [];
  out = out.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => { styles.push(m); return ''; });
  out = out
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?html[^>]*>/gi, '')
    .replace(/<body([^>]*)>/i, '<div$1>')
    .replace(/<\/body>/gi, '</div>');
  return styles.join('\n') + '\n' + out.trim();
}


export { escapeHtmlText, plainPreviewDoc, stripPageHtml };
