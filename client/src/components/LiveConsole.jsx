import { useEffect, useRef } from 'react';

const EVENT_STYLE = {
  send_ok:          { icon: '✓', color: 'var(--green)',  label: 'SENT' },
  send_fail:        { icon: '✗', color: 'var(--red)',    label: 'FAIL' },
  campaign_start:   { icon: '▶', color: 'var(--cyan)',   label: 'START' },
  campaign_queued:  { icon: '⇩', color: 'var(--cyan)',   label: 'QUEUE' },
  campaign_done:    { icon: '■', color: 'var(--purple)', label: 'DONE' },
  open:             { icon: '◉', color: 'var(--yellow)', label: 'OPEN' },
  click:            { icon: '↗', color: 'var(--cyan)',   label: 'CLICK' },
  bounce:           { icon: '⛔', color: 'var(--red)',    label: 'BOUNCE' },
  unsubscribe:      { icon: '⊘', color: 'var(--orange)', label: 'UNSUB' },
  telegram_fail:    { icon: '⚠', color: 'var(--orange)', label: 'TG-ERR' },
  smtp_check:       { icon: '⇄', color: 'var(--cyan)',   label: 'SMTP' },
  campaign_fail:    { icon: '✗', color: 'var(--red)',    label: 'FAIL' },
  sorter:           { icon: '⇅', color: 'var(--cyan)',   label: 'SORT' },
  info:             { icon: '·', color: 'var(--txt-dim)', label: 'INFO' },
};

function eventLine(ev) {
  switch (ev.kind) {
    case 'send_ok':         return `${ev.email}`;
    case 'send_fail':       return `${ev.email} — ${ev.error || 'failed'}`;
    case 'campaign_start':  return `${ev.name} — "${ev.subject || '(no subject)'}" · ${ev.total ?? '?'} recipients · ${ev.engine || ''}`;
    case 'campaign_queued': return `${ev.name} — "${ev.subject || '(no subject)'}" · ${ev.total ?? '?'} queued${ev.scheduledFor ? ' · scheduled ' + new Date(ev.scheduledFor).toLocaleString() : ''}`;
    case 'smtp_check':      return `${ev.ok ? '✓' : '✗'} ${ev.label || 'smtp'}${ev.host ? ' @ ' + ev.host : ''}${ev.ok ? '' : ' — ' + (ev.error || 'failed')}`;
    case 'campaign_fail':   return `${ev.name} FAILED — ${ev.error || 'error'}`;
    case 'campaign_done': {
      const s = {};
      for (const r of ev.stats || []) s[r.status] = r.c;
      return `${ev.name} — sent ${s.sent || 0} · failed ${s.failed || 0} · left ${(s.queued || 0) + (s.sending || 0)}`;
    }
    case 'open':            return `${ev.email} opened ${ev.name ? `“${ev.name}”` : ''}`;
    case 'click':           return `${ev.email} → ${String(ev.target || '').slice(0, 80)}`;
    case 'bounce':          return `${ev.email} — ${ev.reason || ev.kind}`;
    case 'unsubscribe':     return `${ev.email} unsubscribed`;
    case 'telegram_fail':   return `telegram: ${ev.error}`;
    default:                return ev.message || ev.kind;
  }
}

function LiveConsole({ events, empty }) {
  const ref = useRef(null);
  const list = (events || []).slice(-100);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length]);
  return (
    <div className="console" ref={ref}>
      {list.length === 0 && <div className="console-empty">{empty || '[ AWAITING EVENTS — SENDS, OPENS, CLICKS, BOUNCES STREAM HERE ]'}</div>}
      {list.map((ev, i) => {
        const st = EVENT_STYLE[ev.kind] || EVENT_STYLE.info;
        return (
          <div key={i} className="console-line">
            <span className="console-ts">{new Date(ev.ts).toLocaleTimeString('en-GB', { hour12: false })}</span>
            <span className="console-ico" style={{ color: st.color }}>{st.icon}</span>
            <span className="console-tag" style={{ color: st.color }}>{st.label}</span>
            <span className="console-msg">{eventLine(ev)}</span>
          </div>
        );
      })}
    </div>
  );
}


export { eventLine };
export default LiveConsole;
