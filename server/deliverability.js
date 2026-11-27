import { resolveTxt, reverse } from 'node:dns/promises';

const DEFAULT_TIMEOUT = 2500;
const DEFAULT_CACHE = 5 * 60 * 1000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), ms);
    timer.unref?.();
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

function flattenTxt(records) {
  return (records || []).map((record) => (Array.isArray(record) ? record.join('') : String(record)));
}

function status(value, label, detail = '') {
  return { status: value, label, detail };
}

function safeDomain(value) {
  return String(value || '').trim().toLowerCase().replace(/^.*@/, '').replace(/\.$/, '');
}

/**
 * Live DNS health for the address the suite actually sends from.
 * All lookups run in parallel with a hard timeout, so the dashboard never waits
 * on a slow resolver. Results are cached because DNS records change rarely.
 */
export function createDeliverability({
  getNetInfo,
  resolveTxtFn = resolveTxt,
  reverseFn = reverse,
  cacheMs = DEFAULT_CACHE,
  timeoutMs = DEFAULT_TIMEOUT,
} = {}) {
  let cache = { at: 0, key: '', data: null };

  async function lookupTxt(name) {
    try {
      const records = await withTimeout(resolveTxtFn(name), timeoutMs);
      return { values: flattenTxt(records), error: '' };
    } catch (error) {
      return { values: [], error: error.code || error.message || 'lookup failed' };
    }
  }

  async function lookupPtr(ip) {
    if (!ip) return { names: [], error: 'no public ip' };
    try {
      const names = await withTimeout(reverseFn(ip), timeoutMs);
      return { names: (names || []).filter(Boolean), error: '' };
    } catch (error) {
      return { names: [], error: error.code || error.message || 'lookup failed' };
    }
  }

  async function check({ settings = {}, fromEmail = '', smtp = {} } = {}, { refresh = false } = {}) {
    const domain = safeDomain(settings.spoofFromEmail || fromEmail || smtp.fromEmail || settings.directFromEmail);
    const mode = settings.sendMode || 'smtp';
    const selector = String(settings.dkimSelector || '').trim();
    const dkimDomain = safeDomain(settings.dkimDomain || domain);
    const key = [
      domain, selector, dkimDomain, Boolean(settings.dkimEnabled), mode,
      Boolean(settings.trackOpens || settings.trackClicks), settings.publicBaseUrl || '',
    ].join('|');

    if (!refresh && cache.data && cache.key === key && Date.now() - cache.at < cacheMs) {
      return { ...cache.data, cached: true };
    }

    if (!domain) {
      const empty = status('unknown', 'NO FROM ADDRESS', 'Set a from address in SETTINGS before running DNS checks.');
      const data = {
        domain: '',
        fromEmail: '',
        checkedAt: new Date().toISOString(),
        cached: false,
        checks: { spf: empty, dkim: empty, dmarc: empty, ptr: empty, port25: empty, tracking: empty },
      };
      cache = { at: Date.now(), key, data };
      return data;
    }

    const [spfResult, dmarcResult, dkimResult, netInfo] = await Promise.all([
      lookupTxt(domain),
      lookupTxt(`_dmarc.${domain}`),
      settings.dkimEnabled && selector && dkimDomain
        ? lookupTxt(`${selector}._domainkey.${dkimDomain}`)
        : Promise.resolve({ values: [], error: '' }),
      getNetInfo ? getNetInfo() : Promise.resolve({ publicIp: '', port25: { open: false, reason: 'unknown' } }),
    ]);
    const ptrResult = await lookupPtr(netInfo?.publicIp);

    const spfRecords = spfResult.values.filter((value) => /^v=spf1\b/i.test(value));
    let spf;
    if (!spfRecords.length) {
      spf = status('fail', 'MISSING', spfResult.error === 'ENOTFOUND' ? `No TXT records at ${domain}.` : 'No SPF record found.');
    } else if (spfRecords.length > 1) {
      spf = status('warn', 'MULTIPLE', 'More than one SPF record — receivers may ignore all of them.');
    } else if (/\+\s*all\b/i.test(spfRecords[0])) {
      spf = status('warn', '+ALL', 'SPF ends in +all, which authorizes every sender. Use -all or ~all.');
    } else if (/^\s*v=spf1\s*[~-]all\s*$/i.test(spfRecords[0])) {
      spf = status('fail', 'NO SENDERS', 'SPF authorizes no sending sources. Add ip4/include for the relay or server that sends this domain.');
    } else {
      spf = status('pass', 'PUBLISHED', spfRecords[0]);
    }

    const dmarcRecords = dmarcResult.values.filter((value) => /^v=DMARC1\b/i.test(value));
    let dmarc;
    if (!dmarcRecords.length) {
      dmarc = status('fail', 'MISSING', `Add a TXT record at _dmarc.${domain} (start with p=none).`);
    } else {
      const policy = /(?:^|;)\s*p=([^;]+)/i.exec(dmarcRecords[0])?.[1]?.trim() || 'none';
      dmarc = status(policy === 'none' ? 'warn' : 'pass', `p=${policy.toUpperCase()}`, dmarcRecords[0]);
    }

    let dkim;
    if (!settings.dkimEnabled) {
      dkim = status('warn', 'OFF', 'Enable DKIM signing in SETTINGS so receivers can authenticate the domain.');
    } else if (!selector || !dkimDomain) {
      dkim = status('warn', 'INCOMPLETE', 'DKIM is on but the selector or domain is empty.');
    } else if (dkimDomain !== domain) {
      dkim = status('warn', 'MISALIGNED', `DKIM signs as ${dkimDomain}, but the From address uses ${domain}. Use the same domain or a subdomain for DMARC alignment.`);
    } else if (!dkimResult.values.some((value) => /v=DKIM1\b/i.test(value) && /(?:^|;)\s*p=/i.test(value))) {
      dkim = status('fail', 'NOT FOUND', `No DKIM key at ${selector}._domainkey.${dkimDomain} (${dkimResult.error || 'no matching record'}).`);
    } else {
      dkim = status('pass', 'PUBLISHED', `${selector}._domainkey.${dkimDomain}`);
    }

    const providerRelay = /(^|\.)(gmail|google|googlemail|outlook|office365|sendgrid|mailgun|amazonaws|brevo|mailjet|postmark|sparkpost|zoho|yahoo|icloud)\./i.test(`${settings.relayHost || ''}.`);
    const ptrRelevant = mode === 'direct' || mode === 'socks5' || (mode === 'relay' && !providerRelay);
    let ptr;
    if (!ptrRelevant) {
      ptr = status('off', 'N/A', mode === 'relay'
        ? 'The relay provider sends from its own IPs — PTR is theirs to manage.'
        : 'This engine sends from provider IPs — PTR is not set on your server.');
    } else if (!netInfo?.publicIp) {
      ptr = status('unknown', 'NO IP', 'The public IP could not be detected.');
    } else if (!ptrResult.names.length) {
      ptr = status('fail', 'MISSING', `No PTR record for ${netInfo.publicIp} (${ptrResult.error || 'not found'}).`);
    } else if (ptrResult.names.some((name) => name.toLowerCase() === domain || name.toLowerCase().endsWith(`.${domain}`))) {
      ptr = status('pass', 'MATCHES', ptrResult.names[0]);
    } else {
      ptr = status('warn', 'DIFFERENT', `${netInfo.publicIp} → ${ptrResult.names[0]} (does not match ${domain}).`);
    }

    let port25;
    if (mode === 'direct' || mode === 'socks5') {
      port25 = netInfo?.port25?.open
        ? status('pass', 'OPEN', 'Outbound port 25 is reachable — direct MX can deliver.')
        : status('fail', 'BLOCKED', `Port 25 ${netInfo?.port25?.reason || 'filtered'} — use relay/SMTP mode or ask the host to unblock it.`);
    } else if (mode === 'relay') {
      port25 = settings.relayHost
        ? status('pass', 'RELAY', `${settings.relayHost}:${settings.relayPort || 25}${settings.relaySecure ? ' (TLS)' : ''}`)
        : status('warn', 'NO RELAY', 'Set a relay host in SETTINGS.');
    } else if (mode === 'smtp') {
      port25 = smtp?.configured
        ? status('pass', 'SMTP AUTH', `${smtp.host}:${smtp.port}${smtp.secure ? ' (SSL)' : ' (STARTTLS)'}`)
        : status('warn', 'NOT SET', 'Configure an SMTP server in SETTINGS.');
    } else {
      port25 = status('pass', mode.toUpperCase(), 'API engine — no outbound port 25 needed.');
    }

    const base = String(settings.publicBaseUrl || '').trim();
    const trackingOn = Boolean(settings.trackOpens || settings.trackClicks);
    const tracking = !trackingOn
      ? status('off', 'OFF', 'Open/click tracking is disabled.')
      : /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(base)
        ? status('warn', 'LOCALHOST', 'Tracking links point at localhost. Set PUBLIC_BASE_URL for real recipients.')
        : status('pass', 'LIVE', base || 'PUBLIC_BASE_URL is set.');

    const data = {
      domain,
      fromEmail: settings.spoofFromEmail || fromEmail || '',
      checkedAt: new Date().toISOString(),
      cached: false,
      checks: { spf, dkim, dmarc, ptr, port25, tracking },
    };
    cache = { at: Date.now(), key, data };
    return data;
  }

  return { check };
}
