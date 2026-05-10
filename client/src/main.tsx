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
  const initialResetToken = new URLSearchParams(window.location.search).get('reset_token') || '';
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>(initialResetToken ? 'reset' : 'login');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setStatus('');
    const fd = new FormData(e.currentTarget);
    const body: Record<string, any> = Object.fromEntries(fd.entries());
    try {
      let path = `/api/auth/${mode}`;
      if (mode === 'reset') {
        path = '/api/auth/reset-password';
        body.token = resetToken;
        if (body.password !== body.confirm_password) throw new Error('Passwords do not match.');
        delete body.confirm_password;
      } else if (mode === 'forgot') {
        path = '/api/auth/forgot-password';
      }
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
      if (!res.ok) throw new Error(res.error || 'Authentication failed');
      if (mode === 'forgot') {
        setStatus(res.message || 'If an account exists for that email, a reset link has been sent.');
        return;
      }
      if (mode === 'reset') {
        setStatus(res.message || 'Password reset. You can sign in now.');
        setResetToken('');
        window.history.replaceState({}, '', window.location.pathname);
        setMode('login');
        return;
      }
      localStorage.setItem('tqt_token', res.token);
      onToken(res.token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const title = mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : mode === 'reset' ? 'Choose new password' : 'WARREN Quote Tool';
  const copy = mode === 'signup'
    ? 'Create your hosted quote dashboard.'
    : mode === 'forgot'
      ? 'Enter your account email and we will send a reset link.'
      : mode === 'reset'
        ? 'Enter a new password for your account.'
        : 'Sign in to manage hosted widgets.';

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <h1>{title}</h1>
        <p>{copy}</p>
        {mode !== 'reset' && <input name="email" type="email" placeholder="Email" required />}
        {mode !== 'forgot' && <input name="password" type="password" placeholder={mode === 'reset' ? 'New password' : 'Password'} minLength={8} required />}
        {mode === 'reset' && <input name="confirm_password" type="password" placeholder="Confirm new password" minLength={8} required />}
        {mode === 'signup' && <input name="businessName" placeholder="Business name" />}
        <button>{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Reset password' : 'Sign in'}</button>
        {error && <div className="error">{error}</div>}
        {status && <div className="success">{status}</div>}
        {mode === 'login' && <button type="button" className="link" onClick={() => { setError(''); setStatus(''); setMode('forgot'); }}>Forgot password?</button>}
        <button type="button" className="link" onClick={() => { setError(''); setStatus(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>
          {mode === 'login' ? 'Need an account?' : 'Back to sign in'}
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
            {tab === 'Pricing'
              ? <PricingPanel settings={widget.settings} update={updateSetting} entitlements={entitlements} />
              : activeGroup && <SettingsGroup group={activeGroup} settings={widget.settings} update={updateSetting} entitlements={entitlements} />}
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

const DOG_PRESETS = [1, 2, 3, 4, 5, 6];
const FREQ_PRESETS = [
  { value: 'seven_times_a_week', label: '7x / week' },
  { value: 'six_times_a_week', label: '6x / week' },
  { value: 'five_times_a_week', label: '5x / week' },
  { value: 'four_times_a_week', label: '4x / week' },
  { value: 'three_times_a_week', label: '3x / week' },
  { value: 'two_times_a_week', label: '2x / week' },
  { value: 'once_a_week', label: 'Weekly' },
  { value: 'bi_weekly', label: 'Every other week' },
  { value: 'twice_per_month', label: 'Twice per month' },
  { value: 'every_three_weeks', label: 'Every 3 weeks' },
  { value: 'once_a_month', label: 'Monthly' },
  { value: 'every_four_weeks', label: 'Every 4 weeks' },
  { value: 'one_time', label: 'One-time clean' },
];
const YARD_BUCKETS = [
  { value: '', label: 'Base / Regular' },
  { value: 'eighth_acre', label: 'Up to 1/8 acre' },
  { value: 'quarter_acre', label: 'Up to 1/4 acre' },
  { value: 'half_acre', label: 'Up to 1/2 acre' },
  { value: 'one_acre', label: 'Up to 1 acre' },
  { value: 'xlarge', label: 'Over 1 acre' },
];

function freqSlug(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('_')) return raw.toLowerCase();
  const key = raw.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const found = FREQ_PRESETS.find(row => row.label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim() === key);
  return found?.value || key.replace(/ /g, '_');
}

function parseDogs(value: string) {
  return String(value || '').split(/[\r\n,]+/).map(part => Number(String(part).replace(/[^0-9]/g, ''))).filter(n => Number.isFinite(n) && n > 0).filter((n, i, arr) => arr.indexOf(n) === i).sort((a, b) => a - b);
}

function parseFreqs(value: string) {
  return String(value || '').split(/\r\n|\r|\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [rawValue, rawLabel] = line.includes('|') ? line.split('|', 2).map(part => part.trim()) : [line, ''];
    const value = freqSlug(rawValue);
    return value ? { value, label: rawLabel || FREQ_PRESETS.find(row => row.value === value)?.label || value.replace(/_/g, ' ') } : null;
  }).filter(Boolean) as Array<{ value: string; label: string }>;
}

type PriceCell = { per_cleanup: string; monthly: string };

function parsePricing(value: string) {
  const map = new Map<string, PriceCell>();
  String(value || '').split(/\r\n|\r|\n/).forEach(line => {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) return;
    const parts = raw.split('|').map(part => part.trim());
    if (parts.length < 4) return;
    const dogs = Number(parts[0]);
    const frequency = freqSlug(parts[1]);
    if (!dogs || !frequency) return;
    let bucket = '';
    parts.slice(4).forEach(bit => {
      const [k, v] = bit.split('=').map(part => part.trim());
      if (k === 'yard_size') bucket = v || '';
    });
    map.set(`${bucket}|${dogs}|${frequency}`, { per_cleanup: parts[2] || '', monthly: parts[3] || '' });
  });
  return map;
}

function serializePricing(map: Map<string, PriceCell>) {
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, cell]) => {
    const [bucket, dogs, frequency] = key.split('|');
    const bits = [dogs, frequency, cell.per_cleanup || '', cell.monthly || ''];
    if (bucket) bits.push(`yard_size=${bucket}`);
    return bits.join(' | ');
  }).join('\n');
}

