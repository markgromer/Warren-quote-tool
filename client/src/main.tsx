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

function consumeLaunchToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('tqt_token') || '';
  if (!token) return localStorage.getItem('tqt_token') || '';

  localStorage.setItem('tqt_token', token);
  params.delete('tqt_token');
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
  return token;
}

function App() {
  const [token, setToken] = useState(consumeLaunchToken);
  if (window.location.pathname === '/demo') return <DemoPage />;
  if (window.location.pathname === '/upgrade') return <UpgradePage token={token} onToken={setToken} />;
  if (!token) return <Auth onToken={setToken} />;
  return <Dashboard token={token} onLogout={() => { localStorage.removeItem('tqt_token'); setToken(''); }} />;
}

function DemoPage() {
  const tabs = ['Start Here', 'Pricing', 'Map', 'Connections', 'Follow Up', 'Leads', 'Tracking', 'Branding', 'Embed', 'Secrets'];
  const pricingRows = [
    { key: 'two_times_a_week', label: 'Two Times A Week' },
    { key: 'once_a_week', label: 'Once A Week' },
    { key: 'bi_weekly', label: 'Bi Weekly' },
    { key: 'once_a_month', label: 'Once A Month' },
  ];
  const dogColumns = [1, 2, 3, 4, 5];
  const [activeTab, setActiveTab] = useState('Start Here');
  const [captureStatus, setCaptureStatus] = useState('');
  const [dashboardSettingsStatus, setDashboardSettingsStatus] = useState('');
  const [widgetRun, setWidgetRun] = useState(0);
  const [demo, setDemo] = useState<any>({
    business_name: 'Scoop Doggy Logs',
    business_email: '',
    service_data_source: 'local',
    lead_destination: 'sng',
    widget_title: 'Get an Instant Quote',
    panel_bg: '#f6f8f7',
    panel_border: '#17212b',
    cta: '#1167d8',
    cta_text_color: '#ffffff',
    radius: '12',
    show_per_cleanup_price: true,
    require_phone_before_quote: true,
    show_last_cleaned: true,
    enable_yard_map: false,
    mapbox_token: '',
    use_managed_mapbox_token: false,
    demo_weekly_price: '18',
    demo_biweekly_price: '24',
    demo_monthly_price: '34',
    demo_onetime_price: '79',
    demo_extra_dog_price: '4',
    demo_price_matrix: {
      two_times_a_week: { 1: '104', 2: '124', 3: '140', 4: '156', 5: '162' },
      once_a_week: { 1: '90', 2: '98', 3: '98', 4: '98', 5: '124' },
      bi_weekly: { 1: '65', 2: '81', 3: '92', 4: '99', 5: '115' },
      once_a_month: { 1: '42', 2: '52', 3: '62', 4: '72', 5: '82' },
      one_time: { 1: '79', 2: '91', 3: '103', 4: '115', 5: '127' },
    },
    openphone_partial_quote_sms_enabled: true,
    openphone_signup_sms_enabled: true,
    enable_partial_lead_email: true,
  });

  const updateDemo = (key: string, value: any) => {
    setDemo(current => ({ ...current, [key]: value }));
  };

  const updateMatrixPrice = (frequency: string, dogs: number, value: string) => {
    setDemo(current => ({
      ...current,
      demo_price_matrix: {
        ...(current.demo_price_matrix || {}),
        [frequency]: {
          ...((current.demo_price_matrix && current.demo_price_matrix[frequency]) || {}),
          [dogs]: value,
        },
      },
    }));
  };

  const restartDemoWidget = () => {
    setWidgetRun(current => current + 1);
    setTimeout(() => {
      document.getElementById('demo-widget')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const selectedDestination = demo.lead_destination === 'sng'
    ? 'Sweep&Go'
    : demo.lead_destination === 'webhook'
      ? 'Webhook / CRM'
      : 'Email inbox';

  useEffect(() => {
    const dashboardToken = localStorage.getItem('tqt_token') || '';
    if (!dashboardToken) return;
    let cancelled = false;
    api(dashboardToken, '/api/auth/me')
      .then(res => {
        const accountId = res.accounts?.[0]?.id;
        if (!accountId) return null;
        return api(dashboardToken, `/api/app/accounts/${accountId}/widgets`);
      })
      .then(async res => {
        if (!res || cancelled) return;
        const widget = res.widgets?.[0];
        if (!widget?.public_id) return;
        const publicConfig = await fetch(`/public/widgets/${widget.public_id}/config`).then(r => r.json()).catch(() => null);
        if (cancelled || !publicConfig?.settings) return;
        const publicSettings = publicConfig.settings;
        const mapboxToken = String(publicSettings.mapbox_token || '').trim();
        setDemo(current => ({
          ...current,
          ...publicSettings,
          business_name: current.business_name,
          business_email: current.business_email,
          demo_price_matrix: current.demo_price_matrix,
          mapbox_token: mapboxToken || current.mapbox_token || '',
          enable_yard_map: Boolean(publicSettings.enable_yard_map || current.enable_yard_map),
        }));
        if (mapboxToken) {
          setDashboardSettingsStatus(publicSettings.use_managed_mapbox_token ? 'Using hosted Mapbox token from your dashboard.' : 'Using Mapbox token from your dashboard.');
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const submitDemoInterest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCaptureStatus('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(demo.business_email.trim())) {
      setCaptureStatus('Enter a valid business email.');
      return;
    }
    try {
      await fetch('/api/demo-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demo),
      });
      setCaptureStatus('Saved. We can follow up with the setup you tested here.');
    } catch {
      setCaptureStatus('Saved locally for this demo. The live follow-up endpoint was unavailable.');
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'Start Here':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head">
              <div><h2>Build a working quote flow in minutes</h2><p>Use your CRM pricing, use your own local pricing table, or start with email-only lead capture.</p></div>
              <span className="demo-badge">Guided setup</span>
            </div>
            <form className="demo-capture-form" onSubmit={submitDemoInterest}>
              <label><span>Business email</span><input type="email" value={demo.business_email} placeholder="owner@example.com" onChange={e => updateDemo('business_email', e.target.value)} /></label>
              <label><span>Business name</span><input value={demo.business_name} onChange={e => updateDemo('business_name', e.target.value)} /></label>
              <div className="demo-control-grid">
                <label><span>Pricing source</span><select value={demo.service_data_source} onChange={e => updateDemo('service_data_source', e.target.value)}><option value="sng">Sweep&Go pricing</option><option value="local">Use my own data</option></select></label>
                <label><span>Lead destination</span><select value={demo.lead_destination} onChange={e => updateDemo('lead_destination', e.target.value)}><option value="sng">Sweep&Go</option><option value="webhook">Webhook / CRM</option><option value="email">Email only</option></select></label>
              </div>
              <button type="submit">Send me this setup</button>
              {captureStatus && <p className={captureStatus.startsWith('Enter') ? 'error' : 'success'}>{captureStatus}</p>}
            </form>
            <div className="demo-admin-grid">
              <DemoMetric label="Customer quote" value="Instant price" />
              <DemoMetric label="Lead capture" value={selectedDestination} />
              <DemoMetric label="Follow-up" value="Email + SMS" />
              <DemoMetric label="Install" value="One script" />
            </div>
          </section>
        );
      case 'Pricing':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Pricing engine</h2><p>Edit the fixed monthly pricing grid, then choose the same dog count and frequency in the widget preview.</p></div></div>
            <div className="demo-pricing-copy">
              <strong>Prepaid Fixed Monthly - Regular</strong>
              <p>Please enter your fixed cost prepaid prices. Regular pricing affects clients living in regular zip codes. If you do not offer certain options, leave those prices blank.</p>
            </div>
            <div className="demo-pricing-matrix" role="region" aria-label="Demo fixed monthly pricing table">
              <table>
                <thead>
                  <tr>
                    <th scope="col"></th>
                    {dogColumns.map(dogs => <th scope="col" key={dogs}>{dogs} {dogs === 1 ? 'dog' : 'dogs'}</th>)}
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRows.map(row => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      {dogColumns.map(dogs => (
                        <td key={`${row.key}-${dogs}`}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label={`${row.label}, ${dogs} ${dogs === 1 ? 'dog' : 'dogs'}`}
                            value={(demo.demo_price_matrix && demo.demo_price_matrix[row.key] && demo.demo_price_matrix[row.key][dogs]) || ''}
                            onChange={e => updateMatrixPrice(row.key, dogs, e.target.value)}
                          />
                        </td>
                      ))}
                      <td><button type="button" className="demo-table-action">Edit</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="demo-pricing-hint">The preview treats these as prepaid monthly totals and derives the per-visit display from visit frequency.</p>
            <div className="demo-flow-list">
              <DemoStep number="1" title="Choose data source" detail="Pull live service options from Sweep&Go or run from a local pricing table." />
              <DemoStep number="2" title="Quote instantly" detail="Frequency, dog count, yard size, and last-cleaned answers shape the displayed price." />
              <DemoStep number="3" title="Route the lead" detail="Send the signup into Sweep&Go, a webhook CRM, Jobber/GHL, or an email inbox." />
            </div>
          </section>
        );
      case 'Map':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Map and yard measurement</h2><p>For operators who price by property size, customers can search an address and draw the service area.</p></div><span className="demo-badge">Add-on</span></div>
            <label className="check"><input type="checkbox" checked={demo.enable_yard_map} onChange={e => updateDemo('enable_yard_map', e.target.checked)} /> Show map workflow in the quote setup</label>
            {dashboardSettingsStatus && <p className="success">{dashboardSettingsStatus}</p>}
            {!demo.mapbox_token && demo.enable_yard_map && <p className="error">Add a Mapbox public token in the dashboard Map settings, then reload this demo.</p>}
            <div className="demo-map-preview">
              <div className="demo-map-yard"></div>
              <span>Sample yard: 7,850 sq ft</span>
            </div>
            <DemoFeature active label="Address search" detail="Customers start with an address so ZIP, city, and state can be carried into signup." />
            <DemoFeature active label="Measured quote modifiers" detail="Large yards can trigger configured adjustments before the price is shown." />
          </section>
        );
      case 'Connections':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Connect the tool to the systems you already use</h2><p>The production widget can create customers, send webhooks, or simply email lead details.</p></div></div>
            <label><span>Lead destination</span><select value={demo.lead_destination} onChange={e => updateDemo('lead_destination', e.target.value)}><option value="sng">Sweep&Go onboarding</option><option value="webhook">Webhook / CRM route</option><option value="email">Email-only lead capture</option></select></label>
            <DemoFeature active={demo.service_data_source === 'sng'} label="Sweep&Go service data" detail="Pulls dog counts, frequencies, service areas, and price registration details from your account." onToggle={value => updateDemo('service_data_source', value ? 'sng' : 'local')} />
            <DemoFeature active={demo.lead_destination === 'webhook'} label="CRM webhook" detail="Send new leads to Jobber, GoHighLevel, Zapier, Make, or a custom endpoint." onToggle={value => updateDemo('lead_destination', value ? 'webhook' : 'email')} />
            <DemoFeature active={demo.lead_destination === 'email'} label="Email fallback" detail="Start without a CRM and receive every lead by email." onToggle={value => updateDemo('lead_destination', value ? 'email' : 'sng')} />
          </section>
        );
      case 'Follow Up':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Automated follow-up</h2><p>Capture intent before checkout and follow up when a visitor views a quote but does not finish.</p></div></div>
            <label className="check"><input type="checkbox" checked={demo.enable_partial_lead_email} onChange={e => updateDemo('enable_partial_lead_email', e.target.checked)} /> Email partial quote leads</label>
            <label className="check"><input type="checkbox" checked={demo.openphone_partial_quote_sms_enabled} onChange={e => updateDemo('openphone_partial_quote_sms_enabled', e.target.checked)} /> Text quote viewers with OpenPhone</label>
            <label className="check"><input type="checkbox" checked={demo.openphone_signup_sms_enabled} onChange={e => updateDemo('openphone_signup_sms_enabled', e.target.checked)} /> Text signup confirmations</label>
            <DemoLead name="Partial quote" status="Text queued" meta="Visitor saw $18.00 weekly pricing and left a phone number" />
            <DemoLead name="Signup" status="Confirmation sent" meta="Customer completed address, email, and phone" />
          </section>
        );
      case 'Leads':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Lead desk</h2><p>Every important customer action is logged with the routing result.</p></div><span className="demo-badge">Sample feed</span></div>
            <DemoLead name="Jamie R." status="Quote viewed" meta="2 dogs - weekly - Phoenix - partial follow-up" />
            <DemoLead name="Morgan S." status="Signup complete" meta={`1 dog - bi-weekly - sent to ${selectedDestination}`} />
            <DemoLead name="Taylor K." status="Waitlist" meta="Outside service area - email captured" />
            <DemoLead name="Casey P." status="Coupon help" meta="Phone captured for special-offer follow-up" />
          </section>
        );
      case 'Tracking':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Conversion tracking</h2><p>Events are intentionally non-PII and can be sent to GTM, GA4, Meta, Google Ads, or custom listeners.</p></div></div>
            <div className="demo-pill-row"><span>zip_verified</span><span>quote_displayed</span><span>coupon_applied</span><span>waitlist_submitted</span><span>lead_submitted</span></div>
            <DemoFeature active label="GTM dataLayer" detail="Push events to existing tag manager containers." />
            <DemoFeature active label="Meta Pixel" detail="Emit Lead and ViewContent standard events where configured." />
            <DemoFeature active label="Developer events" detail="Listen for browser CustomEvents for deeper site integrations." />
          </section>
        );
      case 'Branding':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Branding and copy</h2><p>Make the widget feel like the business site while keeping the checkout flow direct.</p></div></div>
            <label><span>Widget title</span><input value={demo.widget_title} onChange={e => updateDemo('widget_title', e.target.value)} /></label>
            <div className="demo-control-grid">
              <label><span>Panel</span><input type="color" value={demo.panel_bg} onChange={e => updateDemo('panel_bg', e.target.value)} /></label>
              <label><span>Border</span><input type="color" value={demo.panel_border} onChange={e => updateDemo('panel_border', e.target.value)} /></label>
              <label><span>Button</span><input type="color" value={demo.cta} onChange={e => updateDemo('cta', e.target.value)} /></label>
              <label><span>Radius</span><input type="number" min="0" max="28" value={demo.radius} onChange={e => updateDemo('radius', e.target.value)} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={demo.require_phone_before_quote} onChange={e => updateDemo('require_phone_before_quote', e.target.checked)} /> Require phone before showing price</label>
            <label className="check"><input type="checkbox" checked={demo.show_per_cleanup_price} onChange={e => updateDemo('show_per_cleanup_price', e.target.checked)} /> Show per-visit price first</label>
          </section>
        );
      case 'Embed':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Install path</h2><p>Drop the widget into Elementor, a landing page, or a custom site with one script.</p></div></div>
            <pre>{`<div id="quote-tool"></div>
<script src="https://your-host/widget.js"
  data-widget-id="wid_..."
  data-mount="#quote-tool"></script>`}</pre>
            <DemoFeature active label="Elementor compatible" detail="Works in regular pages, popups, and HTML widgets." />
            <DemoFeature active label="Hosted settings" detail="Business owners edit pricing, copy, routing, and tracking without touching the website." />
          </section>
        );
      case 'Secrets':
        return (
          <section className="demo-panel">
            <div className="demo-panel-head"><div><h2>Secrets stay private</h2><p>The public widget never exposes CRM tokens, webhook signing secrets, map keys, or OpenPhone credentials.</p></div></div>
            <label><span>Sweep&Go token</span><input value="****************" readOnly /></label>
            <label><span>OpenPhone key</span><input value="****************" readOnly /></label>
            <label><span>Webhook signing secret</span><input value="****************" readOnly /></label>
          </section>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    const mount = document.getElementById('tqt-demo-widget');
    if (!mount) return;
    mount.innerHTML = '';
    const script = document.createElement('script');
    script.src = '/widget.js';
    script.async = true;
    script.dataset.demo = '1';
    script.dataset.mount = '#tqt-demo-widget';
    script.dataset.demoConfig = JSON.stringify({ settings: demo });
    mount.appendChild(script);
    return () => {
      script.remove();
      mount.innerHTML = '';
    };
  }, [demo, widgetRun]);

  const conversionCards = [
    { title: 'Quote while they are ready', metric: 'Instant', copy: 'Give visitors a real price before they drift away.' },
    { title: 'Recover the almost-booked', metric: 'Follow-up', copy: 'Capture serious shoppers before they finish the full signup.' },
    { title: 'Sell bigger jobs', metric: 'Upsell', copy: 'Add coupons, specials, add-ons, and yard-size pricing right in the flow.' },
    { title: 'Protect paid access', metric: 'Stripe', copy: 'Keep Pro features tied to active subscriptions.' },
  ];
  const showcaseHighlights = [
    ['Yard-size quoting', 'Price jobs that need more than ZIP.'],
    ['Coupons and specials', 'Launch offers that convert now.'],
    ['Add-on upsells', 'Grow order value before signup.'],
    ['Out-of-area waitlists', 'Turn unavailable ZIPs into demand.'],
    ['CRM, email, SMS', 'Send hot leads where work happens.'],
    ['Payment-aware Pro', 'Keep premium access current.'],
  ];
  const integrations = ['Sweep&Go', 'Stripe', 'OpenPhone', 'Jobber', 'GoHighLevel', 'Zapier', 'GA4', 'Meta Pixel', 'Mapbox', 'WordPress'];

  return (
    <main className="demo-shell" id="top">
      <nav className="demo-nav">
        <a href="#top" className="demo-brand">WARREN Quote Tool</a>
        <div>
          <a href="#why">Why it wins</a>
          <a href="#demo-workspace">Live demo</a>
          <a href="#pricing">Pro</a>
        </div>
        <a className="button-link" href="/">Sign in</a>
      </nav>

      <section className="demo-landing">
        <div className="demo-landing-copy">
          <p className="eyebrow">Premium quote experience</p>
          <h1>Instant quotes that turn visitors into booked jobs.</h1>
          <p>Launch a polished quote flow for service brands: price the job, capture the lead, recover missed shoppers, and keep Pro access tied to payment.</p>
          <div className="demo-hero-actions">
            <a className="button-link" href="#demo-workspace">Try the live demo</a>
            <a className="button-link secondary" href="/">Open dashboard</a>
          </div>
          <div className="demo-proof-row">
            <span>Fast pricing</span>
            <span>Lead recovery</span>
            <span>Add-on upsells</span>
            <span>Paid Pro access</span>
            <span>CRM handoff</span>
          </div>
        </div>
        <div className="demo-hero-visual" aria-label="Quote platform preview">
          <div className="demo-browser">
            <div className="demo-browser-top"><span></span><span></span><span></span><em>quote.yourdomain.com</em></div>
            <div className="demo-browser-body">
              <div className="demo-mini-sidebar"><b></b><b></b><b></b><b></b><b></b></div>
              <div className="demo-mini-main">
                <div className="demo-mini-kpis"><span></span><span></span><span></span></div>
                <div className="demo-mini-chart"><i></i><i></i><i></i><i></i><i></i></div>
                <div className="demo-mini-table"><span></span><span></span><span></span><span></span></div>
              </div>
              <div className="demo-mini-widget">
                <strong>$24.00</strong>
                <span>per visit</span>
                <button>Sign up</button>
              </div>
            </div>
          </div>
          <div className="demo-hero-card">
            <span>Live status</span>
            <strong>Pro active</strong>
            <em>Billing, widget access, and feature gates are synchronized.</em>
          </div>
        </div>
      </section>

      <section className="demo-logo-strip" aria-label="Supported systems">
        {integrations.slice(0, 8).map(name => <span key={name}>{name}</span>)}
      </section>

      <section className="demo-section" id="why">
        <div className="demo-section-head">
          <p className="eyebrow">Why it wins</p>
          <h2>A landing-page quote flow with real revenue behind it.</h2>
          <p>Sharp on the customer side. Powerful behind the scenes.</p>
        </div>
        <div className="demo-platform-grid">
          {conversionCards.map(card => (
            <article className="demo-platform-card" key={card.title}>
              <span>{card.metric}</span>
              <h3>{card.title}</h3>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-section demo-showcase" id="showcase">
        <div className="demo-section-head">
          <p className="eyebrow">Showcase</p>
          <h2>Everything behind the quote, without slowing the buyer down.</h2>
        </div>
        <div className="demo-capability-grid">
          {showcaseHighlights.map(([title, copy]) => (
            <article className="demo-capability-card" key={title}>
              <b>{title}</b>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-command-center">
        <div>
          <p className="eyebrow">Command center</p>
          <h2>The sales page is the front. The dashboard is the engine.</h2>
          <p>Manage brands, offers, service areas, setup health, billing status, and install paths from one clean workspace.</p>
        </div>
        <div className="demo-command-grid">
          <DemoMetric label="Brand health" value="Visible" />
          <DemoMetric label="Paid access" value="Automated" />
          <DemoMetric label="Support" value="Contextual" />
          <DemoMetric label="Deployment" value="One script" />
        </div>
      </section>

      <section className="demo-workspace" id="demo-workspace">
        <div className="demo-dashboard" aria-label="Demo dashboard controls">
          <div className="demo-dashboard-head">
            <div>
              <strong>WARREN Quote Tool</strong>
              <span>{demo.business_name || 'Demo business'}</span>
            </div>
            <span>Demo-safe setup</span>
          </div>
          <div className="demo-admin-surface">
            <nav className="demo-tab-rail" aria-label="Demo admin sections">
              {tabs.map(tab => (
                <button key={tab} type="button" className={tab === activeTab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>
              ))}
            </nav>
            <div className="demo-tab-content">
              {renderTab()}
            </div>
          </div>
        </div>

        <div className="demo-live" id="demo-widget">
          <div className="demo-live-head">
            <div>
              <strong>Live customer widget</strong>
              <span>Try Phoenix, Arcadia, Scottsdale, or Outside service area.</span>
            </div>
            <div className="demo-live-actions">
              <div className="demo-route-mini">
                <span>Pricing: {demo.service_data_source === 'sng' ? 'CRM data' : 'local table'}</span>
                <span>Leads: {selectedDestination}</span>
              </div>
              <button type="button" className="secondary" onClick={restartDemoWidget}>Restart</button>
            </div>
          </div>
          <div id="tqt-demo-widget" />
        </div>
      </section>

      <section className="demo-pricing-cta" id="pricing">
        <div>
          <p className="eyebrow">Pro</p>
          <h2>Give every service brand a quote flow that feels expensive.</h2>
          <p>Premium branding, advanced tracking, yard-size quoting, follow-up paths, and payment-aware access.</p>
        </div>
        <a className="button-link" href="https://buy.stripe.com/14A4gz4Tt67x0recAZfMA0W" target="_blank">Subscribe to Pro</a>
      </section>
    </main>
  );
}

function DemoMetric({ label, value }: { label: string; value: string }) {
  return <div className="demo-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function DemoFeature({ active, label, detail, onToggle }: { active: boolean; label: string; detail: string; onToggle?: (active: boolean) => void }) {
  return (
    <div className="demo-feature">
      <div>
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      {onToggle ? <input type="checkbox" checked={active} onChange={e => onToggle(e.target.checked)} /> : <span className={active ? 'demo-state-on' : 'demo-state-off'}>{active ? 'On' : 'Off'}</span>}
    </div>
  );
}

function DemoLead({ name, status, meta }: { name: string; status: string; meta: string }) {
  return (
    <div className="demo-lead-row">
      <div><strong>{name}</strong><span>{meta}</span></div>
      <em>{status}</em>
    </div>
  );
}

function DemoStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="demo-step">
      <b>{number}</b>
      <div><strong>{title}</strong><span>{detail}</span></div>
    </div>
  );
}

const upgradePlanFallbacks: PlanCatalog = {
  free: {
    label: 'Free',
    description: 'Basic hosted quote widget for testing the flow.',
    features: ['Instant quote embed', 'Basic lead capture', 'WARREN branding'],
  },
  starter: {
    label: 'Starter',
    description: 'One-time setup for a production-ready quote widget.',
    features: ['Custom copy and colors', 'Manual pricing', 'Basic lead history'],
  },
  pro: {
    label: 'Pro Add-on',
    description: 'Monthly upgrade for serious lead capture, tracking, and automation.',
    features: ['Tracking pixels', 'Webhooks', 'Custom CSS', 'Developer events', 'Yard map'],
  },
  agency: {
    label: 'Agency',
    description: 'For teams managing multiple brands or client widgets.',
    features: ['Everything in Pro', 'Managed Mapbox option', 'Agency support'],
  },
};

const upgradeLinkFallbacks = {
  pro: 'https://buy.stripe.com/14A4gz4Tt67x0recAZfMA0W',
};

function UpgradePage({ token, onToken }: { token: string; onToken: (token: string) => void }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [plans, setPlans] = useState<PlanCatalog>(upgradePlanFallbacks);
  const [links, setLinks] = useState<Record<string, string>>(upgradeLinkFallbacks);

  useEffect(() => {
    if (!token) return;
    api(token, '/api/auth/me').then(res => {
      setUser(res.user || null);
      setAccount(res.accounts?.[0] || null);
    }).catch(() => {
      localStorage.removeItem('tqt_token');
      onToken('');
    });
    api(token, '/api/app/settings-schema').then(res => {
      setPlans({ ...upgradePlanFallbacks, ...(res.schema?.plans || {}) });
    }).catch(() => {});
    api(token, '/api/app/billing-links').then(res => {
      setLinks({ ...upgradeLinkFallbacks, ...(res.links || {}) });
    }).catch(() => {});
  }, [token]);

  const currentPlan = String(account?.plan || 'free').toLowerCase();
  const currentStatus = String(account?.billing_status || 'active').toLowerCase();
  const planCards = [
    { key: 'starter', eyebrow: 'Setup', price: 'One-time', cta: plans.starter?.label || 'Starter Setup', link: links.starter },
    { key: 'pro', eyebrow: 'Most popular', price: 'Monthly', cta: plans.pro?.label || 'Pro Add-on', link: links.pro },
    { key: 'agency', eyebrow: 'Scale', price: 'Custom', cta: plans.agency?.label || 'Agency', link: links.agency },
  ];
  const process = [
    ['1', 'Choose the upgrade', 'Signed-in users go to Stripe with their account ID attached.'],
    ['2', 'Pay in Stripe', 'Stripe hosts checkout, card entry, receipts, and subscription billing.'],
    ['3', 'Webhook updates access', 'WARREN receives the Stripe event and marks the account Pro/active.'],
    ['4', 'Features unlock', 'Tracking, webhooks, custom CSS, and map features follow the new plan.'],
  ];

  return (
    <main className="upgrade-shell">
      <nav className="upgrade-nav">
        <a href="/" className="demo-brand">WARREN Quote Tool</a>
        <div>
          <a href="/demo">Demo</a>
          <a href="#plans">Plans</a>
          <a href="#process">Process</a>
        </div>
        {token ? <a className="button-link secondary" href="/">Dashboard</a> : <a className="button-link secondary" href="/">Sign in</a>}
      </nav>

      <section className="upgrade-hero">
        <div>
          <p className="eyebrow">Upgrade experience</p>
          <h1>Upgrade the quote tool without a sales call.</h1>
          <p>Users choose a plan, pay through Stripe, and WARREN unlocks the right Pro features for their account automatically.</p>
          <div className="upgrade-actions">
            {links.pro ? <a className="button-link" href={billingUrl(links.pro, account, user)} target="_blank">Upgrade to Pro</a> : <a className="button-link" href="#plans">View plans</a>}
            <a className="button-link secondary" href="/demo">Preview the product</a>
          </div>
        </div>
        <aside className="upgrade-status-card">
          <span>Current account</span>
          <strong>{account?.name || 'Preview mode'}</strong>
          <em>{token ? `${currentPlan} plan / ${currentStatus}` : 'Sign in to attach checkout to an account.'}</em>
        </aside>
      </section>

      <section className="upgrade-plans" id="plans">
        {planCards.map(card => {
          const isCurrent = currentPlan === card.key;
          const href = card.link ? billingUrl(card.link, account, user) : '';
          return (
            <article className={card.key === 'pro' ? 'upgrade-plan featured' : 'upgrade-plan'} key={card.key}>
              <span>{isCurrent ? 'Current plan' : card.eyebrow}</span>
              <h2>{plans[card.key]?.label || card.cta}</h2>
              <strong>{card.price}</strong>
              <p>{plans[card.key]?.description || ''}</p>
              <ul>
                {(plans[card.key]?.features || []).map(feature => <li key={feature}>{feature}</li>)}
              </ul>
              {href ? <a className="button-link" href={href} target="_blank">{isCurrent ? 'Manage in Stripe' : card.cta}</a> : <button disabled>Link not configured</button>}
            </article>
          );
        })}
      </section>

      <section className="upgrade-process" id="process">
        <div>
          <p className="eyebrow">How it works</p>
          <h2>The handoff is Stripe first, app access second.</h2>
          <p>Checkout is hosted by Stripe. WARREN listens for successful checkout and subscription events, stores the Stripe customer/subscription IDs, and gates features by plan status.</p>
        </div>
        <div className="upgrade-process-grid">
          {process.map(([num, title, copy]) => (
            <div className="upgrade-step" key={title}>
              <b>{num}</b>
              <strong>{title}</strong>
              <span>{copy}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
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
        {mode === 'login' && <a className="auth-demo-link" href="/demo">View interactive demo</a>}
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
        <BillingLinks links={billingLinks} plans={plans} account={currentAccount} user={user} />
        <nav>
          {groups.map(group => <button key={group.title} className={tab === group.title ? 'active' : ''} onClick={() => setTab(group.title)}>{group.title}</button>)}
          <button className={tab === 'Copy' ? 'active' : ''} onClick={() => setTab('Copy')}>Copy</button>
          <button className={tab === 'Embed' ? 'active' : ''} onClick={() => setTab('Embed')}>Embed</button>
          <button className={tab === 'Leads' ? 'active' : ''} onClick={() => setTab('Leads')}>Leads</button>
          <button className={tab === 'Events' ? 'active' : ''} onClick={() => setTab('Events')}>Events</button>
          <button className={tab === 'Help' ? 'active' : ''} onClick={() => setTab('Help')}>Help</button>
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
              {!['Embed', 'Leads', 'Events', 'Help', 'Secrets', 'Admin'].includes(tab) && <button onClick={save}>Save settings</button>}
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
            {tab === 'Help' && <HelpPanel account={currentAccount} widget={widget} embed={embed} leads={leads} events={events} onGoTab={setTab} />}
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

function billingUrl(url: string, account: any, user: CurrentUser | null) {
  if (!url) return '';
  try {
    const next = new URL(url);
    if (next.hostname.includes('stripe.com')) {
      if (user?.email && !next.searchParams.has('prefilled_email')) next.searchParams.set('prefilled_email', user.email);
      if (account?.id && !next.searchParams.has('client_reference_id')) next.searchParams.set('client_reference_id', account.id);
    }
    return next.toString();
  } catch (err) {
    return url;
  }
}

function BillingLinks({ links, plans, account, user }: { links: Record<string, string>; plans: PlanCatalog; account: any; user: CurrentUser | null }) {
  const available = Object.entries(links || {}).filter(([, url]) => !!url);
  if (!available.length) return null;
  const plan = String(account?.plan || 'free').toLowerCase();
  return (
    <div className="panel compact">
      <a className="button-link secondary" href="/upgrade">Compare plans</a>
      {links.starter && plan === 'free' && <a className="button-link secondary" href={billingUrl(links.starter, account, user)} target="_blank">{plans.starter?.label || 'Starter Setup'}</a>}
      {links.pro && plan !== 'pro' && plan !== 'agency' && <a className="button-link" href={billingUrl(links.pro, account, user)} target="_blank">{plans.pro?.label || 'Pro Add-on'}</a>}
      {links.map && plan !== 'pro' && plan !== 'agency' && <a className="button-link secondary" href={billingUrl(links.map, account, user)} target="_blank">Map add-on</a>}
      {links.agency && plan !== 'agency' && <a className="button-link secondary" href={billingUrl(links.agency, account, user)} target="_blank">{plans.agency?.label || 'Agency'}</a>}
      {links.portal && <a className="button-link secondary" href={billingUrl(links.portal, account, user)} target="_blank">Billing Portal</a>}
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

function settingOn(value: any) {
  return [true, 'true', '1', 1, 'yes', 'active', 'enabled'].includes(value);
}

function HelpPanel({ account, widget, embed, leads, events, onGoTab }: { account: any; widget: Widget; embed: string; leads: any[]; events: any[]; onGoTab: (tab: string) => void }) {
  const [query, setQuery] = useState('');
  const [activeTopic, setActiveTopic] = useState('launch');
  const settings = widget.settings || {};
  const entitlements = accountEntitlements(account);
  const pricingSource = String(settings.service_data_source || 'sng');
  const mapEnabled = settingOn(settings.enable_yard_map);
  const managedMapbox = settingOn(settings.use_managed_mapbox_token);
  const hasMapToken = !!String(settings.mapbox_token || '').trim() || managedMapbox;
  const hasManualPricing = !!String(settings.manual_pricing || '').trim();
  const hasLocalAreas = !!String(settings.local_area_values || settings.local_service_areas || settings.service_area_values || '').trim();
  const hasOrg = !!String(settings.org_slug || settings.sng_org_slug || settings.organization || '').trim();
  const leadDestination = String(settings.lead_destination || 'sng');
  const hasLeadEmail = !!String(settings.lead_email_to || settings.notification_email || settings.business_email || '').trim();
  const hasTracking = settingOn(settings.tracking_enabled) || !!String(settings.gtm_id || settings.ga4_measurement_id || settings.meta_pixel_id || '').trim();

  const checks = [
    { key: 'enabled', label: 'Widget is enabled', ok: widget.enabled, action: 'Business', fix: 'Open Business and enable the public widget.' },
    { key: 'pricing', label: 'Pricing source is ready', ok: pricingSource === 'local' ? hasManualPricing : hasOrg, action: 'Pricing', fix: pricingSource === 'local' ? 'Add rows to the manual pricing matrix.' : 'Add your Sweep&Go organization slug, then test pricing.' },
    { key: 'areas', label: 'Service areas are defined', ok: pricingSource === 'sng' || hasLocalAreas, action: 'Pricing', fix: 'For local/manual pricing, add ZIPs or cities that this brand serves.' },
    { key: 'leads', label: 'Lead routing is configured', ok: leadDestination !== 'email' || hasLeadEmail, action: leadDestination === 'email' ? 'Follow Up' : 'Connections', fix: 'Set the email recipient or connect the CRM destination.' },
    { key: 'map', label: 'Yard map can load', ok: !mapEnabled || (entitlements.hasFeature('yardMap', 'yard_map', 'pro') && hasMapToken), action: 'Map', fix: 'Add a Mapbox token, enable managed Mapbox, or turn the map off.' },
    { key: 'tracking', label: 'Tracking is available', ok: hasTracking, action: 'Tracking', fix: 'Add GTM, GA4, Meta Pixel, or turn on developer events.' },
    { key: 'embed', label: 'Embed code is ready', ok: !!widget.public_id && !!embed, action: 'Embed', fix: 'Open Embed and place the snippet on the brand site.' },
  ];

  const healthy = checks.filter(check => check.ok).length;
  const topics = [
    {
      id: 'launch',
      title: 'Launch checklist',
      tag: 'Start',
      summary: 'The fastest path from a draft widget to a live quote flow.',
      tab: 'Business',
      steps: ['Confirm the widget is enabled and the brand name is correct.', 'Set pricing and service areas before sharing the embed.', 'Run one test quote and one test lead from the real page.', 'Check Events after testing to confirm tracking is firing.'],
    },
    {
      id: 'pricing',
      title: 'Pricing setup',
      tag: 'Revenue',
      summary: 'Choose Sweep&Go pricing or local pricing and avoid dead-end quotes.',
      tab: 'Pricing',
      steps: ['Use Sweep&Go when this brand should mirror CRM service data.', 'Use local/manual when you want dashboard-managed ZIPs, dogs, frequencies, and prices.', 'After editing pricing, test the highest dog count and each frequency you sell.', 'Keep one-time and recurring copy aligned with the actual offer.'],
    },
    {
      id: 'map',
      title: 'Yard map troubleshooting',
      tag: 'Map',
      summary: 'Make the draw-your-yard flow reliable before sending traffic to it.',
      tab: 'Map',
      steps: ['Confirm the account has the yard map feature.', 'Use managed Mapbox or paste a public Mapbox token.', 'Test an address in a served ZIP and draw a small yard polygon.', 'If the map is not core to the sale, keep ZIP mode as the fallback.'],
    },
    {
      id: 'leads',
      title: 'Lead routing',
      tag: 'Ops',
      summary: 'Know where quote leads, partial leads, and waitlist requests go.',
      tab: 'Leads',
      steps: ['Open Leads to confirm recent submissions are arriving.', 'Use Follow Up to configure partial lead emails and registration follow-up.', 'Use Connections and Secrets for CRM tokens or webhook credentials.', 'Submit a test lead after changing destination settings.'],
    },
    {
      id: 'embed',
      title: 'Install the widget',
      tag: 'Site',
      summary: 'Place the widget on WordPress, Webflow, custom HTML, or landing pages.',
      tab: 'Embed',
      steps: ['Copy the embed snippet exactly.', 'Paste it once on the page where the quote tool should render.', 'Avoid putting the same widget ID on the same page multiple times.', 'After publishing, test from an incognito window.'],
    },
    {
      id: 'tracking',
      title: 'Tracking and conversion events',
      tag: 'Data',
      summary: 'Send quote, lead, waitlist, coupon, and ZIP events to your analytics stack.',
      tab: 'Tracking',
      steps: ['Use GTM if the website already manages analytics through tags.', 'Use direct GA4 or Meta Pixel only when the site does not use GTM.', 'Events intentionally exclude personal information.', 'Check the Events tab after a live quote test.'],
    },
    {
      id: 'secrets',
      title: 'Private credentials',
      tag: 'Security',
      summary: 'Keep API tokens private while still connecting each brand to outside tools.',
      tab: 'Secrets',
      steps: ['Paste API keys only into Secrets, never public copy fields.', 'Use the Sweep&Go test button after saving a token.', 'Rotate a secret any time a credential is shared outside the team.', 'Public embeds never receive the encrypted secret value.'],
    },
  ];
  const filteredTopics = topics.filter(topic => {
    const haystack = `${topic.title} ${topic.tag} ${topic.summary} ${topic.steps.join(' ')}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const selected = topics.find(topic => topic.id === activeTopic) || topics[0];
  const recentEventNames = Array.from(new Set((events || []).slice(0, 8).map(row => String(row.event || row.type || 'event')))).slice(0, 5);

  return (
    <div className="help-shell">
      <section className="help-hero">
        <div>
          <p className="eyebrow">Brand help center</p>
          <h2>{account?.name || widget.name}</h2>
          <p>Use this as the operating console for setup, QA, and troubleshooting. It reads the active brand settings and points you to the exact dashboard area to fix gaps.</p>
        </div>
        <div className="help-score">
          <strong>{healthy}/{checks.length}</strong>
          <span>launch checks passing</span>
        </div>
      </section>

      <section className="help-checklist">
        {checks.map(check => (
          <button key={check.key} className={`help-check ${check.ok ? 'ok' : 'warn'}`} onClick={() => onGoTab(check.action)}>
            <span>{check.ok ? 'Ready' : 'Needs work'}</span>
            <strong>{check.label}</strong>
            <em>{check.ok ? `Open ${check.action}` : check.fix}</em>
          </button>
        ))}
      </section>

      <section className="help-layout">
        <div className="help-card">
          <div className="help-card-head">
            <div>
              <h3>Find help fast</h3>
              <p>Search by workflow, feature, or problem.</p>
            </div>
          </div>
          <input className="help-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search pricing, map, leads, embed..." />
          <div className="help-topic-list">
            {filteredTopics.map(topic => (
              <button key={topic.id} className={`help-topic ${selected.id === topic.id ? 'active' : ''}`} onClick={() => setActiveTopic(topic.id)}>
                <span>{topic.tag}</span>
                <strong>{topic.title}</strong>
                <em>{topic.summary}</em>
              </button>
            ))}
            {!filteredTopics.length && <div className="help-empty">No topics matched that search.</div>}
          </div>
        </div>

        <div className="help-card help-guide">
          <div className="help-card-head">
            <div>
              <h3>{selected.title}</h3>
              <p>{selected.summary}</p>
            </div>
            <button className="secondary" onClick={() => onGoTab(selected.tab)}>Open {selected.tab}</button>
          </div>
          <div className="help-steps">
            {selected.steps.map((step, index) => (
              <div key={step} className="help-step">
                <b>{index + 1}</b>
                <span>{step}</span>
              </div>
            ))}
          </div>
          {selected.id === 'embed' && <textarea className="help-code" readOnly rows={4} value={embed} onFocus={e => e.currentTarget.select()} />}
          <div className="help-actions">
            <button onClick={() => onGoTab('Pricing')}>Open Pricing</button>
            <button className="secondary" onClick={() => onGoTab('Embed')}>Copy Embed</button>
            <button className="secondary" onClick={() => onGoTab('Leads')}>Review Leads</button>
            <button className="secondary" onClick={() => onGoTab('Events')}>Check Events</button>
          </div>
        </div>

        <div className="help-card">
          <div className="help-card-head">
            <div>
              <h3>Live brand snapshot</h3>
              <p>Useful context before debugging a customer report.</p>
            </div>
          </div>
          <div className="help-snapshot">
            <span><strong>Plan</strong>{account?.plan || 'free'} / {account?.billing_status || 'active'}</span>
            <span><strong>Pricing</strong>{pricingSource === 'local' ? 'Local/manual' : 'Sweep&Go'}</span>
            <span><strong>Map</strong>{mapEnabled ? (hasMapToken ? 'Enabled' : 'Missing token') : 'Off'}</span>
            <span><strong>Leads</strong>{(leads || []).length} saved</span>
            <span><strong>Events</strong>{(events || []).length} logged</span>
            <span><strong>Phone gate</strong>{settingOn(settings.require_phone_before_quote) ? 'Required' : 'Optional'}</span>
          </div>
          <div className="help-pill-row">
            {recentEventNames.length ? recentEventNames.map(name => <span key={name}>{name}</span>) : <span>No recent events yet</span>}
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminPanel({ token }: { token: string }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = async () => {
    setError('');
    const res = await api(token, '/api/app/admin/accounts');
    const nextAccounts = res.accounts || [];
    setAccounts(nextAccounts);
    setSelectedAccountId(current => {
      if (current && nextAccounts.some((account: any) => account.id === current)) return current;
      return nextAccounts[0]?.id || '';
    });
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

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter(account => {
      const members = Array.isArray(account.members) ? account.members : [];
      const widgets = Array.isArray(account.widgets) ? account.widgets : [];
      const haystack = [
        account.name,
        account.id,
        account.plan,
        account.billing_status,
        account.stripe_customer_id,
        account.stripe_subscription_id,
        ...members.map((member: any) => member.email),
        ...widgets.map((widget: any) => widget.public_id),
      ].filter(Boolean).join(' ').toLowerCase();
      const planOk = planFilter === 'all' || String(account.plan || 'free') === planFilter;
      const statusOk = statusFilter === 'all' || String(account.billing_status || 'active') === statusFilter;
      return planOk && statusOk && (!q || haystack.includes(q));
    });
  }, [accounts, search, planFilter, statusFilter]);

  const selectedAccount = accounts.find(account => account.id === selectedAccountId) || filteredAccounts[0] || accounts[0] || null;
  const totals = useMemo(() => ({
    brands: accounts.length,
    active: accounts.filter(account => !['canceled', 'past_due', 'unpaid', 'inactive'].includes(String(account.billing_status || 'active'))).length,
    leads: accounts.reduce((sum, account) => sum + (Number(account.lead_count) || 0), 0),
    widgets: accounts.reduce((sum, account) => sum + (Array.isArray(account.widgets) ? account.widgets.length : 0), 0),
    mapAddons: accounts.filter(account => [true, 'true', 'active', 1].includes((account.addons || {}).yard_map)).length,
  }), [accounts]);

  return (
    <>
      <header>
        <div>
          <h1>Admin</h1>
          <p>Find brands fast, inspect setup health, and adjust plans, billing state, and add-ons from one place.</p>
        </div>
        <button className="secondary" onClick={() => load().catch((err: any) => setError(err.message || 'Could not refresh accounts.'))}>Refresh</button>
      </header>
      {status && <div className="status">{status}</div>}
      {error && <div className="error">{error}</div>}
      <div className="admin-overview">
        <DemoMetric label="Brands" value={String(totals.brands)} />
        <DemoMetric label="Active" value={String(totals.active)} />
        <DemoMetric label="Leads" value={String(totals.leads)} />
        <DemoMetric label="Widgets" value={String(totals.widgets)} />
        <DemoMetric label="Map add-ons" value={String(totals.mapAddons)} />
      </div>
      <div className="admin-toolbar">
        <label><span>Search brands</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Brand, email, widget, Stripe ID" /></label>
        <label><span>Plan</span><select value={planFilter} onChange={e => setPlanFilter(e.target.value)}><option value="all">All plans</option><option value="free">Free</option><option value="starter">Starter</option><option value="pro">Pro</option><option value="agency">Agency</option></select></label>
        <label><span>Billing</span><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="past_due">Past due</option><option value="canceled">Canceled</option><option value="unpaid">Unpaid</option><option value="inactive">Inactive</option></select></label>
      </div>
      <div className="admin-dashboard-layout">
        <section className="admin-brand-list" aria-label="Brands">
          <div className="admin-list-head"><strong>Brands</strong><span>{filteredAccounts.length} shown</span></div>
          {!filteredAccounts.length && <div className="admin-empty">No brands match those filters.</div>}
          {filteredAccounts.map(account => {
            const members = Array.isArray(account.members) ? account.members : [];
            const widgets = Array.isArray(account.widgets) ? account.widgets : [];
            return (
              <button key={account.id} type="button" className={account.id === selectedAccount?.id ? 'admin-brand-row active' : 'admin-brand-row'} onClick={() => setSelectedAccountId(account.id)}>
                <span>
                  <strong>{account.name}</strong>
                  <em>{members[0]?.email || 'No owner email'} | {widgets[0]?.public_id || 'No widget'}</em>
                </span>
                <span>
                  <b>{account.plan || 'free'}</b>
                  <em>{account.lead_count || 0} leads</em>
                </span>
              </button>
            );
          })}
        </section>
        <section className="admin-detail">
          {selectedAccount ? (
            <>
              <AdminAccountSummary account={selectedAccount} />
              <AdminAccountCard account={selectedAccount} onSave={payload => saveAccount(selectedAccount, payload)} />
            </>
          ) : (
            <div className="admin-empty">Select a brand to manage it.</div>
          )}
        </section>
      </div>
    </>
  );
}

function AdminAccountSummary({ account }: { account: any }) {
  const members = Array.isArray(account.members) ? account.members : [];
  const widgets = Array.isArray(account.widgets) ? account.widgets : [];
  const addons = account.addons || {};
  const checks = [
    { label: 'Owner/member', ok: members.length > 0 },
    { label: 'Public widget', ok: widgets.length > 0 },
    { label: 'Stripe customer', ok: !!account.stripe_customer_id },
    { label: 'Stripe subscription', ok: !!account.stripe_subscription_id },
    { label: 'Yard map', ok: [true, 'true', 'active', 1].includes(addons.yard_map) },
    { label: 'Managed Mapbox', ok: [true, 'true', 'active', 1].includes(addons.managed_mapbox) },
  ];
  return (
    <div className="admin-summary-card">
      <div>
        <h2>{account.name}</h2>
        <p><code>{account.id}</code></p>
      </div>
      <div className="admin-check-grid">
        {checks.map(check => <span key={check.label} className={check.ok ? 'ok' : ''}>{check.label}</span>)}
      </div>
    </div>
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
