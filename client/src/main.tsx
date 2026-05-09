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
  feature?: string;
  addon?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  help?: string;
};

type SettingGroup = { title: string; fields: SettingField[] };
type PlanCatalog = Record<string, { label: string; description: string; features: string[] }>;
type CurrentUser = { id: string; email: string; is_admin?: boolean };

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
        <h1>WARREN Quote Tool</h1>
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
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accountId, setAccountId] = useState('');
  const [widget, setWidget] = useState<Widget | null>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [groups, setGroups] = useState<SettingGroup[]>([]);
  const [plans, setPlans] = useState<PlanCatalog>({});
  const [billingLinks, setBillingLinks] = useState<Record<string, string>>({});
  const [tab, setTab] = useState('Business');
  const [status, setStatus] = useState('');

  useEffect(() => {
    api(token, '/api/auth/me').then(res => {
      setUser(res.user || null);
      setAccounts(res.accounts);
      setAccountId(res.accounts[0]?.id || '');
    }).catch(onLogout);
    api(token, '/api/app/settings-schema').then(res => {
      setGroups(res.schema.groups || []);
      setPlans(res.schema.plans || {});
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
  const entitlements = accountEntitlements(currentAccount);
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
        <h2>WARREN Quote Tool</h2>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}>
          {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        {currentAccount && <div className="status">Plan: {currentAccount.plan || 'free'} · {currentAccount.billing_status || 'active'}</div>}
        <BillingLinks links={billingLinks} plans={plans} account={currentAccount} />
        <nav>
          {groups.map(group => <button key={group.title} className={tab === group.title ? 'active' : ''} onClick={() => setTab(group.title)}>{group.title}</button>)}
          <button className={tab === 'Copy' ? 'active' : ''} onClick={() => setTab('Copy')}>Copy</button>
          <button className={tab === 'Embed' ? 'active' : ''} onClick={() => setTab('Embed')}>Embed</button>
          <button className={tab === 'Leads' ? 'active' : ''} onClick={() => setTab('Leads')}>Leads</button>
          <button className={tab === 'Events' ? 'active' : ''} onClick={() => setTab('Events')}>Events</button>
          <button className={tab === 'Secrets' ? 'active' : ''} onClick={() => setTab('Secrets')}>Secrets</button>
          {user?.is_admin && <button className={tab === 'Admin' ? 'active' : ''} onClick={() => setTab('Admin')}>Admin</button>}
        </nav>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </aside>
      <section className="content">
        {tab === 'Admin' && user?.is_admin ? <AdminPanel token={token} /> : !widget ? <div>No widget found.</div> : (
          <>
            <header>
              <div>
                <h1>{tab}</h1>
                <p>{widget.name} · <code>{widget.public_id}</code></p>
              </div>
              {!['Embed', 'Leads', 'Events', 'Secrets', 'Admin'].includes(tab) && <button onClick={save}>Save settings</button>}
            </header>
            <EntitlementBanner account={currentAccount} links={billingLinks} />
            {status && <div className="status">{status}</div>}
            {activeGroup && <SettingsGroup group={activeGroup} settings={widget.settings} update={updateSetting} entitlements={entitlements} />}
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

function accountEntitlements(account: any) {
  const plan = String(account?.plan || 'free').toLowerCase();
  const status = String(account?.billing_status || 'active').toLowerCase();
  const active = !['canceled', 'past_due', 'unpaid', 'disabled', 'inactive'].includes(status);
  const addons = account?.addons || {};
  const rank: Record<string, number> = { free: 0, starter: 1, pro: 2, agency: 3 };
  const hasPlan = (minimum: string) => active && (rank[plan] ?? 0) >= (rank[minimum] ?? 0);
  const hasAddon = (addon: string) => active && [true, 'true', 'active', 1].includes(addons?.[addon]);
  return {
    plan,
    active,
    addons,
    hasPlan,
    hasAddon,
    hasFeature: (feature?: string, addon?: string, minimumPlan?: string) => {
      if (!feature && !addon && !minimumPlan) return true;
      if (addon && hasAddon(addon)) return true;
      if (feature === 'yardMap') return hasPlan('pro') || hasAddon('yard_map');
      if (feature === 'managedMapbox') return hasPlan('agency') || hasAddon('managed_mapbox');
      if (minimumPlan) return hasPlan(minimumPlan);
      return !feature || hasPlan('pro');
    },
  };
}

function BillingLinks({ links, plans, account }: { links: Record<string, string>; plans: PlanCatalog; account: any }) {
  const available = Object.entries(links || {}).filter(([, url]) => !!url);
  if (!available.length) return null;
  const plan = String(account?.plan || 'free').toLowerCase();
  return (
    <div className="panel compact">
      {links.starter && plan === 'free' && <a className="button-link secondary" href={links.starter} target="_blank">{plans.starter?.label || 'Starter Setup'}</a>}
      {links.pro && plan !== 'pro' && plan !== 'agency' && <a className="button-link" href={links.pro} target="_blank">{plans.pro?.label || 'Pro Add-on'}</a>}
      {links.map && plan !== 'pro' && plan !== 'agency' && <a className="button-link secondary" href={links.map} target="_blank">Map add-on</a>}
      {links.agency && plan !== 'agency' && <a className="button-link secondary" href={links.agency} target="_blank">{plans.agency?.label || 'Agency'}</a>}
      {links.portal && <a className="button-link secondary" href={links.portal} target="_blank">Billing Portal</a>}
    </div>
  );
}

function EntitlementBanner({ account, links }: { account: any; links: Record<string, string> }) {
  const entitlements = accountEntitlements(account);
  const mapEnabled = entitlements.hasFeature('yardMap', 'yard_map', 'pro');
  return (
    <div className="entitlement">
      <strong>{account?.plan || 'free'} plan</strong>
      <span>This is a quote and lead-capture add-on for your CRM, not a CRM replacement.</span>
      {!mapEnabled && links.map && <a href={links.map} target="_blank">Add yard map</a>}
      {!entitlements.hasPlan('pro') && links.pro && <a href={links.pro} target="_blank">Unlock tracking and webhooks</a>}
    </div>
  );
}

function AdminPanel({ token }: { token: string }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    const res = await api(token, '/api/app/admin/accounts');
    setAccounts(res.accounts || []);
  };

  useEffect(() => {
    load().catch((err: any) => setError(err.message || 'Could not load accounts.'));
  }, [token]);

  const saveAccount = async (account: any, payload: Record<string, any>) => {
    setStatus(`Saving ${account.name}...`);
    setError('');
    try {
      await api(token, `/api/app/admin/accounts/${account.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      await load();
      setStatus(`${account.name} updated.`);
      setTimeout(() => setStatus(''), 1800);
    } catch (err: any) {
      setError(err.message || 'Could not save account.');
      setStatus('');
    }
  };

  return (
    <>
      <header>
        <div>
          <h1>Admin</h1>
          <p>View brands and manually override plans, billing state, and feature add-ons.</p>
        </div>
        <button className="secondary" onClick={() => load().catch((err: any) => setError(err.message || 'Could not refresh accounts.'))}>Refresh</button>
      </header>
      {status && <div className="status">{status}</div>}
      {error && <div className="error">{error}</div>}
      <div className="admin-grid">
        {accounts.map(account => <AdminAccountCard key={account.id} account={account} onSave={payload => saveAccount(account, payload)} />)}
      </div>
    </>
  );
}

function AdminAccountCard({ account, onSave }: { account: any; onSave: (payload: Record<string, any>) => void }) {
  const [plan, setPlan] = useState(String(account.plan || 'free'));
  const [billingStatus, setBillingStatus] = useState(String(account.billing_status || 'active'));
  const [addons, setAddons] = useState<Record<string, any>>(account.addons || {});
  const [stripeCustomerId, setStripeCustomerId] = useState(String(account.stripe_customer_id || ''));
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState(String(account.stripe_subscription_id || ''));

  useEffect(() => {
    setPlan(String(account.plan || 'free'));
    setBillingStatus(String(account.billing_status || 'active'));
    setAddons(account.addons || {});
    setStripeCustomerId(String(account.stripe_customer_id || ''));
    setStripeSubscriptionId(String(account.stripe_subscription_id || ''));
  }, [account.id]);

  const toggleAddon = (key: string, enabled: boolean) => {
    setAddons(next => ({ ...next, [key]: enabled ? 'active' : false }));
  };

  const members = Array.isArray(account.members) ? account.members : [];
  const widgets = Array.isArray(account.widgets) ? account.widgets : [];
  const submit = () => onSave({
    plan,
    billing_status: billingStatus,
    addons,
    stripe_customer_id: stripeCustomerId.trim(),
    stripe_subscription_id: stripeSubscriptionId.trim(),
  });

  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <div>
          <h3>{account.name}</h3>
          <p><code>{account.id}</code></p>
        </div>
        <span>{account.lead_count || 0} leads</span>
      </div>
      <div className="admin-meta">
        <span>Members: {members.map((member: any) => member.email).filter(Boolean).join(', ') || 'None'}</span>
        <span>Widgets: {widgets.map((widget: any) => widget.public_id).filter(Boolean).join(', ') || 'None'}</span>
      </div>
      <div className="admin-controls">
        <label><span>Plan</span><select value={plan} onChange={e => setPlan(e.target.value)}><option value="free">Free</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="agency">Agency</option></select></label>
        <label><span>Billing status</span><select value={billingStatus} onChange={e => setBillingStatus(e.target.value)}><option value="active">Active</option><option value="trialing">Trialing</option><option value="past_due">Past due</option><option value="canceled">Canceled</option><option value="unpaid">Unpaid</option><option value="inactive">Inactive</option></select></label>
        <label><span>Stripe customer ID</span><input value={stripeCustomerId} onChange={e => setStripeCustomerId(e.target.value)} placeholder="cus_..." /></label>
        <label><span>Stripe subscription ID</span><input value={stripeSubscriptionId} onChange={e => setStripeSubscriptionId(e.target.value)} placeholder="sub_..." /></label>
      </div>
      <div className="admin-addons">
        <label className="check"><input type="checkbox" checked={[true, 'true', 'active', 1].includes(addons.yard_map)} onChange={e => toggleAddon('yard_map', e.target.checked)} /> Yard map add-on</label>
        <label className="check"><input type="checkbox" checked={[true, 'true', 'active', 1].includes(addons.managed_mapbox)} onChange={e => toggleAddon('managed_mapbox', e.target.checked)} /> Managed Mapbox add-on</label>
      </div>
      <button onClick={submit}>Save account</button>
    </section>
  );
}

function SettingsGroup({ group, settings, update, entitlements }: { group: SettingGroup; settings: Record<string, any>; update: (key: string, value: any) => void; entitlements: ReturnType<typeof accountEntitlements> }) {
  return (
    <div className="settings-grid">
      {group.fields.map(field => {
        const locked = !entitlements.hasFeature(field.feature, field.addon, field.plan);
        return <Field key={field.key} field={field} value={settings[field.key]} locked={locked} onChange={value => update(field.key, value)} />;
      })}
    </div>
  );
}

function Field({ field, value, locked, onChange }: { field: SettingField; value: any; locked?: boolean; onChange: (value: any) => void }) {
  const label = field.label || field.key.replace(/_/g, ' ');
  const suffix = locked ? ' Locked' : field.plan ? ` ${field.plan}+` : field.addon ? ' add-on' : '';
  const help = locked ? `Upgrade${field.addon ? ' or add this feature' : ''} to use ${label}.` : field.help;
  if (field.type === 'boolean' || typeof value === 'boolean') {
    return <label className={`check ${locked ? 'locked' : ''}`}><input type="checkbox" checked={!!value} disabled={locked} onChange={e => onChange(e.target.checked)} /> {label}{suffix && <small>{suffix}</small>}{help && <em>{help}</em>}</label>;
  }
  if (field.type === 'textarea') {
    return <label className={locked ? 'locked' : ''}><span>{label}{suffix && <small>{suffix}</small>}</span><textarea value={value || ''} disabled={locked} onChange={e => onChange(e.target.value)} rows={field.rows || 4} />{help && <em>{help}</em>}</label>;
  }
  if (field.type === 'color') {
    return <label className={locked ? 'locked' : ''}><span>{label}{suffix && <small>{suffix}</small>}</span><div className="color-row"><input type="color" value={value || '#000000'} disabled={locked} onChange={e => onChange(e.target.value)} /><input value={value || ''} disabled={locked} onChange={e => onChange(e.target.value)} /></div>{help && <em>{help}</em>}</label>;
  }
  if (field.type === 'select') {
    return <label className={locked ? 'locked' : ''}><span>{label}{suffix && <small>{suffix}</small>}</span><select value={value ?? field.options?.[0]?.value ?? ''} disabled={locked} onChange={e => onChange(e.target.value)}>{(field.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{help && <em>{help}</em>}</label>;
  }
  return <label className={locked ? 'locked' : ''}><span>{label}{suffix && <small>{suffix}</small>}</span><input type={field.type === 'number' ? 'number' : 'text'} value={value ?? ''} disabled={locked} onChange={e => onChange(e.target.value)} />{help && <em>{help}</em>}</label>;
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