function money(value: string | number | null | undefined) {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$--';
}

function priceCellFor(pricing: Map<string, PriceCell>, bucket: string, dog: number, frequency: string) {
  return pricing.get(`${bucket}|${dog}|${frequency}`) || pricing.get(`|${dog}|${frequency}`) || { per_cleanup: '', monthly: '' };
}

function PricingPanel({ settings, update, entitlements }: { settings: Record<string, any>; update: (key: string, value: any) => void; entitlements: ReturnType<typeof accountEntitlements> }) {
  const [activeBucket, setActiveBucket] = useState('');
  const [previewDog, setPreviewDog] = useState(1);
  const [previewFreq, setPreviewFreq] = useState('once_a_week');
  const [previewBucket, setPreviewBucket] = useState('');
  const dogs = parseDogs(settings.manual_dogs || '');
  const freqs = parseFreqs(settings.manual_frequencies || '');
  const pricing = useMemo(() => parsePricing(settings.manual_pricing || ''), [settings.manual_pricing]);
  const locked = !entitlements.active;
  const previewDogs = dogs.length ? dogs : DOG_PRESETS.slice(0, 4);
  const previewFreqs = freqs.length ? freqs : FREQ_PRESETS.filter(row => ['once_a_week', 'bi_weekly', 'once_a_month'].includes(row.value));
  const resolvedPreviewDog = previewDogs.includes(previewDog) ? previewDog : previewDogs[0];
  const resolvedPreviewFreq = previewFreqs.some(row => row.value === previewFreq) ? previewFreq : previewFreqs[0]?.value || 'once_a_week';

  const setDogs = (next: number[]) => update('manual_dogs', next.sort((a, b) => a - b).join('\n'));
  const setFreqs = (next: Array<{ value: string; label: string }>) => update('manual_frequencies', next.map(row => `${row.value}|${row.label}`).join('\n'));
  const toggleDog = (dog: number) => setDogs(dogs.includes(dog) ? dogs.filter(n => n !== dog) : [...dogs, dog]);
  const toggleFreq = (row: { value: string; label: string }) => setFreqs(freqs.some(freq => freq.value === row.value) ? freqs.filter(freq => freq.value !== row.value) : [...freqs, row]);
  const updatePrice = (dog: number, frequency: string, field: keyof PriceCell, value: string) => {
    const next = new Map(pricing);
    const key = `${activeBucket}|${dog}|${frequency}`;
    const current = next.get(key) || { per_cleanup: '', monthly: '' };
    const updated = { ...current, [field]: value };
    if (!updated.per_cleanup && !updated.monthly) next.delete(key);
    else next.set(key, updated);
    update('manual_pricing', serializePricing(next));
  };

  return (
    <div className="owner-settings">
      <section className="panel">
        <h3>Service Areas</h3>
        <div className="settings-grid">
          <label><span>Pricing source</span><select value={settings.service_data_source || 'sng'} disabled={locked} onChange={e => update('service_data_source', e.target.value)}><option value="sng">Sweep&Go</option><option value="local">Local/manual</option></select></label>
          <label><span>Local area mode</span><select value={settings.local_area_mode || 'zip'} disabled={locked} onChange={e => update('local_area_mode', e.target.value)}><option value="zip">ZIP list</option><option value="locations">City / location list</option></select></label>
          <label className="full"><span>Local service areas</span><textarea rows={5} value={settings.local_area_values || ''} disabled={locked} onChange={e => update('local_area_values', e.target.value)} placeholder="33578 | Riverview" /></label>
        </div>
      </section>
      <section className="panel">
        <h3>Dog Counts</h3>
        <div className="chip-row">{DOG_PRESETS.map(dog => <label className="chip" key={dog}><input type="checkbox" checked={dogs.includes(dog)} disabled={locked} onChange={() => toggleDog(dog)} /> {dog} {dog === 1 ? 'dog' : 'dogs'}</label>)}</div>
        <label className="full"><span>Custom dog counts</span><textarea rows={3} value={settings.manual_dogs || ''} disabled={locked} onChange={e => update('manual_dogs', e.target.value)} /></label>
      </section>
      <section className="panel">
        <h3>Frequencies</h3>
        <div className="chip-row">{FREQ_PRESETS.map(freq => <label className="chip" key={freq.value}><input type="checkbox" checked={freqs.some(row => row.value === freq.value)} disabled={locked} onChange={() => toggleFreq(freq)} /> {freq.label}</label>)}</div>
        <label className="full"><span>Custom frequency rows</span><textarea rows={5} value={settings.manual_frequencies || ''} disabled={locked} onChange={e => update('manual_frequencies', e.target.value)} placeholder="once_a_week|Weekly" /></label>
      </section>
      <section className="panel">
        <h3>Pricing Matrix</h3>
        <div className="bucket-row">{YARD_BUCKETS.map(bucket => <button type="button" key={bucket.value || 'base'} className={activeBucket === bucket.value ? 'active' : 'secondary'} onClick={() => setActiveBucket(bucket.value)}>{bucket.label}</button>)}</div>
        {!dogs.length || !freqs.length ? <div className="status">Choose at least one dog count and frequency to build the matrix.</div> : (
          <div className="pricing-matrix">
            <table>
              <thead><tr><th>Frequency</th>{dogs.map(dog => <th key={dog}>{dog} {dog === 1 ? 'dog' : 'dogs'}</th>)}</tr></thead>
              <tbody>{freqs.map(freq => <tr key={freq.value}><th>{freq.label}</th>{dogs.map(dog => {
                const key = `${activeBucket}|${dog}|${freq.value}`;
                const cell = pricing.get(key) || { per_cleanup: '', monthly: '' };
                return <td key={key}><input placeholder="Per visit" value={cell.per_cleanup} disabled={locked} onChange={e => updatePrice(dog, freq.value, 'per_cleanup', e.target.value)} /><input placeholder="Monthly" value={cell.monthly} disabled={locked} onChange={e => updatePrice(dog, freq.value, 'monthly', e.target.value)} /></td>;
              })}</tr>)}</tbody>
            </table>
          </div>
        )}
        <label className="full"><span>Raw manual pricing</span><textarea rows={6} value={settings.manual_pricing || ''} disabled={locked} onChange={e => update('manual_pricing', e.target.value)} /></label>
      </section>
      <section className="panel">
        <h3>One-Time And Display Rules</h3>
        <div className="settings-grid">
          <label><span>One-time starting price</span><input value={settings.one_time_price || ''} disabled={locked} onChange={e => update('one_time_price', e.target.value)} /></label>
          <label><span>One-time price per extra dog</span><input value={settings.one_time_price_per_extra_dog || ''} disabled={locked} onChange={e => update('one_time_price_per_extra_dog', e.target.value)} /></label>
          <label><span>Dog selector style</span><select value={settings.dog_control_type || 'dropdown'} disabled={locked} onChange={e => update('dog_control_type', e.target.value)}><option value="dropdown">Dropdown</option><option value="slider">Slider</option></select></label>
          <label><span>Frequency selector style</span><select value={settings.frequency_control_type || 'dropdown'} disabled={locked} onChange={e => update('frequency_control_type', e.target.value)}><option value="dropdown">Dropdown</option><option value="slider">Slider</option></select></label>
          <label className="check"><input type="checkbox" checked={!!settings.show_per_cleanup_price} disabled={locked} onChange={e => update('show_per_cleanup_price', e.target.checked)} /> Show per-visit price first</label>
          <label><span>Recurring calculation</span><select value={settings.recurring_calc_mode || 'standard'} disabled={locked} onChange={e => update('recurring_calc_mode', e.target.value)}><option value="standard">52 weeks / 12 months</option><option value="four_weeks">4 weeks</option></select></label>
          <label><span>Price font size</span><input value={settings.price_font_size || '32'} disabled={locked} onChange={e => update('price_font_size', e.target.value)} /></label>
          <label><span>Price font weight</span><input value={settings.price_font_weight || '900'} disabled={locked} onChange={e => update('price_font_weight', e.target.value)} /></label>
          <label><span>Price label font size</span><input value={settings.price_label_font_size || '12'} disabled={locked} onChange={e => update('price_label_font_size', e.target.value)} /></label>
          <label><span>Price label font weight</span><input value={settings.price_label_font_weight || '400'} disabled={locked} onChange={e => update('price_label_font_weight', e.target.value)} /></label>
          <label><span>Monthly line font size</span><input value={settings.price_companion_font_size || '12'} disabled={locked} onChange={e => update('price_companion_font_size', e.target.value)} /></label>
          <label><span>Monthly line font weight</span><input value={settings.price_companion_font_weight || '400'} disabled={locked} onChange={e => update('price_companion_font_weight', e.target.value)} /></label>
          <label><span>CTA font size</span><input value={settings.cta_font_size || '18'} disabled={locked} onChange={e => update('cta_font_size', e.target.value)} /></label>
          <label><span>CTA font weight</span><input value={settings.cta_font_weight || '900'} disabled={locked} onChange={e => update('cta_font_weight', e.target.value)} /></label>
          <label className="full"><span>Recurring pricing notice</span><textarea rows={3} value={settings.pricing_notice_recurring || ''} disabled={locked} onChange={e => update('pricing_notice_recurring', e.target.value)} placeholder="Optional note under recurring quotes" /></label>
          <label className="full"><span>One-time pricing notice</span><textarea rows={3} value={settings.pricing_notice_one_time || ''} disabled={locked} onChange={e => update('pricing_notice_one_time', e.target.value)} placeholder="Optional note under one-time quotes" /></label>
        </div>
      </section>
      <PricingPreview
        settings={settings}
        pricing={pricing}
        dogs={previewDogs}
        freqs={previewFreqs}
        dog={resolvedPreviewDog}
        frequency={resolvedPreviewFreq}
        bucket={previewBucket}
        onDog={setPreviewDog}
        onFrequency={setPreviewFreq}
        onBucket={setPreviewBucket}
      />
    </div>
  );
}

