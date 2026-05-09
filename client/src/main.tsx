import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Widget = {
  id: string;
  public_id: string;
  name: string;
  enabled: boolean;
  settings: Record<string, any>;
};

type SettingField = {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'textarea' | 'boolean' | 'select' | 'color' | 'number' | 'json';
  public?: boolean;
  secret?: boolean;
  plan?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  help?: string;
};

type SettingGroup = { title: string; fields: SettingField[] };

function api(token: string, path: string, options: RequestInit = {}) {
  return fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  }).then(async res => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
    return data;
  });
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('tqt_token') || '');
  if (!token) return <Auth onToken={setToken} />;
  return <Dashboard token={token} onLogout={() => { localStorage.removeItem('tqt_token'); setToken(''); }} />;
}

function Auth({ onToken }: { onToken: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
      if (!res.ok) throw new Error(res.error || 'Authentication failed');
      localStorage.setItem('tqt_token', res.token);
      onToken(res.token);
    } catch (err: any) {
      setError(err.message);
    }
  };
  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>Titan Quote Tool</h1>
        <p>{mode === 'login' ? 'Sign in to manage hosted widgets.' : 'Create your hosted quote dashboard.'}</p>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" minLength={8} required />
        {mode === 'signup' && <input name="businessName" placeholder="Business name" />}
        <button>{mode === 'login' ? 'Sign in' : 'Create account'}</button>
        {error && <div className="error">{error}</div>}
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'Need an account?' : 'Have an account?'}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [widget, setWidget] = useState<Widget | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [groups, setGroups] = useState<SettingGroup[]>([]);
  const [billingLinks, setBillingLinks] = useState<Record<string, string>>({});
  const [tab, setTab] = useState('Business');
  const [status, setStatus] = useState('');

  useEffect(() => {
    api(token, '/api/auth/me').then(res => {
      setAccounts(res.accounts);
      setAccountId(res.accounts[0]?.id || '');
    }).catch(onLogout);
    api(token, '/api/app/settings-schema').then(res => {
      setGroups(res.schema.groups || []);
    });
    api(token, '/api/app/billing-links').then(res => {
      setBillingLinks(res.links || {});
    });
  }, [token]);

  useEffect(() => {
    if (!accountId) return;
    api(token, `/api/app/accounts/${accountId}/widgets`).then(res => {
      setWidget(res.widgets[0] || null);
    });
    api(token, `/api/app/accounts/${accountId}/leads`).then(res => setLeads(res.leads));
    api(token, `/api/app/accounts/${accountId}/events`).then(res => setEvents(res.events));
  }, [accountId, token]);

  const currentAccount = accounts.find(account => account.id === accountId);
  const embed = useMemo(() => {
    if (!widget) return '';
    const origin = window.location.origin;
    return `<div id="tqt-widget"></div>\n<script src="${origin}/widget.js" data-widget-id="${widget.public_id}"></script>`;
  }, [widget]);

  const updateSetting = (key: string, value: any) => {
    if (!widget) return;
    setWidget({ ...widget, settings: { ...widget.settings, [key]: value } });
  };

  const save = async () => {
    if (!widget) return;
    setStatus('Saving...');
    const res = await api(token, `/api/app/widgets/${widget.id}/settings`, { method: 'PATCH', body: JSON.stringify({ settings: widget.settings }) });
    setWidget(res.widget);
    setStatus('Saved');
    setTimeout(() => setStatus(''), 1800);
  };

  const activeGroup = groups.find(g => g.title === tab);

  return (
    <main className="app-shell">
      <aside>
        <h2>Titan Quote Tool</h2>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        {currentAccount && <div className="status">Plan: {currentAccount.plan || 'free'} · {currentAccount.billing_status || 'active'}</div>}
        <BillingLinks links={billingLinks} />
        <nav>
          {groups.map(group => <button key={group.title} className={tab === group.title ? 'active' : ''} onClick={() => setTab(group.title)}>{group.title}</button>)}
          <button className={tab === 'Copy' ? 'active' : ''} onClick={() => setTab('Copy')}>Copy</button>
          <button className={tab === 'Embed' ? 'active' : ''} onClick={() => setTab('Embed')}>Embed</button>
          <button className={tab === 'Leads' ? 'active' : ''} onClick={() => setTab('Leads')}>Leads</button>
          <button className={tab === 'Events' ? 'active' : ''} onClick={() => setTab('Events')}>Events</button>
          <button className={tab === 'Secrets' ? 'active' : ''} onClick={() => setTab('Secrets')}>Secrets</button>
        </nav>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </aside>
      <section className="content">
        {!widget ? <div>No widget found.</div> : (
          <>
            <header>
              <div>
                <h1>{tab}</h1>
                <p>{widget.name} · <code>{widget.public_id}</code></p>
              </div>
              {!['Embed', 'Leads', 'Events', 'Secrets'].includes(tab) && <button onClick={save}>Save settings</button>}
            </header>
            {status && <div className="status">{status}</div>}
            {activeGroup && <SettingsGroup group={activeGroup} settings={widget.settings} update={updateSetting} />}
            {tab === 'Copy' && <JsonEditor label="Copy overrides" value={widget.settings.copy_overrides || {}} onChange={next => updateSetting('copy_overrides', next)} />}
            {tab === 'Embed' && <EmbedPanel embed={embed} widget={widget} />}
            {tab === 'Leads' && <RecordsPanel records={leads} labelKey="type" />}
            {tab === 'Events' && <RecordsPanel records={events} labelKey="event" />}
            {tab === 'Secrets' && <SecretsPanel token={token} accountId={accountId} widgetId={widget.id} />}
          </>
        )}
      </section>
    </main>
  );
}

