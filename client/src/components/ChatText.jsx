function chatInline(t) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|(?<![\w*])\*[^*]+\*(?![\w*])|`[^`]+`)/g;
  let last = 0, k = 0;
  for (const m of t.matchAll(re)) {
    if (m.index > last) out.push(t.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k++} className="chat-ic">{tok.slice(1, -1)}</code>);
    else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

function ChatText({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      blocks.push(<pre key={blocks.length} className="chat-code">{code.join('\n')}</pre>);
    } else if (/^#{1,4}\s/.test(line)) {
      blocks.push(<div key={blocks.length} className="chat-h">{chatInline(line.replace(/^#{1,4}\s*/, ''))}</div>);
      i++;
    } else if (/^\s*[-*•]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++; }
      blocks.push(<ul key={blocks.length} className="chat-list">{items.map((t, j) => <li key={j}>{chatInline(t)}</li>)}</ul>);
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      blocks.push(<ol key={blocks.length} className="chat-list">{items.map((t, j) => <li key={j}>{chatInline(t)}</li>)}</ol>);
    } else if (line.trim()) {
      blocks.push(<div key={blocks.length} className="chat-p">{chatInline(line)}</div>);
      i++;
    } else {
      i++;
    }
  }
  return <>{blocks}</>;
}


export default ChatText;
