import { useEffect, useRef, useState } from 'react';
import { Sparkles, LogOut, X, Users, Mail, Send, Server, ArrowRight, Filter, CheckCheck, Settings2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from './api.js';
import {
  emptyDraft, emptySmtp, emptyAccount, emptySettings,
  INTRO_STEPS, BLOCK_SNIPPETS, SMTP_PRESETS, SMTP_GUIDES, TIME_OPTIONS,
  DAY_LABELS, fmtMin, PLACEHOLDER_GROUPS, NAV_ITEMS,
} from './config.js';
import { LETTER_TEMPLATES } from './builtinTemplates.js';
import { escapeHtmlText, plainPreviewDoc, stripPageHtml } from './html.js';
import { RbcMascot, ChromosomeBackground, RbcLogo, NavIcon } from './components/Chrome.jsx';
import Pager from './components/Pager.jsx';
import VisualEditor from './components/VisualEditor.jsx';
import LiveConsole, { eventLine } from './components/LiveConsole.jsx';
import ChatText from './components/ChatText.jsx';

// Standard scan footer used on letters and generated PDFs.
const SCAN_DISCLAIMER = 'This email has been scanned for spam and viruses. Click here to report this email as spam.';

// Each console streams only its own task. The dashboard is the one console
// that shows every event; the others stay scoped so they stay readable.
const CAMPAIGN_EVENT_KINDS = new Set([
  'campaign_queued', 'campaign_start', 'campaign_done', 'campaign_fail',
  'send_ok', 'send_fail', 'smtp_check', 'open', 'click', 'bounce', 'unsubscribe',
]);

function isCampaignEvent(e) {
  if (CAMPAIGN_EVENT_KINDS.has(e.kind)) return true;
  return e.kind === 'info' && /^(campaign #|test accepted)/i.test(String(e.message || ''));
}

function isRecipientEvent(e) {
  if (e.kind === 'sorter' || e.kind === 'smtp_check') return true;
  return e.kind === 'info' && /^(smtp import|ms mailbox import|verify )/i.test(String(e.message || ''));
}

function PreviewAttachments({ attachments }) {
  const list = attachments || [];
  if (!list.length) return null;
  return (
    <div className="preview-attachments">
      <div className="preview-attachments-head">ATTACHMENTS <span className="dim">({list.length})</span></div>
      {list.map((a, i) => (
        <div className="attach-row" key={a.path || i}>
          <span className="attach-name">📎 {a.filename || 'attachment'}</span>
          <span className="dim">{Math.round((a.size || 0) / 1024)}KB</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('mailerToken') || '');
  const [loginToken, setLoginToken] = useState('');
  const [state, setState] = useState(null);
  const [netInfo, setNetInfo] = useState(null);
  const [netInfoLoading, setNetInfoLoading] = useState(false);
  const [tgToken, setTgToken] = useState('');
  const [tgChat, setTgChat] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [draft, setDraft] = useState(emptyDraft);
  const [selectedId, setSelectedId] = useState(null);
  const [smtp, setSmtp] = useState(emptySmtp);
  const [acctForm, setAcctForm] = useState(emptyAccount);
  const [msRtImportOpen, setMsRtImportOpen] = useState(false);
  const [msRtData, setMsRtData] = useState('');
  const [msRtQuota, setMsRtQuota] = useState(10000);
  const [msRtTenant, setMsRtTenant] = useState('');
  const [msRtClientId, setMsRtClientId] = useState('');
  const [msRtEmail, setMsRtEmail] = useState('');
  const [smtpImportOpen, setSmtpImportOpen] = useState(false);
  const [smtpImportData, setSmtpImportData] = useState('');
  const [smtpImportQuota, setSmtpImportQuota] = useState(0);
  const [smtpImportResults, setSmtpImportResults] = useState(null);
  const [msRtResults, setMsRtResults] = useState(null);
  const [editingAcct, setEditingAcct] = useState(null);
  const [settings, setSettings] = useState(emptySettings);
  const [aiModelList, setAiModelList] = useState(null);
  const [aiModelsMsg, setAiModelsMsg] = useState('');
  const [csv, setCsv] = useState('email,first_name,last_name,company\nalex@example.com,Alex,Morgan,Example Ltd');
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [preview, setPreview] = useState(null);
  const [verifyResults, setVerifyResults] = useState(null);
  const [opsLog, setOpsLog] = useState([]);
  const [previewDevice, setPreviewDevice] = useState('desktop');
  const [versionInfo, setVersionInfo] = useState(null);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateResult, setUpdateResult] = useState(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [relayTest, setRelayTest] = useState({ state: 'idle' });
  // One look, everywhere: warm white. No dark mode to keep contrast honest.
  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    localStorage.setItem('rbc_theme', 'light');
  }, []);
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem('rbc_intro_seen'));
  const [introStep, setIntroStep] = useState(0);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState('ok');
  const [toasts, setToasts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [extractJob, setExtractJob] = useState(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setClockNow(new Date()), 1000); return () => clearInterval(t); }, []); // {jobId, accountId, owner, fetched, total, status, error, contacts, list}
  const [bodyMode, setBodyMode] = useState('html');
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [extraTemplates, setExtraTemplates] = useState([]);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiTarget, setAiTarget] = useState('body');
  const [aiAttachment, setAiAttachment] = useState(null);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [subjectIdeas, setSubjectIdeas] = useState([]);
  const [subjectBusy, setSubjectBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatModel, setChatModel] = useState('');
  const [chatModels, setChatModels] = useState(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatEditIndex, setChatEditIndex] = useState(null);
  const [spamCheckOpen, setSpamCheckOpen] = useState(false);
  const [spamScore, setSpamScore] = useState(null);
  const [spamIssues, setSpamIssues] = useState([]);
  const [spamChecking, setSpamChecking] = useState(false);
  const [spamFix, setSpamFix] = useState(null);
  const [spamFixing, setSpamFixing] = useState(false);
  const [awPrompt, setAwPrompt] = useState('');
  const [awBusy, setAwBusy] = useState(false);
  const [awResult, setAwResult] = useState(null);
  const [awMode, setAwMode] = useState('letter');
  const [awTone, setAwTone] = useState('');
  const [awLength, setAwLength] = useState('');
  const [awAudience, setAwAudience] = useState('');
  const [awDocPrompt, setAwDocPrompt] = useState('');
  const [awDocType, setAwDocType] = useState('PDF');
  const [awDocName, setAwDocName] = useState('');
  const [awDocUrl, setAwDocUrl] = useState('');
  const [awDocPreset, setAwDocPreset] = useState('notice');
  const [awDocBusy, setAwDocBusy] = useState(false);
  const [awAttachment, setAwAttachment] = useState(null);
  const [awPreview, setAwPreview] = useState(null);
  const [sorterInput, setSorterInput] = useState('');
  const [sorterResult, setSorterResult] = useState(null);
  const [sorterBusy, setSorterBusy] = useState(false);
  const [dashMore, setDashMore] = useState(false);
  const [abTestOpen, setAbTestOpen] = useState(false);
  const [abTestCampaignId, setAbTestCampaignId] = useState(null);
  const [subjectVariants, setSubjectVariants] = useState([]);
  const [newVariantSubject, setNewVariantSubject] = useState('');
  const [engagementTier, setEngagementTier] = useState('all');
  const [recipList, setRecipList] = useState('all');
  const [importList, setImportList] = useState('');
  const [aiSubjectBusy, setAiSubjectBusy] = useState(false);
  const [aiTaskText, setAiTaskText] = useState('');
  const [aiTaskAt, setAiTaskAt] = useState('');
  const [aiTaskRepeat, setAiTaskRepeat] = useState('');
  const [recipPage, setRecipPage] = useState(1);
  const [recipRows, setRecipRows] = useState([]);
  const [recipTotal, setRecipTotal] = useState(0);
  const [recipVersion, setRecipVersion] = useState(0);
  const [bouncePage, setBouncePage] = useState(1);
  const [histPage, setHistPage] = useState(1);
  const [campFilter, setCampFilter] = useState('all');
  const [campSearch, setCampSearch] = useState('');
  const [acctPage, setAcctPage] = useState(1);
  const [selectedAccts, setSelectedAccts] = useState([]);
  const [pageSize, setPageSize] = useState(50);
  const [templates, setTemplates] = useState([]);
  const [templateDropdownOpen, setTemplateDropdownOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [deliverability, setDeliverability] = useState(null);
  const [deliverabilityLoading, setDeliverabilityLoading] = useState(false);
  const [deliverabilityError, setDeliverabilityError] = useState('');
  const [visualEditorOpen, setVisualEditorOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const htmlRef = useRef(null);
  const pasteRef = useRef(null);
  const textRef = useRef(null);

  async function refreshState(activeToken = token) {
    const next = await api(activeToken, '/api/state');
    setState(next);
    setSmtp({ ...emptySmtp, ...next.smtp, password: '' });
    if (next.sendSettings) setSettings({ ...emptySettings, ...next.sendSettings });
    return next;
  }

  async function refresh(activeToken = token) {
    const next = await refreshState(activeToken);
    const [templatesRes, assetsRes] = await Promise.all([
      api(activeToken, '/api/templates').catch(() => []),
      api(activeToken, '/api/assets').catch(() => []),
    ]);
    setTemplates(templatesRes || []);
    setAssets(assetsRes || []);
    setRecipVersion((v) => v + 1);
    return next;
  }

  async function loadDeliverability(force = false) {
    if (!token) return;
    setDeliverabilityLoading(true);
    setDeliverabilityError('');
    try {
      const res = await api(token, `/api/deliverability${force ? '?refresh=1' : ''}`);
      setDeliverability(res);
    } catch (err) {
      setDeliverabilityError(err.message || 'DNS check failed');
    } finally {
      setDeliverabilityLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    api(token, `/api/recipients?offset=${(recipPage - 1) * pageSize}&limit=${pageSize}&tier=${engagementTier}${recipList !== 'all' ? `&list=${encodeURIComponent(recipList)}` : ''}`)
      .then((r) => { setRecipRows(r.recipients || []); setRecipTotal(r.total || 0); })
      .catch(() => {});
  }, [token, recipPage, pageSize, engagementTier, recipList, recipVersion]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('gmail') === 'connected') {
      showNotice(`Google account connected${q.get('email') ? ` — ${q.get('email')}` : ''}. Refresh token stored.`);
      window.history.replaceState({}, '', window.location.pathname);
      refresh(token).catch(() => {});
    } else if (q.get('gmail') === 'error') {
      showNotice(`Google connect failed: ${q.get('msg') || 'unknown'}`, 'err');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (q.get('graph') === 'connected') {
      showNotice(`Microsoft account connected${q.get('email') ? ` — ${q.get('email')}` : ''}. Delegated refresh token stored.`);
      window.history.replaceState({}, '', window.location.pathname);
      refresh(token).catch(() => {});
    } else if (q.get('graph') === 'error') {
      showNotice(`Microsoft connect failed: ${q.get('msg') || 'unknown'}`, 'err');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [token]);

  useEffect(() => {
    if (token) refresh(token).catch((err) => {
      if (err.status === 401) { sessionStorage.removeItem('mailerToken'); setToken(''); }
      showNotice(err.message, 'err');
    });
  }, [token]);

  useEffect(() => {
    if (state?.telegram?.chatId && !tgChat) setTgChat(state.telegram.chatId);
  }, [state?.telegram?.chatId]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const load = () => api(token, '/api/netinfo').then((n) => { if (alive) setNetInfo(n); }).catch(() => {});
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  useEffect(() => {
    if (!token || tab !== 'analytics') return;
    let alive = true;
    setAnalyticsLoading(true);
    api(token, '/api/analytics/overview')
      .then((res) => { if (alive) setAnalyticsData(res); })
      .catch((err) => { if (alive) showNotice(`Analytics error: ${err.message}`); })
      .finally(() => { if (alive) setAnalyticsLoading(false); });
    return () => { alive = false; };
  }, [token, tab]);

  useEffect(() => {
    if (!token || tab !== 'dashboard') return;
    loadDeliverability(false);
    const iv = setInterval(() => loadDeliverability(false), 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, [token, tab]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const check = () => api(token, '/api/update/check')
      .then((r) => {
        if (!alive) return;
        setVersionInfo({ version: r.version, commit: r.local });
        if (!r.upToDate && r.remote) setUpdateInfo(r);
      })
      .catch(() => {});
    check();
    const iv = setInterval(check, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  useEffect(() => {
    if (!chatOpen || !token) return;
    const saved = settings.aiModel || '';
    if (!chatModel && saved) setChatModel(saved);
    if (!settings.aiEndpoint || !settings.aiKey) {
      setChatModels([]);
      return;
    }
    if (!chatModels?.length) {
      api(token, '/api/ai/models').then((r) => {
        const list = r.models || [];
        setChatModels(list);
        const cur = chatModel || saved;
        setChatModel(list.includes(cur) ? cur : (list[0] || cur));
      }).catch(() => setChatModels([]));
    }
  }, [chatOpen, token, settings.aiEndpoint, settings.aiKey]);

  useEffect(() => {
    if (tab !== 'compose' || extraTemplates.length) return;
    import('./letterTemplates.js').then((m) => setExtraTemplates(m.EXTRA_TEMPLATES || [])).catch(() => {});
  }, [tab, extraTemplates.length]);

  useEffect(() => {
    if (!token || (tab !== 'send' && tab !== 'dashboard')) return;
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      refreshState(token).catch(() => {});
    };
    const iv = setInterval(tick, 3000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [token, tab]);

  // Strip <style>/<script> and neutralize absolute positioning from pasted HTML
  function sanitizePastedHtml(html) {
    try {
      const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
      const root = doc.body.firstElementChild;
      if (!root) return '';
      root.querySelectorAll('style,script,link,meta,title,iframe,object,embed').forEach((n) => n.remove());
      root.querySelectorAll('*').forEach((el) => {
        if (el.style.position && el.style.position !== 'static') el.style.position = 'static';
        el.removeAttribute('width');
        el.removeAttribute('height');
      });
      return root.innerHTML;
    } catch {
      return html;
    }
  }

  // Live preview — debounced stream to rhs pane
  useEffect(() => {
    if (!token || tab !== 'compose') return;
    if (!draft.html.trim() && !draft.text.trim()) { setPreview(null); return; }
    const t = setTimeout(() => {
      api(token, '/api/preview', { method: 'POST', body: { ...draft, subject: draft.subject || '(no subject)' } })
        .then(setPreview)
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [draft, token, tab]);

  // Sync paste area innerHTML only when draft.html changed from OUTSIDE the editor.
  // lastEditorHtml tracks what the contenteditable itself last produced, so
  // keystrokes don't retrigger a DOM reset mid-typing.
  const lastEditorHtml = useRef('');
  useEffect(() => {
    if ((bodyMode !== 'paste' && bodyMode !== 'blocks') || !pasteRef.current) return;
    if (!draft.html) {
      if (pasteRef.current.innerHTML) pasteRef.current.innerHTML = '';
      lastEditorHtml.current = '';
      return;
    }
    if (draft.html === lastEditorHtml.current) return;
    const clean = sanitizePastedHtml(draft.html);
    pasteRef.current.innerHTML = clean;
    lastEditorHtml.current = pasteRef.current.innerHTML;
  }, [bodyMode, draft.html, selectedId]);

  // Auto-dismiss notices after 3s
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  function showNotice(msg, type = 'ok') {
    setNotice(msg); setNoticeType(type);
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((list) => [...list.slice(-3), { id, msg, type }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), type === 'err' ? 7000 : 4200);
    setOpsLog((l) => [...l.slice(-199), { at: new Date(), msg, type }]);
  }

  // In-app dialog system — replaces window.confirm / window.prompt
  function uiConfirm(message, { title = 'CONFIRM', danger = false, confirmLabel = 'CONFIRM' } = {}) {
    return new Promise((resolve) => setDialog({ kind: 'confirm', title, message, danger, confirmLabel, value: '', resolve }));
  }
  function uiPrompt(message, { title = 'INPUT', placeholder = '', confirmLabel = 'OK' } = {}) {
    return new Promise((resolve) => setDialog({ kind: 'prompt', title, message, placeholder, confirmLabel, value: '', resolve }));
  }
  function settleDialog(result) {
    if (!dialog) return;
    const value = dialog.kind === 'prompt' ? (result ? dialog.value : null) : Boolean(result);
    dialog.resolve(value);
    setDialog(null);
  }

  // ── Contact extraction — live-progress job ──
  async function startExtract(acct) {
    try {
      const r = await api(token, `/api/smtp/accounts/${acct.id}/extract-contacts`, { method: 'POST', body: { phase: 'pull' } });
      setExtractJob({ jobId: r.jobId, accountId: acct.id, owner: r.owner, fetched: 0, total: 0, status: 'pulling', error: '', contacts: null, list: r.owner });
    } catch (err) { showNotice(`Extract failed: ${err.message}`, 'err'); }
  }
  useEffect(() => {
    if (!extractJob || extractJob.status !== 'pulling') return;
    const t = setInterval(async () => {
      try {
        const s = await api(token, `/api/smtp/accounts/${extractJob.accountId}/extract-contacts/${extractJob.jobId}`);
        if (s.status === 'done') {
          clearInterval(t);
          const d = await api(token, `/api/smtp/accounts/${extractJob.accountId}/extract-contacts`, { method: 'POST', body: { phase: 'download', jobId: extractJob.jobId } });
          setExtractJob((j) => j && { ...j, status: 'done', fetched: d.contacts.length, contacts: d.contacts });
        } else if (s.status === 'failed') {
          clearInterval(t);
          setExtractJob((j) => j && { ...j, status: 'failed', error: s.error || 'pull failed' });
        } else {
          setExtractJob((j) => j && { ...j, fetched: s.fetched, total: s.total });
        }
      } catch {}
    }, 900);
    return () => clearInterval(t);
  }, [extractJob?.status, extractJob?.jobId, extractJob?.accountId, token]);

  function downloadExtractCsv() {
    if (!extractJob?.contacts?.length) return;
    const csv = ['email,name', ...extractJob.contacts.map((c) => `${c.email},${(c.displayName || '').replaceAll(',', ' ')}`)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${extractJob.list || extractJob.owner}-contacts.csv` });
    a.click(); URL.revokeObjectURL(blob);
  }

  async function exportExtract() {
    const j = extractJob;
    if (!j) return;
    run(async () => {
      const r = await api(token, `/api/smtp/accounts/${j.accountId}/extract-contacts`, { method: 'POST', body: { phase: 'save', jobId: j.jobId, list: j.list } });
      showNotice(`Saved ${r.imported} contact(s) to "${r.list}"${r.merged ? ` — ${r.merged} merged into existing` : ''} (${r.total} pulled)`);
      setExtractJob(null);
      await refresh();
    });
  }

  async function run(action) {
    setBusy(true); setNotice('');
    try { await action(); }
    catch (err) { showNotice(err.message, 'err'); }
    finally { setBusy(false); }
  }

  async function applyUpdate() {
    const pending = updateInfo;
    setUpdating(true);
    setUpdateInfo(null);
    setUpdateResult(null);
    setUpdateDismissed(false);
    setTimeout(() => setUpdateDismissed(true), 5000);
    try {
      await api(token, '/api/update/apply', { method: 'POST' });
      // Server restarts mid-run — poll the log for the outcome; request failures
      // during restart are expected and ignored.
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          const s = await api(token, '/api/update/status');
          // Only trust results from THIS run — a STARTED marker means the log
          // was rewritten by the current apply, not left over from an old one.
          const fresh = s.log?.includes('[update] STARTED');
          if (fresh && s.log.includes('FAILED')) {
            clearInterval(poll);
            setUpdating(false);
            showNotice('Update failed — see the update log.', 'err');
            setUpdateInfo(pending);
            setUpdateResult({ ok: false, log: s.log });
          } else if (fresh && s.log.includes('[update] OK')) {
            clearInterval(poll);
            setUpdating(false);
            showNotice('Update applied — reloading…');
            setTimeout(() => location.reload(), 6000);
          }
        } catch {}
        if (tries > 30) {
          clearInterval(poll);
          setUpdating(false);
          try {
            const s = await api(token, '/api/update/status');
            const fresh = s.log?.includes('[update] STARTED');
            if (fresh && s.log.includes('FAILED')) {
              showNotice('Update failed — see the update log.', 'err');
              setUpdateInfo(pending);
              setUpdateResult({ ok: false, log: s.log });
            } else if (fresh && s.log.includes('[update] OK')) {
              showNotice('Update applied — reloading…');
              setTimeout(() => location.reload(), 3000);
            } else {
              showNotice('Update still running — refresh in a minute to see the new build.');
              setUpdateInfo(pending);
              setUpdateResult({ ok: false, log: s.log || 'No update log yet — the updater may not have started.' });
            }
          } catch (err) {
            showNotice(`Update status unavailable: ${err.message}`, 'err');
            setUpdateInfo(pending);
            setUpdateResult({ ok: false, log: `Could not read the update log: ${err.message}` });
          }
        }
      }, 3000);
    } catch (err) {
      setUpdating(false);
      showNotice(`Update failed: ${err.message}`, 'err');
      setUpdateInfo(pending);
      setUpdateResult({ ok: false, log: err.message });
    }
  }

  // AI calls retry themselves on provider "busy"/503/429 before the operator
  // ever sees an error. The server also fails over to another live model.
  async function aiApi(path, options = {}, attempts = 3) {
    let last;
    for (let i = 0; i < attempts; i++) {
      try {
        return await api(token, path, options);
      } catch (err) {
        last = err;
        const busy = err.status === 503 || err.status === 429
          || /busy|high demand|temporar|unavailable|overload|try again/i.test(err.message || '');
        if (!busy || i === attempts - 1) break;
        await new Promise((r) => setTimeout(r, 2000 + i * 3000));
      }
    }
    throw last;
  }

  async function suggestSubjects(direction = '') {
    if (subjectBusy) return;
    setSubjectBusy(true);
    try {
      const r = await aiApi('/api/ai/subjects', {
        method: 'POST',
        body: {
          subject: draft.subject, preheader: draft.preheader, html: draft.html, text: draft.text,
          prompt: direction, count: 6,
        },
      });
      const ideas = (r.subjects || []).filter(Boolean).slice(0, 10);
      if (!ideas.length) throw new Error('No subject ideas returned.');
      setSubjectIdeas(ideas);
      showNotice(`${ideas.length} subject ideas ready — click one to use it.`);
    } catch (err) {
      showNotice(`AI subjects: ${err.message}`, 'err');
    } finally {
      setSubjectBusy(false);
    }
  }

  function docPreset(kind) {
    const today = new Date().toISOString().slice(0, 10);
    const presets = {
      notice: {
        format: 'PDF', base: `Formal-Notice-${today}`,
        prompt: 'Write the body of a formal one-page notice from [Company] to [Firstname] [Lastname]. Start with a clear subject line. Write 2-3 short paragraphs: the matter, the action required, and the deadline. Use ++rbc_number6++ as the reference and ++rbc_date++ as the issue date. Output plain text only — no HTML, no markdown, no commentary. The page builder adds the letterhead, reference block, clickable button and action overlay.',
      },
      invoice: {
        format: 'PDF', base: `Invoice-${today}`,
        prompt: 'Write a concise invoice body from [Company] to [Firstname] [Lastname]. Include a reference, issue date, due date, line items with description / quantity / amount, subtotal, tax and total due. Output plain text lines only — no HTML, no markdown, no commentary. The page builder adds the letterhead and a clickable payment button.',
      },
      statement: {
        format: 'PDF', base: `Statement-${today}`,
        prompt: 'Write an account statement body for [Firstname] [Lastname]. Include the statement period, opening balance, a transaction table (date, description, amount), and closing balance. Output plain text lines only — no HTML, no markdown, no commentary. The page builder adds the letterhead and a clickable button.',
      },
      quote: {
        format: 'PDF', base: `Quote-${today}`,
        prompt: 'Write a renewal quote body from [Company] to [Firstname] [Lastname]. Include a reference, scope, itemized pricing, total, validity date and payment terms. Output plain text lines only — no HTML, no markdown, no commentary. The page builder adds the letterhead and a clickable accept button.',
      },
      receipt: {
        format: 'PDF', base: `Receipt-${today}`,
        prompt: 'Write a payment receipt body for [Firstname] [Lastname]. Include the paid date, payment method, reference, itemized lines, total paid and a short thank-you. Output plain text lines only — no HTML, no markdown, no commentary. The page builder adds the letterhead and a clickable button.',
      },
      agreement: {
        format: 'PDF', base: `Agreement-${today}`,
        prompt: 'Write a service agreement summary between [Company] and [Firstname] [Lastname]. Include the effective date, 4-6 numbered clauses and a signature block. Output plain text lines only — no HTML, no markdown, no commentary. The page builder adds the letterhead and a clickable review button.',
      },
      report: {
        format: 'PDF', base: `Report-${today}`,
        prompt: 'Write a concise monthly report for [Firstname] [Lastname]. Include a KPI summary, 3-5 findings with real-looking numbers, and one recommendation. Output plain text lines only — no HTML, no markdown, no commentary. The page builder adds the letterhead and a clickable read button.',
      },
      calendar: {
        format: 'ICS', base: `Calendar-Invite-${today}`,
        prompt: 'Write the details of a 30-minute calendar invite that fits this letter: title, date and time, location or link, and a short agenda. Output plain text lines only — no HTML, no markdown, no commentary.',
      },
    };
    const p = presets[kind] || presets.notice;
    setAwDocPreset(kind);
    setAwDocPrompt(p.prompt);
    setAwDocType(p.format);
    setAwDocName(`${p.base}.${p.format.toLowerCase()}`);
  }

  function attachmentBlob(a) {
    const bin = atob(String(a?.data || ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: a?.contentType || 'application/octet-stream' });
  }

  function previewGenerated(a) {
    try {
      if (a.contentType === 'application/pdf') {
        setAwPreview({ attachment: a, url: URL.createObjectURL(attachmentBlob(a)) });
      } else if (a.contentType === 'text/html') {
        setAwPreview({ attachment: a, html: atob(String(a.data || '')) });
      } else {
        setAwPreview({ attachment: a, text: atob(String(a.data || '')) });
      }
    } catch (err) {
      showNotice(`Preview failed: ${err.message}`, 'err');
    }
  }

  function downloadGenerated(a) {
    try {
      const url = URL.createObjectURL(attachmentBlob(a));
      const link = document.createElement('a');
      link.href = url;
      link.download = a.filename || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      showNotice(`Download failed: ${err.message}`, 'err');
    }
  }

  async function attachGenerated(a) {
    try {
      const up = await api(token, '/api/uploads', { method: 'POST', body: a });
      updateDraft('attachments', [...(draft.attachments || []), up]);
      showNotice(`Attached ${up.filename} (${Math.round((up.size || 0) / 1024)}KB).`);
      setAwAttachment(null);
      closeAwPreview();
    } catch (err) {
      showNotice(`Attach failed: ${err.message}`, 'err');
    }
  }

  function closeAwPreview() {
    setAwPreview((cur) => {
      if (cur?.url) URL.revokeObjectURL(cur.url);
      return null;
    });
  }

  async function copyChatText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showNotice('Copied.');
      return;
    } catch { /* fall through to the legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showNotice('Copied.');
    } catch {
      showNotice('Copy failed — select the text and copy it.', 'err');
    }
  }

  function editChatMessage(index) {
    const msg = chatMsgs[index];
    if (!msg || msg.role !== 'user' || chatBusy) return;
    setChatInput(msg.content);
    setChatEditIndex(index);
  }

  async function sendChat(override) {
    const text = (typeof override === 'string' ? override : chatInput).trim();
    if (!text || chatBusy) return;
    // Editing an earlier prompt resends from that point and drops the old tail.
    const base = (chatEditIndex !== null && typeof override !== 'string')
      ? chatMsgs.slice(0, chatEditIndex)
      : chatMsgs;
    const msgs = [...base, { role: 'user', content: text }];
    setChatMsgs(msgs);
    setChatInput('');
    setChatEditIndex(null);
    setChatBusy(true);
    try {
      const r = await Promise.race([
        aiApi('/api/ai/chat', {
          method: 'POST',
          body: {
            messages: msgs, model: chatModel,
            context: { tab, subject: draft.subject, html: draft.html, text: draft.text },
          },
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('RBC Helper timed out — provider not responding')), 150000)),
      ]);
      const replyText = String(r.reply || '').trim();
      const actions = r.actions || [];
      if (!replyText && !actions.length) throw new Error('AI provider returned an empty reply.');
      setChatMsgs([...msgs, { role: 'assistant', content: replyText || 'Done — use the action buttons below.', target: r.target || 'none', actions }]);
      if (r.model && r.model !== chatModel) setChatModel(r.model);
    } catch (err) {
      const message = err.message || 'chat failed';
      setChatMsgs([...msgs, { role: 'assistant', content: `⚠ ${message}` }]);
      showNotice(`AI: ${message}`, 'err');
    } finally {
      setChatBusy(false);
    }
  }

  function applyChat(content, field) {
    updateDraft(field === 'body' ? 'html' : field, content);
    showNotice(`Applied to ${field === 'body' ? 'HTML body' : field === 'text' ? 'text body' : field}.`);
  }

  async function runChatAction(a) {
    try {
      if (a.id === 'goto') { setTab(a.tab); return; }
      if (a.id === 'verify_accounts') {
        showNotice('Verifying all accounts…');
        const r = await api(token, '/api/smtp/verify-all', { method: 'POST' });
        const results = r?.results || r;
        const okCount = Array.isArray(results) ? results.filter((x) => x.ok).length : 0;
        showNotice(`Verify done — ${okCount}/${Array.isArray(results) ? results.length : '?'} live.`);
      } else if (a.id === 'reset_quotas') {
        await Promise.all((a.ids || []).map((id) => api(token, `/api/smtp/accounts/${id}/reset-quota`, { method: 'POST' })));
        showNotice(`Reset ${a.ids?.length || 0} quota(s).`);
      } else if (['pause', 'resume', 'retry', 'queue'].includes(a.id)) {
        const r = await api(token, `/api/campaigns/${a.campaignId}/${a.id}`, { method: 'POST', body: {} });
        showNotice(`${a.id === 'queue' ? `Queued ${r?.queued ?? ''}` : `Campaign #${a.campaignId} ${a.id}d`}.`);
      } else if (a.id === 'reset_quota_one') {
        await api(token, `/api/smtp/accounts/${a.accountId}/reset-quota`, { method: 'POST' });
        showNotice('Quota reset.');
      } else if (a.id === 'toggle_account') {
        const acct = (state.smtpAccounts || []).find((x) => x.id === a.accountId);
        if (!acct) { showNotice('Account not found — refresh and retry.'); return; }
        await api(token, `/api/smtp/accounts/${a.accountId}`, {
          method: 'PUT',
          body: { label: acct.label, host: acct.host, port: acct.port, secure: acct.secure, username: acct.username, password: '', fromName: acct.fromName, fromEmail: acct.fromEmail, replyTo: acct.replyTo, enabled: a.enabled, weight: acct.weight, dailyQuota: acct.dailyQuota },
        });
        showNotice(`${acct.label || acct.fromEmail} ${a.enabled ? 'enabled' : 'disabled'}.`);
      } else if (a.id === 'send_test') {
        showNotice(`Sending test to ${a.to}…`);
        const r = await api(token, '/api/test-send', { method: 'POST', body: { to: a.to, subject: draft.subject, html: draft.html, text: draft.text, accountIds: draft.accounts || [], accountsRandom: draft.accountsRandom === true } });
        setChatMsgs((m) => [...m, { role: 'assistant', content: `Test accepted by the engine${r.account ? ` via ${r.account}` : ''} for ${a.to} (${r.messageId || r.response || 'ok'}). Check the inbox - placement there is the real verdict.` }]);
      } else if (a.id === 'spam_check') {
        const r = await api(token, '/api/spam-check', { method: 'POST', body: { subject: draft.subject, html: draft.html, text: draft.text } });
        const issues = (r.issues || []).slice(0, 8).map((i) => `• ${i.type}${i.word ? ` "${i.word}"` : ''}${i.severity ? ` [${i.severity}]` : ''}`).join('\n');
        setChatMsgs((m) => [...m, { role: 'assistant', content: `Spam check — score ${r.score ?? '?'}/100${issues ? `\n\n${issues}` : '\n\nNo issues flagged.'}${(r.issues || []).length > 8 ? `\n…and ${r.issues.length - 8} more` : ''}`, target: 'none', actions: [] }]);
      }
      refresh();
    } catch (err) {
      showNotice(`Action failed: ${err.message}`);
    }
  }

  function login(e) {
    e.preventDefault();
    sessionStorage.setItem('mailerToken', loginToken);
    setToken(loginToken);
  }

  function logout() { sessionStorage.removeItem('mailerToken'); setToken(''); setState(null); }
  function updateDraft(k, v) { setDraft((c) => ({ ...c, [k]: v })); }
  function updateSettings(k, v) { setSettings((c) => ({ ...c, [k]: v })); }

  async function ensureDkimKey() {
    let domain = (settings.dkimDomain || '').trim().toLowerCase();
    if (!domain) {
      const ans = await uiPrompt('Domain to sign outgoing mail with?', { title: 'DKIM DOMAIN', placeholder: 'yourdomain.com', confirmLabel: 'GENERATE' });
      if (ans === null) return false;
      domain = ans.trim().toLowerCase();
    }
    const selector = (settings.dkimSelector || '').trim().toLowerCase() || 'rbc';
    const r = await api(token, '/api/settings/dkim-generate', { method: 'POST', body: { domain, selector } });
    updateSettings('dkimDomain', r.domain);
    updateSettings('dkimSelector', r.selector);
    updateSettings('dkimPublicKey', r.publicKey);
    updateSettings('dkimConfigured', true);
    updateSettings('dkimPrivateKey', '');
    return true;
  }

  function execEditPaste(cmd, val = null) {
    pasteRef.current.focus();
    document.execCommand(cmd, false, val);
    lastEditorHtml.current = pasteRef.current.innerHTML;
    updateDraft('html', lastEditorHtml.current);
  }

  // Textarea modes: wrap the current selection in the textarea
  function wrapSelection(field, ref, transform) {
    const ta = ref.current;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = (draft[field] || '').slice(s, e);
    const rep = transform(sel);
    const next = (draft[field] || '').slice(0, s) + rep + (draft[field] || '').slice(e);
    updateDraft(field, next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s;
      ta.selectionEnd = s + rep.length;
    });
  }

  const FONT_SIZE_PX = { 1: '12px', 2: '13px', 3: '14px', 4: '16px', 5: '18px', 6: '24px', 7: '32px' };

  async function execEdit(cmd, val = null) {
    if (bodyMode === 'paste' || bodyMode === 'blocks') {
      if (cmd === 'createLink') {
        const url = await uiPrompt('Link URL', { title: 'INSERT LINK', placeholder: 'https://...' });
        if (url) execEditPaste('createLink', url);
        return;
      }
      execEditPaste(cmd, val);
      return;
    }

    const isText = bodyMode === 'text';
    const field = isText ? 'text' : 'html';
    const ref = isText ? textRef : htmlRef;

    const wrapHtml = (tag, style = '') => (sel) =>
      `<${tag}${style ? ` style="${style}"` : ''}>${sel || 'text'}</${tag}>`;

    switch (cmd) {
      case 'bold': return wrapSelection(field, ref, isText ? (s) => `**${s || 'bold'}**` : wrapHtml('b'));
      case 'italic': return wrapSelection(field, ref, isText ? (s) => `*${s || 'italic'}*` : wrapHtml('i'));
      case 'underline': return wrapSelection(field, ref, isText ? (s) => `__${s || 'underline'}__` : wrapHtml('u'));
      case 'strikeThrough': return wrapSelection(field, ref, isText ? (s) => `~~${s || 'strike'}~~` : wrapHtml('s'));
      case 'createLink': {
        const url = await uiPrompt('Link URL', { title: 'INSERT LINK', placeholder: 'https://...' });
        if (!url) return;
        if (isText) return wrapSelection(field, ref, (s) => `[${s || 'link'}](${url})`);
        return wrapSelection(field, ref, (s) => `<a href="${url}">${s || 'link'}</a>`);
      }
      case 'unlink':
        return wrapSelection(field, ref, isText
          ? (s) => s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          : (s) => s.replace(/<\/?a[^>]*>/gi, ''));
      case 'foreColor':
        if (isText) return;
        return wrapSelection(field, ref, wrapHtml('span', `color:${val}`));
      case 'hiliteColor':
        if (isText) return;
        return wrapSelection(field, ref, wrapHtml('span', `background-color:${val}`));
      case 'insertUnorderedList':
        return wrapSelection(field, ref, isText
          ? (s) => s.split('\n').map((l) => (l.trim() ? `- ${l}` : l)).join('\n')
          : (s) => `<ul>${(s || 'item').split('\n').map((l) => `<li>${l.trim() || 'item'}</li>`).join('')}</ul>`);
      case 'insertOrderedList':
        return wrapSelection(field, ref, isText
          ? (s) => s.split('\n').map((l, i) => (l.trim() ? `${i + 1}. ${l}` : l)).join('\n')
          : (s) => `<ol>${(s || 'item').split('\n').map((l) => `<li>${l.trim() || 'item'}</li>`).join('')}</ol>`);
      case 'removeFormat':
        return wrapSelection(field, ref, isText
          ? (s) => s.replace(/\*\*|__|~~|\[([^\]]*)\]\([^)]*\)/g, (m, g) => g || '')
          : (s) => s.replace(/<[^>]+>/g, ''));
      case 'justifyLeft': case 'justifyCenter': case 'justifyRight': {
        if (isText) return;
        const align = { justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right' }[cmd];
        return wrapSelection(field, ref, wrapHtml('div', `text-align:${align}`));
      }
      case 'formatBlock': {
        if (isText) return;
        const tag = String(val).replace(/[<>]/g, '') || 'p';
        return wrapSelection(field, ref, wrapHtml(tag));
      }
      case 'fontSize': {
        if (isText) return;
        const px = FONT_SIZE_PX[val] || '16px';
        return wrapSelection(field, ref, wrapHtml('span', `font-size:${px}`));
      }
      default: return;
    }
  }

  function insertPlaceholder(val) {
    if ((bodyMode === 'paste' || bodyMode === 'blocks') && pasteRef.current) {
      pasteRef.current.focus();
      document.execCommand('insertText', false, val);
      lastEditorHtml.current = pasteRef.current.innerHTML;
      updateDraft('html', lastEditorHtml.current);
      return;
    }
    const ta = bodyMode === 'text' ? textRef.current : htmlRef.current;
    const field = bodyMode === 'text' ? 'text' : 'html';
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const current = draft[field] || '';
    updateDraft(field, current.slice(0, s) + val + current.slice(e));
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + val.length, s + val.length); });
  }

  async function saveDraft() {
    let id = selectedId;
    if (id) {
      await api(token, `/api/campaigns/${id}`, { method: 'PUT', body: draft });
    } else {
      const r = await api(token, '/api/campaigns', { method: 'POST', body: draft });
      id = r.id; setSelectedId(id);
    }
    await refresh(); return id;
  }

  function queue(schedule = false) {
    return run(async () => {
      const id = await saveDraft();
      const body = schedule ? { scheduledFor: new Date(scheduledFor).toISOString() } : {};
      const r = await api(token, `/api/campaigns/${id}/queue`, { method: 'POST', body });
      const pf = r.preflight;
      if (pf?.campaignFailed) {
        showNotice(`Queued ${r.queued}, but no live SMTP senders${pf.dropped?.length ? ` — dropped ${pf.dropped.length} dead` : ''}. Campaign failed.`, 'err');
      } else if (pf && !pf.skipped) {
        showNotice(`${r.queued} recipients queued — ${pf.live}/${pf.total} sender(s) live${pf.dropped?.length ? `, ${pf.dropped.length} dead dropped` : ''}.`);
      } else {
        showNotice(`${r.queued} recipients queued.`);
      }
      setSelectedId(null); setDraft(emptyDraft); setPreview(null);
      await refresh(); setTab('send');
    });
  }

  function editCampaign(c) {
    if (!['draft', 'failed', 'scheduled'].includes(c.status)) return;
    setSelectedId(c.id);
    setDraft({ name: c.name, subject: c.subject, preheader: c.preheader || '', html: c.html, text: c.text, attachments: c.attachments || [], providers: c.providers || [], lists: c.lists || [] });
    setTab('compose');
  }

  async function exportCampaign(id) {
    const res = await fetch(`/api/campaigns/${id}/export`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Export failed'); }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `campaign-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function saveSettings() {
    return run(async () => {
      await api(token, '/api/settings', { method: 'PUT', body: { ...settings } });
      showNotice('Settings saved.');
      await refresh();
    });
  }

  // ── totals across all campaigns ──
  const totals = (state?.campaigns || []).reduce(
    (acc, c) => ({ sent: acc.sent + c.sent, failed: acc.failed + c.failed, queued: acc.queued + c.queued }),
    { sent: 0, failed: 0, queued: 0 }
  );
  const plural = (count, one, many) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
  const needsMsReauth = (account) => /AADSTS50173|AADSTS700082|invalid_grant|revoked|reauth/i.test(account?.lastError || '');
  const deliveryBase = totals.sent + totals.failed;
  const deliveryRate = deliveryBase > 0 ? Math.round((totals.sent / deliveryBase) * 1000) / 10 : null;
  const liveSenders = (state?.smtpAccounts || []).filter((a) => a.enabled).length;
  const msSenders = (state?.smtpAccounts || []).filter((a) => a.enabled && (a.authType === 'ms_rt' || a.authType === 'ms_cc')).length;
  const delivChecks = deliverability?.checks || null;
  const delivEntries = delivChecks ? [
    ['SPF', delivChecks.spf],
    ['DKIM', delivChecks.dkim],
    ['DMARC', delivChecks.dmarc],
    ['PTR', delivChecks.ptr],
    ['PORT 25', delivChecks.port25],
    ['TRACKING', delivChecks.tracking],
  ] : [];
  const delivScored = delivEntries.filter(([, check]) => ['pass', 'warn', 'fail'].includes(check?.status));
  const delivPassed = delivScored.filter(([, check]) => check.status === 'pass').length;
  const delivFailing = delivEntries.filter(([, check]) => ['fail', 'warn'].includes(check?.status));
  const dashCampaigns = (state?.campaigns || []).slice(0, 6);
  const senderRows = (state?.smtpAccounts || []).slice(0, 5);

  // Friendly time shortcuts for the schedule screen.
  const quickWhen = (kind) => {
    const d = new Date();
    if (kind === 'hour') d.setHours(d.getHours() + 1, 0, 0, 0);
    if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
    if (kind === 'monday') {
      const add = ((8 - d.getDay()) % 7) || 7;
      d.setDate(d.getDate() + add); d.setHours(9, 0, 0, 0);
    }
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // One obvious next step on every screen, so nobody has to hunt for it.
  const primaryAction = (() => {
    switch (tab) {
      case 'dashboard': return { label: 'Write a letter', to: 'compose', icon: <Mail size={14} /> };
      case 'send': return { label: 'New campaign', to: 'compose', icon: <Send size={14} /> };
      case 'recipients': return { label: 'Add contacts', to: 'recipients', focus: '#import-list-name', icon: <Users size={14} /> };
      case 'sorter': return { label: 'Clean my list', to: 'recipients', focus: '#import-list-name', icon: <Filter size={14} /> };
      case 'smtp': return { label: 'Add a sender', to: 'smtp', focus: '#acct-label-input', icon: <Server size={14} /> };
      case 'aiwriter': return { label: 'Write with AI', to: 'aiwriter', icon: <Sparkles size={14} /> };
      case 'analytics': return { label: 'See campaigns', to: 'send', icon: <ArrowRight size={14} /> };
      case 'bounces': return { label: 'See contacts', to: 'recipients', icon: <Users size={14} /> };
      case 'help': return { label: 'Write a letter', to: 'compose', icon: <Mail size={14} /> };
      default: return null;
    }
  })();

  // ── LOGIN ──
  if (!token) {
    return (
      <>
      <ChromosomeBackground />
      <div className="login-wrap">
        <div className="login-box">
          <div className="login-brand">
            <RbcLogo size={72} />
            <div className="login-wordmark">RUBICON<span>EMAIL SUITE</span></div>
          </div>
          <p className="login-sub">YOUR WORKSPACE, ONE CODE AWAY</p>
          <form onSubmit={login} className="login-form">
            <label className="field-label">ACCESS CODE</label>
            <input className="w-input" type="password" value={loginToken} onChange={(e) => setLoginToken(e.target.value)} required autoFocus placeholder="Paste your access code" />
            <button className="btn-primary" type="submit">Open workspace</button>
          </form>
          {notice && <p className="login-err">ERROR {notice}</p>}
          <p className="login-made">made with ❤️ @fuckmonad</p>
        </div>
      </div>
      </>
    );
  }

  const sendMode = settings.sendMode || 'smtp';
  const aiReady = Boolean(settings.aiEndpoint && settings.aiKey);
  const pagedRecip = recipRows;

  function saveRecipField(r, patch) {
    run(async () => {
      await api(token, `/api/recipients/${r.id}`, { method: 'PUT', body: { firstName: r.firstName, lastName: r.lastName, company: r.company, list: r.list, ...patch } });
      await refresh();
    });
  }
  const pagedBounces = (state?.bounces || []).slice((bouncePage - 1) * pageSize, bouncePage * pageSize);
  const filteredCampaigns = (state?.campaigns || []).filter((c) => {
    if (campFilter === 'active' && !['queued', 'sending', 'scheduled'].includes(c.status)) return false;
    if (campFilter === 'draft' && c.status !== 'draft') return false;
    if (campFilter === 'done' && !['completed', 'failed', 'cancelled'].includes(c.status)) return false;
    if (campSearch && !`${c.name} ${c.subject} ${c.id}`.toLowerCase().includes(campSearch.toLowerCase())) return false;
    return true;
  });
  const pagedCampaigns = filteredCampaigns.slice((histPage - 1) * pageSize, histPage * pageSize);
  const pagedAccounts = (state?.smtpAccounts || []).slice((acctPage - 1) * pageSize, acctPage * pageSize);
  const editingAccount = editingAcct ? (state?.smtpAccounts || []).find((a) => a.id === editingAcct) : null;
  const draftEmpty = !draft.html.trim() && !draft.text.trim();
  const canQueue = !draftEmpty && draft.subject.trim().length > 0;
  const engineCheck = {
    smtp: { ok: !!state?.smtp?.configured || (state?.smtpAccounts?.length || 0) > 0, hint: 'add an SMTP account or server' },
    direct: { ok: !!settings.directFromEmail, hint: 'set FROM EMAIL in SETTINGS' },
    socks5: { ok: !!settings.directFromEmail && !!settings.socks5Proxy, hint: 'set proxy + FROM EMAIL in SETTINGS' },
    relay: { ok: !!settings.relayHost && !!settings.directFromEmail, hint: 'set relay host + FROM EMAIL' },
    graph: { ok: msSenders > 0 || !!(settings.engineClientId && ((settings.engineClientSecret && settings.engineTenant) || settings.engineMsRefreshToken)), hint: 'connect an MS mailbox or enter Graph credentials in SETTINGS' },
    gmail: { ok: !!(settings.engineClientId && settings.engineClientSecret && settings.engineRefreshToken), hint: 'enter Gmail OAuth credentials in SETTINGS' },
    api: { ok: !!settings.apiProvider && (settings.apiKeySet || settings.apiProvider === 'custom') && !!settings.directFromEmail, hint: 'pick provider, add key + FROM EMAIL' },
  };
  const { ok: engineReady, hint: engineHint } = engineCheck[sendMode] || { ok: false, hint: 'configure the engine' };
  const chatSugg = [
    totals.failed > 0 ? `Why are ${totals.failed} sends failing?` : null,
    !(state?.smtpAccounts || []).length ? 'How do I import MS mailboxes?' : 'Check my account pool health',
    !draftEmpty ? 'Improve my current letter' : 'Write a subject line for a promo email',
    !draftEmpty ? 'Check my draft for spam triggers' : null,
    totals.queued > 0 ? 'Pause the queue' : 'Which send mode am I on and is it right?',
  ].filter(Boolean).slice(0, 5);

  return (
    <>
    <ChromosomeBackground />
    <div className={`layout${chatOpen ? ' chat-open' : ''}`}>
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type === 'err' ? 'toast-err' : 'toast-ok'}`}>
            <span className="toast-ic">{t.type === 'err' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}</span>
            <span className="toast-msg">{t.msg}</span>
            <button aria-label="Dismiss" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <RbcLogo size={46} />
          <div>
            <span className="sb-wordmark">RUBICON<span>EMAIL SUITE</span></span>
            {versionInfo && (
              <div className="sb-ver" title="Check for update" style={{ cursor: 'pointer' }} onClick={async () => {
                try {
                  const r = await api(token, '/api/update/check');
                  setVersionInfo({ version: r.version, commit: r.local });
                  if (!r.upToDate && r.remote) setUpdateInfo(r);
                  else showNotice(`Up to date — ${String(r.local || '').slice(0, 7)}`);
                } catch { showNotice('Update check failed.'); }
              }}>
                v{versionInfo.version}{versionInfo.commit ? ` · ${versionInfo.commit.slice(0, 7)}` : ''} ↻
              </div>
            )}
          </div>
        </div>

        <div className="sb-stats">
          <div className="stat-row"><span className="stat-lbl">MODE</span><span className="stat-val mode-val">{sendMode.toUpperCase()}</span></div>
          <div className="stat-row"><span className="stat-lbl">LIST</span><span className="stat-val">{state?.confirmed || 0}</span></div>
          <div className="stat-row"><span className="stat-lbl">SENT</span><span className="stat-val sent-val">{totals.sent}</span></div>
          <div className="stat-row"><span className="stat-lbl">FAIL</span><span className="stat-val fail-val">{totals.failed}</span></div>
          <div className="stat-row"><span className="stat-lbl">QUEUE</span><span className="stat-val queue-val">{totals.queued}</span></div>
        </div>

        <nav className="sb-nav" aria-label="Suite sections">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item ${tab === item.id ? 'active' : ''}`} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}>
              <span className="nav-icon" aria-hidden="true"><NavIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {updateInfo && !updating && (
          <div className="upd-side">
            <button className="nav-item upd-nav" aria-label="Update available — open details" onClick={() => setUpdateOpen((o) => !o)}>
              <span className="nav-icon" aria-hidden="true">⇧</span>
              <span>UPDATE</span>
            </button>
            {updateOpen && (
              <div className="upd-side-card">
                <p>A new Rubicon build is ready — installs and restarts automatically.</p>
                {!!(updateInfo.changes || []).length && (
                  <ul>{updateInfo.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                )}
                <div className="upd-side-actions">
                  <button className="btn-primary" onClick={applyUpdate}>UPDATE</button>
                  <button className="btn-sm" onClick={() => setUpdateInfo(null)}>DISMISS</button>
                </div>
              </div>
            )}
          </div>
        )}

        <button className="nav-item logout-btn" onClick={logout}><LogOut size={16} /><span>Log out</span></button>

        <div className="sb-net">
          <div className="sb-net-title">
            <span>SERVER</span>
            <button className="sb-recheck" disabled={netInfoLoading} title="Re-check the public IP and port 25 now"
              onClick={() => { setNetInfoLoading(true); api(token, '/api/netinfo?refresh=1').then(setNetInfo).catch(() => showNotice('Server check failed.', 'err')).finally(() => setNetInfoLoading(false)); }}>
              {netInfoLoading ? '…' : 'RECHECK'}
            </button>
          </div>
          <div className="sb-net-row">
            <span className="stat-lbl">IP</span>
            <button className="sb-ip" title="Click to copy — use for SMTP relay / IP whitelists" aria-label="Copy server public IP"
              onClick={() => { if (netInfo?.publicIp) { navigator.clipboard.writeText(netInfo.publicIp); showNotice('IP copied.'); } }}>
              {netInfo?.publicIp || '…'}
            </button>
          </div>
          <div className="sb-net-row">
            <span className="stat-lbl">PORT 25</span>
            <span className={`stat-val ${netInfo?.port25?.open ? 'sent-val' : ['direct', 'socks5'].includes(sendMode) ? 'fail-val' : 'mode-val'}`}
              title={netInfo && !netInfo.port25?.open
                ? `Port 25 ${netInfo.port25?.reason || 'filtered'}${['direct', 'socks5'].includes(sendMode) ? ' - direct MX unavailable' : ` (not used in ${sendMode.toUpperCase()} mode)`}`
                : 'Outbound port 25'}>
              {netInfo ? (netInfo.port25?.open ? 'OPEN' : 'BLOCKED') : '…'}
            </span>
          </div>
          {!['direct', 'socks5'].includes(sendMode) && (
            <div className="sb-net-hint">port 25 not used in {sendMode.toUpperCase()} mode</div>
          )}
          <div className="sb-net-hint">click IP to copy · whitelist this egress IP for relay</div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main-wrap" role="main">

        {/* top bar */}
        <div className="topbar">
          <span className="topbar-title">
            <NavIcon name={NAV_ITEMS.find((n) => n.id === tab)?.icon} size={13} />&nbsp;
            {NAV_ITEMS.find((n) => n.id === tab)?.label}
          </span>
          {busy && <span className="busy-dot" role="status" aria-label="Working">●</span>}
          {primaryAction && (
            <button className="topbar-cta" onClick={() => {
              if (primaryAction.to !== tab) setTab(primaryAction.to);
              if (primaryAction.focus) {
                setTimeout(() => {
                  const el = document.querySelector(primaryAction.focus);
                  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
                }, 160);
              }
            }}>
              {primaryAction.icon}
              <span>{primaryAction.label}</span>
            </button>
          )}
          <button className="topbar-ai" title="Rubicon AI" aria-label="Open Rubicon AI assistant"
            onClick={() => setChatOpen((open) => !open)}>
            <Sparkles size={14} /> Rubicon AI
          </button>
        </div>

        <div className="content">
          {!state ? (
            <div className="loading">LOADING...</div>
          ) : (
            <>

              {/* ══ LETTER / COMPOSE ══ */}
              {tab === 'compose' && (
                <div className="compose-layout">
                  <div className="pane">
                    <div className="pane-head">
                      <span>{selectedId ? `EDIT DRAFT #${selectedId}` : 'NEW LETTER'}</span>
                      <div className="head-actions">
                        <button className="btn-sm" disabled={busy} onClick={() => setVisualEditorOpen(!visualEditorOpen)}>{visualEditorOpen ? 'HTML EDITOR' : 'VISUAL EDITOR'}</button>
                        <button className="btn-sm" disabled={busy} onClick={() => setAiAssistantOpen(!aiAssistantOpen)}>AI ASSIST</button>
                        <button className="btn-sm" disabled={busy} onClick={() => setSpamCheckOpen(!spamCheckOpen)}>SPAM CHECK</button>
                        <button className="btn-sm" disabled={busy} onClick={() => run(async () => { await saveDraft(); showNotice('Draft saved.'); })}>SAVE</button>
                      </div>
                    </div>

                    <label className="field-label">CAMPAIGN NAME</label>
                    <input className="w-input" value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} placeholder="Campaign name" />

                    <label className="field-label">SUBJECT</label>
                    <input className="w-input" value={draft.subject} onChange={(e) => updateDraft('subject', e.target.value)} placeholder="Subject line — placeholders work here" />
                    <div className="subject-helper">
                      <button
                        type="button"
                        className="btn-xs subject-ai-btn"
                        disabled={subjectBusy || !(settings.aiEndpoint && settings.aiKey)}
                        title="AI writes clean subject options from this letter — click one to apply"
                        onClick={() => suggestSubjects()}
                      >{subjectBusy ? 'THINKING…' : '✦ SUGGEST SUBJECTS'}</button>
                      {!!subjectIdeas.length && <span className="dim-txt">click a line to apply it</span>}
                      {!!subjectIdeas.length && <button type="button" className="btn-xs" onClick={() => setSubjectIdeas([])}>CLEAR</button>}
                    </div>
                    {!!subjectIdeas.length && (
                      <div className="subject-ideas">
                        {subjectIdeas.map((idea, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`subject-idea${draft.subject === idea ? ' on' : ''}`}
                            title="Use this subject line"
                            onClick={() => { updateDraft('subject', idea); showNotice('Subject applied.'); }}
                          >{idea}</button>
                        ))}
                      </div>
                    )}

                    <div className="template-row">
                      <select className="w-select" onChange={async (e) => {
                        const templateId = Number(e.target.value);
                        if (!templateId) return;
                        const r = templates.find((t) => t.id === templateId);
                        if (!r) { showNotice('Template not found — refresh the list.'); return; }
                        updateDraft('subject', r.subject);
                        updateDraft('preheader', r.preheader);
                        updateDraft('html', r.html);
                        updateDraft('text', r.text);
                        updateDraft('attachments', r.attachments || []);
                        showNotice(`Template "${r.name}" loaded.`);
                        e.target.value = '';
                      }}>
                        <option value="">Load template...</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <button className="btn-xs" onClick={async () => {
                        const name = await uiPrompt('Template name?', 'Save as template', 'Template name');
                        if (!name) return;
                        await api(token, '/api/templates', { method: 'POST', body: { name, subject: draft.subject, preheader: draft.preheader, html: draft.html, text: draft.text, attachments_json: draft.attachments || [] } });
                        showNotice('Template saved.');
                        const r = await api(token, '/api/templates');
                        setTemplates(r || []);
                      }}>SAVE TEMPLATE</button>
                    </div>

                    <label className="field-label">PREHEADER <span className="dim">(inbox preview text)</span></label>
                    <input className="w-input" value={draft.preheader} onChange={(e) => updateDraft('preheader', e.target.value)} placeholder="Preview text recipients see next to the subject..." />

                    {/* AI ASSISTANT PANEL */}
                    {aiAssistantOpen && (
                      <div className="ai-panel">
                        <div className="ai-panel-head">
                          <span>AI ASSISTANT</span>
                          <button className="btn-sm" aria-label="Close AI assist panel" onClick={() => setAiAssistantOpen(false)}>×</button>
                        </div>
                        <div className="ai-presets">
                          <button className="btn-sm" onClick={() => suggestSubjects('Rewrite the subject line for a higher open rate.')}>REWRITE SUBJECT</button>
                          <button className="btn-sm" onClick={() => setAiPrompt('Personalize the body content using [Firstname], [Lastname], [Company] placeholders.')}>PERSONALIZE BODY</button>
                          <button className="btn-sm" onClick={() => setAiPrompt('Optimize this email for inbox placement and avoid spam triggers.')}>OPTIMIZE FOR INBOX</button>
                          <button className="btn-sm" onClick={() => setAiPrompt('Fix any spam triggers in the content.')}>FIX SPAM TRIGGERS</button>
                          <button className="btn-sm" onClick={() => setAiPrompt('Write a preheader (inbox preview text, max 90 chars) for this email.')}>PREHEADER</button>
                          <button className="btn-sm" onClick={() => setAiPrompt('Generate a professional PDF attachment document related to this letter (invoice, notice, or statement — pick whichever fits the content).')}>DRAFT PDF</button>
                        </div>
                        <textarea
                          className="ai-prompt-input"
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder="Custom prompt... e.g., 'Make the tone more urgent' or 'Add a call-to-action'"
                          rows={2}
                        />
                        <button
                          className="btn-sm"
                          disabled={aiStreaming || !aiPrompt}
                          onClick={async () => {
                            setAiStreaming(true);
                            setAiResponse('');
                            setAiAttachment(null);
                            setAiTarget('body');
                            try {
                              const res = await aiApi('/api/ai/assist', {
                                method: 'POST',
                                body: { prompt: aiPrompt, subject: draft.subject, html: draft.html, text: draft.text },
                              });
                              const resultText = String(res.result || '').trim();
                              if (!resultText && !res.attachment) throw new Error('AI provider returned an empty result.');
                              setAiResponse(resultText);
                              setAiTarget(res.target || 'body');
                              setAiAttachment(res.attachment || null);
                            } catch (err) {
                              const message = err.message || 'AI request failed';
                              setAiResponse(`Error: ${message}`);
                              showNotice(`AI: ${message}`, 'err');
                            } finally {
                              setAiStreaming(false);
                            }
                          }}
                        >
                          {aiStreaming ? 'GENERATING...' : 'GENERATE'}
                        </button>
                        {aiResponse && (
                          <div className="ai-response-area">
                            <div className="ai-response-head">
                              <span>RESULT <span className="dim" style={{ fontSize: 10 }}>→ {aiTarget}</span></span>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {aiTarget === 'attachment' && aiAttachment ? (
                                  <button className="btn-sm" onClick={async () => {
                                    try {
                                      const up = await api(token, '/api/uploads', { method: 'POST', body: aiAttachment });
                                      updateDraft('attachments', [...(draft.attachments || []), up]);
                                      showNotice(`Attached ${up.filename} (${Math.round((up.size || 0) / 1024)}KB).`);
                                    } catch (err) {
                                      showNotice(`Attach failed: ${err.message}`);
                                    }
                                  }}>ATTACH TO LETTER</button>
                                ) : (
                                  <button className="btn-sm" onClick={() => {
                                    const field = aiTarget === 'subject' ? 'subject' : aiTarget === 'preheader' ? 'preheader' : 'html';
                                    updateDraft(field, aiResponse);
                                    showNotice(`Applied to ${field === 'html' ? 'HTML body' : field}.`);
                                  }}>APPLY → {aiTarget.toUpperCase()}</button>
                                )}
                                <select className="w-select" style={{ width: 'auto', padding: '2px 6px', fontSize: 10 }} value="" onChange={(e) => {
                                  if (!e.target.value) return;
                                  updateDraft(e.target.value, aiResponse);
                                  showNotice(`Applied to ${e.target.options[e.target.selectedIndex].text}.`);
                                }}>
                                  <option value="">apply to…</option>
                                  <option value="subject">subject</option>
                                  <option value="preheader">preheader</option>
                                  <option value="html">body</option>
                                  <option value="text">text body</option>
                                </select>
                              </div>
                            </div>
                            <pre className="ai-response-text">{aiResponse}</pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SPAM CHECK PANEL */}
                    {spamCheckOpen && (
                      <div className="ai-panel">
                        <div className="ai-panel-head">
                          <span>SPAM SCORE CHECKER</span>
                          <button className="btn-sm" aria-label="Close spam check" onClick={() => setSpamCheckOpen(false)}>×</button>
                        </div>
                        <button
                          className="btn-sm"
                          disabled={spamChecking}
                          onClick={async () => {
                            setSpamChecking(true);
                            setSpamScore(null);
                            setSpamIssues([]);
                            setSpamFix(null);
                            try {
                              const res = await api(token, '/api/spam-check', {
                                method: 'POST',
                                body: { subject: draft.subject, html: draft.html, text: draft.text },
                              });
                              setSpamScore(res.score);
                              setSpamIssues(res.issues || []);
                            } catch (err) {
                              setSpamScore(0);
                              setSpamIssues([{ type: 'error', severity: 'high', desc: err.message || 'Check failed' }]);
                            } finally {
                              setSpamChecking(false);
                            }
                          }}
                        >
                          {spamChecking ? 'CHECKING...' : 'RUN CHECK'}
                        </button>
                        {spamScore !== null && (
                          <div className="spam-result-area">
                            <div className="spam-score-display">
                              <span className={`spam-score ${spamScore >= 80 ? 'spam-good' : spamScore >= 50 ? 'spam-warn' : 'spam-bad'}`}>
                                {spamScore}/100
                              </span>
                              <span className="spam-score-label">
                                {spamScore >= 80 ? 'GOOD' : spamScore >= 50 ? 'WARN' : 'POOR'}
                              </span>
                            </div>
                            {spamIssues.length > 0 && (
                              <div className="spam-issues-list">
                                {spamIssues.map((issue, i) => (
                                  <div key={i} className={`spam-issue spam-${issue.severity}`}>
                                    <span className="spam-issue-type">
                                      {issue.type.replace(/_/g, ' ').toUpperCase()}
                                    </span>
                                    <span className="spam-issue-desc">
                                      {issue.word && `Word: "${issue.word}"`}
                                      {issue.count && `Count: ${issue.count}`}
                                      {issue.length && `Length: ${issue.length}`}
                                      {issue.desc && issue.desc}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {spamIssues.length > 0 && spamScore < 80 && (
                              <button
                                className="btn-sm"
                                disabled={spamFixing}
                                onClick={async () => {
                                  setSpamFixing(true);
                                  setSpamFix(null);
                                  try {
                                    const findings = spamIssues.map((i) => `${i.type}${i.word ? ` "${i.word}"` : ''}${i.desc ? ` — ${i.desc}` : ''}`).join('; ');
                                    const res = await aiApi('/api/ai/assist', {
                                      method: 'POST',
                                      body: {
                                        prompt: `Rewrite this email to fix these spam-check findings: ${findings}. Keep the same intent, links, and ++rbc_*++ placeholders. Output only the revised content.`,
                                        subject: draft.subject, html: draft.html, text: draft.text,
                                      },
                                    });
                                    setSpamFix({ text: res.result || '', target: res.target || 'html' });
                                  } catch (err) {
                                    showNotice(`AI fix failed: ${err.message}`, 'err');
                                  } finally {
                                    setSpamFixing(false);
                                  }
                                }}
                              >
                                {spamFixing ? 'FIXING...' : 'FIX WITH AI'}
                              </button>
                            )}
                            {spamFix && (
                              <div className="ai-response-area">
                                <div className="ai-response-head">
                                  <span>AI FIX <span className="dim" style={{ fontSize: 10 }}>→ {spamFix.target}</span></span>
                                  <button className="btn-sm" onClick={() => {
                                    const field = spamFix.target === 'subject' ? 'subject' : spamFix.target === 'preheader' ? 'preheader' : spamFix.target === 'text' ? 'text' : 'html';
                                    updateDraft(field, spamFix.text);
                                    showNotice('Applied — re-run the check to verify.');
                                  }}>APPLY → {spamFix.target.toUpperCase()}</button>
                                </div>
                                <pre className="ai-response-text">{spamFix.text}</pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* AUDIENCE TARGETING */}
                    {(() => {
                      const counts = state.providerCounts || {};
                      const providers = Object.keys(counts).sort();
                      const selected = draft.providers || [];
                      const eligible = providers.filter((p) => !selected.length || selected.includes(p)).reduce((n, p) => n + counts[p], 0);
                      const toggleProvider = (p) => {
                        const next = selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p];
                        updateDraft('providers', next);
                      };
                      return (
                        <div className="audience-block">
                          <label className="field-label">AUDIENCE <span className="dim">({eligible} of {state.recipientTotal || 0} eligible — blank = all providers)</span></label>
                          <div className="provider-chips">
                            {providers.length === 0 && <span className="dim">no classified recipients — run SORT BY PROVIDER in RECIPIENTS</span>}
                            {providers.map((p) => (
                              <button
                                key={p}
                                type="button"
                                className={`prov-chip ${selected.includes(p) ? 'prov-chip-on' : ''}`}
                                onClick={() => toggleProvider(p)}
                              >{p} <span className="prov-count">{counts[p]}</span></button>
                            ))}
                            {selected.length > 0 && (
                              <button type="button" className="prov-chip prov-chip-clear" onClick={() => updateDraft('providers', [])}>ALL</button>
                            )}
                          </div>
                          {!!(state.lists || []).length && (
                            <>
                              <label className="field-label" style={{ marginTop: 10 }}>CONTACT LISTS <span className="dim">(blank = every list)</span></label>
                              <div className="provider-chips">
                                {state.lists.map((l) => (
                                  <button
                                    key={l.name}
                                    type="button"
                                    className={`prov-chip ${(draft.lists || []).includes(l.name) ? 'prov-chip-on' : ''}`}
                                    onClick={() => {
                                      const cur = draft.lists || [];
                                      updateDraft('lists', cur.includes(l.name) ? cur.filter((x) => x !== l.name) : [...cur, l.name]);
                                    }}
                                  >{l.name} <span className="prov-count">{l.count}</span></button>
                                ))}
                                {(draft.lists || []).length > 0 && (
                                  <button type="button" className="prov-chip prov-chip-clear" onClick={() => updateDraft('lists', [])}>ALL LISTS</button>
                                )}
                              </div>
                            </>
                          )}
                          {(() => {
                            const mode = settings.sendMode;
                            const poolRelevant = mode === 'smtp' || mode === 'graph';
                            const sendable = (state.smtpAccounts || []).filter((a) => a.enabled && (mode === 'smtp' || (a.authType || '').startsWith('ms_')));
                            if (!poolRelevant || !sendable.length) return null;
                            const selected = draft.accounts || [];
                            const labelFor = (a) => a.label || a.username || `#${a.id}`;
                            return (
                            <details className="account-picker" style={{ marginTop: 10 }}>
                              <summary>
                                <span>SEND ACCOUNTS</span>
                                <span className="dim">
                                  {selected.length
                                    ? `${selected.length} selected`
                                    : `all enabled ${mode === 'graph' ? 'MS mailboxes' : 'senders'}`}
                                </span>
                              </summary>
                              <div className="account-picker-body">
                                <label className="check-row">
                                  <input type="checkbox" checked={!selected.length} onChange={() => updateDraft('accounts', [])} />
                                  <span>ALL ENABLED {mode === 'graph' ? 'MS MAILBOXES' : 'SENDERS'}</span>
                                </label>
                                {sendable.map((a) => (
                                  <label className="check-row" key={a.id}>
                                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => {
                                      updateDraft('accounts', selected.includes(a.id) ? selected.filter((x) => x !== a.id) : [...selected, a.id]);
                                    }} />
                                    <span>{labelFor(a)} <span className="dim">· {a.authType === 'ms_rt' ? 'RT' : a.authType === 'ms_cc' ? 'CC' : 'SMTP'}</span></span>
                                  </label>
                                ))}
                                <label className="check-row" style={{ marginTop: 4 }}>
                                  <input type="checkbox" checked={draft.accountsRandom === true} onChange={(e) => updateDraft('accountsRandom', e.target.checked)} />
                                  <span>RANDOM ORDER</span>
                                </label>
                                <div className="btn-row" style={{ marginTop: 6 }}>
                                  <button type="button" className="btn-xs" onClick={() => updateDraft('accounts', sendable.map((a) => a.id))}>SELECT ALL</button>
                                  <button type="button" className="btn-xs" onClick={() => updateDraft('accounts', [])}>CLEAR</button>
                                </div>
                              </div>
                            </details>
                            );
                          })()}
                          <label className="check-row" style={{ marginTop: 10 }}>
                            <input type="checkbox" checked={settings.disclaimerText === SCAN_DISCLAIMER}
                              onChange={(e) => {
                                const next = { ...settings,
                                  disclaimerText: e.target.checked ? SCAN_DISCLAIMER : (settings.disclaimerText === SCAN_DISCLAIMER ? '' : settings.disclaimerText),
                                  disclaimerInPdf: e.target.checked ? true : settings.disclaimerInPdf,
                                };
                                setSettings(next);
                                run(async () => {
                                  await api(token, '/api/settings', { method: 'PUT', body: next });
                                  showNotice(e.target.checked ? 'Scan disclaimer on — letters and PDFs.' : 'Scan disclaimer removed.');
                                  await refresh();
                                });
                              }} />
                            <span>SCAN DISCLAIMER AT THE BOTTOM <span className="dim">(letters + every PDF)</span></span>
                          </label>
                          <label className="field-label" style={{ marginTop: 10 }}>ENGAGEMENT TIERS <span className="dim">(blank = every tier)</span></label>
                          <div className="provider-chips">
                            {[['hot', 'HOT 70+'], ['warm', 'WARM 31-69'], ['cold', 'COLD 0-30']].map(([t, l]) => (
                              <button
                                key={t}
                                type="button"
                                className={`prov-chip ${(draft.tiers || []).includes(t) ? 'prov-chip-on' : ''}`}
                                onClick={() => {
                                  const cur = draft.tiers || [];
                                  updateDraft('tiers', cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
                                }}
                              >{l}</button>
                            ))}
                          </div>
                          <div className="btn-row" style={{ marginTop: 10 }}>
                            <button type="button" className="btn-sm" disabled={busy} title="AI picks the strongest letter from the vault for this audience" onClick={() => run(async () => {
                              const r = await aiApi('/api/ai/pick-letter', { method: 'POST', body: { goal: draft.subject || draft.name, providers: draft.providers || [], lists: draft.lists || [], tiers: draft.tiers || [] } });
                              updateDraft('html', r.html);
                              if (r.text) updateDraft('text', r.text);
                              if (r.subject && !draft.subject) updateDraft('subject', r.subject);
                              if (r.preheader && !draft.preheader) updateDraft('preheader', r.preheader);
                              showNotice(`AI picked "${r.name}" — ${r.why || 'best fit for this audience'}`);
                            })}>✦ BEST LETTER FOR AUDIENCE</button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* PLACEHOLDER DROPDOWN */}
                    <div className="ph-dropdown-wrap">
                      <label className="field-label">INSERT PLACEHOLDER</label>
                      <select
                        className="w-select ph-select"
                        value=""
                        onChange={(e) => { if (e.target.value) insertPlaceholder(e.target.value); }}
                      >
                        <option value="">— select a placeholder to insert —</option>
                        {PLACEHOLDER_GROUPS.map((g) => (
                          <optgroup key={g.label} label={g.label}>
                            {g.items.map(({ tag, tip }) => (
                              <option key={tag} value={tag}>{tag} — {tip}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {/* LETTER TEMPLATE */}
                    <div style={{ marginBottom: 10 }}>
                      <label className="field-label">LETTER TEMPLATE <span className="dim">(loads subject + body — placeholders render per recipient)</span></label>
                      <select className="w-select" value="" onChange={(e) => {
                        const all = [...LETTER_TEMPLATES, ...extraTemplates];
                        const idx = e.target.value === 'random' ? Math.floor(Math.random() * all.length) : Number(e.target.value);
                        const t = all[idx];
                        if (!t || !t.html) { e.target.value = ''; return; }
                        setDraft({ ...draft, name: draft.name || t.label.replace(/^✉\s*/, ''), subject: t.subject || draft.subject, html: stripPageHtml(t.html), text: t.text || draft.text });
                        setBodyMode('paste');
                        e.target.value = '';
                      }}>
                        <option value="">— select a template to load —</option>
                        <option value="random">⚄ RANDOM — pick one for me</option>
                        {LETTER_TEMPLATES.map((t, i) => <option key={i} value={i} disabled={!t.html}>{t.label}</option>)}
                        {extraTemplates.length > 0 && <option disabled>── {extraTemplates.length} letter imports ──</option>}
                        {extraTemplates.map((t, i) => <option key={`x${i}`} value={LETTER_TEMPLATES.length + i}>{t.label}</option>)}
                      </select>
                    </div>

                    {/* BODY MODE TOGGLE */}
                    <div className="body-mode-bar">
                      <span className="field-label" style={{ margin: 0 }}>BODY MODE</span>
                      <div className="mode-toggle">
                        <button type="button" className={bodyMode === 'html' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('html')}>HTML</button>
                        <button type="button" className={bodyMode === 'paste' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('paste')}>PASTE</button>
                        <button type="button" className={bodyMode === 'blocks' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('blocks')}>BLOCKS</button>
                        <button type="button" className={bodyMode === 'text' ? 'mode-btn active' : 'mode-btn'} onClick={() => setBodyMode('text')}>PLAIN</button>
                      </div>
                    </div>

                    {/* EDITOR TOOLBAR — paste/blocks only, expands on demand */}
                    {(bodyMode === 'paste' || bodyMode === 'blocks') && (
                    <div className="tb-wrap">
                      <button type="button" className={`tb-toggle ${toolbarOpen ? 'tb-toggle-on' : ''}`} onClick={() => setToolbarOpen(!toolbarOpen)} aria-expanded={toolbarOpen}>
                        ✎ FORMAT {toolbarOpen ? '▾' : '▸'}
                      </button>
                      {toolbarOpen && (
                    <div className="editor-toolbar" onMouseDown={(e) => e.preventDefault()}>
                      <button type="button" className="tb-btn" title="Bold" onClick={() => execEdit('bold')}><b>B</b></button>
                      <button type="button" className="tb-btn" title="Italic" onClick={() => execEdit('italic')}><i>I</i></button>
                      <button type="button" className="tb-btn" title="Underline" onClick={() => execEdit('underline')}><u>U</u></button>
                      <button type="button" className="tb-btn" title="Strikethrough" onClick={() => execEdit('strikeThrough')}><s>S</s></button>
                      <span className="tb-sep" />
                      <button type="button" className="tb-btn" title="Insert hyperlink" onClick={() => execEdit('createLink')}>LINK</button>
                      <button type="button" className="tb-btn" title="Remove link" onClick={() => execEdit('unlink')}>UNLINK</button>
                      <span className="tb-sep" />
                      <label className="tb-color" title="Text color">
                        <span className="tb-color-lbl">A</span>
                        <input type="color" defaultValue="#e5eaf5" onChange={(e) => execEdit('foreColor', e.target.value)} />
                      </label>
                      <label className="tb-color" title="Highlight color">
                        <span className="tb-color-lbl">HL</span>
                        <input type="color" defaultValue="#ffe066" onChange={(e) => execEdit('hiliteColor', e.target.value)} />
                      </label>
                      <span className="tb-sep" />
                      <button type="button" className="tb-btn" title="Bullet list" onClick={() => execEdit('insertUnorderedList')}>• LIST</button>
                      <button type="button" className="tb-btn" title="Numbered list" onClick={() => execEdit('insertOrderedList')}>1. LIST</button>
                      <button type="button" className="tb-btn" title="Clear formatting" onClick={() => execEdit('removeFormat')}>CLEAR</button>
                      <span className="tb-sep" />
                      <button type="button" className="tb-btn" title="Align left" onClick={() => execEdit('justifyLeft')}>⇤</button>
                      <button type="button" className="tb-btn" title="Align center" onClick={() => execEdit('justifyCenter')}>≡</button>
                      <button type="button" className="tb-btn" title="Align right" onClick={() => execEdit('justifyRight')}>⇥</button>
                      <span className="tb-sep" />
                      <select className="tb-select" title="Block style" defaultValue="" onChange={(e) => { if (e.target.value) execEdit('formatBlock', e.target.value); e.target.value = ''; }}>
                        <option value="">BLOCK</option>
                        <option value="&lt;p&gt;">PARAGRAPH</option>
                        <option value="&lt;h1&gt;">HEADING 1</option>
                        <option value="&lt;h2&gt;">HEADING 2</option>
                        <option value="&lt;h3&gt;">HEADING 3</option>
                        <option value="&lt;blockquote&gt;">QUOTE</option>
                      </select>
                      <select className="tb-select" title="Font size" defaultValue="" onChange={(e) => { if (e.target.value) execEdit('fontSize', e.target.value); e.target.value = ''; }}>
                        <option value="">SIZE</option>
                        <option value="1">XS</option>
                        <option value="3">SM</option>
                        <option value="5">MD</option>
                        <option value="6">LG</option>
                        <option value="7">XL</option>
                      </select>
                    </div>
                      )}
                    </div>
                    )}

                    {bodyMode === 'html' && (
                      <>
                        <label className="field-label">HTML BODY</label>
                        <textarea ref={htmlRef} className="w-textarea code-ta" rows={16} value={draft.html} onChange={(e) => updateDraft('html', e.target.value)} />
                      </>
                    )}
                    {(bodyMode === 'paste' || bodyMode === 'blocks') && (
                      <>
                        <label className="field-label">{bodyMode === 'blocks' ? 'BLOCK EDITOR' : 'PASTE EMAIL CONTENT'} <span className="dim">(copy from Gmail/Outlook — keeps images, fonts, links)</span></label>
                        {bodyMode === 'blocks' && (
                          <div className="block-palette">
                            {BLOCK_SNIPPETS.map(([lbl, html]) => (
                              <button key={lbl} type="button" className="block-chip" onClick={() => {
                                if (!pasteRef.current) return;
                                pasteRef.current.focus();
                                document.execCommand('insertHTML', false, html);
                                lastEditorHtml.current = pasteRef.current.innerHTML;
                                updateDraft('html', lastEditorHtml.current);
                              }}>{lbl}</button>
                            ))}
                          </div>
                        )}
                        <div
                          ref={pasteRef}
                          className="paste-area"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={() => { lastEditorHtml.current = pasteRef.current.innerHTML; updateDraft('html', lastEditorHtml.current); }}
                          onPaste={(e) => {
                            e.preventDefault();
                            const html = e.clipboardData.getData('text/html');
                            const text = e.clipboardData.getData('text/plain');
                            pasteRef.current.focus();
                            if (html) {
                              document.execCommand('insertHTML', false, sanitizePastedHtml(html));
                            } else if (text) {
                              document.execCommand('insertText', false, text);
                            }
                            lastEditorHtml.current = pasteRef.current.innerHTML;
                            updateDraft('html', lastEditorHtml.current);
                          }}
                        />
                      </>
                    )}
                    {bodyMode === 'text' && (
                      <>
                        <label className="field-label">PLAIN TEXT BODY</label>
                        <textarea ref={textRef} className="w-textarea code-ta" rows={16} value={draft.text} onChange={(e) => updateDraft('text', e.target.value)} placeholder="Plain text email body..." />
                      </>
                    )}

                    {bodyMode !== 'text' && (
                      <>
                        <label className="field-label">PLAIN TEXT <span className="dim">(auto if empty)</span></label>
                        <textarea className="w-textarea code-ta" rows={5} value={draft.text} onChange={(e) => updateDraft('text', e.target.value)} />
                      </>
                    )}
                    {bodyMode === 'text' && (
                      <>
                        <label className="field-label">HTML BODY <span className="dim">(optional — leave empty for text-only send)</span></label>
                        <textarea className="w-textarea code-ta" rows={8} value={draft.html} onChange={(e) => updateDraft('html', e.target.value)} placeholder="Optional HTML version..." />
                      </>
                    )}

                    {visualEditorOpen && (
                      <VisualEditor draft={draft} updateDraft={updateDraft} token={token} assets={assets} setAssets={setAssets} />
                    )}

                  </div>

                  <div className="pane preview-pane">
                    <div className="pane-head">
                      <span>LIVE PREVIEW</span>
                      <div className="mode-toggle">
                        <button type="button" className={previewDevice === 'desktop' ? 'mode-btn active' : 'mode-btn'} onClick={() => setPreviewDevice('desktop')}>DESKTOP</button>
                        <button type="button" className={previewDevice === 'mobile' ? 'mode-btn active' : 'mode-btn'} onClick={() => setPreviewDevice('mobile')}>MOBILE</button>
                      </div>
                    </div>
                    {preview ? (
                      <>
                        <div className="preview-subject">Subject: {preview.subject}</div>
                        {preview.html ? (
                          <div className={`preview-device-wrap ${previewDevice}`}>
                            <iframe title="Preview" sandbox="" srcDoc={preview.html} className="preview-frame" />
                          </div>
                        ) : (
                          <div className={`preview-device-wrap ${previewDevice}`}>
                            <iframe title="Preview" sandbox="" srcDoc={plainPreviewDoc(preview.text)} className="preview-frame" />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="preview-empty">START TYPING — PREVIEW STREAMS HERE</div>
                    )}
                    <PreviewAttachments attachments={draft.attachments} />
                    {/* ATTACHMENTS */}
                    <div className="cfg-block" style={{marginTop:8}}>
                      <div className="cfg-block-title">ATTACHMENTS <span className="dim">max 10 files / 10MB each</span></div>
                      <input type="file" multiple className="w-input" onChange={(e) => run(async () => {
                        const files = [...e.target.files];
                        const added = [];
                        for (const f of files) {
                          const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(f); });
                          const up = await api(token, '/api/uploads', { method: 'POST', body: { filename: f.name, contentType: f.type || 'application/octet-stream', data } });
                          added.push(up);
                        }
                        updateDraft('attachments', [...(draft.attachments || []), ...added]);
                        e.target.value = '';
                        showNotice(`${added.length} attachment(s) uploaded.`);
                      })} />
                      {(draft.attachments || []).length > 0 && (
                        <div className="attach-list">
                          {draft.attachments.map((a, i) => (
                            <div key={a.path} className="attach-row">
                              <span className="attach-name">{a.filename}</span>
                              <span className="dim">{Math.round((a.size || 0) / 1024)}KB</span>
                              <button type="button" className="btn-xs btn-danger" onClick={() => updateDraft('attachments', draft.attachments.filter((_, j) => j !== i))}>✕</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* ══ AI WRITER ══ */}
              {tab === 'aiwriter' && (
                <div className="aw-layout">
                  <div className="aw-left">
                  <div className="mode-toggle aw-mode-toggle">
                    <button type="button" className={awMode === 'letter' ? 'mode-btn active' : 'mode-btn'} onClick={() => setAwMode('letter')}>✉ LETTER MODE</button>
                    <button type="button" className={awMode === 'attachment' ? 'mode-btn active' : 'mode-btn'} onClick={() => setAwMode('attachment')}>📎 ATTACHMENT MODE</button>
                  </div>
                  {awMode === 'letter' && (
                  <div className="pane">
                    <div className="pane-head"><span><RbcMascot size={30} /> AI EMAIL WRITER — RUBICON AI</span></div>
                    <p className="dim-txt">Describe the letter — the AI drafts it against your current compose content, then apply straight into the draft. Pick a preset or write your own brief.</p>
                    <div className="ai-presets">
                      {[['COLD OUTREACH', 'Write a cold outreach email — short, professional, one clear call to action.'],
                        ['FOLLOW-UP', 'Write a follow-up email referencing the previous message — polite nudge, same thread feel.'],
                        ['URGENT NOTICE', 'Write an urgent account notification email — security alert tone, action required, no fear-mongering.'],
                        ['PROMO BLAST', 'Write a promotional email — punchy benefit-led copy, single offer, strong CTA button text.'],
                        ['NEWSLETTER', 'Write a newsletter-style update email — scannable sections, friendly expert voice.'],
                        ['PAYMENT REMINDER', 'Write a payment/invoice reminder email — firm but professional, deadline and amount placeholders.'],
                        ['WELCOME', 'Write a welcome/onboarding email — warm, sets expectations, first steps + one CTA.'],
                        ['RE-ENGAGE', 'Write a win-back email to an inactive subscriber — acknowledge the gap, give one reason to return.'],
                        ['DELIVERY NOTICE', 'Write a package-delivery notification — shipment status, tracking placeholder, clean logistics tone.'],
                        ['SECURITY ALERT', 'Write an account-security notification — sign-in detected, verify-or-secure CTA, calm authority.'],
                      ].map(([label, prompt]) => (
                        <button key={label} className="btn-sm" onClick={() => setAwPrompt(prompt)}>{label}</button>
                      ))}
                    </div>
                    <div className="aw-controls">
                      <div className="aw-ctl">
                        <span className="aw-lbl">TONE</span>
                        <div className="aw-chips">
                          {['', 'professional', 'friendly', 'urgent', 'formal', 'persuasive'].map((t) => (
                            <button key={t || 'none'} className={`btn-xs ${awTone === t ? 'btn-solid' : ''}`} onClick={() => setAwTone(t)}>{t ? t.toUpperCase() : 'AUTO'}</button>
                          ))}
                        </div>
                      </div>
                      <div className="aw-ctl">
                        <span className="aw-lbl">LENGTH</span>
                        <div className="aw-chips">
                          {[['', 'AUTO'], ['under 80 words', 'SHORT'], ['about 150 words', 'MEDIUM'], ['about 300 words', 'LONG']].map(([v, l]) => (
                            <button key={l} className={`btn-xs ${awLength === v ? 'btn-solid' : ''}`} onClick={() => setAwLength(v)}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div className="aw-ctl">
                        <span className="aw-lbl">AUDIENCE</span>
                        <input className="w-input" style={{ flex: 1, minWidth: 140 }} value={awAudience} onChange={(e) => setAwAudience(e.target.value)} placeholder="e.g. small-business owners, IT admins…" />
                      </div>
                    </div>
                    <textarea className="ai-prompt-input" rows={4} value={awPrompt} onChange={(e) => setAwPrompt(e.target.value)}
                      placeholder="Brief the writer… e.g. 'Notice that the client's mailbox storage is 90% full, offer the upgrade link, keep it under 120 words, use ++rbc_*++ placeholders where a link goes'" />
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <button className="btn-primary" disabled={awBusy || !awPrompt.trim()} onClick={async () => {
                        setAwBusy(true); setAwResult(null);
                        const shaped = [awPrompt, awTone && `Tone: ${awTone}.`, awLength && `Length: ${awLength}.`, awAudience.trim() && `Audience: ${awAudience.trim()}.`].filter(Boolean).join(' ');
                        try {
                          const res = await aiApi('/api/ai/assist', {
                            method: 'POST',
                            body: { prompt: shaped, subject: draft.subject, html: draft.html, text: draft.text },
                          });
                          const resultText = String(res.result || '').trim();
                          if (!resultText && !res.attachment) throw new Error('AI provider returned an empty result.');
                          setAwResult({ text: resultText, target: res.target || 'html' });
                        } catch (err) { setAwResult({ text: `Error: ${err.message}`, target: 'none' }); showNotice(`AI: ${err.message}`, 'err'); }
                        finally { setAwBusy(false); }
                      }}>{awBusy ? 'WRITING...' : 'WRITE'}</button>
                      <button className="btn-sm" disabled={awBusy} onClick={async () => {
                        setAwBusy(true); setAwResult(null);
                        try {
                          const res = await aiApi('/api/ai/subjects', {
                            method: 'POST',
                            body: {
                              subject: draft.subject, preheader: draft.preheader, html: draft.html, text: draft.text,
                              tone: awTone, audience: awAudience.trim(), count: 6,
                            },
                          });
                          const lines = (res.subjects || []).filter(Boolean);
                          if (!lines.length) throw new Error('AI provider returned no subject lines.');
                          setAwResult({ text: lines.join('\n'), target: 'subject', subject: draft.subject });
                        } catch (err) { setAwResult({ text: `Error: ${err.message}`, target: 'none' }); showNotice(`AI: ${err.message}`, 'err'); }
                        finally { setAwBusy(false); }
                      }}>✦ 6 SUBJECT LINES</button>
                    </div>
                    {awResult && (
                      <div className="ai-response-area">
                        <div className="ai-response-head">
                          <span>DRAFT <span className="dim" style={{ fontSize: 10 }}>→ {awResult.target} · {awResult.text.trim().split(/\s+/).filter(Boolean).length} words</span></span>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {['subject', 'preheader', 'html', 'text'].map((f) => (
                              <button key={f} className={`btn-xs ${awResult.target === f || (awResult.target === 'body' && f === 'html') ? 'btn-solid' : ''}`}
                                onClick={() => { updateDraft(f, awResult.text); showNotice(`Applied to ${f === 'html' ? 'body' : f}.`); }}>
                                → {f === 'html' ? 'BODY' : f.toUpperCase()}
                              </button>
                            ))}
                            <button className="btn-xs" onClick={() => { navigator.clipboard.writeText(awResult.text); showNotice('Copied.'); }}>COPY</button>
                          </div>
                        </div>
                        <pre className="ai-response-text">{awResult.text}</pre>
                        {awResult.target === 'subject' && (
                          <div className="aw-subjects">
                            {awResult.text.split('\n').map((l) => l.replace(/^[\d\.\-\*\s]+/, '').trim()).filter(Boolean).map((line, i) => (
                              <button key={i} className="btn-sm aw-subject-line" onClick={() => { updateDraft('subject', line); showNotice('Subject applied.'); }}>{line}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {awMode === 'attachment' && (
                  <div className="pane">
                    <div className="pane-head"><span>AI ATTACHMENT GENERATOR</span></div>
                    <p className="dim-txt">Describe the document — the AI generates a real file (PDF/ICS/CSV/etc.) and attaches it to the current letter.</p>
                    <div className="aw-controls">
                      <div className="aw-ctl">
                        <span className="aw-lbl">FORMAT</span>
                        <div className="aw-chips">
                          {['PDF', 'TXT', 'CSV', 'ICS', 'HTML'].map((f) => (
                            <button key={f} className={`btn-xs ${awDocType === f ? 'btn-solid' : ''}`} onClick={() => setAwDocType(f)}>{f}</button>
                          ))}
                        </div>
                      </div>
                      <div className="aw-ctl">
                        <span className="aw-lbl">FILENAME</span>
                        <input className="w-input" style={{ flex: 1, minWidth: 140 }} value={awDocName} onChange={(e) => setAwDocName(e.target.value)} placeholder="Auto-named when you pick a type" />
                      </div>
                      <div className="aw-ctl">
                        <span className="aw-lbl">BUTTON URL</span>
                        <input className="w-input" style={{ flex: 1, minWidth: 140 }} value={awDocUrl} onChange={(e) => setAwDocUrl(e.target.value)} placeholder="https://your-link.com (blank = first link in the document)" />
                      </div>
                    </div>
                    <div className="ai-presets">
                      <button className="btn-sm" onClick={() => docPreset('invoice')}>INVOICE</button>
                      <button className="btn-sm" onClick={() => docPreset('statement')}>STATEMENT</button>
                      <button className="btn-sm" onClick={() => docPreset('notice')}>NOTICE</button>
                      <button className="btn-sm" onClick={() => docPreset('quote')}>QUOTE</button>
                      <button className="btn-sm" onClick={() => docPreset('receipt')}>RECEIPT</button>
                      <button className="btn-sm" onClick={() => docPreset('agreement')}>AGREEMENT</button>
                      <button className="btn-sm" onClick={() => docPreset('report')}>REPORT</button>
                      <button className="btn-sm" onClick={() => docPreset('calendar')}>CALENDAR</button>
                    </div>
                    <textarea className="ai-prompt-input" rows={4} value={awDocPrompt} onChange={(e) => setAwDocPrompt(e.target.value)}
                      placeholder="Pick a document type above, then adjust the brief. The page builder adds a letterhead, reference block, action overlay and clickable button." />
                    <button className="btn-primary" disabled={awDocBusy || !awDocPrompt.trim()} onClick={async () => {
                      setAwDocBusy(true); setAwAttachment(null);
                      try {
                        const res = await aiApi('/api/ai/assist', {
                          method: 'POST',
                          body: {
                            prompt: `Generate a ${awDocType} file attachment document${awDocName.trim() ? ` named "${awDocName.trim()}"` : ''}: ${awDocPrompt}`,
                            subject: draft.subject, html: draft.html, text: draft.text,
                            format: awDocType, filename: awDocName.trim(), preset: awDocPreset,
                            url: awDocUrl.trim(), company: '[Company]', title: undefined,
                          },
                        });
                        if (res.attachment) setAwAttachment(res.attachment);
                        else setAwResult({ text: res.result || '(no file generated — describe the document type more explicitly)', target: 'none' });
                      } catch (err) { setAwResult({ text: `Error: ${err.message}`, target: 'none' }); }
                      finally { setAwDocBusy(false); }
                    }}>{awDocBusy ? 'GENERATING...' : 'GENERATE FILE'}</button>
                    {awAttachment && (
                      <div className="ai-response-area aw-file-ready">
                        <div className="ai-response-head">
                          <span>FILE READY — {awAttachment.filename || 'document'}</span>
                          <div className="aw-file-actions">
                            <button className="btn-sm" onClick={() => previewGenerated(awAttachment)}>PREVIEW</button>
                            <button className="btn-sm" onClick={() => downloadGenerated(awAttachment)}>DOWNLOAD</button>
                            <button className="btn-sm" onClick={() => attachGenerated(awAttachment)}>ATTACH TO LETTER</button>
                          </div>
                        </div>
                        <div className="dim-txt">Preview it, check the reference / date / button target, then attach. The file stays downloadable after attaching.</div>
                      </div>
                    )}
                  </div>
                  )}
                  </div>

                  {/* — RIGHT: LIVE PREVIEW — */}
                  <div className="pane preview-pane aw-preview">
                    <div className="pane-head"><span>LIVE PREVIEW</span>{draft.subject && <span className="dim">{draft.subject}</span>}</div>
                    {awMode === 'letter' ? (
                      awResult ? (
                        awResult.target === 'subject' ? (
                          <div className="preview-empty" style={{ textAlign: 'left', padding: 24 }}>
                            <div className="dim" style={{ marginBottom: 12 }}>CLICK A LINE TO APPLY IT AS THE SUBJECT:</div>
                            {awResult.text.split('\n').map((l) => l.replace(/^[\d\.\-\*\s]+/, '').trim()).filter(Boolean).map((line, i) => (
                              <div key={i} className="aw-subject-preview" onClick={() => { updateDraft('subject', line); showNotice('Subject applied.'); }}>{line}</div>
                            ))}
                          </div>
                        ) : /<\w+[^>]*>/.test(awResult.text) ? (
                          <div className="preview-device-wrap desktop">
                            <iframe title="AI Preview" sandbox="" srcDoc={awResult.text} className="preview-frame" />
                          </div>
                        ) : (
                          <div className="preview-device-wrap desktop">
                            <iframe title="AI Preview" sandbox="" srcDoc={plainPreviewDoc(awResult.text)} className="preview-frame" />
                          </div>
                        )
                      ) : draft.html ? (
                        <div className="preview-device-wrap desktop">
                          <iframe title="Draft Preview" sandbox="" srcDoc={draft.html} className="preview-frame" />
                        </div>
                      ) : draft.text ? (
                        <div className="preview-device-wrap desktop">
                          <iframe title="Draft Preview" sandbox="" srcDoc={plainPreviewDoc(draft.text)} className="preview-frame" />
                        </div>
                      ) : (
                        <div className="preview-empty">WRITE — PREVIEW RENDERS HERE</div>
                      )
                    ) : (
                      <>
                        {draft.html ? (
                          <div className="preview-device-wrap desktop">
                            <iframe title="Draft Preview" sandbox="" srcDoc={draft.html} className="preview-frame" />
                          </div>
                        ) : draft.text ? (
                          <div className="preview-device-wrap desktop">
                            <iframe title="Draft Preview" sandbox="" srcDoc={plainPreviewDoc(draft.text)} className="preview-frame" />
                          </div>
                        ) : (
                          <div className="preview-empty">WRITE — PREVIEW RENDERS HERE</div>
                        )}
                        {awAttachment ? (
                          <div className="aw-file-card">
                            <div className="aw-file-icon">📎</div>
                            <div className="aw-file-name">{awAttachment.filename || 'document'}</div>
                            <div className="dim">{awAttachment.contentType || 'file'} · {Math.round(((awAttachment.data || '').length * 3) / 4096)}KB</div>
                          </div>
                        ) : (
                          <div className="preview-empty">GENERATE — FILE CARD APPEARS BELOW THE LETTER</div>
                        )}
                      </>
                    )}
                    <PreviewAttachments attachments={draft.attachments} />
                  </div>
                </div>
              )}

              {/* ══ MAIL LIST / RECIPIENTS ══ */}
              {tab === 'recipients' && (
                <div className="two-col">
                  <div className="pane">
                    <div className="pane-head"><span>1. Add your contacts</span></div>
                    <p className="dim-txt">Any format works — CSV with <code>email</code> column, or a plain list (one per line, comma/colon separated). Optional columns: <code>first_name</code>, <code>last_name</code>, <code>company</code>.</p>
                    <input type="file" accept=".csv,text/csv" className="w-input" onChange={(e) => run(async () => { const f = e.target.files[0]; if (f) setCsv(await f.text()); })} />
                    <textarea className="w-textarea code-ta" rows={12} value={csv} onChange={(e) => setCsv(e.target.value)} />
                    <label className="field-label" htmlFor="import-list-name">LIST NAME <span className="dim">— pick an existing name to merge, or type a new one</span></label>
                    <input id="import-list-name" className="w-input" list="rbc-lists" placeholder="e.g. Outlook Leads — June" value={importList}
                      onChange={(e) => setImportList(e.target.value)} />
                    <datalist id="rbc-lists">{(state.lists || []).map((l) => <option key={l.name} value={l.name} />)}</datalist>
                    <label className="check-row">
                      <input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} />
                      <span>All recipients consented to receive this message.</span>
                    </label>
                    <button className="btn-primary" disabled={busy || !consentConfirmed || !importList.trim()} onClick={() => run(async () => {
                      const merged = (state.lists || []).some((l) => l.name.toLowerCase() === importList.trim().toLowerCase());
                      const r = await api(token, '/api/recipients/import', { method: 'POST', body: { csv, consentConfirmed, list: importList.trim() } });
                      showNotice(`${r.imported} ${merged ? 'merged into' : 'imported to'} "${r.list}" — ${r.errors.length} rejected.`);
                      setCsv(''); setConsentConfirmed(false);
                      await refresh();
                    })}>IMPORT LIST</button>
                  </div>
                  <div className="pane">
                    <div className="pane-head">
                      <span>2. Your contacts <span className="dim">({(state.recipientTotal || 0).toLocaleString()}) · cleanup is optional</span></span>
                      <div className="btn-row">
                        <button className="btn-xs" disabled={busy || !state.recipientTotal} onClick={() => run(async () => {
                          const r = await api(token, '/api/recipients/verify', { method: 'POST', body: { all: true } });
                          const bad = r.results.filter((x) => !x.hasMx || x.disposable || x.roleBased);
                          setVerifyResults(r.results);
                          showNotice(`Verified ${r.results.length} — ${bad.length} flagged (no-MX/disposable/role).`);
                        })}>Check addresses</button>
                        <button className="btn-xs" disabled={busy || !state.recipientTotal} onClick={() => run(async () => {
                          const r = await api(token, '/api/recipients/classify', { method: 'POST', body: {} });
                          showNotice(`Classified ${r.classified}: ${Object.entries(r.counts).map(([k, v]) => `${k}=${v}`).join(', ')}`);
                          await refresh();
                        })}>Group by provider</button>
                        <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                          const r = await api(token, '/api/hygiene/remove-role-addresses', { method: 'POST' });
                          showNotice(`Removed ${r.removed} role addresses.`);
                          await refresh();
                        })}>Remove generic inboxes</button>
                        <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                          const r = await api(token, '/api/hygiene/remove-disposable-addresses', { method: 'POST' });
                          showNotice(`Removed ${r.removed} disposable addresses.`);
                          await refresh();
                        })}>Remove throwaway emails</button>
                        <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                          const r = await api(token, '/api/hygiene/find-duplicates', { method: 'POST' });
                          showNotice(`Found ${r.duplicates.length} duplicate groups.`);
                        })}>Find duplicates</button>
                        <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                          const r = await api(token, '/api/hygiene/remove-duplicates', { method: 'POST' });
                          showNotice(`Removed ${r.removed} duplicate rows.`);
                          await refresh();
                        })}>Remove duplicates</button>
                        <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                          const r = await api(token, '/api/hygiene/validate-syntax', { method: 'POST' });
                          showNotice(`Marked ${r.markedInvalid} invalid emails.`);
                          await refresh();
                        })}>Fix broken emails</button>
                        <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                          const r = await api(token, '/api/recipients/guess-timezones', { method: 'POST' });
                          showNotice(`Guessed ${r.guessed} recipient timezones.`);
                          await refresh();
                        })}>Guess time zones</button>
                        {settings.engineMsRefreshToken === true && (
                          <button className="btn-xs btn-ms" disabled={busy} onClick={async () => {
                            const ln = await uiPrompt('Save pulled contacts to which list? An existing name merges.', { title: 'LIST NAME', placeholder: 'MS contacts', confirmLabel: 'PULL' });
                            if (ln === null) return;
                            run(async () => {
                              const r = await api(token, '/api/graph/contacts', { method: 'POST', body: { list: ln || 'MS contacts' } });
                              showNotice(`MS Contacts: ${r.imported} imported, ${r.duplicates} dupes, ${r.total} total pulled.`);
                              await refresh();
                            });
                          }}>PULL MS CONTACTS</button>
                        )}
                        <button className="btn-xs btn-danger" disabled={busy || !state.recipientTotal} onClick={async () => {
                          if (await uiConfirm(`Delete ALL ${state.recipientTotal} recipients? Delivery history for them is removed too.`, { title: 'CLEAR RECIPIENT LIST', danger: true, confirmLabel: `DELETE ${state.recipientTotal}` })) {
                            run(async () => { const r = await api(token, '/api/recipients', { method: 'DELETE' }); showNotice(`${r.deleted} recipients deleted.`); await refresh(); });
                          }
                        }}>Clear this list</button>
                      </div>
                    </div>
                    <div className="ops-console" aria-live="polite">
                      <div className="ops-head">
                        <span>ACTIVITY</span>
                        <div className="btn-row">
                          <button className="btn-xs" disabled={busy || !(verifyResults || []).length} onClick={() => {
                            const csv = ['email,hasMx,provider,disposable,roleBased', ...(verifyResults || []).map((v) => `${v.email},${v.hasMx ? 1 : 0},${(v.provider || '').replaceAll(',', ' ')},${v.disposable ? 1 : 0},${v.roleBased ? 1 : 0}`)].join(String.fromCharCode(10));
                            const b = new Blob([csv], { type: 'text/csv' });
                            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: 'verify-results.csv' });
                            a.click(); URL.revokeObjectURL(b);
                          }}>EXPORT</button>
                          <button className="btn-xs" disabled={busy || !(verifyResults || []).some((v) => !v.hasMx || v.disposable || v.roleBased)} onClick={async () => {
                            if (await uiConfirm(`Suppress ${(verifyResults || []).filter((v) => !v.hasMx || v.disposable || v.roleBased).length} flagged addresses?`, { title: 'SUPPRESS FLAGGED', danger: true, confirmLabel: 'SUPPRESS' })) {
                              run(async () => {
                                const emails = verifyResults.filter((v) => !v.hasMx || v.disposable || v.roleBased).map((v) => v.email);
                                const r = await api(token, '/api/hygiene/suppress', { method: 'POST', body: { emails } });
                                showNotice(`Suppressed ${r.suppressed} flagged addresses.`);
                                await refresh();
                              });
                            }
                          }}>SUPPRESS FLAGGED</button>
                          {!!opsLog.length && <button className="btn-xs" onClick={() => setOpsLog([])}>CLEAR</button>}
                        </div>
                      </div>
                      <div className="ops-lines">
                        {(() => {
                          const feed = [
                            ...opsLog.map((l, i) => ({ t: l.at.getTime(), txt: `${l.type === 'err' ? '✗' : '✓'} ${l.msg}`, err: l.type === 'err', k: `n${i}` })),
                            ...(state.events || []).filter(isRecipientEvent).map((e, i) => ({ t: e.ts || 0, txt: eventLine(e), err: false, k: `e${i}` })),
                          ].sort((a, b) => a.t - b.t).slice(-40);
                          if (!feed.length) return <div className="ops-line dim">No actions yet — VERIFY DNS, SORT, PULL or IMPORT logs here live.</div>;
                          return feed.map((l) => (
                            <div key={l.k} className={`ops-line ${l.err ? 'ops-err' : ''}`}>
                              <span className="dim">{new Date(l.t).toLocaleTimeString()}</span> {l.txt}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                    <div className="filter-row">
                      <span className="dim">LIST:</span>
                      <select className="w-select" value={recipList} onChange={(e) => { setRecipList(e.target.value); setRecipPage(1); }} aria-label="Filter by contact list">
                        <option value="all">ALL LISTS ({state.recipientTotal || 0})</option>
                        {(state.lists || []).map((l) => <option key={l.name} value={l.name}>{l.name} ({l.count})</option>)}
                        <option value="__none__">— UNLISTED —</option>
                      </select>
                      <span className="dim">ENGAGEMENT:</span>
                      <select className="w-select" value={engagementTier} onChange={(e) => { setEngagementTier(e.target.value); setRecipPage(1); }} aria-label="Filter by engagement tier">
                        <option value="all">ALL</option>
                        <option value="hot">HOT (70+)</option>
                        <option value="warm">WARM (31-69)</option>
                        <option value="cold">COLD (0-30)</option>
                      </select>
                    </div>
                    {verifyResults && (
                      <div className="verify-panel">
                        <div className="verify-head">DNS VERIFY — {verifyResults.length} checked <button className="btn-xs" aria-label="Close verify results" onClick={() => setVerifyResults(null)}>✕</button></div>
                        <div className="tbl-wrap" style={{maxHeight:220}}>
                          <table className="w-table">
                            <thead><tr><th>EMAIL</th><th>MX</th><th>PROVIDER</th><th>FLAGS</th></tr></thead>
                            <tbody>
                              {verifyResults.slice(0, 200).map((v) => (
                                <tr key={v.email}>
                                  <td>{v.email}</td>
                                  <td className="dim">{v.hasMx ? v.mx : '—'}</td>
                                  <td>{v.provider}</td>
                                  <td>{[!v.hasMx && 'NO-MX', v.disposable && 'DISPOSABLE', v.roleBased && 'ROLE'].filter(Boolean).map((f) => <span key={f} className="badge badge-fail" style={{marginRight:4}}>{f}</span>)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    <div className="tbl-wrap">
                      <table className="w-table">
                        <thead><tr><th>EMAIL</th><th>NAME</th><th>LIST</th><th>PROVIDER</th><th>ENGAGEMENT</th><th>STATUS</th><th></th></tr></thead>
                        <tbody>
                          {pagedRecip.map((r) => {
                            return (
                              <tr key={r.id}>
                                <td>{r.email}</td>
                                <td><input className="cell-edit" defaultValue={[r.firstName, r.lastName].filter(Boolean).join(' ')} placeholder="—" aria-label={`Edit name for ${r.email}`}
                                  onBlur={(e) => { const v = e.target.value.trim(); const cur = [r.firstName, r.lastName].filter(Boolean).join(' '); if (v !== cur) { const parts = v.split(/\s+/); saveRecipField(r, { firstName: parts.shift() || '', lastName: parts.join(' ') }); } }} /></td>
                                <td><input className="cell-edit cell-edit-list" list="rbc-lists" defaultValue={r.list || ''} placeholder="—" aria-label={`Edit list for ${r.email}`}
                                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (r.list || '')) saveRecipField(r, { list: v }); }} /></td>
                                <td className="dim">{r.custom?.provider || '—'}</td>
                                <td>
                                  <span className={`badge ${r.engagement_score >= 70 ? 'badge-ok' : r.engagement_score >= 31 ? 'badge-def' : 'badge-fail'}`}>
                                    {r.engagement_score || 0}
                                  </span>
                                </td>
                                <td><span className={`badge ${r.suppressed ? 'badge-fail' : r.validSyntax === false ? 'badge-def' : 'badge-ok'}`}>{r.suppressed ? 'SUPPRESSED' : r.validSyntax === false ? 'INVALID' : 'ACTIVE'}</span></td>
                                <td><div className="act-row">{r.suppressed
                                  ? <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Unsuppress ${r.email}? They will receive future campaigns again.`, { title: 'UNSUPPRESS RECIPIENT', confirmLabel: 'UNSUPPRESS' })) run(async () => { await api(token, `/api/recipients/${r.id}/unsuppress`, { method: 'POST' }); await refresh(); }); }}>UNSUPPRESS</button>
                                  : <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Suppress ${r.email}?`, { title: 'SUPPRESS RECIPIENT', danger: true, confirmLabel: 'SUPPRESS' })) run(async () => { await api(token, `/api/recipients/${r.id}/suppress`, { method: 'POST' }); await refresh(); }); }}>SUPPRESS</button>}
                                  <button className="btn-xs btn-danger" onClick={async () => { if (await uiConfirm(`Delete ${r.email} from the list?`, { title: 'DELETE RECIPIENT', danger: true, confirmLabel: 'DELETE' })) run(async () => { await api(token, `/api/recipients/${r.id}`, { method: 'DELETE' }); await refresh(); }); }}>DEL</button></div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pager total={recipTotal} page={recipPage} setPage={setRecipPage} size={pageSize} setSize={setPageSize} />
                  </div>
                </div>
              )}

              {/* ══ EMAIL SORTER ══ */}
              {tab === 'sorter' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="pane">
                    <div className="pane-head"><span>Clean up a messy list</span></div>
                    <p className="dim-txt">Paste anything — commas, new lines, mixed text. We pull out the emails, remove duplicates, check the syntax and group them by provider. Nothing is imported; copy what you need.</p>
                    <textarea className="w-textarea code-ta" rows={9} value={sorterInput} onChange={(e) => setSorterInput(e.target.value)}
                      placeholder={'john@gmail.com, jane@company.com\ninfo@domain.org; "Name" <user@outlook.com>\nadmin@site.net — anything goes, the sorter extracts the emails'} />
                    <div className="btn-row" style={{ marginTop: 10 }}>
                      <button className="btn-primary" disabled={sorterBusy || !sorterInput.trim()} onClick={async () => {
                        setSorterBusy(true); setSorterResult(null);
                        try { setSorterResult(await api(token, '/api/sorter', { method: 'POST', body: { text: sorterInput } })); }
                        catch (err) { showNotice(`Sort failed: ${err.message}`, 'err'); }
                        finally { setSorterBusy(false); }
                      }}>{sorterBusy ? 'SORTING — MX lookups…' : 'SORT LIST'}</button>
                      <label className="btn-sm" style={{ margin: 0, cursor: 'pointer' }}>IMPORT FILE
                        <input type="file" accept=".txt,.csv,.tsv,.eml,.lst,.json,.log,text/*,*/*" style={{ display: 'none' }} onChange={async (e) => {
                          const f = e.target.files[0];
                          if (f) setSorterInput((await f.text()).slice(0, 5000000));
                          e.target.value = '';
                        }} />
                      </label>
                      {sorterInput.trim() && <button className="btn-sm" onClick={() => { setSorterInput(''); setSorterResult(null); }}>CLEAR</button>}
                    </div>
                    {(sorterBusy || (state?.events || []).some((e) => e.kind === 'sorter')) && (
                      <div className="pane" style={{ marginTop: 14, padding: '10px 12px' }}>
                        <div className="pane-head"><span>SORT CONSOLE — LIVE</span><span className="dim">{sorterBusy ? 'streaming' : 'last run'}</span></div>
                        <LiveConsole events={(state?.events || []).filter((e) => e.kind === 'sorter')} empty="AWAITING SORT EVENTS — SORT, VERIFY, MX PASS" />
                      </div>
                    )}
                  </div>

                  {sorterResult && (
                    <>
                      <div className="kpi-row">
                        {[['EXTRACTED', sorterResult.total, 'var(--txt)'], ['UNIQUE', sorterResult.unique, 'var(--cyan)'], ['DUPES', sorterResult.dupes, 'var(--yellow)'], ['INVALID', (sorterResult.invalid || []).length, 'var(--red)'], ['DISPOSABLE', (sorterResult.disposable || []).length, 'var(--orange)'], ['ROLE', (sorterResult.roleBased || []).length, 'var(--purple)'], ['FREEMAIL', `${sorterResult.freemailCount ?? 0}`, 'var(--txt-dim)'], ['BUSINESS', `${sorterResult.businessCount ?? 0}`, 'var(--txt-dim)'], ['CLEAN', (sorterResult.clean || []).length, 'var(--green)']].map(([l, v, c]) => (
                          <div key={l} className="kpi-card"><div className="kpi-val" style={{ color: c }}>{v}</div><div className="kpi-lbl">{l}</div></div>
                        ))}
                      </div>

                      <div className="pane">
                        <div className="pane-head">
                          <span>PROVIDER SHARE</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn-xs" onClick={() => {
                              const csv = ['provider,email'].concat(Object.entries(sorterResult.buckets || {}).flatMap(([p, list]) => list.map((e) => `${p},${e}`))).join('\n');
                              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'sorted-list.csv'; a.click();
                              showNotice('Downloaded sorted-list.csv');
                            }}>CSV ↓</button>
                            <button className="btn-xs" onClick={() => { navigator.clipboard.writeText((sorterResult.clean || []).join('\n')); showNotice(`Copied ${(sorterResult.clean || []).length} clean emails.`); }}>COPY CLEAN</button>
                            <button className="btn-xs btn-solid" onClick={async () => {
                              const clean = sorterResult.clean || [];
                              if (!clean.length) return;
                              const ln = await uiPrompt('Save sorted contacts to which list? An existing name merges.', { title: 'LIST NAME', placeholder: `Sorted ${new Date().toISOString().slice(0, 10)}`, confirmLabel: 'IMPORT' });
                              if (ln === null) return;
                              try {
                                const res = await api(token, '/api/recipients/import', { method: 'POST', body: { csv: 'email\n' + clean.join('\n'), consentConfirmed: true, list: ln || `Sorted ${new Date().toISOString().slice(0, 10)}` } });
                                showNotice(`Imported ${res.imported ?? clean.length} to "${res.list}".`, 'ok');
                                refresh();
                              } catch (err) { showNotice(`Import failed: ${err.message}`, 'err'); }
                            }}>IMPORT CLEAN → CONTACTS</button>
                          </div>
                        </div>
                        {(sorterResult.providers || []).map((p) => (
                          <div key={p.name} className="share-row">
                            <span className="share-name">{p.name.toUpperCase()}</span>
                            <span className="share-bar"><span className="share-fill" style={{ width: `${p.share}%` }} /></span>
                            <span className="share-num">{p.count} · {p.share}%</span>
                          </div>
                        ))}
                      </div>

                      <div className="pane">
                        <div className="pane-head"><span>PROVIDER BUCKETS</span></div>
                        <div className="sorter-buckets">
                          {Object.entries(sorterResult.buckets || {}).map(([provider, list]) => (
                            <div key={provider} className="sorter-bucket">
                              <div className="sorter-bucket-head">
                                <span>{provider.toUpperCase()} <span className="dim">({list.length})</span></span>
                                <button className="btn-xs" onClick={() => { navigator.clipboard.writeText(list.join('\n')); showNotice(`Copied ${list.length} ${provider} emails.`); }}>COPY</button>
                              </div>
                              {(sorterResult.providers || []).find((p) => p.name === provider)?.mx && (
                                <div className="sorter-mx dim">MX → {(sorterResult.providers || []).find((p) => p.name === provider).mx}</div>
                              )}
                              <pre className="sorter-bucket-list">{list.slice(0, 30).join('\n')}{list.length > 30 ? `\n… +${list.length - 30} more` : ''}</pre>
                            </div>
                          ))}
                        </div>
                      </div>

                      {!!(sorterResult.judged || []).length && (
                        <div className="pane">
                          <div className="pane-head"><span>WEBMAIL JUDGERS — STACK DETECTED ({sorterResult.judged.length})</span></div>
                          <table className="w-table"><thead><tr><th>DOMAIN</th><th>STACK</th><th>EMAILS</th><th>MX</th></tr></thead><tbody>
                            {sorterResult.judged.map((j) => (
                              <tr key={j.domain}>
                                <td>{j.domain}</td>
                                <td className={j.stack === 'OWA/Exchange' ? 'cyan-txt' : j.stack === 'Zimbra' ? 'green-txt' : 'dim'}>{j.stack.toUpperCase()}</td>
                                <td>{j.count}</td>
                                <td className="dim">{j.mx || '—'}</td>
                              </tr>
                            ))}
                          </tbody></table>
                        </div>
                      )}

                      <div className="two-col">
                        {!!(sorterResult.topDomains || []).length && (
                          <div className="pane">
                            <div className="pane-head"><span>TOP DOMAINS</span></div>
                            <table className="w-table"><thead><tr><th>DOMAIN</th><th>#</th><th>MX</th></tr></thead><tbody>
                              {sorterResult.topDomains.map((d) => <tr key={d.domain}><td>{d.domain}</td><td className="cyan-txt">{d.count}</td><td className="dim">{d.provider}</td></tr>)}
                            </tbody></table>
                          </div>
                        )}
                        {!!(sorterResult.topTlds || []).length && (
                          <div className="pane">
                            <div className="pane-head"><span>TLD BREAKDOWN</span></div>
                            <table className="w-table"><thead><tr><th>TLD</th><th>#</th></tr></thead><tbody>
                              {sorterResult.topTlds.map((t) => <tr key={t.tld}><td>.{t.tld}</td><td className="cyan-txt">{t.count}</td></tr>)}
                            </tbody></table>
                          </div>
                        )}
                      </div>

                      <div className="two-col">
                        {!!sorterResult.invalid.length && (
                          <div className="pane">
                            <div className="pane-head"><span>INVALID SYNTAX ({sorterResult.invalid.length})</span></div>
                            <pre className="sorter-bucket-list">{sorterResult.invalid.slice(0, 50).join('\n')}</pre>
                          </div>
                        )}
                        {!!sorterResult.disposable.length && (
                          <div className="pane">
                            <div className="pane-head"><span>DISPOSABLE ({sorterResult.disposable.length})</span></div>
                            <pre className="sorter-bucket-list">{sorterResult.disposable.slice(0, 50).join('\n')}</pre>
                          </div>
                        )}
                        {!!sorterResult.roleBased.length && (
                          <div className="pane">
                            <div className="pane-head"><span>ROLE-BASED ({sorterResult.roleBased.length})</span></div>
                            <pre className="sorter-bucket-list">{sorterResult.roleBased.slice(0, 50).join('\n')}</pre>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ══ SMTP ══ */}
              {tab === 'smtp' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="smtp-jump" aria-label="SMTP sections">
                  {[
                    ['smtp-accounts', '01 ACCOUNTS', 'who sends'],
                    ['smtp-connection', '02 CONNECTION', 'single mailbox fallback'],
                    ['smtp-rules', '03 RULES', 'hours and caps'],
                    ['smtp-inbox', '04 INBOX', 'reading replies'],
                    ['smtp-reference', '05 REFERENCE', 'guides'],
                  ].map(([id, label, hint]) => (
                    <button key={id} type="button" className="smtp-jump-btn" title={hint}
                      onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{label}</button>
                  ))}
                </div>
                {/* ══ SECTION: SENDING ACCOUNTS ══ */}
                <div className="email-section" id="smtp-accounts">01 · SENDING ACCOUNTS — who sends</div>

                {/* SMTP ACCOUNT POOL */}
                <div className="pane">
                  <div className="pane-head"><span>ACCOUNT POOL — ROTATION & FAILOVER</span>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                      <button className="btn-sm" onClick={() => { setSmtpImportOpen(!smtpImportOpen); setMsRtImportOpen(false); }}>Add SMTP sender</button>
                      <button className="btn-sm" onClick={() => { setMsRtImportOpen(!msRtImportOpen); setSmtpImportOpen(false); }}>Import Microsoft mailbox</button>
                      <button className="btn-sm" disabled={busy} onClick={() => run(async () => {
                        const r = await api(token, '/api/smtp/verify-all', { method: 'POST' });
                        const dead = (r.results || []).filter((x) => !x.ok);
                        showNotice(dead.length ? `${r.live}/${r.total} live — ${dead.length} dead cooled 6h.` : `All ${r.total} accounts verified live.`);
                        await refresh();
                      })}>Check all senders</button>
                      <button className="btn-sm btn-danger" disabled={busy || !selectedAccts.length} onClick={async () => {
                        if (await uiConfirm(`Delete ${selectedAccts.length} selected SMTP account${selectedAccts.length === 1 ? '' : 's'}?`, { title: 'DELETE SELECTED ACCOUNTS', danger: true, confirmLabel: `DELETE ${selectedAccts.length}` })) {
                          run(async () => {
                            const r = await api(token, '/api/smtp/accounts/delete', { method: 'POST', body: { ids: selectedAccts } });
                            setSelectedAccts([]);
                            showNotice(`${r.deleted} account${r.deleted === 1 ? '' : 's'} deleted.`);
                            await refresh();
                          });
                        }
                      }}>DELETE SELECTED{selectedAccts.length ? ` (${selectedAccts.length})` : ''}</button>
                      <button className="btn-sm btn-danger" disabled={busy || !(state.smtpAccounts || []).length} onClick={async () => {
                        const total = (state.smtpAccounts || []).length;
                        if (await uiConfirm(`Delete ALL ${total} SMTP accounts? This removes the whole pool.`, { title: 'DELETE ALL SMTP ACCOUNTS', danger: true, confirmLabel: `DELETE ALL ${total}` })) {
                          run(async () => {
                            const r = await api(token, '/api/smtp/accounts/delete', { method: 'POST', body: { all: true } });
                            setSelectedAccts([]);
                            showNotice(`All ${r.deleted} SMTP accounts deleted.`);
                            await refresh();
                          });
                        }
                      }}>Delete all</button>
                    </div>
                  </div>
                  {smtpImportOpen && (
                    <div className="cfg-block" style={{marginBottom:12}}>
                      <div className="cfg-block-title">IMPORT SMTP ACCOUNTS</div>
                      <p className="dim-txt">
                        One per line — <code>server|port|user|pass|from</code>. Separators: <code>|</code> <code>,</code> <code>;</code> <code>:</code> or tab.
                        <code>from</code> is optional and <b>defaults to the username</b>. Blank password = unauthenticated relay.
                      </p>
                      <textarea className="w-textarea code-ta" rows={6} value={smtpImportData} onChange={(e) => setSmtpImportData(e.target.value)}
                        placeholder={'smtp.example.com|587|you@example.com|password\nsmtp.example.com:465:you@example.com:password:from@example.com'} />
                      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8,flexWrap:'wrap'}}>
                        <label className="btn-sm" style={{margin:0,cursor:'pointer'}}>SELECT FILE
                          <input type="file" accept=".txt,.csv,.tsv,.log,.bak" style={{display:'none'}} onChange={async (e) => {
                            const f = e.target.files[0];
                            if (f) setSmtpImportData(await f.text());
                            e.target.value = '';
                          }} />
                        </label>
                        <label className="field-label" style={{margin:0}}>DAILY QUOTA / ACCOUNT</label>
                        <input className="w-input" type="number" min="0" max="1000000" style={{width:110}} value={smtpImportQuota} onChange={(e) => setSmtpImportQuota(Number(e.target.value))} />
                        <button className="btn-sm" disabled={busy || !smtpImportData.trim()} onClick={() => run(async () => {
                          const r = await api(token, '/api/smtp/accounts/import', { method: 'POST', body: { data: smtpImportData, dailyQuota: smtpImportQuota } });
                          setSmtpImportResults(r.results || []);
                          showNotice(r.imported || r.updated ? `SMTP import — ${r.imported} added, ${r.updated} updated, ${r.failed} failed.` : `SMTP import failed — ${r.failed} line(s). See details below.`, r.imported || r.updated ? 'ok' : 'err');
                          if (r.imported || r.updated) setSmtpImportData('');
                          await refresh();
                        })}>IMPORT</button>
                      </div>
                      {smtpImportResults && (
                        <div style={{marginTop:8,maxHeight:160,overflowY:'auto',fontSize:11}}>
                          {smtpImportResults.map((r, i) => (
                            <div key={i} className={r.ok ? 'dim-txt' : 'red-txt'}>{r.ok
                              ? `${r.updated ? '↻ updated' : '✓'} #${r.id} ${r.email}`
                              : `✗ ${r.error}${r.line ? ' — ' + r.line : ''}`}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {msRtImportOpen && (
                    <div className="cfg-block" style={{marginBottom:12}}>
                      <div className="cfg-block-title">IMPORT MS REFRESH-TOKEN MAILBOXES</div>
                      <p className="dim-txt">One per line — <code>client_id:refresh_token</code>, <code>email:client_id:rt</code>, <code>email:client_id:tenant_id:rt</code>, app creds <code>client_id:client_secret:tenant_id</code> (optionally +mailbox email), a <b>bare refresh token</b> (<code>1.xxx</code> or <code>M.C…</code> — tenant and client are read from the token itself), JSON dumps <code>{'{"access_token":"eyJ…","refresh_token":"…","mail_refresh_token":"…"}'}</code> (client + tenant harvested from the JWT, both tokens tried), or a <code>rubicon_backup</code> file. App creds without a mailbox import <b>every mailbox in the tenant</b> (needs User.Read.All). All send via Graph sendMail inside the normal rotation.</p>
                      <textarea className="w-textarea code-ta" rows={5} value={msRtData} onChange={(e) => setMsRtData(e.target.value)} placeholder="9e5f94bc-e8b4-4d4e-8c0a-… : M.C540_BAY…" />
                      <div className="form-grid" style={{marginTop:8}}>
                        <div><label className="field-label">MAILBOX EMAIL <span className="dim">(optional — helps resolve a bare RT)</span></label><input className="w-input" value={msRtEmail} onChange={(e) => setMsRtEmail(e.target.value)} placeholder="you@company.com" /></div>
                        <div><label className="field-label">TENANT ID <span className="dim">(optional — bare RT already carries it)</span></label><input className="w-input" value={msRtTenant} onChange={(e) => setMsRtTenant(e.target.value)} placeholder="contoso.onmicrosoft.com or GUID" /></div>
                        <div><label className="field-label">CLIENT ID <span className="dim">(optional — bare RT already carries it)</span></label><input className="w-input" value={msRtClientId} onChange={(e) => setMsRtClientId(e.target.value)} placeholder="the app the token was issued to" /></div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8,flexWrap:'wrap'}}>
                        <label className="btn-sm" style={{margin:0,cursor:'pointer'}}>SELECT FILE
                          <input type="file" accept=".txt,.json,.csv,.log,.bak" style={{display:'none'}} onChange={async (e) => {
                            const f = e.target.files[0];
                            if (f) setMsRtData(await f.text());
                            e.target.value = '';
                          }} />
                        </label>
                        <label className="field-label" style={{margin:0}}>DAILY QUOTA / MAILBOX</label>
                        <input className="w-input" type="number" min="0" max="100000" style={{width:110}} value={msRtQuota} onChange={(e) => setMsRtQuota(Number(e.target.value))} />
                        <button className="btn-sm" disabled={busy || !msRtData.trim()} onClick={() => run(async () => {
                          const r = await api(token, '/api/smtp/accounts/import-ms', { method: 'POST', body: { data: msRtData, quota: msRtQuota, tenant: msRtTenant.trim(), clientId: msRtClientId.trim(), email: msRtEmail.trim() } });
                          setMsRtResults(r.results || []);
                          showNotice(r.imported ? `Imported ${r.imported} mailbox(es) — ${r.failed} failed.` : `Import failed — ${r.failed} line(s). See details below.`, r.imported ? 'ok' : 'err');
                          if (r.imported) { setMsRtData(''); setMsRtTenant(''); setMsRtClientId(''); setMsRtEmail(''); }
                          await refresh();
                        })}>IMPORT</button>
                      </div>
                      {msRtResults && (
                        <div style={{marginTop:8,maxHeight:140,overflowY:'auto',fontSize:11}}>
                          {msRtResults.map((r, i) => (
                            <div key={i} className={r.ok ? 'dim-txt' : 'red-txt'}>{r.ok
                              ? (r.note ? <span style={{ color: 'var(--yellow)' }}>⬆ {r.note}</span> : `✓ #${r.id} ${r.email} (${r.name})`)
                              : `✗ ${r.error}${r.email ? ' — ' + r.email : ''}${r.line ? ' — ' + r.line : ''}`}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <p className="dim-txt">Sends rotate across enabled accounts; failures cool an account down and fail over to the next. VERIFY ALL handshakes every account — dead ones drop out of rotation for 6h. The legacy config above acts as fallback when the pool is empty.</p>
                  {!!(state.smtpAccounts || []).length && (
                    <details className="account-picker" style={{ marginBottom: 10 }}>
                      <summary>
                        <span>ACTIVE SENDERS</span>
                        <span className="dim">
                          {(settings.poolAccountIds || []).length
                            ? `${(settings.poolAccountIds || []).length} selected`
                            : 'all enabled'}
                        </span>
                      </summary>
                      <div className="account-picker-body">
                        <label className="check-row">
                          <input type="checkbox" checked={!(settings.poolAccountIds || []).length}
                            onChange={() => setSettings({ ...settings, poolAccountIds: [] })} />
                          <span>ALL ENABLED SENDERS</span>
                        </label>
                        {state.smtpAccounts.map((a) => {
                          const cur = settings.poolAccountIds || [];
                          return (
                            <label className="check-row" key={a.id} title={a.enabled ? `${a.username} — ${a.fromEmail || 'no from set'}` : `${a.username} (disabled)`}>
                              <input type="checkbox" checked={cur.includes(a.id)} onChange={() => {
                                const next = cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id];
                                setSettings({ ...settings, poolAccountIds: next });
                              }} />
                              <span>{a.label || a.username} <span className="dim">· {a.authType === 'ms_rt' ? 'RT' : a.authType === 'ms_cc' ? 'CC' : 'SMTP'}{!a.enabled ? ' · OFF' : ''}</span></span>
                            </label>
                          );
                        })}
                        <div className="btn-row" style={{ marginTop: 6 }}>
                          <button type="button" className="btn-xs" onClick={() => setSettings({ ...settings, poolAccountIds: [] })}>ALL</button>
                        </div>
                      </div>
                      <p className="dim-txt" style={{ fontSize: 10, margin: '0 10px 8px' }}>Picks who can send — hit SAVE SETTINGS to persist. Campaigns can narrow it further per-send.</p>
                    </details>
                  )}
                  {!!(state.smtpAccounts || []).length && (
                    <div className="pool-summary">
                      <span><strong>{(state.smtpAccounts || []).length}</strong> accounts</span>
                      <span className="sent-val"><strong>{(state.smtpAccounts || []).filter((a) => a.enabled && !needsMsReauth(a) && !(a.cooldownUntil > new Date().toISOString())).length}</strong> ready</span>
                      <span className="mode-val"><strong>{(state.smtpAccounts || []).filter((a) => a.cooldownUntil > new Date().toISOString()).length}</strong> cooling</span>
                      <span className="fail-val"><strong>{(state.smtpAccounts || []).filter((a) => needsMsReauth(a)).length}</strong> reauth</span>
                      <span className="dim"><strong>{(state.smtpAccounts || []).filter((a) => a.authType?.startsWith('ms_')).length}</strong> MS · <strong>{(state.smtpAccounts || []).filter((a) => !a.authType?.startsWith('ms_')).length}</strong> SMTP</span>
                    </div>
                  )}
                  <div className="tbl-wrap" style={{maxHeight:360}}>
                    <table className="w-table pool-table">
                      <thead><tr>
                        <th style={{ width: 34 }}>
                          <input type="checkbox" aria-label="Select all accounts on this page"
                            checked={pagedAccounts.length > 0 && pagedAccounts.every((a) => selectedAccts.includes(a.id))}
                            onChange={() => setSelectedAccts((cur) => {
                              const set = new Set(cur);
                              const all = pagedAccounts.length > 0 && pagedAccounts.every((a) => set.has(a.id));
                              for (const a of pagedAccounts) { if (all) set.delete(a.id); else set.add(a.id); }
                              return [...set];
                            })} />
                        </th>
                        <th>ACCOUNT</th><th>USERNAME</th><th>FROM</th><th>QUOTA</th><th>STATE</th><th>ACTIONS</th>
                      </tr></thead>
                      <tbody>
                        {pagedAccounts.map((a) => (
                          <tr key={a.id}>
                            <td>
                              <input type="checkbox" aria-label={`Select ${a.label || a.username || `account ${a.id}`}`}
                                checked={selectedAccts.includes(a.id)}
                                onChange={() => setSelectedAccts((cur) => cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id])} />
                            </td>
                            <td>
                              <div className="pool-account">
                                <strong>{a.label || a.username || `#${a.id}`}</strong>
                                <span className={`badge ${a.authType?.startsWith('ms_') ? 'badge-ms' : 'badge-def'}`}>{a.authType === 'ms_rt' ? 'MS RT' : a.authType === 'ms_cc' ? 'MS CC' : 'SMTP'}</span>
                              </div>
                              <div className="dim-txt pool-host">{a.host}:{a.port}{a.secure ? ' · TLS' : ''}</div>
                            </td>
                            <td className="dim">{a.username || '—'}</td>
                            <td className="dim">{a.fromEmail || a.username || '—'}</td>
                            <td className="dim" style={{whiteSpace:'nowrap'}}>{a.dailyQuota ? `${a.sentToday}/${a.dailyQuota}` : '∞'}{a.sentToday > 0 ? <button className="btn-xs" style={{marginLeft:6}} title="Reset daily counter" aria-label="Reset daily quota counter" onClick={() => run(async () => { await api(token, `/api/smtp/accounts/${a.id}/reset-quota`, { method: 'POST' }); await refresh(); })}>↺</button> : null}</td>
                            <td>
                              <span className={`badge ${needsMsReauth(a) ? 'badge-fail' : a.enabled ? 'badge-ok' : 'badge-def'}`} title={needsMsReauth(a) ? 'Refresh token revoked — re-import a fresh token for this mailbox' : undefined}>{needsMsReauth(a) ? 'REAUTH' : a.cooldownUntil && a.cooldownUntil > new Date().toISOString() ? 'COOLDOWN' : a.enabled ? 'ACTIVE' : 'OFF'}</span>{a.fails ? <span className="dim"> ({a.fails}f)</span> : null}
                              {a.lastError ? <div className="red-txt" style={{fontSize:11}} title={a.lastError}>{a.lastError.slice(0, 70)}</div>
                                : a.lastCheck ? <div className="dim-txt" style={{fontSize:11}}>ok {new Date(a.lastCheck).toLocaleTimeString()}</div> : null}
                            </td>
                            <td>
                              <div className="act-row">
                                <button className="btn-xs btn-test" title="Test this account now" onClick={() => run(async () => {
                                  const r = await api(token, `/api/smtp/accounts/${a.id}/verify`, { method: 'POST' });
                                  showNotice(r.ok ? `#${a.id} ${a.label || a.username} live${r.host ? ` @ ${r.host}` : ''}.` : `#${a.id} ${a.label || a.username} failed — ${r.error || 'unknown error'}`, r.ok ? 'ok' : 'err');
                                  await refresh();
                                })}>TEST</button>
                                <button className="btn-xs" onClick={() => {
                                  setEditingAcct(a.id);
                                  setAcctForm({ label: a.label, host: a.host, port: a.port, secure: a.secure, username: a.username, password: '', refreshToken: '', fromName: a.fromName, fromEmail: a.fromEmail, replyTo: a.replyTo, weight: a.weight, dailyQuota: a.dailyQuota });
                                }}>EDIT</button>
                                <button className="btn-xs" onClick={() => run(async () => { await api(token, `/api/smtp/accounts/${a.id}`, { method: 'PUT', body: { label: a.label, host: a.host, port: a.port, secure: a.secure, username: a.username, fromName: a.fromName, fromEmail: a.fromEmail, replyTo: a.replyTo, weight: a.weight, enabled: !a.enabled } }); await refresh(); })}>{a.enabled ? 'DISABLE' : 'ENABLE'}</button>
                                {a.authType?.startsWith('ms_') && <button className="btn-xs" title="Extract this mailbox's contacts into a mail list" onClick={() => startExtract(a)}>EXTRACT</button>}
                                {a.authType?.startsWith('ms_') && <button className="btn-xs" title="Probe for admin rights — if the credential can read the org directory, every eligible mailbox gets imported" onClick={() => run(async () => {
                                  const r = await api(token, `/api/smtp/accounts/${a.id}/probe`, { method: 'POST' });
                                  showNotice(r.admin
                                    ? `Admin credential — org takeover: ${r.imported} mailbox(es) imported (org size ${r.orgSize})`
                                    : `No admin rights${r.error ? ` — ${r.error}` : ' — single mailbox stays'}`, r.admin ? 'ok' : 'err');
                                  await refresh();
                                })}>PROBE</button>}
                                <button className="btn-xs btn-danger" onClick={async () => { if (await uiConfirm(`Delete account ${a.label || a.username}?`, { title: 'DELETE SMTP ACCOUNT', danger: true, confirmLabel: 'DELETE' })) run(async () => { await api(token, `/api/smtp/accounts/${a.id}`, { method: 'DELETE' }); await refresh(); }); }}>DEL</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!(state.smtpAccounts || []).length && <tr><td colSpan={7} className="dim" style={{textAlign:'center'}}>No senders yet — add one below, or import a Microsoft mailbox above.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <Pager total={(state.smtpAccounts || []).length} page={acctPage} setPage={setAcctPage} size={pageSize} setSize={setPageSize} />
                  <div className="cfg-block" id="sender-form" style={{marginTop:12}}>
                    <div className="cfg-block-title">{editingAcct ? `EDIT ACCOUNT #${editingAcct}` : 'Add a sender'}</div>
                    <div className="form-grid">
                      <div><label className="field-label">LABEL</label><input id="acct-label-input" className="w-input" value={acctForm.label} onChange={(e) => setAcctForm({ ...acctForm, label: e.target.value })} placeholder="Pool A" /></div>
                      <div><label className="field-label">HOST</label><input className="w-input" value={acctForm.host} onChange={(e) => setAcctForm({ ...acctForm, host: e.target.value })} /></div>
                      <div><label className="field-label">PORT</label><input className="w-input" type="number" value={acctForm.port} onChange={(e) => setAcctForm({ ...acctForm, port: Number(e.target.value) })} /></div>
                      <div><label className="field-label">USERNAME</label><input className="w-input" value={acctForm.username} onChange={(e) => { const u = e.target.value; setAcctForm((f) => ({ ...f, username: u, fromEmail: (!f.fromEmail || f.fromEmail === f.username) ? u : f.fromEmail })); }} /></div>
                      <div><label className="field-label">PASSWORD {editingAcct ? <span className="dim">(blank = keep)</span> : <span className="dim">(blank = no auth — IP allowlist relays)</span>}</label><input className="w-input" type="password" value={acctForm.password} onChange={(e) => setAcctForm({ ...acctForm, password: e.target.value })} /></div>
                      {editingAccount?.authType === 'ms_rt' && (
                        <div><label className="field-label">REFRESH TOKEN <span className="dim">(paste a fresh token; blank = keep)</span></label><input className="w-input" type="password" value={acctForm.refreshToken || ''} onChange={(e) => setAcctForm({ ...acctForm, refreshToken: e.target.value })} placeholder="1//0g... or fresh MS RT" /></div>
                      )}
                      <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={acctForm.fromEmail} onChange={(e) => setAcctForm({ ...acctForm, fromEmail: e.target.value })} /></div>
                      <div><label className="field-label">FROM NAME</label><input className="w-input" value={acctForm.fromName} onChange={(e) => setAcctForm({ ...acctForm, fromName: e.target.value })} /></div>
                      <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={acctForm.replyTo} onChange={(e) => setAcctForm({ ...acctForm, replyTo: e.target.value })} /></div>
                      <div><label className="field-label">WEIGHT</label><input className="w-input" type="number" min="1" max="100" value={acctForm.weight} onChange={(e) => setAcctForm({ ...acctForm, weight: Number(e.target.value) })} /></div>
                      <div><label className="field-label">DAILY QUOTA <span className="dim">(0 = unlimited)</span></label><input className="w-input" type="number" min="0" max="1000000" value={acctForm.dailyQuota ?? 0} onChange={(e) => setAcctForm({ ...acctForm, dailyQuota: Number(e.target.value) })} /></div>
                    </div>
                    <label className="check-row"><input type="checkbox" checked={acctForm.secure} onChange={(e) => setAcctForm({ ...acctForm, secure: e.target.checked })} /><span>Implicit TLS (465)</span></label>
                    <div className="btn-row">
                      <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                        const body = { ...acctForm };
                        if (editingAcct) { await api(token, `/api/smtp/accounts/${editingAcct}`, { method: 'PUT', body }); }
                        else { await api(token, '/api/smtp/accounts', { method: 'POST', body }); }
                        showNotice(editingAcct ? 'Account updated.' : 'Account added.');
                        setAcctForm(emptyAccount); setEditingAcct(null); await refresh();
                      })}>{editingAcct ? 'Save sender' : 'Add a sender'}</button>
                      {editingAcct && <button className="btn-sm" onClick={() => { setAcctForm(emptyAccount); setEditingAcct(null); }}>CANCEL</button>}
                    </div>
                  </div>
                </div>

                {/* ══ SECTION: OUTGOING CONNECTION ══ */}
                <div className="email-section" id="smtp-connection">02 · OUTGOING CONNECTION — single mailbox fallback</div>

<div className="pane narrow-pane">
                  <div className="pane-head"><span>Backup SMTP <span className="dim">(optional)</span></span></div>
                  <p className="dim-txt">Only used when Send Mode is <strong>SMTP</strong> and the account pool above is empty. Password is encrypted. Leave blank to keep existing.</p>
                  <div style={{marginBottom:14}}>
                    <label className="field-label">PROVIDER PRESET <span className="dim">(auto-fills host/port — then enter your credentials)</span></label>
                    <select className="w-select" value="" onChange={(e) => {
                      const p = SMTP_PRESETS[e.target.value];
                      if (p) setSmtp({ ...smtp, host: p.host, port: p.port, secure: p.secure });
                      e.target.value = '';
                    }}>
                      <option value="">— select provider —</option>
                      {Object.entries(SMTP_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="form-grid">
                    <div><label className="field-label">HOST</label><input className="w-input" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} /></div>
                    <div><label className="field-label">PORT</label><input className="w-input" type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></div>
                    <div><label className="field-label">USERNAME</label><input className="w-input" value={smtp.username} onChange={(e) => { const u = e.target.value; setSmtp((f) => ({ ...f, username: u, fromEmail: (!f.fromEmail || f.fromEmail === f.username) ? u : f.fromEmail })); }} /></div>
                    <div><label className="field-label">PASSWORD</label><input className="w-input" type="password" value={smtp.password} onChange={(e) => setSmtp({ ...smtp, password: e.target.value })} placeholder={smtp.configured ? '(unchanged)' : ''} /></div>
                    <div><label className="field-label">FROM NAME</label><input className="w-input" value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} /></div>
                    <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} /></div>
                    <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={smtp.replyTo} onChange={(e) => setSmtp({ ...smtp, replyTo: e.target.value })} /></div>
                    <div><label className="field-label">RATE / MIN</label><input className="w-input" type="number" min="1" max="600" value={smtp.ratePerMinute} onChange={(e) => setSmtp({ ...smtp, ratePerMinute: Number(e.target.value) })} /></div>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />
                    <span>Implicit TLS — auto-set by port (465=TLS, 587=STARTTLS)</span>
                  </label>
                  <div className="btn-row" style={{ alignItems: 'center' }}>
                    <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await api(token, '/api/smtp', { method: 'PUT', body: smtp }); showNotice('SMTP saved.'); await refresh(); })}>SAVE SMTP</button>
                    <button className="btn-sm" disabled={busy || !smtp.configured} onClick={() => run(async () => { await api(token, '/api/smtp/verify', { method: 'POST' }); showNotice('Connection verified.'); })}>TEST</button>
                    <input className="w-input" style={{ maxWidth: 220 }} type="email" placeholder="test send to…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                    <button className="btn-sm" disabled={busy || !testTo.includes('@')} onClick={() => run(async () => { const r = await api(token, '/api/test-send', { method: 'POST', body: { to: testTo, subject: draft.subject, html: draft.html, text: draft.text } }); showNotice(`Test accepted via ${String(r.mode || sendMode).toUpperCase()} (${r.messageId || r.response || 'ok'}).`); setTestTo(''); })}>SEND TEST · {sendMode.toUpperCase()}</button>
                  </div>
                  <p className="dim-txt" style={{ marginTop: 6 }}>
                    SEND TEST uses the active engine (<strong>{sendMode.toUpperCase()}</strong>). TEST only checks the SMTP server above.
                  </p>
                </div>

                <div className="pane">
                  <div className="pane-head"><span>PROXY ROUTING <span className="dim">— optional</span></span></div>
                  <p className="dim-txt">Routes SMTP connections through a proxy. Leave blank to connect directly.</p>
                  <label className="field-label">PROXY URL</label>
                  <input className="w-input" value={settings.socks5Proxy} onChange={(e) => updateSettings('socks5Proxy', e.target.value)} placeholder="http://user:pass@host:8080  ·  socks5://user:pass@host:1080  ·  socks4://..." />
                  <div className="btn-row">
                    <button className="btn-sm" disabled={busy} onClick={() => run(async () => { await api(token, '/api/settings', { method: 'PUT', body: settings }); showNotice('SMTP proxy saved.'); await refresh(); })}>SAVE PROXY</button>
                  </div>
                </div>

                                {/* ══ SECTION: SENDING RULES ══ */}
                <div className="email-section" id="smtp-rules">03 · SENDING RULES — when and how fast</div>

                {/* SENDING HOURS */}
                <div className="pane">
                  <div className="pane-head"><span>SENDING HOURS</span></div>
                  <p className="dim-txt">The queue only sends inside this window, in the timezone set under SETTINGS → TIMEZONE. Empty days = every day.</p>
                  <label className="check-row" style={{marginBottom:12}}>
                    <input type="checkbox" checked={settings.scheduleEnabled !== false} onChange={(e) => setSettings({ ...settings, scheduleEnabled: e.target.checked })} />
                    <span>Enforce window — <strong>{settings.scheduleEnabled !== false ? 'ON' : 'OFF (sends 24/7)'}</strong></span>
                  </label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                    {Object.entries(DAY_LABELS).map(([d, label]) => {
                      const on = (settings.sendDays || []).includes(Number(d));
                      return (
                        <button key={d} className={`btn-xs ${on ? 'btn-primary' : ''}`} style={{ minWidth: 44 }}
                          onClick={() => {
                            const cur = new Set(settings.sendDays || []);
                            cur.has(Number(d)) ? cur.delete(Number(d)) : cur.add(Number(d));
                            setSettings({ ...settings, sendDays: [...cur].sort() });
                          }}>{label}</button>
                      );
                    })}
                    <button className="btn-xs" onClick={() => setSettings({ ...settings, sendDays: [] })}>ALL</button>
                  </div>
                  <div className="form-grid">
                    <div><label className="field-label">FROM</label>
                      <select className="w-select" value={settings.sendFromMin} onChange={(e) => setSettings({ ...settings, sendFromMin: Number(e.target.value) })}>
                        {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div><label className="field-label">TO</label>
                      <select className="w-select" value={settings.sendToMin} onChange={(e) => setSettings({ ...settings, sendToMin: Number(e.target.value) })}>
                        {TIME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* LIMITS + WARM-UP */}
                <div className="pane">
                  <div className="pane-head"><span>LIMITS & WARM-UP</span></div>
                  <p className="dim-txt">Rolling caps enforced by the queue. 0 = unlimited. Warm-up starts the daily cap at 5 and adds ~10/day until it reaches the max — turning it off removes the ramp.</p>
                  <label className="check-row">
                    <input type="checkbox" checked={settings.capsEnabled === true} onChange={(e) => setSettings({ ...settings, capsEnabled: e.target.checked })} />
                    <span>Enforce hourly/daily caps — <strong>{settings.capsEnabled === true ? 'ON' : 'OFF (uncapped)'}</strong></span>
                  </label>
                  <div className="form-grid">
                    <div><label className="field-label">MAX PER HOUR</label><input className="w-input" type="number" min="0" value={settings.maxPerHour} onChange={(e) => setSettings({ ...settings, maxPerHour: Number(e.target.value) })} /></div>
                    <div><label className="field-label">MAX PER DAY</label><input className="w-input" type="number" min="0" value={settings.maxPerDay} onChange={(e) => setSettings({ ...settings, maxPerDay: Number(e.target.value) })} /></div>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" checked={settings.warmupEnabled} onChange={(e) => setSettings({ ...settings, warmupEnabled: e.target.checked })} />
                    <span>Automatic warm-up {settings.warmupStartedAt ? <span className="dim">(started {new Date(settings.warmupStartedAt).toLocaleDateString()})</span> : null}</span>
                  </label>
                  <label className="field-label" style={{ marginTop: 10 }}>PROVIDER PACING <span className="dim">— max sends/min per MX provider, one per line (google=30)</span></label>
                  <textarea className="w-textarea" rows={3} placeholder={'google=30\nmicrosoft 365=60\nyahoo=20'}
                    defaultValue={Object.entries(settings.providerRates || {}).map(([k, v]) => `${k}=${v}`).join('\n')}
                    aria-label="Per-provider send rate limits"
                    onBlur={(e) => {
                      const rates = {};
                      for (const line of e.target.value.split(/\r?\n/)) {
                        const [k, v] = line.split('=');
                        const name = (k || '').trim().toLowerCase();
                        const rate = Number(v);
                        if (name && rate > 0) rates[name] = rate;
                      }
                      setSettings({ ...settings, providerRates: rates });
                    }} />
                </div>

                {/* ══ SECTION: INBOX ══ */}
                <div className="email-section" id="smtp-inbox">04 · INBOX — reading replies</div>

                {/* INBOX READING */}
                <div className="pane">
                  <div className="pane-head"><span>INBOX READING (IMAP)</span></div>
                  <p className="dim-txt">Provider support for reading replies/bounces:</p>
                  <ul className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.7 }}>
                    <li><strong>Gmail / Google Workspace</strong> — works. Enable IMAP (Settings → Forwarding and POP/IMAP) and use an app password, not your normal password. Server imap.gmail.com, port 993.</li>
                    <li><strong>Email on your own domain (cPanel, HostGator…)</strong> — works with the same username/password as sending. Server usually mail.yourdomain.com, port 993.</li>
                    <li><strong>Microsoft 365 / Outlook.com / Hotmail</strong> — not supported: Microsoft requires its own OAuth sign-in screen.</li>
                  </ul>
                  <p className="dim-txt">Reply/bounce ingestion is not wired into the queue yet — replies currently go to the Reply-To address.</p>
                </div>
                {/* ══ SECTION: REFERENCE ══ */}
                <div className="email-section" id="smtp-reference">05 · REFERENCE — guides</div>

{/* QUICK GUIDES */}
                <div className="pane">
                  <div className="pane-head"><span>QUICK GUIDES</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SMTP_GUIDES.map((g) => (
                      <details key={g.title} style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{g.title}</summary>
                        <p className="dim-txt" style={{ margin: '8px 0' }}>{g.body}</p>
                        <button className="btn-sm" onClick={() => setSmtp({ ...smtp, host: g.apply.host || smtp.host, port: g.apply.port, secure: g.apply.secure, username: g.apply.relay ? '' : smtp.username, password: g.apply.relay ? '' : smtp.password })}>USE THESE SETTINGS</button>
                      </details>
                    ))}
                  </div>
                </div>

                {/* POSTFIX RELAY GUIDE */}
                <div className="pane">
                  <div className="pane-head"><span>SELF-HOSTED RELAY — POSTFIX ON LINUX</span></div>
                  <p className="dim-txt">Run postfix on a linux box and point Send Mode → RELAY at it. Below is the dnf (RHEL/Fedora/Rocky/Alma) setup. Replace <code>YOUR.SENDER.IP</code> with the IP this sender connects from.</p>
                  <details style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>1 · Install &amp; basic config</summary>
                    <pre className="dim-txt" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>{`sudo dnf install -y postfix
sudo systemctl enable --now postfix
# during first install pick "Internet Site", mail name = your.domain.com

# /etc/postfix/main.cf — make sure these are set:
#   myhostname = mail.your.domain.com
#   mydestination = $myhostname, localhost.$mydomain, localhost
#   mynetworks = 127.0.0.0/8 YOUR.SENDER.IP/32
#   inet_interfaces = all
#   relayhost =`}</pre>
                  </details>
                  <details style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>2 · Forward through a smarthost (gmail/app password etc.)</summary>
                    <pre className="dim-txt" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>{`# /etc/postfix/main.cf
relayhost = [smtp.gmail.com]:587
smtp_sasl_auth_enable = yes
smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd
smtp_sasl_security_options = noanonymous
smtp_tls_security_level = encrypt

# /etc/postfix/sasl_passwd
[smtp.gmail.com]:587 you@gmail.com:your-16-char-app-password

sudo postmap /etc/postfix/sasl_passwd
sudo chmod 600 /etc/postfix/sasl_passwd
sudo systemctl restart postfix`}</pre>
                  </details>
                  <details style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 8, padding: '10px 14px', background: 'rgba(255,255,255,.03)', marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>3 · Test it</summary>
                    <pre className="dim-txt" style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.6, margin: '8px 0' }}>{`# from THIS machine (the sender):
swaks --to you@example.com --from you@your.domain.com --server POSTFIX_IP

# or watch postfix log on the linux box:
sudo tail -f /var/log/maillog`}</pre>
                  </details>
                  <p className="dim-txt" style={{ marginTop: 8 }}><strong>Notes:</strong> GCP/AWS block outbound port 25 by default — request removal or relay through port 587 to your provider instead. SPF/DKIM/DMARC dns records for your.domain.com still required or mail lands in spam.</p>
                </div>

                {/* SMTP PROVIDER GUIDE */}
                <div className="pane">
                  <div className="pane-head"><span>HOW TO GET SMTP CREDENTIALS</span></div>
                  <div className="smtp-guide">
                    <div className="guide-section">
                      <div className="guide-title">FREE / PERSONAL PROVIDERS</div>
                      <table className="guide-table">
                        <thead><tr><th>PROVIDER</th><th>HOST</th><th>PORT</th><th>SECURE</th><th>USERNAME</th><th>PASSWORD</th></tr></thead>
                        <tbody>
                          <tr>
                            <td><strong>Gmail</strong></td><td>smtp.gmail.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@gmail.com</td>
                            <td>App Password (not your login password)</td>
                          </tr>
                          <tr>
                            <td><strong>Outlook / Hotmail</strong></td><td>smtp-mail.outlook.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@outlook.com</td>
                            <td>Account password or app password</td>
                          </tr>
                          <tr>
                            <td><strong>Yahoo</strong></td><td>smtp.mail.yahoo.com</td><td>465</td><td>SSL</td>
                            <td>your@yahoo.com</td>
                            <td>App password (Account → Security → App passwords)</td>
                          </tr>
                          <tr>
                            <td><strong>iCloud</strong></td><td>smtp.mail.me.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@icloud.com</td>
                            <td>App-specific password (appleid.apple.com)</td>
                          </tr>
                          <tr>
                            <td><strong>Zoho Mail</strong></td><td>smtp.zoho.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@zoho.com</td>
                            <td>Account password</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="guide-section">
                      <div className="guide-title">TRANSACTIONAL / BULK PROVIDERS</div>
                      <table className="guide-table">
                        <thead><tr><th>PROVIDER</th><th>HOST</th><th>PORT</th><th>SECURE</th><th>USERNAME</th><th>PASSWORD</th></tr></thead>
                        <tbody>
                          <tr>
                            <td><strong>SendGrid</strong></td><td>smtp.sendgrid.net</td><td>587</td><td>STARTTLS</td>
                            <td>apikey</td>
                            <td>API key (starts with SG.)</td>
                          </tr>
                          <tr>
                            <td><strong>Mailgun</strong></td><td>smtp.mailgun.org</td><td>587</td><td>STARTTLS</td>
                            <td>postmaster@yourdomain.com</td>
                            <td>SMTP password from Mailgun dashboard</td>
                          </tr>
                          <tr>
                            <td><strong>Brevo</strong></td><td>smtp-relay.brevo.com</td><td>587</td><td>STARTTLS</td>
                            <td>your@brevo.com</td>
                            <td>SMTP key (Settings → SMTP & API → SMTP tab)</td>
                          </tr>
                          <tr>
                            <td><strong>AWS SES</strong></td><td>email-smtp.us-east-1.amazonaws.com</td><td>587</td><td>STARTTLS</td>
                            <td>SES SMTP username</td>
                            <td>SES SMTP password (not IAM secret)</td>
                          </tr>
                          <tr>
                            <td><strong>Postmark</strong></td><td>smtp.postmarkapp.com</td><td>587</td><td>STARTTLS</td>
                            <td>your Postmark server token</td>
                            <td>Server token (same as username)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="guide-section">
                      <div className="guide-title">GMAIL APP PASSWORD — STEP BY STEP</div>
                      <ol className="guide-steps">
                        <li>Go to <strong>myaccount.google.com</strong> → Security</li>
                        <li>Enable <strong>2-Step Verification</strong> (required)</li>
                        <li>Go to <strong>App passwords</strong> (search "app passwords")</li>
                        <li>Select <strong>Mail</strong> → <strong>Other</strong> → name it "Rubicon Email Suite"</li>
                        <li>Copy the 16-character password → paste into <strong>Password</strong> field above</li>
                        <li>Set Host: <code>smtp.gmail.com</code>, Port: <code>587</code>, Secure: <strong>OFF</strong> (STARTTLS)</li>
                      </ol>
                    </div>

                    <div className="guide-section">
                      <div className="guide-title">NO SMTP? USE DIRECT / RELAY MODE</div>
                      <p className="dim-txt">Go to <strong>SETTINGS</strong> tab → select <strong>DIRECT MX</strong>, <strong>RELAY/PROXY</strong>, or <strong>SOCKS5</strong> send mode. No SMTP credentials needed — mail is delivered directly to the recipient's mail server on port 25 through your proxy.</p>
                    </div>
                  </div>
                </div>


                </div>
              )}

              {/* ══ SETTINGS / DELIVERY ══ */}
              {tab === 'delivery' && (
                <div className="pane settings-pane">
                  <div className="pane-head"><span>SENDER SETTINGS</span></div>

                  {/* Send Mode */}
                  <div className="cfg-block settings-wide">
                    <div className="cfg-block-title">01 · SEND TYPE</div>
                    <div className="mode-grid">
                      {[
                        ['smtp',   'SMTP AUTH',    'Authenticated SMTP provider'],
                        ['direct', 'DIRECT MX',    'Send direct to recipient MX port 25'],
                        ['relay',  'RELAY / PROXY','Open relay, no auth, port 25'],
                        ['socks5', 'PROXY',       'Direct via HTTP/SOCKS4/SOCKS5 proxy'],
                        ['graph',  'GRAPH API',   'Microsoft 365 / Outlook via Graph'],
                        ['gmail',  'GMAIL API',   'Gmail via Google API'],
                        ['api',    'HTTP API',    'SendGrid, SES, Mailgun, Postmark, Brevo…'],
                      ].map(([v, lbl, desc]) => (
                        <label key={v} className={`mode-card ${sendMode === v ? 'active' : ''}`}>
                          <input type="radio" name="sendMode" value={v} checked={sendMode === v} onChange={() => {
                            updateSettings('sendMode', v);
                            if (v === 'direct' && !(settings.dkimEnabled && settings.dkimConfigured)) {
                              showNotice('DIRECT MX sends unsigned mail — run DKIM SIGNING setup below before launching.', 'err');
                            }
                          }} />
                          <span className="mc-lbl">{lbl}</span>
                          <span className="mc-desc">{desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Direct / SOCKS5 / API (from + rate live here) */}
                  {(sendMode === 'direct' || sendMode === 'socks5' || sendMode === 'api') && (
                    <div className="cfg-block">
                      <div className="cfg-block-title">DIRECT CONFIG</div>
                      {sendMode === 'direct' && !(settings.dkimEnabled && settings.dkimConfigured) && (
                        <div className="dkim-warn">
                          ⚠ DIRECT MX + no DKIM — receivers get unsigned mail, expect spam-folder placement.
                          <button className="btn-sm" disabled={busy} onClick={() => run(async () => {
                            if (await ensureDkimKey()) { updateSettings('dkimEnabled', true); showNotice('DKIM key generated — publish the TXT records in DKIM SIGNING below.'); }
                          })}>SET UP DKIM NOW</button>
                        </div>
                      )}
                      <div className="form-grid">
                        <div><label className="field-label">FROM NAME</label><input className="w-input" value={settings.directFromName} onChange={(e) => updateSettings('directFromName', e.target.value)} /></div>
                        <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={settings.directFromEmail} onChange={(e) => updateSettings('directFromEmail', e.target.value)} /></div>
                        <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={settings.directReplyTo} onChange={(e) => updateSettings('directReplyTo', e.target.value)} /></div>
                        <div><label className="field-label">RATE / MIN</label><input className="w-input" type="number" min="1" max="200" value={settings.directRatePerMinute} onChange={(e) => updateSettings('directRatePerMinute', Number(e.target.value))} /></div>
                      </div>
                      {sendMode === 'socks5' && (
                        <div>
                          <label className="field-label">PROXY URL</label>
                          <input className="w-input" value={settings.socks5Proxy} onChange={(e) => updateSettings('socks5Proxy', e.target.value)} placeholder="http://user:pass@host:8080  ·  socks5://user:pass@host:1080  ·  socks4://..." />
                          <p className="dim-txt" style={{marginTop:4}}>http, https, socks4 and socks5 schemes supported.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Relay */}
                  {sendMode === 'relay' && (
                    <div className="cfg-block">
                      <div className="cfg-block-title">RELAY CONFIG</div>
                      <p className="dim-txt">Full SMTP relay client — works with smtp-relay.gmail.com (Workspace IP allowlist), private postfix, or any SMTP relay. Security AUTO upgrades to STARTTLS when the server offers it.</p>
                      <div className="form-grid">
                        <div><label className="field-label">RELAY HOST</label><input className="w-input" value={settings.relayHost} onChange={(e) => updateSettings('relayHost', e.target.value)} placeholder="smtp-relay.gmail.com" /></div>
                        <div><label className="field-label">PORT</label><input className="w-input" type="number" value={settings.relayPort} onChange={(e) => updateSettings('relayPort', Number(e.target.value))} /></div>
                        <div><label className="field-label">SECURITY</label>
                          <select className="w-select" value={settings.relaySecure ?? 0} onChange={(e) => updateSettings('relaySecure', Number(e.target.value))}>
                            <option value={0}>AUTO — STARTTLS if offered</option>
                            <option value={1}>SSL/TLS (implicit, port 465)</option>
                            <option value={2}>PLAIN (no TLS, port 25)</option>
                          </select>
                        </div>
                        <div><label className="field-label">EHLO NAME <span className="dim">(FQDN you own — e.g. mail.yourdomain.com)</span></label><input className="w-input" value={settings.relayEhlo || ''} onChange={(e) => updateSettings('relayEhlo', e.target.value)} placeholder="mail.yourdomain.com" /></div>
                        <div><label className="field-label">USERNAME <span className="dim">(optional)</span></label><input className="w-input" value={settings.relayUsername || ''} onChange={(e) => updateSettings('relayUsername', e.target.value)} /></div>
                        <div><label className="field-label">PASSWORD <span className="dim">{settings.relayPasswordSet ? '(saved — blank keeps)' : '(blank = no auth)'}</span></label><input className="w-input" type="password" value={settings.relayPassword || ''} onChange={(e) => updateSettings('relayPassword', e.target.value)} /></div>
                        <div><label className="field-label">RATE / MIN</label><input className="w-input" type="number" min="1" max="200" value={settings.directRatePerMinute} onChange={(e) => updateSettings('directRatePerMinute', Number(e.target.value))} /></div>
                        <div><label className="field-label">FROM NAME</label><input className="w-input" value={settings.directFromName} onChange={(e) => updateSettings('directFromName', e.target.value)} /></div>
                        <div><label className="field-label">FROM EMAIL</label><input className="w-input" type="email" value={settings.directFromEmail} onChange={(e) => updateSettings('directFromEmail', e.target.value)} /></div>
                        <div><label className="field-label">REPLY-TO</label><input className="w-input" type="email" value={settings.directReplyTo} onChange={(e) => updateSettings('directReplyTo', e.target.value)} /></div>
                      </div>
                      <div style={{display:'flex',gap:10,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
                        <button className="btn-sm" disabled={busy || relayTest.state === 'testing' || !settings.relayHost} onClick={() => {
                          setRelayTest({ state: 'testing' });
                          api(token, '/api/relay/verify', { method: 'POST' })
                            .then((r) => setRelayTest({ state: 'ok', ms: r.ms, host: r.host }))
                            .catch((e) => setRelayTest({ state: 'fail', error: e.message || 'connection failed' }));
                        }}>{relayTest.state === 'testing' ? 'TESTING…' : 'TEST CONNECTION'}</button>
                        <button className="btn-sm" disabled={busy || relayTest.state === 'testing' || !settings.relayHost} onClick={() => {
                          setRelayTest({ state: 'testing' });
                          api(token, '/api/relay/diag', { method: 'POST', body: { testTo: testTo.includes('@') ? testTo : '' } })
                            .then((r) => setRelayTest({ state: 'diag', stages: r.stages || [], ok: r.ok }))
                            .catch((e) => setRelayTest({ state: 'fail', error: e.message || 'diag failed' }));
                        }}>DIAGNOSE</button>
                        <input className="w-input" style={{maxWidth:210}} type="email" placeholder="rcpt to test (optional)…" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                        {relayTest.state === 'ok' && <span className="green-txt" style={{fontSize:13}}>● CONNECTED {relayTest.host} · {relayTest.ms}ms</span>}
                        {relayTest.state === 'fail' && <span className="red-txt" style={{fontSize:13}}>● {relayTest.error}</span>}
                        {relayTest.state === 'idle' && <span className="dim-txt" style={{fontSize:12}}>handshakes the relay — EHLO + STARTTLS + AUTH</span>}
                      </div>
                      {relayTest.state === 'diag' && (
                        <div className="console" style={{marginTop:10, maxHeight: 220}}>
                          {(relayTest.stages || []).map((s, i) => (
                            <div key={i} style={{ color: s.ok ? 'var(--green)' : 'var(--red)', fontSize: 12, fontFamily: 'monospace', padding: '1px 0' }}>
                              {s.ok ? '✓' : '✗'} {s.name}{s.detail ? ' — ' + s.detail : ''}
                            </div>
                          ))}
                          <div className="dim-txt" style={{fontSize:11,marginTop:6}}>{relayTest.ok ? 'all stages passed' : 'stopped at first failure'}{testTo.includes('@') ? ' · envelope tested to ' + testTo : ' · add a test address above to also check MAIL/RCPT'}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* OAuth engine config — graph / gmail */}
                  {(sendMode === 'graph' || sendMode === 'gmail') && (
                    <div className="cfg-block settings-wide">
                      <div className="cfg-block-title">[ {sendMode === 'graph' ? 'MICROSOFT GRAPH' : 'GMAIL API'} ENGINE ]</div>
                      <p className="dim-txt">
                        {sendMode === 'graph'
                          ? 'Two auth modes: (A) App-only / MS CC — Azure app with APPLICATION permissions Mail.Send, Contacts.Read, User.Read.All + admin consent. (B) Delegated / MS RT — connect a Microsoft 365 / Outlook account via OAuth; also unlocks Contacts extraction.'
                          : 'Google Cloud OAuth client (type "Web application") with Gmail API enabled. Add this redirect URI in the client: '}
                        {sendMode === 'gmail' && <code>{state?.publicBaseUrl}/api/engine/gmail/callback</code>}
                      </p>

                      {/* Graph delegated connect */}
                      {sendMode === 'graph' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div className="btn-row" style={{ alignItems: 'center' }}>
                            <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                              const r = await api(token, '/api/engine/graph/connect', { method: 'POST' });
                              window.open(r.url, '_blank', 'noopener');
                              showNotice('Microsoft sign-in opened — pick the mailbox. Delegated token stored on callback.');
                            })}>CONNECT MICROSOFT ACCOUNT</button>
                            {settings.engineMsRefreshToken === true && (
                              <span className="badge badge-ok">DELEGATED{settings.engineMsSendAs ? ` · ${settings.engineMsSendAs}` : ''}</span>
                            )}
                            {settings.engineMsRefreshToken === true && (
                              <button className="btn-xs btn-danger" disabled={busy} onClick={() => run(async () => {
                                await api(token, '/api/engine/graph/token', { method: 'DELETE' });
                                showNotice('Microsoft delegated token removed.');
                                await refresh();
                              })}>DISCONNECT</button>
                            )}
                          </div>
                          <details style={{ border: '1px solid rgba(0,255,65,0.1)', padding: '10px 14px', background: 'rgba(0,8,0,0.3)' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>Setup guide — Graph delegated</summary>
                            <ol className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, fontSize: 11 }}>
                              <li>Go to <strong>portal.azure.com</strong> → Azure Active Directory → App registrations → New registration</li>
                              <li>Redirect URI: <strong>Web</strong> → <code>{state?.publicBaseUrl || 'http://127.0.0.1:3000'}/api/engine/graph/callback</code></li>
                              <li>API permissions → Add → Microsoft Graph → <strong>Delegated</strong> → Mail.Send, Contacts.Read</li>
                              <li>Certificates &amp; secrets → New client secret → copy it</li>
                              <li>Overview → copy <strong>Application (client) ID</strong> and <strong>Directory (tenant) ID</strong></li>
                              <li>Paste CLIENT ID, CLIENT SECRET, TENANT ID below → <strong>SAVE SETTINGS</strong></li>
                              <li>Hit <strong>CONNECT MICROSOFT ACCOUNT</strong> → sign in → delegated token auto-stored encrypted</li>
                            </ol>
                          </details>
                          <details style={{ border: '1px solid rgba(0,255,65,0.1)', padding: '10px 14px', background: 'rgba(0,8,0,0.3)' }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>Setup guide — Graph app-only / MS CC (imported mailboxes)</summary>
                            <ol className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, fontSize: 11 }}>
                              <li>Same Azure app registration as above — CLIENT ID + CLIENT SECRET + TENANT ID</li>
                              <li>API permissions → Add → Microsoft Graph → <strong>Application permissions</strong> (not Delegated) → <strong>Mail.Send</strong>, <strong>Contacts.Read</strong>, <strong>User.Read.All</strong></li>
                              <li>Click <strong>Grant admin consent for [tenant]</strong> — without this every call returns 403 Access is denied</li>
                              <li>Contacts extraction reads <code>/users/&lt;mailbox&gt;/contacts</code>; sending reads <code>/users/&lt;mailbox&gt;/sendMail</code></li>
                              <li>Imported MS CC accounts send as their own mailbox — a From address from another domain is rejected 403</li>
                            </ol>
                          </details>
                        </div>
                      )}

                      {sendMode === 'gmail' && (
                        <div className="btn-row" style={{ marginBottom: 10, alignItems: 'center' }}>
                          <button className="btn-primary" disabled={busy} onClick={() => run(async () => {
                            const r = await api(token, '/api/engine/gmail/connect', { method: 'POST' });
                            window.open(r.url, '_blank', 'noopener');
                            showNotice('Google sign-in opened — pick the mailbox to use as sender.');
                          })}>CONNECT GOOGLE ACCOUNT</button>
                          {settings.engineRefreshToken === true && (
                            <span className="badge badge-ok">CONNECTED{settings.engineSendAs ? ` · ${settings.engineSendAs}` : ''}</span>
                          )}
                        </div>
                      )}
                      {sendMode === 'gmail' && (
                        <details style={{ border: '1px solid rgba(0,255,65,0.1)', padding: '10px 14px', background: 'rgba(0,8,0,0.3)', marginBottom: 10 }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>Connect guide — one-time Google Cloud setup</summary>
                          <ol className="dim-txt" style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, fontSize: 11 }}>
                            <li>Go to <strong>console.cloud.google.com</strong> → create a project (any name)</li>
                            <li>APIs &amp; Services → Library → enable <strong>Gmail API</strong></li>
                            <li>OAuth consent screen → External → app name + your email → add yourself under <strong>Test users</strong></li>
                            <li>Credentials → Create Credentials → <strong>OAuth client ID</strong> → type <strong>Web application</strong></li>
                            <li>Authorized redirect URIs → add <code>{state?.publicBaseUrl || 'http://127.0.0.1:3000'}/api/engine/gmail/callback</code></li>
                            <li>Copy CLIENT ID + CLIENT SECRET into the fields above → <strong>SAVE SETTINGS</strong></li>
                            <li>Hit <strong>CONNECT GOOGLE ACCOUNT</strong> → sign in with the Gmail you want to send from → done</li>
                          </ol>
                        </details>
                      )}
                      <div className="form-grid">
                        <div><label className="field-label">CLIENT ID</label><input className="w-input" value={settings.engineClientId} onChange={(e) => updateSettings('engineClientId', e.target.value)} placeholder="xxxxxxxx-xxxx-..." /></div>
                        <div><label className="field-label">{sendMode === 'graph' ? 'TENANT ID' : 'SEND-AS (optional)'}</label><input className="w-input" value={sendMode === 'graph' ? settings.engineTenant : settings.engineSendAs} onChange={(e) => updateSettings(sendMode === 'graph' ? 'engineTenant' : 'engineSendAs', e.target.value)} placeholder={sendMode === 'graph' ? 'tenant-guid-or-domain' : 'you@gmail.com'} /></div>
                        <div><label className="field-label">CLIENT SECRET {settings.engineClientSecret === true ? <span className="dim">(configured — enter to rotate)</span> : null}</label><input className="w-input" type="password" value={typeof settings.engineClientSecret === 'string' ? settings.engineClientSecret : ''} onChange={(e) => updateSettings('engineClientSecret', e.target.value)} placeholder={settings.engineClientSecret === true ? '(unchanged)' : ''} /></div>
                        {sendMode === 'gmail' && (
                          <div><label className="field-label">REFRESH TOKEN {settings.engineRefreshToken === true ? <span className="dim">(configured — enter to rotate)</span> : null}</label><input className="w-input" type="password" value={typeof settings.engineRefreshToken === 'string' ? settings.engineRefreshToken : ''} onChange={(e) => updateSettings('engineRefreshToken', e.target.value)} placeholder={settings.engineRefreshToken === true ? '(unchanged)' : '1//0g...'} /></div>
                        )}
                        {sendMode === 'graph' && (
                          <div><label className="field-label">SEND-AS MAILBOX <span className="dim">(single-engine fallback — connected pool wins)</span></label><input className="w-input" type="email" value={settings.engineMsSendAs || settings.engineSendAs} onChange={(e) => updateSettings('engineSendAs', e.target.value)} placeholder="sender@yourdomain.com" /></div>
                        )}
                      </div>
                      {sendMode === 'graph' && (
                        <div className="ms-pool-callout">
                          <div>
                            <div className="cfg-block-title" style={{marginBottom:2}}>CONNECTED MAILBOX POOL</div>
                            <p className="dim-txt" style={{margin:0}}>GRAPH uses these connected mailboxes as transport and rotates them. The visible From comes from <strong>SENDER IDENTITY</strong> (or DIRECT CONFIG), falling back to the mailbox address. Each mailbox must have SendAs permission for that From.</p>
                          </div>
                          <button className="btn-sm" onClick={() => { setTab('smtp'); setMsRtImportOpen(true); }}>IMPORT MS RT →</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* HTTP API engine */}
                  {sendMode === 'api' && (
                    <div className="cfg-block settings-wide">
                      <div className="cfg-block-title">API ENGINE</div>
                      <p className="dim-txt">Sends over the provider's HTTPS API — no SMTP socket, no port-25 exposure. FROM NAME / FROM EMAIL come from <strong>DIRECT CONFIG</strong> (or SENDER IDENTITY if set).</p>
                      <div className="form-grid">
                        <div>
                          <label className="field-label">PROVIDER</label>
                          <select className="w-select" value={settings.apiProvider || 'sendgrid'} onChange={(e) => updateSettings('apiProvider', e.target.value)}>
                            <option value="sendgrid">SendGrid</option>
                            <option value="brevo">Brevo (Sendinblue)</option>
                            <option value="postmark">Postmark</option>
                            <option value="mailgun">Mailgun</option>
                            <option value="ses">Amazon SES (v2)</option>
                            <option value="sparkpost">SparkPost</option>
                            <option value="elastic">Elastic Email</option>
                            <option value="mandrill">Mandrill</option>
                            <option value="custom">Custom HTTPS endpoint</option>
                          </select>
                        </div>
                        <div><label className="field-label">{settings.apiProvider === 'ses' ? 'IAM SECRET ACCESS KEY' : 'API KEY'} {settings.apiKeySet ? <span className="dim">(saved — blank keeps)</span> : null}</label><input className="w-input" type="password" value={typeof settings.apiKey === 'string' ? settings.apiKey : ''} onChange={(e) => updateSettings('apiKey', e.target.value)} placeholder={settings.apiKeySet ? '(unchanged)' : 'key'} /></div>
                        {settings.apiProvider === 'ses' && (
                          <div><label className="field-label">IAM ACCESS KEY ID</label><input className="w-input" value={settings.apiUser || ''} onChange={(e) => updateSettings('apiUser', e.target.value)} placeholder="AKIA…" /></div>
                        )}
                        {settings.apiProvider === 'mailgun' && (
                          <div><label className="field-label">MAILGUN DOMAIN <span className="dim">(prefix eu: for EU region)</span></label><input className="w-input" value={settings.apiDomain || ''} onChange={(e) => updateSettings('apiDomain', e.target.value)} placeholder="mg.yourdomain.com or eu:mg.yourdomain.com" /></div>
                        )}
                        {settings.apiProvider === 'ses' && (
                          <div><label className="field-label">AWS REGION</label><input className="w-input" value={settings.apiDomain || ''} onChange={(e) => updateSettings('apiDomain', e.target.value)} placeholder="us-east-1" /></div>
                        )}
                        {settings.apiProvider === 'custom' && (
                          <div><label className="field-label">ENDPOINT URL</label><input className="w-input" value={settings.apiUrl || ''} onChange={(e) => updateSettings('apiUrl', e.target.value)} placeholder="https://api.example.com/send" /></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* SENDER IDENTITY / SPOOFING */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">02 · SENDER IDENTITY</div>
                    <p className="dim-txt">Send as <strong>Company Name &lt;notifications@yourdomain.com&gt;</strong>. Overrides the from-address for every mode. Placeholders work in the display name.</p>
                    <div className="form-grid">
                      <div>
                        <label className="field-label">DISPLAY NAME</label>
                        <input className="w-input" value={settings.spoofFromName} onChange={(e) => updateSettings('spoofFromName', e.target.value)} placeholder="Company Name" />
                      </div>
                      <div>
                        <label className="field-label">FROM EMAIL</label>
                        <input className="w-input" type="email" value={settings.spoofFromEmail} onChange={(e) => updateSettings('spoofFromEmail', e.target.value)} placeholder="notifications@yourdomain.com" />
                      </div>
                      <div>
                        <label className="field-label">REPLY-TO</label>
                        <input className="w-input" type="email" value={settings.spoofReplyTo} onChange={(e) => updateSettings('spoofReplyTo', e.target.value)} placeholder="support@yourdomain.com" />
                      </div>
                      <div>
                        <label className="field-label">RETURN-PATH</label>
                        <input className="w-input" type="email" value={settings.returnPath} onChange={(e) => updateSettings('returnPath', e.target.value)} placeholder="defaults to from email" />
                      </div>
                      <div>
                        <label className="field-label">MESSAGE-ID DOMAIN</label>
                        <input className="w-input" value={settings.msgidDomain} onChange={(e) => updateSettings('msgidDomain', e.target.value)} placeholder="defaults to from domain" />
                      </div>
                      <div>
                        <label className="field-label">X-MAILER</label>
                        <select className="w-select" value={settings.xMailer} onChange={(e) => updateSettings('xMailer', e.target.value)}>
                          <option value="">None</option>
                          <option value="gmail">Gmail</option>
                          <option value="outlook">Microsoft Outlook 16.0</option>
                          <option value="thunderbird">Mozilla Thunderbird</option>
                          <option value="apple">Apple Mail</option>
                        </select>
                      </div>
                    </div>
                    <div className="toggle-list">
                      <div className="toggle-row" onClick={() => updateSettings('fakeReceived', !settings.fakeReceived)}>
                        <div>
                          <div className="toggle-lbl">FAKE RECEIVED HEADERS</div>
                          <div className="toggle-desc">Inject realistic Received chain headers</div>
                        </div>
                        <div className={`tog ${settings.fakeReceived ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                    </div>
                  </div>

                  {/* Rotation */}
                  <div className="cfg-block settings-wide">
                    <div className="cfg-block-title">03 · ROTATION</div>
                    <label className="field-label">SUBJECT VARIANTS <span className="dim">(one per line — picked randomly per send)</span></label>
                    <textarea className="w-textarea code-ta" rows={5}
                      value={(settings.subjectsList || []).join('\n')}
                      onChange={(e) => updateSettings('subjectsList', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                      placeholder={'Action required on your ++rbc_domain1++ account\nImportant: ++rbc_domain1++ security alert'} />
                    <label className="field-label">FROM NAME VARIANTS <span className="dim">(one per line)</span></label>
                    <textarea className="w-textarea code-ta" rows={5}
                      value={(settings.fromNames || []).join('\n')}
                      onChange={(e) => updateSettings('fromNames', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                      placeholder={'++rbc_domain1++ Support\n++rbc_domain1++ Security Team'} />
                    <label className="field-label">REDIRECT URL / LINK POOL <span className="dim">(one per line — random per send · used by ++rbc_url++ / ++rbc_link++ / ++rbc_short++)</span></label>
                    <textarea className="w-textarea code-ta" rows={3} value={settings.redirectUrl} onChange={(e) => updateSettings('redirectUrl', e.target.value)} placeholder={'https://your-link.com/r?e=++rbc_email++\nhttps://backup-link.com/l?e=++rbc_email++'} />
                  </div>

                  {/* DKIM SIGNING */}
                  <div className="cfg-block settings-wide">
                    <div className="cfg-block-title">04 · DKIM SIGNING</div>
                    <p className="dim-txt">Sign outgoing mail with a DKIM key so receivers see a valid signature. Key is stored encrypted. Optional on GRAPH API, GMAIL API and HTTP API — those providers sign with your domain's DKIM. Required for DIRECT MX and plain RELAY.</p>
                    <div className="toggle-row" onClick={() => {
                      if (settings.dkimEnabled) { updateSettings('dkimEnabled', false); return; }
                      updateSettings('dkimEnabled', true);
                      if (!settings.dkimConfigured) run(async () => {
                        if (await ensureDkimKey()) showNotice('DKIM key generated — publish the TXT records below.');
                      });
                    }}>
                      <div>
                        <div className="toggle-lbl">ENABLE DKIM</div>
                        <div className="toggle-desc">{settings.dkimConfigured ? 'Key configured — enter new key to rotate' : 'No key stored yet'}</div>
                      </div>
                      <div className={`tog ${settings.dkimEnabled ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                    </div>
                    {settings.dkimEnabled && (
                      <>
                        <div className="form-grid">
                          <div>
                            <label className="field-label">DKIM DOMAIN</label>
                            <input className="w-input" value={settings.dkimDomain} onChange={(e) => updateSettings('dkimDomain', e.target.value)} placeholder="yourdomain.com" />
                          </div>
                          <div>
                            <label className="field-label">SELECTOR</label>
                            <input className="w-input" value={settings.dkimSelector} onChange={(e) => updateSettings('dkimSelector', e.target.value)} placeholder="mail or default" />
                          </div>
                        </div>
                        <label className="field-label">PRIVATE KEY <span className="dim">(PEM format — leave blank to keep existing)</span></label>
                        <textarea className="w-textarea code-ta" rows={5} value={settings.dkimPrivateKey || ''} onChange={(e) => updateSettings('dkimPrivateKey', e.target.value)} placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----" />
                        <div className="btn-row" style={{ margin: '8px 0' }}>
                          <button className="btn-sm" disabled={busy} onClick={() => run(async () => {
                            if (await ensureDkimKey()) showNotice(`DKIM key generated — publish the TXT records below.`);
                          })}>✦ GENERATE DKIM KEY</button>
                          {!!settings.dkimPublicKey && <button className="btn-sm" onClick={() => { navigator.clipboard.writeText(`v=DKIM1; k=rsa; p=${settings.dkimPublicKey}`); showNotice('DKIM TXT value copied.'); }}>COPY TXT VALUE</button>}
                        </div>
                        <div className="dkim-dns-guide">
                          <label className="field-label">DNS RECORDS TO PUBLISH <span className="dim">(at your DNS provider)</span></label>
                          <div className="dns-rec">
                            <div className="dns-type">TXT</div>
                            <div className="dns-name">{settings.dkimSelector || 'selector'}._domainkey.{settings.dkimDomain || 'yourdomain.com'}</div>
                            <div className="dns-val">{settings.dkimPublicKey ? `v=DKIM1; k=rsa; p=${settings.dkimPublicKey}` : 'v=DKIM1; k=rsa; p=<public-key-base64>'}</div>
                          </div>
                          <div className="dns-rec">
                            <div className="dns-type">TXT</div>
                            <div className="dns-name">{settings.dkimDomain || 'yourdomain.com'}</div>
                            <div className="dns-val">{settings.dkimPublicKey ? `v=DKIM1; k=rsa; p=${settings.dkimPublicKey}` : 'v=DKIM1; k=rsa; p=<public-key-base64>'}</div>
                            <div className="dim-txt">(same key at root — covers unsigned subdomains)</div>
                          </div>
                          <p className="dim-txt">Publish the TXT records above, then add DMARC for full alignment — TXT <code>_dmarc.{settings.dkimDomain || 'yourdomain.com'}</code>: <code>v=DMARC1; p=none;</code>. DKIM signs within seconds of the records propagating.</p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Email options */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">05 · EMAIL OPTIONS</div>
                    <div className="form-grid">
                      <div>
                        <label className="field-label">ENCODING</label>
                        <select className="w-select" value={settings.encoding} onChange={(e) => updateSettings('encoding', e.target.value)}>
                          <option value="base64">base64</option>
                          <option value="8bit">8bit</option>
                          <option value="quoted-printable">quoted-printable</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">PRIORITY</label>
                        <select className="w-select" value={settings.priority} onChange={(e) => updateSettings('priority', Number(e.target.value))}>
                          <option value={1}>1 — Very Important</option>
                          <option value={2}>2 — Important</option>
                          <option value={3}>3 — Normal</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">SEND TYPE</label>
                        <select className="w-select" value={settings.sendType} onChange={(e) => updateSettings('sendType', e.target.value)}>
                          <option value="to">TO</option>
                          <option value="cc">CC</option>
                          <option value="bcc">BCC</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">SLEEP MS</label>
                        <input className="w-input" type="number" min="0" max="60000" value={settings.sleepMs} onChange={(e) => updateSettings('sleepMs', Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="field-label">PARALLEL SENDS <span className="dim">(beast mode — max 30)</span></label>
                        <input className="w-input" type="number" min="1" max="30" value={settings.parallelSends} onChange={(e) => updateSettings('parallelSends', Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="toggle-list">
                      <div className="toggle-row" onClick={() => updateSettings('textOnly', !settings.textOnly)}>
                        <div>
                          <div className="toggle-lbl">TEXT-ONLY SEND</div>
                          <div className="toggle-desc">Send without HTML part — plain text only</div>
                        </div>
                        <div className={`tog ${settings.textOnly ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('trackOpens', !settings.trackOpens)}>
                        <div>
                          <div className="toggle-lbl">OPEN TRACKING</div>
                          <div className="toggle-desc">1×1 pixel — logs when recipient opens</div>
                        </div>
                        <div className={`tog ${settings.trackOpens ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('trackClicks', !settings.trackClicks)}>
                        <div>
                          <div className="toggle-lbl">CLICK TRACKING</div>
                          <div className="toggle-desc">Wraps all links through redirect — logs clicks</div>
                        </div>
                        <div className={`tog ${settings.trackClicks ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                    </div>
                    {settings.trackClicks && (
                      <div>
                        <label className="field-label">CLICK TRACKER BASE URL <span className="dim">(links redirect through this — e.g. https://your-domain.com/go)</span></label>
                        <input className="w-input" value={settings.clickTrackerUrl} onChange={(e) => updateSettings('clickTrackerUrl', e.target.value)} placeholder="https://track.yourdomain.com/c" />
                      </div>
                    )}
                  </div>

                  {/* AI ASSISTANT */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">06 · AI ASSISTANT</div>
                    <p className="dim-txt">Connect an AI API to improve letter content directly from the COMPOSE panel. Key is stored encrypted.</p>
                    <div className="form-grid">
                      <div>
                        <label className="field-label">AI ENDPOINT</label>
                        <input className="w-input" value={settings.aiEndpoint} onChange={(e) => { updateSettings('aiEndpoint', e.target.value); setAiModelList(null); setAiModelsMsg(''); }} placeholder="https://api.openai.com/v1/chat/completions" />
                      </div>
                      <div>
                        <label className="field-label">MODEL</label>
                        <input className="w-input" value={settings.aiModel} onChange={(e) => updateSettings('aiModel', e.target.value)} placeholder="openai/gpt-oss-120b" />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                          <button className="btn-xs" onClick={async () => {
                            setAiModelsMsg('querying…');
                            setAiModelList(null);
                            try {
                              const r = await api(token, '/api/ai/models');
                              const list = r.models || [];
                              setAiModelList(list);
                              if (list.length && !list.includes(settings.aiModel)) {
                                updateSettings('aiModel', list[0]);
                                setAiModelsMsg(`${list.length} live — saved model wasn't among them, auto-picked ${list[0]}`);
                              } else {
                                setAiModelsMsg(list.length ? `${list.length} live models` : 'no models returned');
                              }
                            } catch (err) {
                              setAiModelsMsg(err.message || 'failed');
                            }
                          }}>LIST MODELS</button>
                          {aiModelsMsg ? <span className="dim" style={{ fontSize: 10 }}>{aiModelsMsg}</span> : null}
                        </div>
                        {aiModelList?.length ? (
                          <select className="w-select" style={{ marginTop: 5 }} value={settings.aiModel} onChange={(e) => updateSettings('aiModel', e.target.value)}>
                            {aiModelList.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        ) : null}
                        {aiModelList?.length && settings.aiModel && !aiModelList.includes(settings.aiModel) ? (
                          <div className="red-txt" style={{ fontSize: 10, marginTop: 4 }}>saved model not in provider's live list — pick one above</div>
                        ) : null}
                      </div>
                      <div>
                        <label className="field-label">API KEY {settings.aiKey === true ? <span className="dim">(configured — enter to rotate)</span> : null}</label>
                        <input className="w-input" type="password" value={typeof settings.aiKey === 'string' ? settings.aiKey : ''} onChange={(e) => updateSettings('aiKey', e.target.value)} placeholder={settings.aiKey === true ? '(unchanged)' : 'sk-...'} />
                      </div>
                    </div>
                    <label className="field-label" style={{ marginTop: 8 }}>STANDING RULES <span className="dim">(the AI follows these on every generation)</span></label>
                    <textarea
                      className="w-textarea code-ta"
                      rows={4}
                      value={settings.aiRules}
                      onChange={(e) => updateSettings('aiRules', e.target.value)}
                      placeholder={'e.g. Always write in a professional B2B tone.\nNever use the words free, guarantee, or urgent.\nKeep paragraphs under 3 sentences.\nAlways end with a single clear CTA.'}
                    />
                    <details style={{ border: '1px solid rgba(0,255,65,.15)', borderRadius: 8, padding: '10px 14px', background: 'rgba(0,255,65,.03)', marginTop: 10 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 700, letterSpacing: '.08em', color: 'var(--green)' }}>FREE PROVIDER SETUP — CLICK A PROVIDER TO AUTOFILL</summary>
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          { name: 'GEMINI (recommended — 1M tokens/min free, no card)', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', where: 'aistudio.google.com → Get API key' },
                          { name: 'GROQ (fast but tight token limits — big prompts hit cap fast)', endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b', where: 'console.groq.com → API Keys' },
                          { name: 'CEREBRAS (free trial $5 credit, 30K tok/min)', endpoint: 'https://api.cerebras.ai/v1/chat/completions', model: 'gpt-oss-120b', where: 'cloud.cerebras.ai → API Keys' },
                          { name: 'OPENROUTER (free models, 50 req/day)', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'deepseek/deepseek-chat-v3.1:free', where: 'openrouter.ai → Keys' },
                          { name: 'MISTRAL (free tier)', endpoint: 'https://api.mistral.ai/v1/chat/completions', model: 'mistral-small-latest', where: 'console.mistral.ai → API keys' },
                          { name: 'OLLAMA (local — fully free & private, runs on this machine)', endpoint: 'http://localhost:11434/v1/chat/completions', model: 'llama3.1:8b', where: 'install ollama → ollama pull llama3.1:8b → any non-empty key works' },
                        ].map((p) => (
                          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
                            <button className="btn-xs" onClick={() => { setAiModelList(null); setAiModelsMsg(''); setSettings({ ...settings, aiEndpoint: p.endpoint, aiModel: p.model }); }}>USE</button>
                            <div style={{ flex: 1, minWidth: 220 }}>
                              <div style={{ fontWeight: 700 }}>{p.name}</div>
                              <div className="dim-txt" style={{ fontSize: 10 }}>{p.where}</div>
                              <code className="dim" style={{ fontSize: 10, wordBreak: 'break-all' }}>{p.endpoint} · {p.model}</code>
                            </div>
                          </div>
                        ))}
                        <p className="dim-txt" style={{ margin: '4px 0 0' }}>Claude note: Anthropic API is paid-only and uses a different request shape — reach Claude models through OPENROUTER instead (model <code>anthropic/claude-sonnet-4.5</code>).</p>
                      </div>
                    </details>
                  </div>

                  {/* Anti-fingerprint */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">07 · ANTI-FINGERPRINT</div>
                    <div className="toggle-list">
                      <div className="toggle-row" onClick={() => updateSettings('htmlRandomize', !settings.htmlRandomize)}>
                        <div>
                          <div className="toggle-lbl">HTML RANDOMIZE</div>
                          <div className="toggle-desc">Unique byte structure per send — random comments/whitespace</div>
                        </div>
                        <div className={`tog ${settings.htmlRandomize ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('spamBypass', !settings.spamBypass)}>
                        <div>
                          <div className="toggle-lbl">SPAM WORD BYPASS</div>
                          <div className="toggle-desc">ZWNJ inside trigger words — breaks filter tokenization</div>
                        </div>
                        <div className={`tog ${settings.spamBypass ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('subjectB64', !settings.subjectB64)}>
                        <div>
                          <div className="toggle-lbl">BASE64 SUBJECT</div>
                          <div className="toggle-desc">RFC2047 encoded-word subject — hides content from filters</div>
                        </div>
                        <div className={`tog ${settings.subjectB64 ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('fromnameB64', !settings.fromnameB64)}>
                        <div>
                          <div className="toggle-lbl">BASE64 FROM NAME</div>
                          <div className="toggle-desc">Encoded-word display name</div>
                        </div>
                        <div className={`tog ${settings.fromnameB64 ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('imageRecompress', !settings.imageRecompress)}>
                        <div>
                          <div className="toggle-lbl">IMAGE RECOMPRESS</div>
                          <div className="toggle-desc">Resize + fake EXIF + hash padding on image attachments</div>
                        </div>
                        <div className={`tog ${settings.imageRecompress ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                      <div className="toggle-row" onClick={() => updateSettings('linkCloak', !settings.linkCloak)}>
                        <div>
                          <div className="toggle-lbl">LINK CLOAK</div>
                          <div className="toggle-desc">Every outbound href rewritten behind a redirect base — destination hidden. Applied after click-tracking so opens/clicks still log.</div>
                        </div>
                        <div className={`tog ${settings.linkCloak ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                      </div>
                    </div>
                    {settings.linkCloak && (
                      <div>
                        <label className="field-label">CLOAK BASE URL <span className="dim">(blank = google.com/url — shows a redirect notice · set your own domain for a clean 302, destination appended as ?u=)</span></label>
                        <input className="w-input" value={settings.cloakBase || ''} onChange={(e) => updateSettings('cloakBase', e.target.value)} placeholder="https://r.yourdomain.com/go" />
                      </div>
                    )}
                    <div>
                      <label className="field-label">AUTO-ATTACH FORMATS <span className="dim">(generated from the letter body — eml/docx/pdf/ics)</span></label>
                      <div className="fmt-row">
                        {['eml', 'docx', 'pdf', 'ics'].map((f) => (
                          <label key={f} className="check-row">
                            <input type="checkbox" checked={(settings.attachFormats || []).includes(f)}
                              onChange={(e) => updateSettings('attachFormats', e.target.checked ? [...(settings.attachFormats || []), f] : (settings.attachFormats || []).filter((x) => x !== f))} />
                            <span>{f.toUpperCase()}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Disclaimer */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">DISCLAIMER</div>
                    <p className="dim-txt">Appended to the bottom of every letter before the unsubscribe footer. Placeholders work.</p>
                    <textarea className="w-textarea" rows={4} value={settings.disclaimerText} onChange={(e) => updateSettings('disclaimerText', e.target.value)} placeholder="This message is confidential..." />
                    <div className="btn-row" style={{ marginTop: 8 }}>
                      <button type="button" className="btn-xs" onClick={() => updateSettings('disclaimerText', SCAN_DISCLAIMER)}>USE SCAN DISCLAIMER</button>
                      {settings.disclaimerText && (
                        <button type="button" className="btn-xs" onClick={() => updateSettings('disclaimerText', '')}>CLEAR</button>
                      )}
                    </div>
                    <label className="check-row" style={{ marginTop: 10 }}>
                      <input type="checkbox" checked={settings.disclaimerInPdf === true}
                        onChange={(e) => updateSettings('disclaimerInPdf', e.target.checked)} />
                      <span>ALSO STAMP THE BOTTOM OF EVERY GENERATED PDF</span>
                    </label>
                  </div>

                  {/* Obfuscation */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">LETTER ENCRYPT</div>
                    <div>
                      <label className="field-label">ENCODE MODE</label>
                      <select className="w-select" value={settings.encryptMode} onChange={(e) => updateSettings('encryptMode', e.target.value)}>
                        <option value="unicode">Unicode lookalike (fullwidth)</option>
                        <option value="html_entities">HTML entities</option>
                      </select>
                    </div>
                    <div className="toggle-list">
                      {[
                        ['encryptLetter',   'ENCRYPT LETTER',    'Encode HTML body characters'],
                        ['subjectEncrypt',  'ENCRYPT SUBJECT',   'Encode subject line'],
                        ['fromNameEncrypt', 'ENCRYPT FROMNAME',  'Encode sender display name'],
                      ].map(([k, lbl, desc]) => (
                        <div key={k} className="toggle-row" onClick={() => updateSettings(k, !settings[k])}>
                          <div>
                            <div className="toggle-lbl">{lbl}</div>
                            <div className="toggle-desc">{desc}</div>
                          </div>
                          <div className={`tog ${settings[k] ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom headers */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">CUSTOM HEADER</div>
                    <div className="toggle-row" onClick={() => updateSettings('customHeadersEnabled', !settings.customHeadersEnabled)}>
                      <div className="toggle-lbl">ENABLE CUSTOM HEADER</div>
                      <div className={`tog ${settings.customHeadersEnabled ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                    </div>
                    {settings.customHeadersEnabled && (
                      <>
                        <label className="field-label" style={{marginTop:10}}>HEADERS <span className="dim">(Name: Value — one per line)</span></label>
                        <textarea className="w-textarea code-ta" rows={5}
                          value={(settings.customHeaders || []).join('\n')}
                          onChange={(e) => updateSettings('customHeaders', e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
                          placeholder={'Message-ID: <++rbc_randstring++.++rbc_number6++@sendgrid.net>\nX-Mailer: Microsoft Outlook 16.0'} />
                      </>
                    )}
                  </div>

                  {/* Test email */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">08 · TEST EMAIL</div>
                    <div className="toggle-row" onClick={() => updateSettings('testEmailEnabled', !settings.testEmailEnabled)}>
                      <div className="toggle-lbl">SEND TEST EVERY N EMAILS</div>
                      <div className={`tog ${settings.testEmailEnabled ? 'tog-on' : ''}`}><div className="tog-knob" /></div>
                    </div>
                    {settings.testEmailEnabled && (
                      <div className="form-grid" style={{marginTop:10}}>
                        <div><label className="field-label">EVERY</label><input className="w-input" type="number" min="1" value={settings.testEvery} onChange={(e) => updateSettings('testEvery', Number(e.target.value))} /></div>
                        <div><label className="field-label">DESTINATION</label><input className="w-input" type="email" value={settings.testDestination} onChange={(e) => updateSettings('testDestination', e.target.value)} /></div>
                      </div>
                    )}
                  </div>

                  {/* Telegram */}
                  <div className="cfg-block">
                    <div className="cfg-block-title">09 · TELEGRAM REPORTS</div>
                    <p className="dim-txt">Campaign start/finish, opens, clicks, bounces and unsubscribes are pushed here live. Create a bot via @BotFather, get your chat id from @userinfobot.</p>
                    <div className="form-grid">
                      <div><label className="field-label">BOT TOKEN</label><input className="w-input" type="password" value={tgToken} onChange={(e) => setTgToken(e.target.value)} placeholder={state.telegram?.configured ? '•••••••• (saved — leave blank to keep)' : '123456:ABC-DEF...'} /></div>
                      <div><label className="field-label">CHAT ID</label><input className="w-input" value={tgChat} onChange={(e) => setTgChat(e.target.value)} placeholder="-1001234567890" /></div>
                    </div>
                    <div style={{display:'flex',gap:10,marginTop:12,alignItems:'center'}}>
                      <button className="btn-sm" disabled={busy} onClick={() => run(async () => {
                        await api(token, '/api/telegram', { method: 'PUT', body: { botToken: tgToken, chatId: tgChat } });
                        setTgToken(''); await refresh(); showNotice('Telegram saved.');
                      })}>SAVE</button>
                      <button className="btn-sm" disabled={busy || !state.telegram?.configured} onClick={() => run(async () => { await api(token, '/api/telegram/test', { method: 'POST' }); showNotice('Test sent — check telegram.'); })}>TEST</button>
                      <span className={`stat-val ${state.telegram?.configured ? 'sent-val' : 'fail-val'}`} style={{fontSize:11}}>{state.telegram?.configured ? `● LINKED · ${state.telegram.chatId}` : '○ NOT CONFIGURED'}</span>
                    </div>
                  </div>

                  <button className="btn-primary" disabled={busy} onClick={saveSettings}>SAVE SETTINGS</button>
                </div>
              )}

              {/* ══ SCHEDULE ══ */}
              {tab === 'schedule' && (
                <div className="pane narrow-pane">
                  <div className="pane-head"><span>Schedule a send</span></div>
                  <p className="dim-txt">{selectedId ? `Draft #${selectedId} is selected.` : 'Your current letter will be saved as a draft, then sent at the time you pick.'}</p>
                  <label className="field-label">SEND ON</label>
                  <div className="quick-row">
                    <button type="button" className="btn-xs" onClick={() => setScheduledFor(quickWhen('hour'))}>In 1 hour</button>
                    <button type="button" className="btn-xs" onClick={() => setScheduledFor(quickWhen('tomorrow'))}>Tomorrow 9:00</button>
                    <button type="button" className="btn-xs" onClick={() => setScheduledFor(quickWhen('monday'))}>Monday 9:00</button>
                  </div>
                  <input className="w-input" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
                  <button className="btn-primary" style={{marginTop:14}} disabled={busy || !scheduledFor || !canQueue} onClick={() => { try { new Date(scheduledFor).toISOString(); queue(true); } catch { showNotice('Invalid date.', 'err'); } }}>Schedule this letter</button>
                </div>
              )}

              {/* ══ BOUNCES ══ */}
              {tab === 'bounces' && (
                <div className="pane">
                  <div className="pane-head"><span>SUPPRESSION LOG</span></div>
                  <div className="tbl-wrap">
                    <table className="w-table">
                      <thead><tr><th>EMAIL</th><th>TYPE</th><th>CLASS</th><th>REASON</th><th>DATE</th><th></th></tr></thead>
                      <tbody>
                        {pagedBounces.map((b) => (
                          <tr key={b.id}>
                            <td>{b.email}</td>
                            <td><span className="badge badge-fail">{b.kind.toUpperCase()}</span></td>
                            <td><span className={`badge ${b.classification === 'hard' || b.classification === 'complaint' ? 'badge-fail' : b.classification === 'spam' ? 'badge-def' : 'badge-ok'}`}>{(b.classification || 'technical').toUpperCase()}</span></td>
                            <td className="dim">{b.reason}</td>
                            <td className="dim">{new Date(b.createdAt).toLocaleString()}</td>
                            <td>{b.classification === 'soft' && (() => {
                              <button className="btn-xs" onClick={() => run(async () => {
                                const q = await api(token, `/api/recipients?email=${encodeURIComponent(b.email)}&limit=1`);
                                const rec = q.recipients?.[0];
                                if (!rec) return showNotice('Recipient not found on the list.', 'err');
                                const r = await api(token, `/api/recipients/${rec.id}/retry-soft-bounce`, { method: 'POST', body: {} });
                                showNotice(r.rescheduled ? `${r.rescheduled} deliveries rescheduled (+${r.backoffMinutes}m backoff).` : 'No failed deliveries to retry.');
                              })}>RETRY</button>;
                            })()}</td>
                          </tr>
                        ))}
                        {!pagedBounces.length && <tr><td colSpan={6} className="dim" style={{ textAlign: 'center' }}>No bounced or unsubscribed addresses yet. This list keeps your future sends clean.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <Pager total={(state.bounces || []).length} page={bouncePage} setPage={setBouncePage} size={pageSize} setSize={setPageSize} />
                </div>
              )}

              {/* ══ DASHBOARD ══ */}
              {tab === 'dashboard' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="dash-head">
                    <div className="dash-head-left">
                      <div className="dash-title">Overview</div>
                      <div className="dim-txt">
                        {clockNow.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                        {' · '}{plural(state.confirmed, 'confirmed recipient', 'confirmed recipients')}
                        {' · '}{plural((state.campaigns || []).length, 'campaign', 'campaigns')}
                        {' · '}{liveSenders ? plural(liveSenders, 'live sender', 'live senders') : `${sendMode.toUpperCase()} engine`}
                      </div>
                    </div>
                    <div className="dash-head-right">
                      <div className="dash-clock">
                        <span className="dash-clock-time">{clockNow.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span className="dash-clock-tz">{Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'} · GMT{(() => { const o = -clockNow.getTimezoneOffset() / 60; return `${o >= 0 ? '+' : ''}${o}`; })()}</span>
                      </div>
                      <div className="dash-head-actions">
                        <span className="dash-mode-pill">{sendMode.toUpperCase()}</span>
                        <button type="button" className="btn-xs dash-more-btn" aria-pressed={dashMore}
                          onClick={() => setDashMore((v) => !v)}>{dashMore ? 'SIMPLE VIEW' : 'SHOW DETAILS'}</button>
                      </div>
                    </div>
                  </div>

                  {(state.reputationAlerts || []).length > 0 && (
                    <div className="rep-banner">
                      <span className="rep-banner-icon">⚠</span>
                      <div className="rep-banner-body">
                        <strong>REPUTATION ALERT — {state.reputationAlerts.length} active listing{state.reputationAlerts.length > 1 ? 's' : ''}</strong>
                        {state.reputationAlerts.slice(0, 3).map((a, i) => (
                          <div key={i} className="rep-alert-row">
                            <span>{a.target} listed on {a.source}</span>
                            <span className="dim">{new Date(a.listedAt).toLocaleDateString()}</span>
                            <button className="btn-xs" onClick={() => run(async () => {
                              await api(token, '/api/reputation/resolve', { method: 'POST', body: { target: a.target, source: a.source } });
                              await refresh();
                            })}>RESOLVE</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {delivFailing.length > 0 && (
                    <div className="deliv-banner">
                      <span className="deliv-banner-icon" aria-hidden="true">⚠</span>
                      <div className="deliv-banner-body">
                        <strong>DELIVERABILITY — {delivFailing.map(([label]) => label).join(', ')} {delivFailing.length === 1 ? 'needs' : 'need'} attention</strong>
                        <span>{delivFailing[0][1].detail}</span>
                      </div>
                      <button className="btn-xs" onClick={() => setTab('delivery')}>FIX IN SETTINGS</button>
                    </div>
                  )}

                  <div className="kpi-row">
                    {[
                      { label: 'TOTAL SENT', value: totals.sent.toLocaleString(), color: 'var(--green)', tab: 'send', hint: 'Open campaign setup' },
                      { label: 'DELIVERY %', value: deliveryRate === null ? '—' : `${deliveryRate}%`, color: deliveryRate === null || deliveryRate >= 95 ? 'var(--green)' : deliveryRate >= 85 ? 'var(--yellow)' : 'var(--red)', tab: 'send', hint: 'Sent ÷ attempted across all campaigns' },
                      { label: 'FAILED', value: totals.failed.toLocaleString(), color: totals.failed ? 'var(--red)' : 'var(--txt-dim)', tab: 'send', hint: 'Open campaign setup' },
                      { label: 'IN QUEUE', value: totals.queued.toLocaleString(), color: totals.queued ? 'var(--yellow)' : 'var(--txt-dim)', tab: 'send', hint: 'Open campaign setup' },
                      { label: 'RECIPIENTS', value: state.confirmed.toLocaleString(), color: 'var(--cyan)', tab: 'recipients', hint: 'Open contacts' },
                    ].map((item) => (
                      <button key={item.label} type="button" className="kpi-card kpi-card-btn" title={item.hint} onClick={() => setTab(item.tab)}>
                        <div className="kpi-val" style={{ color: item.color }}>{item.value}</div>
                        <div className="kpi-lbl">{item.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="dash-health" aria-label="List health, last 30 days">
                    <span className="dash-health-title">LIST HEALTH</span>
                    <button type="button" onClick={() => setTab('bounces')}>BOUNCES <strong>{(state.rates?.bounces30 ?? 0).toLocaleString()}</strong></button>
                    <button type="button" onClick={() => setTab('bounces')}>BOUNCE % <strong className={(state.rates?.bounceRate || 0) > 5 ? 'fail-val' : 'sent-val'}>{state.rates?.bounceRate ?? 0}%</strong></button>
                    <button type="button" onClick={() => setTab('bounces')}>COMPLAINT % <strong className={(state.rates?.complaintRate || 0) > 0.1 ? 'fail-val' : 'sent-val'}>{state.rates?.complaintRate ?? 0}%</strong></button>
                    <span className="dim">last 30 days</span>
                  </div>

                  <div className="dash-grid">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div className="pane">
                      <div className="pane-head">
                        <span>Recent sends <span className="dim">({(state.campaigns || []).length})</span></span>
                        <button className="btn-xs" onClick={() => setTab('send')}>VIEW ALL →</button>
                      </div>
                      <div className="tbl-wrap" style={{ maxHeight: 380 }}>
                        <table className="w-table">
                          <thead><tr><th>#</th><th>NAME</th><th>STATUS</th><th>PROGRESS</th><th>SENT</th><th>FAIL</th><th>QUEUE</th></tr></thead>
                          <tbody>
                            {dashCampaigns.slice(0, dashMore ? 6 : 3).map((c) => {
                              const pct = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
                              return (
                                <tr key={c.id} className="dash-camp-row" title="Open in campaign library" onClick={() => setTab('send')}>
                                  <td className="dim">{c.id}</td>
                                  <td>{c.name}</td>
                                  <td><span className={`badge ${c.status === 'completed' ? 'badge-ok' : c.status === 'failed' ? 'badge-fail' : 'badge-def'}`}>{c.paused ? 'PAUSED' : c.status.toUpperCase()}</span></td>
                                  <td style={{ minWidth: 120 }}>
                                    <div className="prog-bar"><div className="prog-fill" style={{ width: `${pct}%` }} /></div>
                                    <span className="dim" style={{ fontSize: 10 }}>{pct}%</span>
                                  </td>
                                  <td className="green-txt">{c.sent}</td>
                                  <td className="red-txt">{c.failed}</td>
                                  <td className="yellow-txt">{c.queued}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {!dashCampaigns.length && (
                        <div className="dash-start">
                          <div className="dash-start-head">
                            <span>Start here</span>
                            <span className="dim">Three steps to your first send</span>
                          </div>
                          <div className="dash-start-grid">
                            <button type="button" className="dash-start-card" onClick={() => setTab('smtp')}>
                              <span className="dash-start-icon"><Server size={18} /></span>
                              <span className="dash-start-title">1. Add a sender</span>
                              <span className="dash-start-copy">Connect SMTP or import a Microsoft mailbox.</span>
                              <span className="dash-start-link">Open senders <ArrowRight size={13} /></span>
                            </button>
                            <button type="button" className="dash-start-card" onClick={() => setTab('recipients')}>
                              <span className="dash-start-icon"><Users size={18} /></span>
                              <span className="dash-start-title">2. Bring contacts</span>
                              <span className="dash-start-copy">Paste a list, clean it, and confirm consent.</span>
                              <span className="dash-start-link">Open contacts <ArrowRight size={13} /></span>
                            </button>
                            <button type="button" className="dash-start-card" onClick={() => setTab('compose')}>
                              <span className="dash-start-icon"><Mail size={18} /></span>
                              <span className="dash-start-title">3. Write the letter</span>
                              <span className="dash-start-copy">Compose, preview, then launch the campaign.</span>
                              <span className="dash-start-link">Open letters <ArrowRight size={13} /></span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {dashMore && (
                      <div className="pane">
                        <div className="pane-head"><span>ACTIVITY CONSOLE <span className="dim">— all events</span></span><span className="dim">every task · sends · opens · clicks · bounces</span></div>
                        <LiveConsole events={state.events} />
                      </div>
                    )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div className="pane">
                        <div className="pane-head"><span>Delivery status</span></div>
                        <div className="engine-grid">
                          <div className="engine-row"><span className="dim">STATUS</span><strong className={engineReady ? 'sent-val' : 'fail-val'}>{engineReady ? 'READY' : 'NOT READY'}</strong></div>
                          <div className="engine-row"><span className="dim">MODE</span><strong>{sendMode.toUpperCase()}</strong></div>
                          <div className="engine-row"><span className="dim">FROM</span><strong title={settings.spoofFromEmail || settings.directFromEmail || smtp.fromEmail || ''}>{(settings.spoofFromEmail || settings.directFromEmail || smtp.fromEmail || 'not set').slice(0, 34)}</strong></div>
                          {sendMode === 'relay' && <div className="engine-row"><span className="dim">RELAY</span><strong title={`${settings.relayHost}:${settings.relayPort}`}>{(settings.relayHost || 'not set') + (settings.relayPort ? `:${settings.relayPort}` : '')}</strong></div>}
                          <div className="engine-row"><span className="dim">PARALLEL</span><strong>×{settings.parallelSends || 1}</strong></div>
                          <div className="engine-row"><span className="dim">POOL ACCOUNTS</span><strong>{liveSenders} active</strong></div>
                          <div className="engine-row"><span className="dim">HOURS</span><strong>{settings.sendDays?.length ? `${settings.sendDays.length}d/wk` : 'every day'} {String(Math.floor((settings.sendFromMin ?? 480) / 60)).padStart(2, '0')}:{String((settings.sendFromMin ?? 480) % 60).padStart(2, '0')}–{String(Math.floor((settings.sendToMin ?? 1200) / 60)).padStart(2, '0')}:{String((settings.sendToMin ?? 1200) % 60).padStart(2, '0')}</strong></div>
                          <div className="engine-row"><span className="dim">CAPS</span><strong>{settings.maxPerHour}/h · {settings.maxPerDay}/d{settings.warmupEnabled ? ' · warmup' : ''}</strong></div>
                          <div className="engine-row"><span className="dim">DKIM</span><strong>{settings.dkimEnabled ? (settings.dkimConfigured ? 'ON' : 'KEY MISSING') : (['graph', 'gmail', 'api'].includes(sendMode) ? 'PROVIDER' : 'OFF')}</strong></div>
                          <div className="engine-row"><span className="dim">TRACKING</span><strong>{settings.trackOpens ? 'opens' : ''}{settings.trackOpens && settings.trackClicks ? ' + ' : ''}{settings.trackClicks ? 'clicks' : ''}{!settings.trackOpens && !settings.trackClicks ? 'OFF' : ''}</strong></div>
                        </div>
                        {!engineReady && <div className="engine-warning">! {engineHint} — <button className="dash-inline-link" onClick={() => setTab('delivery')}>open settings</button></div>}
                      </div>

                      {dashMore && (
                      <div className="pane">
                        <div className="pane-head">
                          <span>DELIVERABILITY</span>
                          <button className="btn-xs" disabled={deliverabilityLoading} onClick={() => loadDeliverability(true)}>
                            {deliverabilityLoading ? 'CHECKING…' : 'RECHECK'}
                          </button>
                        </div>
                        {deliverabilityError ? (
                          <div className="deliv-error">
                            <span>{deliverabilityError}</span>
                            <button className="btn-xs" onClick={() => loadDeliverability(true)}>RETRY</button>
                          </div>
                        ) : !deliverability ? (
                          <p className="dim-txt">Checking SPF, DKIM, DMARC, PTR and the sending path…</p>
                        ) : (
                          <>
                            <div className="deliv-head">
                              <div>
                                <div className="deliv-domain">{deliverability.domain || 'no sending domain'}</div>
                                <div className="dim-txt">{deliverability.fromEmail || 'Set a from address in SETTINGS'}</div>
                              </div>
                              <span className={`deliv-score ${delivScored.length && delivPassed === delivScored.length ? 'ok' : delivPassed ? 'warn' : 'bad'}`}>
                                {delivScored.length ? `${delivPassed}/${delivScored.length}` : '—'}
                              </span>
                            </div>
                            <div className="deliv-list">
                              {delivEntries.map(([label, check]) => (
                                <div className="deliv-row" key={label} title={check?.detail || ''}>
                                  <span className={`deliv-dot ${check?.status || 'unknown'}`} aria-hidden="true" />
                                  <span className="deliv-lbl">{label}</span>
                                  <span className={`deliv-state ${check?.status || 'unknown'}`}>{check?.label || '—'}</span>
                                </div>
                              ))}
                            </div>
                            <div className="deliv-note">
                              {!delivScored.length
                                ? 'Set a from address in SETTINGS to run DNS checks.'
                                : delivPassed === delivScored.length
                                  ? 'All checked records are in place.'
                                  : 'Fix red rows first — they directly affect inbox placement.'}
                              <span className="dim"> · cached 5 min</span>
                            </div>
                          </>
                        )}
                      </div>
                      )}

                      <div className="pane">
                        <div className="pane-head">
                          <span>SENDER HEALTH</span>
                          <button className="btn-xs" onClick={() => setTab('smtp')}>MANAGE</button>
                        </div>
                        {senderRows.length ? (
                          <div className="sender-health">
                            {senderRows.map((a) => {
                              const cooling = a.cooldownUntil && new Date(a.cooldownUntil) > new Date();
                              const status = !a.enabled ? 'Paused' : needsMsReauth(a) ? 'Reauth' : cooling ? 'Cooling' : 'Ready';
                              const tone = status === 'Ready' ? 'ok' : status === 'Cooling' ? 'warn' : 'bad';
                              const pct = a.dailyQuota > 0 ? Math.min(100, Math.round(((a.sentToday || 0) / a.dailyQuota) * 100)) : 0;
                              return (
                                <div className="sender-health-row" key={a.id} title={a.lastError || ''}>
                                  <span className={`sender-dot ${tone}`} aria-hidden="true" />
                                  <span className="sender-name">{a.label || a.username}</span>
                                  <span className="sender-status">{status}</span>
                                  <span className="sender-quota"><span style={{ width: `${pct}%` }} /></span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="dim-txt">No senders yet. Add SMTP or import a Microsoft mailbox to start.</p>
                        )}
                      </div>

                      <div className="pane">
                        <div className="pane-head"><span>QUICK ACTIONS</span></div>
                        <div className="qa-grid">
                          <button className="qa-btn" onClick={() => setTab('compose')}><span className="qa-ic"><Mail size={15} /></span>New letter</button>
                          <button className="qa-btn" onClick={() => setTab('send')}><span className="qa-ic"><Send size={15} /></span>Launch</button>
                          <button className="qa-btn" onClick={() => setTab('recipients')}><span className="qa-ic"><Users size={15} /></span>Import list</button>
                          <button className="qa-btn" onClick={() => setTab('sorter')}><span className="qa-ic"><Filter size={15} /></span>Sort list</button>
                          <button className="qa-btn" onClick={() => setTab('smtp')}><span className="qa-ic"><Server size={15} /></span>Pool</button>
                          <button className="qa-btn" disabled={busy} onClick={() => run(async () => {
                            const r = await api(token, '/api/smtp/verify-all', { method: 'POST' });
                            const okCount = (r.results || []).filter((x) => x.ok).length;
                            showNotice(`Verify done — ${okCount}/${(r.results || []).length} live.`);
                          })}><span className="qa-ic"><CheckCheck size={15} /></span>Verify all</button>
                          <button className="qa-btn" onClick={() => setTab('delivery')}><span className="qa-ic"><Settings2 size={15} /></span>Settings</button>
                          <button className="qa-btn" onClick={() => setChatOpen(true)}><span className="qa-ic"><Sparkles size={15} /></span>Ask AI</button>
                        </div>
                      </div>

                      {dashMore && (
                        <div className="pane">
                          <div className="pane-head">
                            <span>RECENT SUPPRESSIONS</span>
                            <button className="btn-xs" onClick={() => setTab('bounces')}>VIEW ALL →</button>
                          </div>
                          {(state.bounces || []).slice(0, 5).map((b) => (
                            <div key={b.id} className="dash-bounce" title={b.reason || ''}>
                              <span className={`badge ${b.kind === 'bounce' ? 'badge-fail' : b.kind === 'complaint' ? 'badge-def' : 'badge-ok'}`}>{b.kind === 'unsubscribe' ? 'UNSUB' : (b.classification || b.kind || '').toUpperCase()}</span>
                              <span className="dash-bounce-email">{b.email}</span>
                              <span className="dash-bounce-time">{new Date(b.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                            </div>
                          ))}
                          {!(state.bounces || []).length && <p className="dim-txt">No bounces or complaints recorded.</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ══ SEND ══ */}
              {tab === 'send' && (
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  <div className="kpi-row">
                    {[
                      ['TOTAL SENT', totals.sent, 'var(--green)'],
                      ['FAILED', totals.failed, 'var(--red)'],
                      ['IN QUEUE', totals.queued, 'var(--yellow)'],
                      ['RECIPIENTS', state.confirmed, 'var(--cyan)'],
                      ['MODE', sendMode.toUpperCase(), 'var(--txt)'],
                    ].map(([lbl, val, color]) => (
                      <div key={lbl} className="kpi-card">
                        <div className="kpi-val" style={{ color }}>{val}</div>
                        <div className="kpi-lbl">{lbl}</div>
                      </div>
                    ))}
                  </div>
                  <div className="pane">
                    <div className="pane-head"><span>01 · SETUP &amp; LAUNCH</span><span className="dim">pre-flight checklist — green means armed</span></div>
                    <div className="setup-steps">
                      <div className={`setup-step ${canQueue ? 'ok' : ''}`}>
                        <span className="setup-check">{canQueue ? '✓' : '!'}</span>
                        <div className="setup-body">
                          <span className="setup-lbl">1 · LETTER</span>
                          <span className="setup-val">{draft.subject?.trim() ? `"${draft.subject.trim().slice(0, 60)}"` : draft.name || 'no subject — draft incomplete'}</span>
                        </div>
                        <button className="btn-xs" onClick={() => setTab('compose')}>LETTER</button>
                      </div>
                      <div className={`setup-step ${state.confirmed > 0 ? 'ok' : ''}`}>
                        <span className="setup-check">{state.confirmed > 0 ? '✓' : '!'}</span>
                        <div className="setup-body">
                          <span className="setup-lbl">2 · AUDIENCE</span>
                          <span className="setup-val">{state.confirmed} confirmed contacts{(draft.providers || []).length ? ` · targeted: ${(draft.providers || []).join(', ')}` : ' · all providers'}</span>
                        </div>
                        <button className="btn-xs" onClick={() => setTab('recipients')}>CONTACTS</button>
                        <button className="btn-xs" onClick={() => setTab('sorter')}>SORTER</button>
                      </div>
                      <div className={`setup-step ${engineReady ? 'ok' : ''}`}>
                        <span className="setup-check">{engineReady ? '✓' : '!'}</span>
                        <div className="setup-body">
                          <span className="setup-lbl">3 · ENGINE</span>
                          <span className="setup-val">{engineReady ? `${sendMode.toUpperCase()} ready${sendMode === 'smtp' && state.smtpAccounts?.length ? ` · ${state.smtpAccounts.length} pool accounts` : ''}` : `${sendMode.toUpperCase()} not configured — ${engineHint}`}</span>
                        </div>
                        <button className="btn-xs" onClick={() => setTab('delivery')}>SETTINGS</button>
                      </div>
                      <div className="setup-step ok">
                        <span className="setup-check">✓</span>
                        <div className="setup-body">
                          <span className="setup-lbl">4 · WINDOW</span>
                          <span className="setup-val">{settings.scheduleEnabled === false ? '24/7 — always on' : `${(settings.sendDays || []).length ? (settings.sendDays || []).map((d) => DAY_LABELS[d] || d).join('/') : 'daily'} ${fmtMin(settings.sendFromMin)}–${fmtMin(settings.sendToMin)} ${settings.timezone || 'UTC'}`}</span>
                        </div>
                        {settings.scheduleEnabled === false
                          ? <button className="btn-xs" onClick={() => setTab('schedule')}>WINDOW</button>
                          : <button className="btn-xs" disabled={busy} onClick={() => run(async () => {
                              const next = { ...settings, scheduleEnabled: false };
                              await api(token, '/api/settings', { method: 'PUT', body: next });
                              setSettings(next); showNotice('Send window OFF — queue sends 24/7.'); await refresh();
                            })}>24/7</button>}
                      </div>
                    </div>
                    <div className="setup-deck">
                      <div className="deck-field">
                        <label className="field-label">CAMPAIGN NAME</label>
                        <input className="w-input" placeholder="name this run…" value={draft.name} onChange={(e) => updateDraft('name', e.target.value)} />
                      </div>
                      <div className="deck-field">
                        <label className="field-label">TEST FIRE — ONE SHOT TO YOURSELF</label>
                        <div className="deck-row">
                          <input className="w-input" type="email" placeholder="you@yourdomain.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                          <button className="btn-sm deck-btn" disabled={busy || !testTo.includes('@')} title={(draft.accounts || []).length ? 'Sends through this campaign’s linked senders' : 'No senders linked — uses the whole enabled pool'} onClick={() => run(async () => {
                            const r = await api(token, '/api/test-send', { method: 'POST', body: {
                              to: testTo, subject: draft.subject, html: draft.html, text: draft.text, attachments: draft.attachments,
                              accountIds: draft.accounts || [], accountsRandom: draft.accountsRandom === true,
                            } });
                            showNotice(`Test accepted${r.account ? ` via ${r.account}` : ''} (${r.messageId || r.response || 'ok'}) - check ${testTo}.`); setTestTo('');
                          })}>SEND TEST</button>
                        </div>
                        <div className="dim-txt" style={{ marginTop: 6, fontSize: 11 }}>
                          {(draft.accounts || []).length
                            ? `Uses this campaign’s ${(draft.accounts || []).length} linked sender${(draft.accounts || []).length === 1 ? '' : 's'} (${sendMode.toUpperCase()} mode).`
                            : 'No senders linked to this campaign — the test uses every enabled sender in the active pool.'}
                        </div>
                      </div>
                      <div className="deck-field">
                        <label className="field-label">LAUNCH — NOW OR ON THE CLOCK</label>
                        <div className="deck-row">
                          <input className="w-input" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} title="Leave empty to fire now" />
                          {scheduledFor
                            ? <button className="btn-primary deck-btn" disabled={busy || !state.confirmed || !canQueue} onClick={() => { try { new Date(scheduledFor).toISOString(); queue(true); } catch { showNotice('Invalid date.', 'err'); } }}>QUEUE SCHEDULED</button>
                            : <button className="btn-primary btn-send deck-btn" disabled={busy || !state.confirmed || !canQueue || !engineReady} onClick={() => queue(false)}>▶ LAUNCH NOW</button>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pane">
                    <div className="pane-head"><span>Live activity</span><span className="dim">queue · sends · opens · clicks · bounces</span></div>
                    <LiveConsole events={(state.events || []).filter(isCampaignEvent)} empty="Nothing yet — sends, opens and clicks will appear here." />
                  </div>

                  <div className="pane">
                    <div className="pane-head">
                      <span>Campaign history <span className="dim">({filteredCampaigns.length})</span></span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {[['all', 'ALL'], ['active', 'ACTIVE'], ['draft', 'DRAFTS'], ['done', 'FINISHED']].map(([v, l]) => (
                          <button key={v} className={`btn-xs ${campFilter === v ? 'btn-solid' : ''}`} onClick={() => { setCampFilter(v); setHistPage(1); }}>{l}</button>
                        ))}
                        <input className="w-input" style={{ width: 180, padding: '4px 8px', fontSize: 11 }} placeholder="search name / subject…" value={campSearch} onChange={(e) => { setCampSearch(e.target.value); setHistPage(1); }} />
                      </div>
                    </div>
                    <div className="tbl-wrap">
                      <table className="w-table">
                        <thead><tr><th>#</th><th>NAME</th><th>STATUS</th><th>TOTAL</th><th>SENT</th><th>FAIL</th><th>QUEUE</th><th>ACTION</th></tr></thead>
                        <tbody>
                          {pagedCampaigns.map((c) => (
                            <tr key={c.id}>
                              <td className="dim">{c.id}</td>
                              <td>{c.name}{c.providers?.length > 0 && <div className="dim-txt" style={{fontSize:11}}>→ {c.providers.join(', ')}</div>}</td>
                              <td>
                                <span className={`badge ${c.status === 'completed' ? 'badge-ok' : c.status === 'failed' ? 'badge-fail' : 'badge-def'}`}>{c.paused ? 'PAUSED' : c.status.toUpperCase()}</span>
                                {c.total > 0 && (
                                  <div className="prog-bar"><div className="prog-fill" style={{ width: `${Math.round(((c.sent + c.failed) / c.total) * 100)}%` }} /></div>
                                )}
                                {c.hold && <div className="dim-txt" style={{fontSize:11,marginTop:4}}>{c.hold}</div>}
                              </td>
                              <td>{c.total}</td>
                              <td className="green-txt">{c.sent}</td>
                              <td className="red-txt">{c.failed}</td>
                              <td className="yellow-txt">{c.queued}</td>
                              <td>
                                <div className="act-row">
                                  <button className="btn-xs" onClick={() => run(async () => { const r = await api(token, `/api/campaigns/${c.id}/duplicate`, { method: 'POST' }); showNotice(`Draft #${r.id} created.`); await refresh(); })}>DUP</button>
                                  {['draft', 'failed', 'scheduled'].includes(c.status) && <button className="btn-xs" onClick={() => editCampaign(c)}>EDIT</button>}
                                  {c.status === 'failed' && <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Retry #${c.id}? SMTP will be re-verified first.`, { title: 'RETRY CAMPAIGN', confirmLabel: 'RETRY' })) run(async () => { await api(token, `/api/campaigns/${c.id}/retry`, { method: 'POST' }); await refresh(); }); }}>RETRY</button>}
                                  {!['queued', 'scheduled', 'sending'].includes(c.status) && <button className="btn-xs" onClick={async () => { if (await uiConfirm(`Delete campaign #${c.id} "${c.name}" and its delivery history?`, { title: 'DELETE CAMPAIGN', danger: true, confirmLabel: 'DELETE' })) run(async () => { await api(token, `/api/campaigns/${c.id}`, { method: 'DELETE' }); await refresh(); }); }}>DEL</button>}
                                  {['queued','scheduled','sending'].includes(c.status) && (c.paused
                                    ? <button className="btn-xs" onClick={() => run(async () => { await api(token, `/api/campaigns/${c.id}/resume`, { method: 'POST' }); await refresh(); })}>RESUME</button>
                                    : <button className="btn-xs" onClick={() => run(async () => { await api(token, `/api/campaigns/${c.id}/pause`, { method: 'POST' }); await refresh(); })}>PAUSE</button>)}
                                  {['queued','scheduled','sending'].includes(c.status) && <button className="btn-xs btn-danger" onClick={async () => { if (await uiConfirm(`Cancel #${c.id}?`, { title: 'CANCEL CAMPAIGN', danger: true, confirmLabel: 'CANCEL SEND' })) run(async () => { await api(token, `/api/campaigns/${c.id}/cancel`, { method: 'POST' }); await refresh(); }); }}>CANCEL</button>}
                                  <button className="btn-xs" onClick={() => run(() => exportCampaign(c.id))}>CSV</button>
                                  <button className="btn-xs" onClick={async () => {
                                    setAbTestCampaignId(c.id);
                                    setAbTestOpen(true);
                                    const r = await api(token, `/api/campaigns/${c.id}/subject-variants`);
                                    setSubjectVariants(r || []);
                                  }}>AB TEST</button>
                                  <button className="btn-xs" onClick={async () => {
                                    const r = await api(token, `/api/campaigns/${c.id}/enable-send-time-optimization`, { method: 'POST', body: { enabled: !c.send_time_optimization_enabled } });
                                    showNotice(`Send time optimization ${r.enabled ? 'ON' : 'OFF'}.`);
                                    await refresh();
                                  }}>{c.send_time_optimization_enabled ? 'TZ ON' : 'TZ OFF'}</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!filteredCampaigns.length && (
                      <div className="empty-cta">
                        <strong>No campaigns yet</strong>
                        <span>Write a letter, choose your contacts, then press send. We will keep the history here.</span>
                        <button className="btn-primary" onClick={() => setTab('compose')}>Write a letter</button>
                      </div>
                    )}
                    <Pager total={filteredCampaigns.length} page={histPage} setPage={setHistPage} size={pageSize} setSize={setPageSize} />
                  </div>

<div className="pane">
                    <div className="pane-head"><span>04 · AI TASKS <span className="dim">— optional automation, runs without you</span></span></div>
                    <p className="dim-txt">Tell the suite what to do and when — <code>queue the draft at 9am</code>, <code>pause campaign #4 tonight</code>, <code>verify accounts daily at 06:00</code>. At the set time the AI resolves names to ids and executes through the API — no operator needed.</p>
                    <div className="ab-test-input-row" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
                      <input className="w-input" style={{ flex: '1 1 260px' }} placeholder="e.g. Queue campaign #3 at 09:00 tomorrow" value={aiTaskText}
                        onChange={(e) => setAiTaskText(e.target.value)} aria-label="Task for the AI to run" />
                      <input className="w-input" style={{ maxWidth: 200 }} type="datetime-local" value={aiTaskAt} onChange={(e) => setAiTaskAt(e.target.value)} aria-label="Run at" />
                      <select className="w-select" style={{ maxWidth: 120 }} value={aiTaskRepeat} onChange={(e) => setAiTaskRepeat(e.target.value)} aria-label="Repeat">
                        <option value="">ONCE</option><option value="daily">DAILY</option><option value="weekly">WEEKLY</option>
                      </select>
                      <button className="btn-sm" disabled={busy || !aiTaskText.trim() || !aiTaskAt} onClick={() => run(async () => {
                        await api(token, '/api/ai/tasks', { method: 'POST', body: { text: aiTaskText.trim(), runAt: new Date(aiTaskAt).toISOString(), repeat: aiTaskRepeat } });
                        setAiTaskText(''); setAiTaskAt(''); setAiTaskRepeat('');
                        showNotice('AI task armed.');
                        await refresh();
                      })}>ARM TASK</button>
                    </div>
                    {!!(state.aiTasks || []).length && (
                      <div className="tbl-wrap" style={{ maxHeight: 180, marginTop: 10 }}>
                        <table className="w-table">
                          <thead><tr><th>WHEN</th><th>TASK</th><th>REPEAT</th><th>STATUS</th><th>RESULT</th><th></th></tr></thead>
                          <tbody>
                            {(state.aiTasks || []).map((t) => (
                              <tr key={t.id}>
                                <td className="dim" style={{ whiteSpace: 'nowrap' }}>{new Date(t.run_at).toLocaleString()}</td>
                                <td>{t.text}</td>
                                <td className="dim">{(t.repeat || 'once').toUpperCase()}</td>
                                <td><span className={`badge ${t.status === 'done' ? 'badge-ok' : t.status === 'failed' ? 'badge-fail' : 'badge-def'}`}>{t.status.toUpperCase()}</span></td>
                                <td className="dim" title={t.last_result}>{(t.last_result || '—').slice(0, 80)}</td>
                                <td><button className="btn-xs btn-danger" aria-label={`Delete task ${t.id}`} onClick={() => run(async () => { await api(token, `/api/ai/tasks/${t.id}`, { method: 'DELETE' }); await refresh(); })}>✕</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ══ ANALYTICS ══ */}
              {tab === 'analytics' && (
                <div style={{display:'flex',flexDirection:'column',gap:16}}>
                  <div className="pane">
                    <div className="pane-head"><span>ANALYTICS DASHBOARD</span></div>
                    <div className="kpi-row">
                      {[
                        ['OPENS', analyticsData?.opens || 0, 'var(--green)'],
                        ['CLICKS', analyticsData?.clicks || 0, 'var(--cyan)'],
                        ['BOUNCES', analyticsData?.bounces || 0, 'var(--yellow)'],
                        ['COMPLAINTS', analyticsData?.complaints || 0, 'var(--red)'],
                        ['CAMPAIGNS', analyticsData?.campaigns || 0, 'var(--txt)'],
                        ['RECIPIENTS', analyticsData?.recipients || 0, 'var(--purple)'],
                      ].map(([lbl, val, color]) => (
                        <div key={lbl} className="kpi-card">
                          <div className="kpi-val" style={{ color }}>{val}</div>
                          <div className="kpi-lbl">{lbl}</div>
                        </div>
                      ))}
                    </div>
                    <button className="btn-sm" onClick={async () => {
                      setAnalyticsLoading(true);
                      try {
                        const res = await api(token, '/api/analytics/overview');
                        setAnalyticsData(res);
                      } catch (err) {
                        showNotice(`Analytics error: ${err.message}`);
                      } finally {
                        setAnalyticsLoading(false);
                      }
                    }}>{analyticsLoading ? 'LOADING...' : 'REFRESH ANALYTICS'}</button>
                  </div>
                  <div className="pane">
                    <div className="pane-head"><span>ENGAGEMENT HEATMAP</span><span className="dim">opens/clicks by hour (UTC)</span></div>
                    <div className="heatmap-grid">
                      {Array.from({length: 24}).map((_, hour) => {
                        const data = analyticsData?.heatmap?.[hour] || { opens: 0, clicks: 0 };
                        const intensity = Math.min(100, (data.opens + data.clicks) * 5);
                        return (
                          <div key={hour} className="heatmap-cell" style={{ opacity: 0.3 + intensity * 0.007 }}>
                            <div className="heatmap-hour">{hour}:00</div>
                            <div className="heatmap-value">O:{data.opens} C:{data.clicks}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="pane">
                    <div className="pane-head"><span>TOP DOMAINS</span></div>
                    <div className="tbl-wrap">
                      <table className="w-table">
                        <thead><tr><th>DOMAIN</th><th>RECIPIENTS</th><th>OPENS</th><th>CLICKS</th><th>OPEN RATE</th></tr></thead>
                        <tbody>
                          {(analyticsData?.topDomains || []).map((d, i) => (
                            <tr key={i}>
                              <td>{d.domain}</td>
                              <td>{d.recipients}</td>
                              <td className="green-txt">{d.opens}</td>
                              <td className="cyan-txt">{d.clicks}</td>
                              <td className="dim">{d.openRate}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ══ HELP ══ */}
              {tab === 'help' && (
                <div className="help-wrap">
                  <div className="pane">
                    <div className="pane-head"><span>HELP — RUBICON EMAIL SUITE MANUAL</span></div>

                    <details className="help-sec" open>
                      <summary>QUICK START</summary>
                      <ol className="help-list">
                        <li><strong>Engine:</strong> SETTINGS → SEND TYPE — pick SMTP / DIRECT MX / RELAY / PROXY / GRAPH / GMAIL / HTTP API and fill its block. The SMTP tab also holds the OUTGOING CONNECTION presets.</li>
                        <li><strong>List:</strong> CONTACTS → paste or import CSV (<code>email, first_name, last_name, company</code>), confirm consent, import. SORTER pre-cleans any raw list first.</li>
                        <li><strong>Letter:</strong> LETTER tab — subject, preheader, body (HTML / text / blocks / paste), attachments, live preview. AI WRITER drafts it for you.</li>
                        <li><strong>Queue:</strong> CAMPAIGN tab → queue it. Pause/resume/retry from CAMPAIGN HISTORY. SCHEDULE sets the window; caps + warm-up live on EMAIL.</li>
                      </ol>
                    </details>

                    <details className="help-sec">
                      <summary>SEND ENGINES</summary>
                      <table className="w-table help-table"><thead><tr><th>MODE</th><th>WHAT IT DOES</th><th>NEEDS</th></tr></thead><tbody>
                        <tr><td>SMTP</td><td>Any authenticated SMTP server or the account pool</td><td>host:port, user, password (or pool accounts)</td></tr>
                        <tr><td>DIRECT MX</td><td>Delivers to recipient MX on port 25 — no provider</td><td>FROM NAME + FROM EMAIL; port 25 open outbound</td></tr>
                        <tr><td>RELAY</td><td>Auth-free relay / IP-allowlisted host</td><td>relay host:port</td></tr>
                        <tr><td>PROXY</td><td>Direct send tunneled through HTTP/SOCKS4/5</td><td>proxy string + from address</td></tr>
                        <tr><td>GRAPH</td><td>Microsoft 365 via Graph API — app or delegated</td><td>client id + secret + tenant, or pool MS mailboxes</td></tr>
                        <tr><td>GMAIL</td><td>Gmail API with OAuth</td><td>client id + secret + refresh token</td></tr>
                        <tr><td>HTTP API</td><td>SendGrid · SES · Mailgun · Postmark · Brevo · SparkPost · Elastic · Mandrill · custom endpoint</td><td>API key; SES adds IAM user + region, Mailgun adds domain, custom adds URL</td></tr>
                      </tbody></table>
                    </details>

                    <details className="help-sec">
                      <summary>MAILBOX POOL / MS RT IMPORT</summary>
                      <p className="help-p">SMTP tab → ACCOUNT POOL → <code>IMPORT MS RT</code> — one account per line, up to 200 at once. Accepted formats:</p>
                      <pre className="help-pre">{`email@x.com:client_id:M.C5...rt      email:cid:rt
client_id:M.C5...rt                cid:rt
email|cid|rt · email,cid,rt · email;cid;rt
client_id:secret:tenant            app creds (no RT)
{"client_id":"…","refresh_token":"…"}   JSON`}</pre>
                      <p className="help-p">GRAPH mode round-robins imported mailboxes first (each sends as itself, 10k/day quota, cooldown + failover). SMTP mode mixes them with SMTP accounts. VERIFY ALL handshakes every account and shows per-account errors.</p>
                    </details>

                    <details className="help-sec">
                      <summary>AI — HELPER · WRITER · ASSIST</summary>
                      <p className="help-p">Configure in SETTINGS → AI ASSISTANT: endpoint (OpenAI-compatible or Gemini URL), API key, model — LIST MODELS shows the live list; dead model IDs self-heal on next call.</p>
                      <ul className="help-list">
                        <li><strong>✦ RBC Helper AI</strong> (bottom-right button) — chatbot with live access to your sender state. Ask why sends fail, how much quota is left, or to rewrite the draft. ⚡ buttons verify accounts, pause/resume/retry campaigns, send tests, reset quotas, navigate tabs. → apply buttons write its output into subject/preheader/body.</li>
                        <li><strong>AI WRITER tab</strong> — full drafting workspace with presets + a document generator (invoice/statement/notice/ICS) that attaches straight to the letter.</li>
                        <li><strong>AI ASSIST panel</strong> (LETTER tab) — quick rewrites against the current draft; same apply flow.</li>
                        <li><strong>SPAM CHECK → FIX WITH AI</strong> — scores the draft, then one click has AI rewrite around the findings.</li>
                      </ul>
                    </details>

                    <details className="help-sec">
                      <summary>SORTER</summary>
                      <p className="help-p">SORTER tab — paste any raw list (commas, lines, mixed text). Extracts emails, dedupes, syntax-checks, flags disposable + role addresses, buckets by live MX provider. Copy clean or per-provider lists — nothing is imported unless you take it to CONTACTS yourself.</p>
                    </details>

                    <details className="help-sec">
                      <summary>PLACEHOLDERS</summary>
                      <p className="help-p"><code>[Firstname] [Lastname] [Company] [Email]</code> — recipient fields. <code>++rbc_url++ ++rbc_link++ ++rbc_short++</code> — random link from the pool. <code>++rbc_domain1++</code> etc — rotation tokens. Full list in the LETTER tab tag palette.</p>
                    </details>

                    <details className="help-sec">
                      <summary>DELIVERABILITY CHECKLIST</summary>
                      <ul className="help-list">
                        <li>DKIM on (SETTINGS → SENDER IDENTITY) + SPF/DMARC on the sending domain</li>
                        <li>Warm-up enabled on a fresh IP — ramp 2–3 weeks</li>
                        <li>TRACKING off for cold lists; on for engaged ones</li>
                        <li>VERIFY DNS + SORTER before every import — kill no-MX/disposable early</li>
                        <li>Watch BOUNCES — hard bounces and complaints suppress automatically</li>
                        <li>SPAM CHECK every draft — fix what it flags before queueing</li>
                      </ul>
                    </details>

                    <details className="help-sec">
                      <summary>TROUBLESHOOTING</summary>
                      <table className="w-table help-table"><thead><tr><th>SYMPTOM</th><th>FIX</th></tr></thead><tbody>
                        <tr><td>AI 401 / "not working"</td><td>Key got wiped or is wrong — re-enter it in SETTINGS → AI ASSISTANT, save, retry. LIST MODELS confirms the key works.</td></tr>
                        <tr><td>AI 503 "high demand"</td><td>Transient — the engine retries then fails over to the next live model automatically and persists the winner.</td></tr>
                        <tr><td>Pool account in COOLDOWN</td><td>It failed recently — wait it out or VERIFY ALL to retest now. Check last_error in the pool table.</td></tr>
                        <tr><td>GRAPH sends but pool mailboxes idle</td><td>Normal if pool is empty — import MS RT creds. Single-engine creds only run when the pool has zero MS accounts.</td></tr>
                        <tr><td>API mode "Configure a from/direct email"</td><td>HTTP API sends via DIRECT CONFIG fields — fill FROM NAME + FROM EMAIL in SETTINGS.</td></tr>
                        <tr><td>Queue won't start</td><td>CAMPAIGN tab tells you why — missing engine creds, empty list, or send-window closed (see SCHEDULE).</td></tr>
                      </tbody></table>
                    </details>

                    <details className="help-sec">
                      <summary>FAQ — WHERE PEOPLE GET STUCK</summary>
                      <table className="w-table help-table"><thead><tr><th>QUESTION</th><th>ANSWER</th></tr></thead><tbody>
                        <tr><td>MS RT import says "unparseable line"</td><td>Every line must carry a refresh token AND a client id — or a JSON dump that contains an <code>access_token</code> (client + tenant get harvested from it). Bare <code>1.xxx</code> tokens auto-bind the Teams public client. Whole vault exports and <code>rubicon_backup</code> gzip blobs are supported — paste the entire blob, or use <code>SELECT FILE</code>. A line that is only a fragment (half a token, a JSON shard) can't import — re-export the file instead of copy-pasting through a clipped window.</td></tr>
                        <tr><td>PORT 25 BLOCKED in the sidebar</td><td>Your host/provider filters outbound SMTP. DIRECT MX mode needs port 25 open — ask the provider to unblock it, or switch engines: SMTP pool, GRAPH, or an HTTP API provider (SendGrid/SES/etc.) doesn't need port 25 at all.</td></tr>
                        <tr><td>Emails land in spam</td><td>Run the spam checker on the draft before queueing — it scores triggers and hands fixes to the AI in one click. Then the deliverability basics: SPF + DKIM + DMARC aligned on the sending domain (DKIM guide lives in SETTINGS), a real unsubscribe link (auto-inserted), warmed-up volume (start low, ramp), and clean lists (SORTER first — kills dead domains and disposables that tank reputation).</td></tr>
                        <tr><td>"LAUNCH" is greyed out</td><td>The setup wizard is gating it — one of the four steps isn't ready: LETTER (subject + body), AUDIENCE (≥1 confirmed contact), ENGINE (creds for the selected send type — the step tells you exactly which field is missing), WINDOW (send window). Fix the amber step, launch unlocks.</td></tr>
                        <tr><td>Contact import won't accept my list</td><td>Two gates: the consent checkbox must be ticked, and emails must parse — columns <code>email, first_name, last_name, company</code>. Messy exports? Run them through SORTER first — it extracts valid addresses from any paste, then <code>IMPORT CLEAN → CONTACTS</code>.</td></tr>
                        <tr><td>Campaign stuck / sending slow</td><td>Check CAMPAIGN HISTORY for per-account errors, then the sidebar: PORT 25 blocked? Accounts in COOLDOWN? Quotas — each mailbox has a daily cap; exhausted accounts pause rotation until reset. SCHEDULE's window may be closed right now (it shows 24/7 when open). Warm-up ramp in SETTINGS deliberately throttles fresh setups.</td></tr>
                        <tr><td>AI WRITER is slow or errors</td><td>Assist calls time out at 60s and fail over through your provider's live model list until one answers — the winning model is persisted. If it still fails, your AI key/endpoint in SETTINGS is dead: LIST MODELS there is the litmus test. Speed depends on the model you picked — smaller models answer in seconds, frontier models take longer but write better HTML.</td></tr>
                        <tr><td>Forgot the dashboard token</td><td>It's in <code>.env</code> as <code>DASHBOARD_TOKEN</code> on the machine running the server. Change it there and restart. Sessions live in sessionStorage — closing the tab logs you out.</td></tr>
                        <tr><td>Where do MS RT mailboxes come from?</td><td>They send via Microsoft Graph inside the normal rotation — same quotas, cooldowns and failover as SMTP pool accounts. VERIFY ALL handshakes every account; dead ones drop for 6h. App creds (<code>cid:secret:tenant</code>) import every mailbox in the tenant — that needs User.Read.All consent on the app.</td></tr>
                      </tbody></table>
                    </details>
                  </div>
                </div>
              )}

            </>
          )}
        </div>
      </div>

      {/* ── GETTING STARTED WALKTHROUGH ── */}
      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-card">
            <div className="intro-brand">RUBICON EMAIL SUITE</div>
            <div className="intro-step">{introStep + 1} / {INTRO_STEPS.length}</div>
            <h2 className="intro-title">{INTRO_STEPS[introStep].title}</h2>
            <p className="intro-desc">{INTRO_STEPS[introStep].desc}</p>
            <div className="intro-actions">
              {introStep > 0 && <button className="btn-sm" onClick={() => setIntroStep(introStep - 1)}>BACK</button>}
              {introStep < INTRO_STEPS.length - 1
                ? <button className="btn-primary" onClick={() => setIntroStep(introStep + 1)}>NEXT</button>
                : <button className="btn-primary" onClick={() => { setShowIntro(false); localStorage.setItem('rbc_intro_seen', '1'); setTab('dashboard'); }}>OPEN DASHBOARD</button>}
            </div>
            <button className="intro-skip" onClick={() => { setShowIntro(false); localStorage.setItem('rbc_intro_seen', '1'); }}>skip walkthrough</button>
          </div>
        </div>
      )}

      {/* ── EXTRACT PROGRESS MODAL ── */}
      {extractJob && (
        <div className="dlg-overlay">
          <div className="dlg-card" role="dialog" aria-label="Extract contacts progress">
            <div className="dlg-head">
              <div className="dlg-title">EXTRACT CONTACTS — {extractJob.owner}</div>
              <button className="dlg-close" aria-label="Close extract dialog" onClick={() => setExtractJob(null)}>✕</button>
            </div>
            {extractJob.status === 'pulling' && (
              <>
                <div className="x-prog-bar" role="progressbar" aria-valuenow={extractJob.total ? Math.round(extractJob.fetched / extractJob.total * 100) : 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="x-prog-fill" style={{ width: `${extractJob.total ? Math.min(100, extractJob.fetched / extractJob.total * 100) : Math.min(95, extractJob.fetched / 20)}%` }} />
                </div>
                <div className="x-prog-line">
                  {extractJob.total
                    ? `${Math.round(extractJob.fetched / extractJob.total * 100)}% — ${extractJob.fetched} of ${extractJob.total} contacts`
                    : `${extractJob.fetched} contacts pulled…`}
                </div>
              </>
            )}
            {extractJob.status === 'failed' && (
              <div className="dlg-msg" style={{ color: 'var(--red)' }}>Pull failed — {extractJob.error}</div>
            )}
            {extractJob.status === 'done' && (
              <>
                <div className="x-prog-bar"><div className="x-prog-fill" style={{ width: '100%' }} /></div>
                <div className="dlg-msg" style={{ marginTop: 10 }}><strong>{extractJob.fetched}</strong> contact(s) pulled. Download a copy or file them into a mail list.</div>
                <label className="field-label">EXPORT TO LIST <span className="dim">— existing name merges</span></label>
                <input className="w-input dlg-input" value={extractJob.list} onChange={(e) => setExtractJob({ ...extractJob, list: e.target.value })} list="rbc-lists" />
                <div className="dlg-actions" style={{ justifyContent: 'space-between' }}>
                  <button className="btn-sm" onClick={downloadExtractCsv}>⇩ DOWNLOAD CSV</button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" onClick={() => setExtractJob(null)}>CLOSE</button>
                    <button className="btn-primary" disabled={busy} onClick={exportExtract}>EXPORT TO CONTACTS</button>
                  </div>
                </div>
              </>
            )}
            {extractJob.status !== 'done' && (
              <div className="dlg-actions"><button className="btn-sm" onClick={() => setExtractJob(null)}>{extractJob.status === 'failed' ? 'CLOSE' : 'CANCEL'}</button></div>
            )}
          </div>
        </div>
      )}

      {/* ── APP DIALOG ── */}
      {dialog && (
        <div className="dlg-overlay" onClick={() => settleDialog(false)}>
          <div className="dlg-card" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <div className="dlg-title">{dialog.title}</div>
              <button className="dlg-close" aria-label="Close dialog" onClick={() => settleDialog(false)}>✕</button>
            </div>
            <div className="dlg-msg">{dialog.message}</div>
            {dialog.kind === 'prompt' && (
              <input
                className="w-input dlg-input"
                autoFocus
                placeholder={dialog.placeholder}
                value={dialog.value}
                onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter' && dialog.value.trim()) settleDialog(true); if (e.key === 'Escape') settleDialog(false); }}
              />
            )}
            <div className="dlg-actions">
              <button className="btn-sm" onClick={() => settleDialog(false)}>CANCEL</button>
              <button
                className={`btn-primary ${dialog.danger ? 'btn-danger-solid' : ''}`}
                onClick={() => settleDialog(dialog.kind === 'prompt' ? dialog.value.trim() !== '' : true)}
              >{dialog.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── A/B TEST DIALOG ── */}
      {abTestOpen && (
        <div className="dlg-overlay">
          <div className="dlg-card dlg-large" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <div className="dlg-title">SUBJECT A/B TEST</div>
              <button className="dlg-close" aria-label="Close A/B test" onClick={() => { setAbTestOpen(false); setAbTestCampaignId(null); setSubjectVariants([]); setNewVariantSubject(''); }}>✕</button>
            </div>
            <div className="dlg-msg">
              <p className="dim-txt">Campaign #{abTestCampaignId} — spin multiple subject variants, split-test across recipients, track open/click rates.</p>
              <div className="ab-test-input-row" style={{ marginBottom: 8 }}>
                <button className="btn-sm" disabled={aiSubjectBusy} title="AI generates subject variants from the letter" onClick={async () => {
                  setAiSubjectBusy(true);
                  try {
                    const res = await aiApi('/api/ai/assist', {
                      method: 'POST',
                      body: {
                        prompt: 'Write 6 alternative subject lines for this email campaign. Rules: each on its own line, under 60 characters, varied tone — no numbering, no quotes, no explanations, no preamble.',
                        subject: draft.subject, html: draft.html, text: draft.text,
                      },
                    });
                    const lines = String(res.result || '').split(/\r?\n/)
                      .map((l) => l.replace(/^\s*[\d\-•\*\.]+[\.\)]?\s*/, '').replace(/^["']|["']$/g, '').trim())
                      .filter((l) => l.length >= 4 && l.length <= 120)
                      .slice(0, 10);
                    if (!lines.length) { showNotice('AI returned no usable subject lines.', 'err'); return; }
                    await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants`, {
                      method: 'POST',
                      body: { subjects: [...subjectVariants.map((v) => v.subject), ...lines] },
                    });
                    const r = await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants`);
                    setSubjectVariants(r || []);
                    showNotice(`${lines.length} AI subject variant(s) added.`);
                  } catch (err) { showNotice(`AI autofill failed: ${err.message}`, 'err'); }
                  finally { setAiSubjectBusy(false); }
                }}>{aiSubjectBusy ? '✦ THINKING…' : '✦ AI AUTOFILL'}</button>
              </div>
              <div className="ab-test-input-row">
                <input
                  className="w-input"
                  placeholder="New subject variant..."
                  value={newVariantSubject}
                  onChange={(e) => setNewVariantSubject(e.target.value)}
                />
                <button
                  className="btn-sm"
                  disabled={!newVariantSubject.trim()}
                  onClick={async () => {
                    await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants`, {
                      method: 'POST',
                      body: { subjects: [...subjectVariants.map(v => v.subject), newVariantSubject.trim()] },
                    });
                    setNewVariantSubject('');
                    const r = await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants`);
                    setSubjectVariants(r || []);
                  }}
                >
                  ADD
                </button>
              </div>
              {subjectVariants.length > 0 && (
                <div className="ab-variants-list">
                  {subjectVariants.map((v) => (
                    <div key={v.id} className={`ab-variant ${v.isWinner ? 'ab-winner' : ''}`}>
                      <div className="ab-variant-subject">{v.subject}</div>
                      <div className="ab-variant-stats">
                        <span className="dim">sent: {v.sent}</span>
                        <span className="dim">opens: {v.opens} ({v.openRate}%)</span>
                        <span className="dim">clicks: {v.clicks} ({v.clickRate}%)</span>
                      </div>
                      <div className="ab-variant-actions">
                        {!v.isWinner && (
                          <button
                            className="btn-xs"
                            onClick={async () => {
                              await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants/${v.id}/winner`, { method: 'POST' });
                              const r = await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants`);
                              setSubjectVariants(r || []);
                            }}
                          >
                            SET WINNER
                          </button>
                        )}
                        <button
                          className="btn-xs"
                          onClick={async () => {
                            await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants/${v.id}`, { method: 'DELETE' });
                            const r = await api(token, `/api/campaigns/${abTestCampaignId}/subject-variants`);
                            setSubjectVariants(r || []);
                          }}
                        >
                          DELETE
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="dlg-actions">
              <button className="btn-sm" onClick={() => { setAbTestOpen(false); setAbTestCampaignId(null); setSubjectVariants([]); setNewVariantSubject(''); }}>CLOSE</button>
            </div>
          </div>
        </div>
      )}


      {/* ── RHS AI CHATBOT ── */}
      {chatOpen && (
        <div className="chat-panel">
          <div className="chat-head">
            <span>RUBICON AI</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {chatModels?.length ? (
                <select className="chat-model-sel" value={chatModel} onChange={(e) => setChatModel(e.target.value)}>
                  {chatModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              ) : null}
              <button className="btn-sm" onClick={() => { setChatMsgs([]); setChatEditIndex(null); setChatInput(''); }} title="Clear">↺</button>
              <button className="btn-sm" aria-label="Close Rubicon AI" onClick={() => setChatOpen(false)}>×</button>
            </div>
          </div>
          <div className="chat-body">
            {!aiReady && (
              <div className="chat-note">AI endpoint is not configured. Add an endpoint + key in <button className="dash-inline-link" onClick={() => { setChatOpen(false); setTab('delivery'); }}>SETTINGS</button>.</div>
            )}
            {!chatMsgs.length && (
              <>
                <div className="dim-txt" style={{ padding: 10 }}>Ask anything — rewrites, deliverability, pool health, provider questions. Or:</div>
                <div className="chat-sugg">
                  {chatSugg.map((s) => (
                    <button key={s} className="chat-sugg-chip" disabled={!aiReady} onClick={() => sendChat(s)}>{s}</button>
                  ))}
                </div>
              </>
            )}
            {chatMsgs.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role === 'user' ? 'chat-user' : 'chat-ai'}${chatEditIndex === i ? ' chat-editing' : ''}`}>
                <div className="chat-msg-text">{m.role === 'assistant' ? <ChatText text={m.content} /> : m.content}</div>
                <div className="chat-msg-tools">
                  <button type="button" className="chat-tool" title="Copy this text" aria-label="Copy this text" onClick={() => copyChatText(m.content)}>⧉</button>
                  {m.role === 'user' && (
                    <button type="button" className="chat-tool" title="Edit this prompt" aria-label="Edit this prompt" onClick={() => editChatMessage(i)}>✎</button>
                  )}
                </div>
                {m.role === 'assistant' && m.target && m.target !== 'none' && (
                  <div className="chat-apply-row">
                    {[['subject', 'SUBJECT'], ['preheader', 'PREHEADER'], ['body', 'BODY'], ['text', 'TEXT']].map(([f, label]) => (
                      <button
                        key={f}
                        className={`chat-apply${m.target === f ? ' on' : ''}`}
                        title={m.target === f ? 'suggested target' : ''}
                        onClick={() => applyChat(m.content, f)}
                      >→ {label}</button>
                    ))}
                  </div>
                )}
                {m.role === 'assistant' && m.actions?.length > 0 && (
                  <div className="chat-apply-row">
                    {m.actions.map((a, j) => (
                      <button key={j} className="chat-apply chat-act" onClick={() => runChatAction(a)}>⚡ {a.label}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {chatBusy && <div className="chat-msg chat-ai"><div className="chat-msg-text dim">thinking…</div></div>}
            <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth', block: 'end' })} />
          </div>
          <div className="chat-foot">
            {chatEditIndex !== null && (
              <div className="chat-editing-note">
                <span>Editing an earlier prompt — send to replace everything after it.</span>
                <button type="button" className="btn-xs" onClick={() => { setChatEditIndex(null); setChatInput(''); }}>CANCEL</button>
              </div>
            )}
            <input
              className="w-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder={aiReady ? 'Talk to Rubicon AI…' : 'Configure AI in SETTINGS first…'}
              disabled={chatBusy || !aiReady}
            />
            <button className="btn-sm" aria-label="Send message" disabled={chatBusy || !aiReady || !chatInput.trim()} onClick={sendChat}>➤</button>
          </div>
        </div>
      )}

      {/* ── ATTACHMENT PREVIEW ── */}
      {awPreview && (
        <div className="dlg-overlay" onClick={closeAwPreview}>
          <div className="dlg-card aw-preview-dlg" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <div className="dlg-title">PREVIEW — {awPreview.attachment?.filename || 'document'}</div>
              <button className="dlg-close" aria-label="Close preview" onClick={closeAwPreview}>✕</button>
            </div>
            <div className="aw-preview-body">
              {awPreview.url ? (
                <iframe title="Attachment preview" src={awPreview.url} className="aw-preview-frame" />
              ) : awPreview.html ? (
                <iframe title="Attachment preview" sandbox="" srcDoc={awPreview.html} className="aw-preview-frame" />
              ) : (
                <pre className="aw-preview-text">{awPreview.text}</pre>
              )}
            </div>
            <div className="dlg-actions">
              <button className="btn-sm" onClick={() => downloadGenerated(awPreview.attachment)}>DOWNLOAD</button>
              <button className="btn-primary" onClick={() => attachGenerated(awPreview.attachment)}>ATTACH TO LETTER</button>
              <button className="btn-sm" onClick={closeAwPreview}>CLOSE</button>
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATING OVERLAY ── */}
      {updating && !updateDismissed && (
        <div className="dlg-overlay" onClick={() => setUpdateDismissed(true)} style={{ cursor: 'pointer' }}>
          <div className="dlg-card">
            <div className="dlg-title" style={{ color: 'var(--cyan)' }}>UPDATING...</div>
            <div className="dlg-msg">
              Pulling the latest build and applying it.<br /><br />
              The server will restart automatically when done.<br />
              <strong>Refresh this page in ~30 seconds.</strong>
            </div>
          </div>
        </div>
      )}

      {/* ── UPDATE RESULT (real updater output) ── */}
      {updateResult && (
        <div className="dlg-overlay" onClick={() => setUpdateResult(null)}>
          <div className="dlg-card update-card" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-head">
              <div className="dlg-title" style={{ color: updateResult.ok ? 'var(--green)' : 'var(--red)' }}>
                {updateResult.ok ? 'UPDATE COMPLETE' : 'UPDATE FAILED'}
              </div>
              <button className="dlg-close" aria-label="Close update log" onClick={() => setUpdateResult(null)}>✕</button>
            </div>
            <pre className="update-log">{updateResult.log || 'No updater output was returned.'}</pre>
            <div className="dlg-actions">
              <button className="btn-sm" onClick={() => { navigator.clipboard?.writeText(updateResult.log || ''); showNotice('Update log copied.'); }}>COPY LOG</button>
              <button className="btn-primary" onClick={() => setUpdateResult(null)}>CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}