function BillingLinks({ links }: { links: Record<string, string> }) {
  const available = Object.entries(links || {}).filter(([, url]) => !!url);
  if (!available.length) return null;
  return (
    <div className="panel compact">
      {links.pro && <a className="button-link" href={links.pro} target="_blank">Upgrade Pro</a>}
      {links.agency && <a className="button-link secondary" href={links.agency} target="_blank">Agency</a>}
      {links.portal && <a className="button-link secondary" href={links.portal} target="_blank">Billing Portal</a>}
    </div>
  );
}

function SettingsGroup({ group, settings, update }: { group: SettingGroup; settings: Record<string, any>; update: (key: string, value: any) => void }) {
  return (
    <div className="settings-grid">
      {group.fields.map(field => <Field key={field.key} field={field} value={settings[field.key]} onChange={value => update(field.key, value)} />)}
    </div>
  );
}

function Field({ field, value, onChange }: { field: SettingField; value: any; onChange: (value: any) => void }) {
  const label = field.label || field.key.replace(/_/g, ' ');
  if (field.type === 'boolean' || typeof value === 'boolean') {
    return <label className="check"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {label}</label>;
  }
  if (field.type === 'textarea') {
    return <label><span>{label}{field.plan && <small> {field.plan}+</small>}</span><textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={field.rows || 4} />{field.help && <em>{field.help}</em>}</label>;
  }
  if (field.type === 'color') {
    return <label><span>{label}</span><div className="color-row"><input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} /><input value={value || ''} onChange={e => onChange(e.target.value)} /></div></label>;
  }
  if (field.type === 'select') {
    return <label><span>{label}</span><select value={value ?? field.options?.[0]?.value ?? ''} onChange={e => onChange(e.target.value)}>{(field.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  }
  return <label><span>{label}{field.plan && <small> {field.plan}+</small>}</span><input type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} onChange={e => onChange(e.target.value)} />{field.help && <em>{field.help}</em>}</label>;
}

function JsonEditor({ label, value, onChange }: { label: string; value: any; onChange: (value: any) => void }) {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [error, setError] = useState('');
  return <label className="full"><span>{label}</span><textarea rows={20} value={text} onChange={e => {
    setText(e.target.value);
    try { onChange(JSON.parse(e.target.value || '{}')); setError(''); } catch { setError('Invalid JSON'); }
  }} />{error && <em>{error}</em>}</label>;
}

function EmbedPanel({ embed, widget }: { embed: string; widget: Widget }) {
  return <div className="panel"><h3>Embed code</h3><p>Paste this into Wix, Webflow, Squarespace, Shopify, WordPress, or any custom HTML block.</p><textarea readOnly rows={5} value={embed} /><h3>Public config</h3><a target="_blank" href={`/public/widgets/${widget.public_id}/config`}>Open widget config JSON</a></div>;
}

function RecordsPanel({ records, labelKey }: { records: any[]; labelKey: string }) {
  return <div className="table">{records.map(record => <details key={record.id}><summary>{new Date(record.created_at).toLocaleString()} · {record[labelKey]}</summary><pre>{JSON.stringify(record, null, 2)}</pre></details>)}</div>;
}

function SecretsPanel({ token, accountId, widgetId }: { token: string; accountId: string; widgetId: string }) {
  const [kind, setKind] = useState('sng');
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState('');
  const save = async () => {
    if (!secret.trim()) {
      setStatus('Paste a secret value before saving.');
      return;
    }
    const secretKey = kind === 'sng' ? 'api_token' : kind === 'jobber' ? 'webhook_secret' : 'secret';
    await api(token, `/api/app/accounts/${accountId}/connections/${kind}`, { method: 'PUT', body: JSON.stringify({ config: {}, secret_config: { [secretKey]: secret } }) });
    setSecret('');
    setStatus('Secret saved');
  };
  const testSng = async () => {
    setStatus('Testing Sweep&Go...');
    try {
      const res = await api(token, `/api/app/widgets/${widgetId}/test-sng`, { method: 'POST', body: JSON.stringify({}) });
      setStatus(res.message || 'Sweep&Go connection is working.');
    } catch (err: any) {
      setStatus(err.message || 'Sweep&Go connection failed.');
    }
  };
  return <div className="panel"><h3>Encrypted connection secrets</h3><p>Secrets are encrypted in Postgres and are never exposed to public embeds.</p><select value={kind} onChange={e => setKind(e.target.value)}><option value="sng">Sweep&Go API token</option><option value="jobber">Jobber webhook secret</option><option value="ghl">GHL secret</option><option value="generic">Generic webhook secret</option></select><input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste secret value" /><button onClick={save}>Save secret</button><button className="secondary" onClick={testSng}>Test Sweep&amp;Go connection</button>{status && <div className="status">{status}</div>}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