function PricingPreview({ settings, pricing, dogs, freqs, dog, frequency, bucket, onDog, onFrequency, onBucket }: {
  settings: Record<string, any>;
  pricing: Map<string, PriceCell>;
  dogs: number[];
  freqs: Array<{ value: string; label: string }>;
  dog: number;
  frequency: string;
  bucket: string;
  onDog: (dog: number) => void;
  onFrequency: (frequency: string) => void;
  onBucket: (bucket: string) => void;
}) {
  const cell = priceCellFor(pricing, bucket, dog, frequency);
  const showPerVisit = settings.show_per_cleanup_price !== false;
  const amount = showPerVisit ? (cell.per_cleanup || cell.monthly) : (cell.monthly || cell.per_cleanup);
  const freqLabel = freqs.find(row => row.value === frequency)?.label || frequency.replace(/_/g, ' ');
  const bucketLabel = YARD_BUCKETS.find(row => row.value === bucket)?.label || 'Base / Regular';
  const style = {
    '--preview-panel': settings.panel_transparent ? 'transparent' : (settings.panel_bg || '#e7e2d9'),
    '--preview-border': settings.panel_border || '#000000',
    '--preview-ink': settings.text || '#263238',
    '--preview-muted': settings.muted || '#6b7b83',
    '--preview-cta': settings.cta || '#1f86ea',
    '--preview-cta-text': settings.cta_text_color || '#ffffff',
    '--preview-radius': `${settings.radius || 16}px`,
    '--preview-price-size': `${settings.price_font_size || 32}px`,
    '--preview-price-weight': String(settings.price_font_weight || 900),
    '--preview-cta-size': `${settings.cta_font_size || 18}px`,
    '--preview-cta-weight': String(settings.cta_font_weight || 900),
    '--preview-title-size': `${settings.title_font_size || 22}px`,
    '--preview-title-align': settings.title_align || 'left',
    '--preview-price-label-size': `${settings.price_label_font_size || 12}px`,
    '--preview-price-label-weight': String(settings.price_label_font_weight || 400),
    '--preview-price-companion-size': `${settings.price_companion_font_size || 12}px`,
    '--preview-price-companion-weight': String(settings.price_companion_font_weight || 400),
  } as React.CSSProperties;
  return (
    <section className="panel">
      <h3>Preview</h3>
      <div className="settings-grid">
        <label><span>Dog count</span><select value={dog} onChange={e => onDog(Number(e.target.value))}>{dogs.map(d => <option key={d} value={d}>{d} {d === 1 ? 'dog' : 'dogs'}</option>)}</select></label>
        <label><span>Frequency</span><select value={frequency} onChange={e => onFrequency(e.target.value)}>{freqs.map(freq => <option key={freq.value} value={freq.value}>{freq.label}</option>)}</select></label>
        <label><span>Yard bucket</span><select value={bucket} onChange={e => onBucket(e.target.value)}>{YARD_BUCKETS.map(row => <option key={row.value || 'base'} value={row.value}>{row.label}</option>)}</select></label>
      </div>
      <div className="quote-preview" style={style}>
        <div className="quote-preview-title">{settings.widget_title || 'Get an Instant Quote'}</div>
        <div className="quote-preview-fields">
          <span>{dog} {dog === 1 ? 'dog' : 'dogs'}</span>
          <span>{freqLabel}</span>
        </div>
        <div className="quote-preview-bar">
          <div className="quote-preview-price-label">{showPerVisit ? 'PER VISIT PRICE' : 'MONTHLY PRICE'}</div>
          <div className="quote-preview-price">{money(amount)}</div>
          {cell.monthly && showPerVisit && <div className="quote-preview-price-companion">{money(cell.monthly)} per month</div>}
          <div className="quote-preview-note">{bucketLabel}</div>
          <button type="button">SIGN UP</button>
        </div>
      </div>
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
    const secretKey = kind === 'sng' ? 'api_token' : kind === 'openphone' ? 'api_key' : kind === 'jobber' ? 'webhook_secret' : 'secret';
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
  return <div className="panel"><h3>Encrypted connection secrets</h3><p>Secrets are encrypted in Postgres and are never exposed to public embeds.</p><select value={kind} onChange={e => setKind(e.target.value)}><option value="sng">Sweep&Go API token</option><option value="openphone">OpenPhone API key</option><option value="jobber">Jobber webhook secret</option><option value="ghl">GHL secret</option><option value="generic">Generic webhook secret</option></select><input value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste secret value" /><button onClick={save}>Save secret</button><button className="secondary" onClick={testSng}>Test Sweep&amp;Go connection</button>{status && <div className="status">{status}</div>}</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
