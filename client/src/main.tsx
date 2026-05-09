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

const groups: Array<{ title: string; keys: string[] }> = [
  { title: 'Business', keys: ['org_slug', 'email_to', 'contact_phone', 'privacy_url', 'terms_url'] },
  { title: 'Connections', keys: ['base_url', 'location_id', 'organization_form_id', 'lead_destination', 'ghl_webhook_url', 'jobber_webhook_url'] },
  { title: 'Pricing', keys: ['service_data_source', 'local_area_mode', 'local_area_values', 'manual_dogs', 'manual_frequencies', 'manual_pricing', 'one_time_price', 'one_time_price_per_extra_dog', 'show_per_cleanup_price', 'recurring_calc_mode'] },
  { title: 'Quote Rules', keys: ['require_phone_before_quote', 'require_name_before_quote', 'require_consent_before_quote', 'show_last_cleaned', 'enable_coupon_field', 'show_sng_addons_by_default'] },
  { title: 'Branding', keys: ['panel_bg', 'panel_transparent', 'panel_border', 'text', 'muted', 'accent', 'cta', 'cta_text_color', 'radius', 'widget_title', 'hint_text', 'bullets', 'custom_css'] },
  { title: 'Typography', keys: ['heading_font_url', 'heading_font_family', 'body_font_url', 'body_font_family', 'title_font_url', 'title_font_family', 'title_font_size', 'title_align', 'cta_font_size', 'cta_font_weight', 'price_font_size', 'price_font_weight'] },
  { title: 'Controls', keys: ['dog_control_type', 'frequency_control_type', 'dog_slider_icon_mode', 'dog_slider_icon_emoji', 'dog_slider_icon_image', 'freq_slider_icon_mode', 'freq_slider_icon_emoji', 'freq_slider_icon_image', 'slider_track_color', 'slider_fill_color', 'slider_thumb_color', 'slider_thumb_size', 'slider_track_height', 'slider_icon_size'] },
  { title: 'Copy', keys: ['copy_overrides'] },
  { title: 'Map', keys: ['enable_yard_map', 'mapbox_token'] },
];

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
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [widget, setWidget] = useState<Widget | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [tab, setTab] = useState('Business');
  const [status, setStatus] = useState('');

  useEffect(() => {
    api(token, '/api/auth/me').then(res => {
      setAccounts(res.accounts);
      setAccountId(res.accounts[0]?.id || '');
    }).catch(onLogout);
  }, [token]);

  useEffect(() => {
    if (!accountId) return;
    api(token, `/api/app/accounts/${accountId}/widgets`).then(res => {
      setWidgets(res.widgets);
      setWidget(res.widgets[0] || null);
    });
    api(token, `/api/app/accounts/${accountId}/leads`).then(res => setLeads(res.leads));
  }, [accountId, token]);

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

  return (
    <main className="app-shell">
      <aside>
        <h2>Titan Quote Tool</h2>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <nav>
          {groups.map(group => <button key={group.title} className={tab === group.title ? 'active' : ''} onClick={() => setTab(group.title)}>{group.title}</button>)}
          <button className={tab === 'Embed' ? 'active' : ''} onClick={() => setTab('Embed')}>Embed</button>
          <button className={tab === 'Leads' ? 'active' : ''} onClick={() => setTab('Leads')}>Leads</button>
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
              {!['Embed', 'Leads', 'Secrets'].includes(tab) && <button onClick={save}>Save settings</button>}
            </header>
            {status && <div className="status">{status}</div>}
            {groups.find(g => g.title === tab) && <SettingsGroup group={groups.find(g => g.title === tab)!} settings={widget.settings} update={updateSetting} />}
            {tab === 'Embed' && <EmbedPanel embed={embed} widget={widget} />}
            {tab === 'Leads' && <LeadsPanel leads={leads} />}
            {tab === 'Secrets' && <SecretsPanel token={token} accountId={accountId} widgetId={widget.id} />}
          </>
        )}
      </section>
    </main>
  );
}

function SettingsGroup({ group, settings, update }: { group: { title: string; keys: string[] }; settings: Record<string, any>; update: (key: string, value: any) => void }) {
  if (group.title === 'Copy') {
    const value = settings.copy_overrides || {};
    return <JsonEditor label="Copy overrides" value={value} onChange={next => update('copy_overrides', next)} />;
  }
  return (
    <div className="settings-grid">
      {group.keys.map(key => <Field key={key} name={key} value={settings[key]} onChange={value => update(key, value)} />)}
    </div>
  );
}

function Field({ name, value, onChange }: { name: string; value: any; onChange: (value: any) => void }) {
  const label = name.replace(/_/g, ' ');
  if (typeof value === 'boolean') {
    return <label className="check"><input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /> {label}</label>;
  }
  if (['manual_pricing', 'manual_frequencies', 'local_area_values', 'bullets', 'custom_css', 'addon2_desc'].includes(name)) {
    return <label><span>{label}</span><textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={name === 'manual_pricing' ? 8 : 4} /></label>;
  }
  if (name.includes('color') || ['panel_bg', 'panel_border', 'text', 'muted', 'accent', 'cta', 'cta_text_color'].includes(name)) {
    return <label><span>{label}</span><div className="color-row"><input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} /><input value={value || ''} onChange={e => onChange(e.target.value)} /></div></label>;
  }
  if (name === 'service_data_source') {
    return <label><span>{label}</span><select value={value || 'sng'} onChange={e => onChange(e.target.value)}><option value="sng">Sweep&Go</option><option value="local">Local/manual</option></select></label>;
  }
  if (name === 'lead_destination') {
    return <label><span>{label}</span><select value={value || 'sng'} onChange={e => onChange(e.target.value)}><option value="sng">Sweep&Go</option><option value="ghl">GoHighLevel webhook</option><option value="jobber">Jobber webhook</option><option value="email">Email only</option></select></label>;
  }
  return <label><span>{label}</span><input value={value ?? ''} onChange={e => onChange(e.target.value)} /></label>;
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

function LeadsPanel({ leads }: { leads: any[] }) {
  return <div className="table">{leads.map(lead => <details key={lead.id}><summary>{new Date(lead.created_at).toLocaleString()} · {lead.type}</summary><pre>{JSON.stringify(lead, null, 2)}</pre></details>)}</div>;
}

function SecretsPanel({ token, accountId, widgetId }: { token: string; accountId: string; widgetId: string }) {
  const [kind, setKind] = useState('sng');
  const [secret, setSecret] = useState('');
  const [status, setStatus] = useState('');
  const save = async () => {
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
  return <div className="panel"><h3>Encrypted connection secrets</h3><p>Secrets are encrypted in Postgres and are never exposed to public embeds.</p><select value={kind} onChange={e => setKind(e.target.value)}><option value="sng">Sweep&Go API token</option><option value="jobber">Jobber webhook secret</option><option value="ghl">GHL secret</option></select><input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste secret value" /><button onClick={save}>Save secret</button><button className="secondary" onClick={testSng}>Test Sweep&amp;Go connection</button>{status && <div className="status">{status}</div>}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
