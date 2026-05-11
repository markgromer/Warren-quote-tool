export const widgetScript = String.raw`
(function(){
  var script = document.currentScript;
  var demoMode = !!(script && (script.getAttribute('data-demo') === '1' || script.dataset.demo === '1'));
  var widgetId = script && (script.getAttribute('data-widget-id') || script.dataset.widgetId);
  if (!widgetId && !demoMode) { console.error('WARREN Quote Tool: missing data-widget-id'); return; }
  if (!widgetId) widgetId = 'demo';
  var apiBase = (script && script.getAttribute('data-api-base')) || new URL(script.src).origin;
  var mountSelector = (script && script.getAttribute('data-mount')) || '#tqt-widget';
  var mount = document.querySelector(mountSelector) || document.createElement('div');
  if (!mount.parentNode) script.parentNode.insertBefore(mount, script);
  mount.className = 'tqt-hosted-widget';

  function money(n){ return '$' + (Number(n)||0).toFixed(2); }
  function digits(v){ return String(v||'').replace(/\D/g,'').slice(0,10); }
  function parseResponse(r){
    return r.text().then(function(text){
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch(e) { data = { ok:false, error:text || ('HTTP ' + r.status) }; }
      if (!r.ok && data && data.ok !== false) data.ok = false;
      if (!r.ok && data && !data.error) data.error = 'HTTP ' + r.status;
      return data;
    });
  }
  function post(path, body){ return demoMode ? Promise.resolve(demoPost(path, body || {})) : fetch(apiBase + '/public/widgets/' + widgetId + '/' + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{}) }).then(parseResponse); }
  function get(path){ return demoMode ? Promise.resolve(demoGet(path)) : fetch(apiBase + '/public/widgets/' + widgetId + '/' + path).then(parseResponse); }
  function trackingSettings(){ return state.cfg && state.cfg.settings ? state.cfg.settings : {}; }
  function cleanEventDetail(detail){
    var out = {};
    detail = detail || {};
    Object.keys(detail).forEach(function(k){
      if (/email|phone|street|first_name|last_name/i.test(k)) return;
      var v = detail[k];
      if (v === undefined || typeof v === 'function') return;
      if (v && typeof v === 'object') {
        out[k] = Array.isArray(v) ? v.slice(0, 30) : '[object]';
      } else {
        out[k] = v;
      }
    });
    return out;
  }
  function customEventName(base){
    var s = trackingSettings();
    var prefix = s.event_prefix == null ? 'tqt_' : String(s.event_prefix);
    var key = String(base || '').replace(/^tqt_/, '');
    var mapped = '';
    try {
      var map = s.custom_event_map ? JSON.parse(s.custom_event_map) : {};
      mapped = map[key] || map[prefix + key] || '';
    } catch(e) {}
    return mapped || (prefix + key);
  }
  function ensureGtag(){
    var s = trackingSettings();
    if (!s.ga4_enabled || !s.google_tag_id) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function(){ window.dataLayer.push(arguments); };
    if (!document.querySelector('script[data-tqt-ga4="'+s.google_tag_id+'"]')) {
      var tag = document.createElement('script');
      tag.async = true;
      tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(s.google_tag_id);
      tag.setAttribute('data-tqt-ga4', s.google_tag_id);
      document.head.appendChild(tag);
      window.gtag('js', new Date());
      window.gtag('config', s.google_tag_id);
    }
  }
  function ensureGtm(){
    var s = trackingSettings();
    if (!s.google_tag_manager_id || document.querySelector('script[data-tqt-gtm="'+s.google_tag_manager_id+'"]')) return;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(s.google_tag_manager_id);
    tag.setAttribute('data-tqt-gtm', s.google_tag_manager_id);
    document.head.appendChild(tag);
  }
  function ensureMetaPixel(){
    var s = trackingSettings();
    if (!s.meta_pixel_enabled || !s.meta_pixel_id || window.fbq) return;
    window.fbq = function(){ window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments); };
    window.fbq.queue = [];
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(tag);
    window.fbq('init', s.meta_pixel_id);
    window.fbq('track', 'PageView');
  }
  function initTracking(){
    var s = trackingSettings();
    if (!s.tracking_enabled) return;
    ensureGtm();
    ensureGtag();
    ensureMetaPixel();
  }
  function emitEvent(base, detail){
    var s = trackingSettings();
    if (!s.tracking_enabled) return;
    var name = customEventName(base);
    var payload = cleanEventDetail(Object.assign({
      widget_id: widgetId,
      page: location.href,
      path: location.pathname
    }, detail || {}));
    if (s.data_layer_enabled) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, payload));
    }
    if (s.ga4_enabled && typeof window.gtag === 'function') {
      window.gtag('event', name, payload);
      if (s.google_ads_conversion_id && ((base === 'lead_submitted' && s.google_ads_lead_label) || (base === 'quote_displayed' && s.google_ads_quote_label))) {
        var label = base === 'lead_submitted' ? s.google_ads_lead_label : s.google_ads_quote_label;
        window.gtag('event', 'conversion', { send_to: s.google_ads_conversion_id + '/' + label, value: payload.value || undefined, currency: 'USD' });
      }
    }
    if (s.dom_events_enabled) {
      try { mount.dispatchEvent(new CustomEvent(name, { detail: payload, bubbles: true })); } catch(e) {}
    }
    if (s.meta_pixel_enabled && typeof window.fbq === 'function') {
      if (base === 'quote_displayed') window.fbq('track', 'ViewContent', { content_name: 'WARREN Quote Tool Quote', content_category: 'quote', value: payload.value, currency: 'USD' });
      if (base === 'lead_submitted' || base === 'waitlist_submitted') window.fbq('track', 'Lead', { content_name: 'WARREN Quote Tool Lead', content_category: base === 'waitlist_submitted' ? 'waitlist' : 'lead', value: payload.value, currency: 'USD' });
      window.fbq('trackCustom', name, payload);
    }
    if (s.developer_events_enabled) {
      post('event', { event: name, detail: payload, page: location.href }).catch(function(){});
    }
  }
  function normFreq(v){ return String(v||'once_a_week').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
  function extractPrice(res){
    var p = res && (res.price || res.quote || res);
    var per = p && first(p.price_per_cleanup, p.per_cleanup, p.pricePerCleanup, p.display_price);
    var monthly = p && first(p.monthly_price, p.monthlyPrice, p.monthly_total, p.value);
    return { per: per == null ? null : Number(per), monthly: monthly == null ? null : Number(monthly) };
  }
  function first(){
    for (var i=0;i<arguments.length;i++) if (arguments[i] != null) return arguments[i];
    return null;
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function hasOption(list, value){
    return list.some(function(item){
      var v = (item && typeof item === 'object') ? item.value : item;
      return String(v) === String(value);
    });
  }
  function optionValue(item){ return (item && typeof item === 'object') ? item.value : item; }
  function optionLabel(item){
    if (item && typeof item === 'object') return item.label || item.value;
    return String(item == null ? '' : item).replace(/_/g,' ');
  }
  function yardLabel(sqft){
    var n = Number(sqft || 0);
    if (!n) return '';
    if (n <= 5445) return 'Up to 1/8 acre';
    if (n <= 10890) return 'Up to 1/4 acre';
    if (n <= 21780) return 'Up to 1/2 acre';
    if (n <= 43560) return 'Up to 1 acre';
    return 'Over 1 acre';
  }
  function loadScript(src){
    return new Promise(function(resolve, reject){
      var existing = document.querySelector('script[src="'+src+'"]');
      if (existing) {
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function(){ s.dataset.loaded = '1'; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function loadCss(href){
    if (document.querySelector('link[href="'+href+'"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    document.head.appendChild(l);
  }
  function demoFrequencies(){
    return [
      { value:'once_a_week', label:'Weekly' },
      { value:'bi_weekly', label:'Every other week' },
      { value:'once_a_month', label:'Monthly' },
      { value:'one_time', label:'One-time clean' }
    ];
  }
  function demoCopy(){
    return {
      cta_check_area:'CHECK MY AREA',
      cta_show_price:'SHOW PRICE',
      cta_signup:'SIGN UP',
      zip_input_placeholder:'ZIP code',
      waitlist_copy:'This sample ZIP is outside the demo service area. Drop a test email to see the waitlist step.',
      waitlist_input_placeholder:'Email address',
      waitlist_button:'NOTIFY ME',
      onboard_first_name_placeholder:'First name',
      onboard_last_name_placeholder:'Last name',
      onboard_email_placeholder:'Email',
      onboard_phone_placeholder:'Phone',
      onboard_street_placeholder:'Home address',
      onboard_city_placeholder:'City',
      onboard_state_placeholder:'State',
      onboard_cancel_button:'Cancel',
      onboard_submit_button:'REGISTER',
      success_title:'Demo complete',
      success_body:'This simulated signup did not send customer data or connect to a CRM.',
      credit_card_link_success:''
    };
  }
  function demoOverrides(){
    try {
      if (!script || !script.dataset.demoConfig) return {};
      var parsed = JSON.parse(script.dataset.demoConfig);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch(e) {
      return {};
    }
  }
  function demoConfig(){
    var cfg = {
      ok:true,
      widgetId:'demo',
      enabled:true,
      account:{ plan:'demo', billing_status:'active', addons:{} },
      settings:{
        service_data_source:'local',
        widget_title:'Get an Instant Quote',
        hint_text:'Try ZIP 85001, 85018, or 85251.',
        panel_bg:'#f6f8f7',
        panel_transparent:false,
        panel_border:'#17212b',
        text:'#17212b',
        muted:'#667684',
        cta:'#1167d8',
        cta_text_color:'#ffffff',
        radius:'12',
        body_font_family:'ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif',
        title_font_family:'ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif',
        title_font_size:'22',
        title_align:'left',
        price_font_size:'34',
        price_font_weight:'900',
        price_label_font_size:'12',
        price_label_font_weight:'700',
        price_companion_font_size:'13',
        price_companion_font_weight:'600',
        cta_font_size:'18',
        cta_font_weight:'900',
        show_per_cleanup_price:true,
        require_phone_before_quote:true,
        show_last_cleaned:true,
        enable_yard_map:false,
        tracking_enabled:false,
        developer_events_enabled:false,
        send_credit_card_link_after_registration:false
      },
      copy:demoCopy(),
      options:{
        dogDefaults:[1,2,3,4,5],
        frequencyDefaults:demoFrequencies(),
        areaOptions:[
          { value:'85001', label:'Phoenix, AZ' },
          { value:'85018', label:'Arcadia, AZ' },
          { value:'85251', label:'Scottsdale, AZ' },
          { value:'99999', label:'Outside service area' }
        ]
      }
    };
    var overrides = demoOverrides();
    if (overrides.settings && typeof overrides.settings === 'object') {
      cfg.settings = Object.assign({}, cfg.settings, overrides.settings);
    }
    if (overrides.copy && typeof overrides.copy === 'object') {
      cfg.copy = Object.assign({}, cfg.copy, overrides.copy);
    }
    if (overrides.options && typeof overrides.options === 'object') {
      cfg.options = Object.assign({}, cfg.options, overrides.options);
    }
    return cfg;
  }
  function demoOptions(){
    return {
      ok:true,
      local_data:true,
      dogs:[1,2,3,4,5],
      frequencies_meta:demoFrequencies(),
      last_times:[
        { value:'one_week', label:'Within a week' },
        { value:'two_weeks', label:'About two weeks' },
        { value:'one_month', label:'A month or more' }
      ],
      area_options:demoConfig().options.areaOptions
    };
  }
  function demoPost(path, body){
    if (path === 'event') return { ok:true, skipped:true, demo:true };
    if (path === 'waitlist') return { ok:true, demo:true };
    if (path === 'onboard') return { ok:true, destination:'demo' };
    if (path !== 'price' && path !== 'local_price') return { ok:true, demo:true };
    var zip = String(body.zip || body.zip_code || '').trim();
    if (zip === '99999') return { ok:true, waitlist:true };
    var dog = Math.max(1, Number(body.number_of_dogs || body.dogs || 1));
    var freq = normFreq(body.clean_up_frequency || body.frequency || 'once_a_week');
    var settings = state.cfg && state.cfg.settings ? state.cfg.settings : {};
    var configuredBase = {
      once_a_week: Number(settings.demo_weekly_price),
      bi_weekly: Number(settings.demo_biweekly_price),
      once_a_month: Number(settings.demo_monthly_price),
      one_time: Number(settings.demo_onetime_price)
    };
    var baseFallback = { once_a_week:18, bi_weekly:24, once_a_month:34, one_time:79 }[freq] || 24;
    var base = (isFinite(configuredBase[freq]) && configuredBase[freq] > 0) ? configuredBase[freq] : baseFallback;
    var extraDog = Number(settings.demo_extra_dog_price);
    if (!isFinite(extraDog) || extraDog < 0) extraDog = freq === 'one_time' ? 12 : 4;
    var per = base + Math.max(0, dog - 1) * (freq === 'one_time' ? Math.max(extraDog, 8) : extraDog);
    var profile = String(settings.demo_price_profile || 'balanced');
    var multiplier = profile === 'budget' ? 0.85 : (profile === 'premium' ? 1.25 : 1);
    var last = String(body.last_time_yard_was_thoroughly_cleaned || '');
    if (last === 'two_weeks') per += 4;
    if (last === 'one_month') per += 10;
    var sqft = Number(body.yard_sqft || 0);
    var yardLabel = '';
    if (sqft > 10890) { per += 12; yardLabel = 'Adjusted for a larger sample yard.'; }
    per = Math.round(per * multiplier);
    var visits = { once_a_week:52/12, bi_weekly:0.5*(52/12), once_a_month:0.25*(52/12) }[freq] || 0;
    return {
      ok:true,
      price:{
        price_per_cleanup:per,
        monthly_price:visits ? per * visits : null
      },
      yard_size_label:yardLabel,
      demo:true
    };
  }
  function demoGet(path){
    if (path === 'config') return demoConfig();
    if (path.indexOf('options') === 0) return demoOptions();
    if (path === 'addons') return { ok:true, addons:[] };
    return { ok:true, demo:true };
  }

  var style = document.createElement('style');
  style.textContent = '.tqt-hosted-widget{font-family:var(--tqt-body-font,ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif);max-width:760px;margin:0 auto;color:var(--tqt-ink,#263238)}.tqt-hosted-card{background:var(--tqt-panel,#e7e2d9);border:3px solid var(--tqt-border,#000);border-radius:var(--tqt-radius,16px);padding:16px}.tqt-hosted-title{font-family:var(--tqt-title-font,var(--tqt-body-font,ui-sans-serif,system-ui,sans-serif));font-size:var(--tqt-title-size,22px);font-weight:900;text-align:var(--tqt-title-align,left);margin:0 0 10px}.tqt-hosted-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:8px}.tqt-hosted-field{grid-column:span 12}.tqt-hosted-field.half{grid-column:span 6}.tqt-hosted-input,.tqt-hosted-select{width:100%;height:44px;border:1px solid #d9e3e7;border-radius:12px;padding:10px 12px;font-size:15px;background:#fff}.tqt-hosted-btn{height:46px;border:0;border-radius:14px;padding:0 18px;background:var(--tqt-cta,#1f86ea);color:var(--tqt-cta-text,#fff);font-size:var(--tqt-cta-size,18px);font-weight:var(--tqt-cta-weight,900);cursor:pointer}.tqt-hosted-btn:disabled{opacity:.55;cursor:not-allowed}.tqt-hosted-map-secondary{background:#eef2f5;color:#17212b}.tqt-hosted-bar{margin-top:12px;padding:14px;border:3px solid var(--tqt-border,#000);border-radius:var(--tqt-radius,16px);background:var(--tqt-panel,#e7e2d9);display:flex;align-items:center;justify-content:space-between;gap:12px}.tqt-hosted-has-price .tqt-hosted-bar{flex-direction:column;text-align:center}.tqt-hosted-price{font-size:var(--tqt-price-size,32px);font-weight:var(--tqt-price-weight,900)}.tqt-hosted-price-label{font-size:var(--tqt-price-label-size,12px);font-weight:var(--tqt-price-label-weight,400);color:var(--tqt-muted,#6b7b83);margin-top:6px}.tqt-hosted-price-companion{font-size:var(--tqt-price-companion-size,12px);font-weight:var(--tqt-price-companion-weight,400);color:var(--tqt-muted,#6b7b83);margin-top:6px}.tqt-hosted-has-price .tqt-hosted-btn{min-height:58px;width:min(100%,340px);font-size:var(--tqt-cta-size,22px)}.tqt-hosted-note,.tqt-hosted-hint{font-size:12px;color:var(--tqt-muted,#6b7b83);margin-top:6px}.tqt-hosted-form{margin-top:12px}.tqt-hosted-success{padding:18px;text-align:center;font-weight:800}.tqt-hosted-waitlist{margin-top:12px}.tqt-hosted-row{display:flex;gap:8px;margin-top:8px}.tqt-hosted-row .tqt-hosted-input{flex:1}.tqt-hosted-map-disclaimer{grid-column:span 12;font-size:12px;line-height:1.35;color:var(--tqt-muted,#6b7b83);padding:2px 2px 0}.tqt-hosted-map-link{border:0;background:transparent;color:var(--tqt-cta,#1f86ea);font:inherit;font-weight:800;text-decoration:underline;cursor:pointer;padding:0}.tqt-hosted-map-wrap{grid-column:span 12;border:1px solid #d9e3e7;border-radius:12px;background:#fff;padding:10px}.tqt-hosted-map{height:280px;border-radius:10px;overflow:hidden;margin-top:8px}.tqt-hosted-map-actions{display:flex;gap:8px}.tqt-hosted-map-actions .tqt-hosted-input{flex:1}.tqt-hosted-map-tools{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}.tqt-hosted-map-tools .tqt-hosted-btn{height:38px;font-size:13px}.tqt-hosted-map-meta{font-size:12px;color:var(--tqt-muted,#6b7b83);margin-top:8px}.tqt-hosted-map-error{color:#b42318}@media(max-width:560px){.tqt-hosted-field.half{grid-column:span 12}.tqt-hosted-bar{align-items:stretch}.tqt-hosted-row,.tqt-hosted-map-actions{flex-direction:column}}';
  document.head.appendChild(style);

  var state = {
    cfg:null,
    price:null,
    options:null,
    selection:{ zip:'', dogs:'', frequency:'', last_time_yard_was_thoroughly_cleaned:'one_week', phone:'', yard_sqft:'', yard_address:'', yard_geojson:null },
    mapOpen:false,
    loading:false
  };

  function getDogs(){
    var liveDogs = state.options && Array.isArray(state.options.dogs) && state.options.dogs.length ? state.options.dogs : null;
    var configuredDogs = state.cfg.options && state.cfg.options.dogDefaults && state.cfg.options.dogDefaults.length ? state.cfg.options.dogDefaults : null;
    var merged = [];
    [liveDogs, configuredDogs, [1,2,3,4]].forEach(function(list){
      (list || []).forEach(function(value){
        var n = Number(value);
        if (isFinite(n) && n > 0 && merged.indexOf(n) < 0) merged.push(n);
      });
    });
    return merged.sort(function(a,b){ return a-b; });
  }

  function getFreqs(){
    var liveFreqs = state.options && Array.isArray(state.options.frequencies_meta) && state.options.frequencies_meta.length ? state.options.frequencies_meta : null;
    if (!liveFreqs && state.options && Array.isArray(state.options.frequencies) && state.options.frequencies.length) liveFreqs = state.options.frequencies;
    return liveFreqs || (state.cfg.options && state.cfg.options.frequencyDefaults && state.cfg.options.frequencyDefaults.length ? state.cfg.options.frequencyDefaults : null) || [{value:'once_a_week',label:'Weekly'}];
  }

  function getLastTimes(){
    return state.options && Array.isArray(state.options.last_times) && state.options.last_times.length ? state.options.last_times : [
      { value:'one_week', label:'One Week' },
      { value:'two_weeks', label:'Two Weeks' },
      { value:'one_month', label:'One Month' }
    ];
  }

  function syncSelection(form){
    if (!form) return;
    var fd = new FormData(form);
    state.selection.zip = String(fd.get('zip') || '').trim();
    state.selection.dogs = String(fd.get('dogs') || '');
    state.selection.frequency = normFreq(fd.get('frequency'));
    state.selection.last_time_yard_was_thoroughly_cleaned = String(fd.get('last_time_yard_was_thoroughly_cleaned') || 'one_week');
    state.selection.phone = digits(fd.get('phone'));
    state.selection.yard_sqft = String(fd.get('yard_sqft') || state.selection.yard_sqft || '').replace(/\D/g,'');
    state.selection.yard_address = String(fd.get('yard_address') || state.selection.yard_address || '').trim();
  }

  function quotePayload(){
    return {
      zip: state.selection.zip,
      zip_code: state.selection.zip,
      dogs: state.selection.dogs,
      frequency: normFreq(state.selection.frequency),
      number_of_dogs: Number(state.selection.dogs),
      clean_up_frequency: normFreq(state.selection.frequency),
      last_time_yard_was_thoroughly_cleaned: state.selection.last_time_yard_was_thoroughly_cleaned || 'one_week',
      phone: state.selection.phone,
      lead_phone: state.selection.phone,
      yard_sqft: state.selection.yard_sqft,
      yard_address: state.selection.yard_address
    };
  }

  function render(){
    var cfg = state.cfg;
    var s = cfg.settings;
    var c = cfg.copy;
    var areaOptions = (cfg.options && cfg.options.areaOptions) || [];
    var dogOptions = getDogs();
    var freqs = getFreqs();
    var lastTimes = getLastTimes();
    if (state.selection.dogs && !hasOption(dogOptions, state.selection.dogs)) state.selection.dogs = '';
    if (state.selection.frequency && !hasOption(freqs, state.selection.frequency)) state.selection.frequency = '';
    if (!state.selection.last_time_yard_was_thoroughly_cleaned || !hasOption(lastTimes, state.selection.last_time_yard_was_thoroughly_cleaned)) state.selection.last_time_yard_was_thoroughly_cleaned = optionValue(lastTimes[0]);
    var hasPrice = !!state.price;

    mount.style.setProperty('--tqt-panel', s.panel_transparent ? 'transparent' : s.panel_bg);
    mount.style.setProperty('--tqt-border', s.panel_border);
    mount.style.setProperty('--tqt-ink', s.text);
    mount.style.setProperty('--tqt-muted', s.muted);
    mount.style.setProperty('--tqt-cta', s.cta);
    mount.style.setProperty('--tqt-cta-text', s.cta_text_color);
    mount.style.setProperty('--tqt-radius', (s.radius || 16) + 'px');
    mount.style.setProperty('--tqt-body-font', s.body_font_family || 'ui-sans-serif, system-ui, sans-serif');
    mount.style.setProperty('--tqt-title-font', s.title_font_family || s.heading_font_family || s.body_font_family || 'ui-sans-serif, system-ui, sans-serif');
    mount.style.setProperty('--tqt-title-size', (s.title_font_size || 22) + 'px');
    mount.style.setProperty('--tqt-title-align', s.title_align || 'left');
    mount.style.setProperty('--tqt-price-size', (s.price_font_size || 32) + 'px');
    mount.style.setProperty('--tqt-price-weight', String(s.price_font_weight || 900));
    mount.style.setProperty('--tqt-price-label-size', (s.price_label_font_size || 12) + 'px');
    mount.style.setProperty('--tqt-price-label-weight', String(s.price_label_font_weight || 400));
    mount.style.setProperty('--tqt-price-companion-size', (s.price_companion_font_size || 12) + 'px');
    mount.style.setProperty('--tqt-price-companion-weight', String(s.price_companion_font_weight || 400));
    mount.style.setProperty('--tqt-cta-size', (s.cta_font_size || 18) + 'px');
    mount.style.setProperty('--tqt-cta-weight', String(s.cta_font_weight || 900));
    mount.classList.toggle('tqt-hosted-has-price', hasPrice);

    var title = s.widget_title || 'Get an Instant Quote';
    var shownPrice = hasPrice ? (s.show_per_cleanup_price ? first(state.price.per, state.price.monthly) : first(state.price.monthly, state.price.per)) : null;
    var priceNote = s.show_per_cleanup_price ? 'PER VISIT PRICE' : 'MONTHLY PRICE';
    var companion = '';
    if (hasPrice && s.show_per_cleanup_price && state.price.monthly != null) companion = '<div class="tqt-hosted-price-companion">'+money(state.price.monthly)+' per month</div>';
    if (hasPrice && !s.show_per_cleanup_price && state.price.per != null) companion = '<div class="tqt-hosted-price-companion">'+money(state.price.per)+' per visit</div>';
    if (hasPrice && state.price.yard_size_label) companion += '<div class="tqt-hosted-note">'+esc(state.price.yard_size_label)+'</div>';
    var priceHtml = hasPrice ? '<div class="tqt-hosted-price-label">'+esc(priceNote)+'</div><div class="tqt-hosted-price">'+money(shownPrice)+'</div>'+companion : '<div class="tqt-hosted-price-label">Ready for your price?</div><div class="tqt-hosted-price">$--</div>';
    var areaField = s.service_data_source === 'local' && areaOptions.length
      ? '<select name="zip" class="tqt-hosted-select">'+areaOptions.map(function(o){ return '<option value="'+esc(o.value)+'"'+(String(o.value)===String(state.selection.zip)?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('')+'</select>'
      : '<input name="zip" class="tqt-hosted-input" placeholder="'+esc(c.zip_input_placeholder || 'ZIP code')+'" maxlength="5" value="'+esc(state.selection.zip)+'">';
    var dogHtml = '<option value="" disabled'+(!state.selection.dogs?' selected':'')+'>Number of dogs</option>' + dogOptions.map(function(d){ return '<option value="'+esc(d)+'"'+(String(d)===String(state.selection.dogs)?' selected':'')+'>'+esc(d)+' dog'+(Number(d)===1?'':'s')+'</option>'; }).join('');
    var freqHtml = '<option value="" disabled'+(!state.selection.frequency?' selected':'')+'>Frequency</option>' + freqs.map(function(f){ var value=normFreq(optionValue(f)); return '<option value="'+esc(value)+'"'+(value===state.selection.frequency?' selected':'')+'>'+esc(optionLabel(f))+'</option>'; }).join('');
    var requirePhone = !!(s.require_phone_before_quote || s.zip_require_phone_before_quote);
    var showLastCleaned = !!(s.show_last_cleaned || s.zip_show_last_cleaned);
    var showMap = !!(s.enable_yard_map && s.mapbox_token);
    var mapOpen = showMap && (state.mapOpen || !!state.selection.yard_sqft || !!state.selection.yard_geojson);
    var lastHtml = showLastCleaned ? '<div class="tqt-hosted-field"><select name="last_time_yard_was_thoroughly_cleaned" class="tqt-hosted-select">'+lastTimes.map(function(o){ return '<option value="'+esc(o.value)+'"'+(String(o.value)===String(state.selection.last_time_yard_was_thoroughly_cleaned)?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('')+'</select></div>' : '';
    var phoneHtml = requirePhone ? '<div class="tqt-hosted-field"><input name="phone" class="tqt-hosted-input" inputmode="tel" placeholder="'+esc(c.onboard_phone_placeholder || 'Phone')+'" value="'+esc(state.selection.phone)+'"></div>' : '';
    var mapHtml = showMap ? (mapOpen
      ? '<div class="tqt-hosted-map-wrap"><div class="tqt-hosted-map-actions"><input name="yard_address" class="tqt-hosted-input" placeholder="Property address" value="'+esc(state.selection.yard_address)+'"><button type="button" class="tqt-hosted-btn tqt-hosted-map-search">Find</button></div><input type="hidden" name="yard_sqft" value="'+esc(state.selection.yard_sqft)+'"><div class="tqt-hosted-map" data-tqt-map></div><div class="tqt-hosted-map-tools"><button type="button" class="tqt-hosted-btn tqt-hosted-map-add">Add yard section</button><button type="button" class="tqt-hosted-btn tqt-hosted-map-secondary tqt-hosted-map-clear">Clear sections</button></div><div class="tqt-hosted-map-meta">'+(state.selection.yard_sqft ? esc(Number(state.selection.yard_sqft).toLocaleString() + ' total sq ft measured - ' + yardLabel(state.selection.yard_sqft)) : 'Draw around each yard section. Double-click to finish a section, then add another if needed.')+'</div></div>'
      : '<div class="tqt-hosted-map-disclaimer">Price is based on a typical yard size up to 1/8 acre. Not sure your yard size? <button type="button" class="tqt-hosted-map-link">Click here to measure your yard.</button></div>'
    ) : '';
    var buttonCopy = state.loading ? 'Calculating...' : (hasPrice ? c.cta_signup : c.cta_show_price);

    mount.innerHTML = '<div class="tqt-hosted-card"><h3 class="tqt-hosted-title">'+esc(title)+'</h3><form class="tqt-hosted-quote"><div class="tqt-hosted-grid"><div class="tqt-hosted-field">'+areaField+'</div><div class="tqt-hosted-field half"><select name="dogs" class="tqt-hosted-select">'+dogHtml+'</select></div><div class="tqt-hosted-field half"><select name="frequency" class="tqt-hosted-select">'+freqHtml+'</select></div>'+lastHtml+phoneHtml+mapHtml+'</div><div class="tqt-hosted-bar"><div>'+priceHtml+'</div><button type="submit" class="tqt-hosted-btn"'+(state.loading?' disabled':'')+'>'+esc(buttonCopy)+'</button></div><div class="tqt-hosted-hint">'+esc(s.hint_text || '')+'</div></form><div class="tqt-hosted-onboard" hidden></div><div class="tqt-hosted-waitlist" hidden></div></div>';
    var quoteForm = mount.querySelector('.tqt-hosted-quote');
    quoteForm.addEventListener('submit', onQuoteSubmit);
    quoteForm.addEventListener('change', onQuoteChange);
    quoteForm.addEventListener('input', onQuoteInput);
    var mapLink = mount.querySelector('.tqt-hosted-map-link');
    if (mapLink) mapLink.addEventListener('click', function(){
      syncSelection(quoteForm);
      state.mapOpen = true;
      render();
    });
    if (mapOpen) setTimeout(initMap, 0);
  }

  function initMap(){
    var s = state.cfg && state.cfg.settings;
    var el = mount.querySelector('[data-tqt-map]');
    if (!s || !el || !s.mapbox_token) return;
    loadCss('https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.css');
    loadCss('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.5.0/mapbox-gl-draw.css');
    Promise.all([
      loadScript('https://api.mapbox.com/mapbox-gl-js/v3.10.0/mapbox-gl.js'),
      loadScript('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.5.0/mapbox-gl-draw.js'),
      loadScript('https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js')
    ]).then(function(){
      if (!window.mapboxgl || !window.MapboxDraw || !window.turf || !mount.querySelector('[data-tqt-map]')) return;
      window.mapboxgl.accessToken = s.mapbox_token;
      var map = new window.mapboxgl.Map({
        container: el,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        center: [Number(s.map_default_lng || -111.0), Number(s.map_default_lat || 32.2)],
        zoom: Number(s.map_initial_zoom || 19)
      });
      map.on('load', function(){ map.resize(); });
      map.doubleClickZoom.disable();
      map.addControl(new window.mapboxgl.NavigationControl(), 'top-right');
      var draw = new window.MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: state.selection.yard_geojson && state.selection.yard_geojson.features && state.selection.yard_geojson.features.length ? 'simple_select' : 'draw_polygon',
        styles: [
          { id:'tqt-polygon-fill-inactive', type:'fill', filter:['all',['==','active','false'],['==','$type','Polygon']], paint:{ 'fill-color':'#1f86ea', 'fill-outline-color':'#0b4f8a', 'fill-opacity':0.32 } },
          { id:'tqt-polygon-fill-active', type:'fill', filter:['all',['==','active','true'],['==','$type','Polygon']], paint:{ 'fill-color':'#ff8a00', 'fill-outline-color':'#9a3412', 'fill-opacity':0.38 } },
          { id:'tqt-polygon-stroke-inactive', type:'line', filter:['all',['==','active','false'],['==','$type','Polygon']], layout:{ 'line-cap':'round','line-join':'round' }, paint:{ 'line-color':'#0b4f8a', 'line-width':3 } },
          { id:'tqt-polygon-stroke-active', type:'line', filter:['all',['==','active','true'],['==','$type','Polygon']], layout:{ 'line-cap':'round','line-join':'round' }, paint:{ 'line-color':'#9a3412', 'line-width':3 } },
          { id:'tqt-line-active', type:'line', filter:['all',['==','active','true'],['==','$type','LineString']], layout:{ 'line-cap':'round','line-join':'round' }, paint:{ 'line-color':'#ff8a00', 'line-dasharray':[0.2,2], 'line-width':3 } },
          { id:'tqt-vertex', type:'circle', filter:['all',['==','meta','vertex'],['==','$type','Point']], paint:{ 'circle-radius':5, 'circle-color':'#ffffff', 'circle-stroke-color':'#0b4f8a', 'circle-stroke-width':2 } },
          { id:'tqt-midpoint', type:'circle', filter:['all',['==','meta','midpoint'],['==','$type','Point']], paint:{ 'circle-radius':4, 'circle-color':'#ff8a00' } }
        ]
      });
      map.addControl(draw);
      var hydratingMap = false;
      if (state.selection.yard_geojson && state.selection.yard_geojson.features && state.selection.yard_geojson.features.length) {
        try {
          hydratingMap = true;
          draw.add(state.selection.yard_geojson);
        } catch(e) {}
      }
      var updateArea = function(refetchPrice){
        var data = draw.getAll();
        var meta = mount.querySelector('.tqt-hosted-map-meta');
        var hidden = mount.querySelector('input[name="yard_sqft"]');
        if (!data.features.length) {
          state.selection.yard_sqft = '';
          state.selection.yard_geojson = null;
          if (hidden) hidden.value = '';
          if (meta) meta.textContent = 'Draw around each yard section. Double-click to finish a section, then add another if needed.';
          return;
        }
        var sqft = Math.round(window.turf.area(data) * 10.7639);
        state.selection.yard_sqft = String(sqft);
        state.selection.yard_geojson = data;
        if (hidden) hidden.value = String(sqft);
        if (meta) meta.textContent = sqft.toLocaleString() + ' total sq ft measured across ' + data.features.length + ' section' + (data.features.length === 1 ? '' : 's') + ' - ' + yardLabel(sqft);
        if (refetchPrice && !hydratingMap && state.price) {
          state.price = null;
          fetchPrice();
        }
      };
      map.on('draw.create', function(){
        updateArea(!hydratingMap);
        if (!hydratingMap) setTimeout(function(){ try { draw.changeMode('simple_select'); } catch(e) {} }, 0);
      });
      map.on('draw.update', function(){ updateArea(true); });
      map.on('draw.delete', function(){ updateArea(true); });
      updateArea(false);
      if (hydratingMap) setTimeout(function(){
        hydratingMap = false;
        updateArea(false);
      }, 0);
      var addBtn = mount.querySelector('.tqt-hosted-map-add');
      if (addBtn) addBtn.addEventListener('click', function(){
        try { draw.changeMode('draw_polygon'); } catch(e) {}
      });
      var clearBtn = mount.querySelector('.tqt-hosted-map-clear');
      if (clearBtn) clearBtn.addEventListener('click', function(){
        try { draw.deleteAll(); } catch(e) {}
        state.selection.yard_sqft = '';
        state.selection.yard_geojson = null;
        state.price = null;
        updateArea(false);
      });
      var searchBtn = mount.querySelector('.tqt-hosted-map-search');
      if (searchBtn) searchBtn.addEventListener('click', function(){
        var form = mount.querySelector('.tqt-hosted-quote');
        syncSelection(form);
        var q = state.selection.yard_address || state.selection.zip;
        if (!q) return showHint('Enter an address or ZIP before using the map.');
        fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodeURIComponent(q)+'.json?limit=1&country=US&access_token='+encodeURIComponent(s.mapbox_token))
          .then(function(r){ return r.json(); })
          .then(function(data){
            var center = data && data.features && data.features[0] && data.features[0].center;
            if (!center) return showHint('Could not find that address on the map.');
            map.flyTo({ center:center, zoom:Number(s.map_search_zoom || 20) });
          })
          .catch(function(){ showHint('Could not search the map address.'); });
      });
      if (state.selection.zip || state.selection.yard_address) {
        var q = state.selection.yard_address || state.selection.zip;
        fetch('https://api.mapbox.com/geocoding/v5/mapbox.places/'+encodeURIComponent(q)+'.json?limit=1&country=US&access_token='+encodeURIComponent(s.mapbox_token))
          .then(function(r){ return r.json(); })
          .then(function(data){
            var center = data && data.features && data.features[0] && data.features[0].center;
            if (center) {
              map.setCenter(center);
              map.setZoom(Number(s.map_initial_zoom || 19));
            }
          })
          .catch(function(){});
      }
    }).catch(function(){
      var meta = mount.querySelector('.tqt-hosted-map-meta');
      if (meta) {
        meta.classList.add('tqt-hosted-map-error');
        meta.textContent = 'Map could not load. Check the Mapbox token and allowed domains.';
      }
    });
  }

  function renderOnboard(){
    var c = state.cfg.copy;
    var box = mount.querySelector('.tqt-hosted-onboard');
    mount.querySelector('.tqt-hosted-quote').hidden = true;
    box.hidden = false;
    box.innerHTML = '<form class="tqt-hosted-form"><div class="tqt-hosted-grid"><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="first_name" required placeholder="'+esc(c.onboard_first_name_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="last_name" required placeholder="'+esc(c.onboard_last_name_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="email" type="email" required placeholder="'+esc(c.onboard_email_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="phone" inputmode="tel" required placeholder="'+esc(c.onboard_phone_placeholder)+'" value="'+esc(state.selection.phone)+'"></div><div class="tqt-hosted-field"><input class="tqt-hosted-input" name="street" required placeholder="'+esc(c.onboard_street_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="city" required placeholder="'+esc(c.onboard_city_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="state" required placeholder="'+esc(c.onboard_state_placeholder)+'"></div></div><div class="tqt-hosted-row"><button type="button" class="tqt-hosted-btn tqt-hosted-back">'+esc(c.onboard_cancel_button)+'</button><button class="tqt-hosted-btn">'+esc(c.onboard_submit_button)+'</button></div><div class="tqt-hosted-hint"></div></form>';
    box.querySelector('.tqt-hosted-back').addEventListener('click', function(){ box.hidden=true; mount.querySelector('.tqt-hosted-quote').hidden=false; });
    box.querySelector('form').addEventListener('submit', onOnboardSubmit);
  }

  function onQuoteInput(e){
    if (!e.target || (e.target.name !== 'phone' && e.target.name !== 'yard_address')) return;
    syncSelection(e.currentTarget);
  }

  function onQuoteChange(e){
    syncSelection(e.currentTarget);
    var changed = e.target && e.target.name;
    if (!changed) return;
    state.price = null;
    if (changed === 'zip') {
      state.options = null;
      loadOptionsForZip(state.selection.zip, true);
      return;
    }
    if (['dogs','frequency','last_time_yard_was_thoroughly_cleaned'].indexOf(changed) >= 0) {
      if (state.selection.dogs && state.selection.frequency) fetchPrice();
      else render();
    } else {
      render();
    }
  }

  function onQuoteSubmit(e){
    e.preventDefault();
    syncSelection(e.currentTarget);
    if (state.price) return renderOnboard();
    fetchPrice();
  }

  function fetchPrice(){
    var s = state.cfg.settings;
    if (state.loading) return;
    if (!state.selection.zip) return showHint('Enter your ZIP code.');
    if (s.service_data_source !== 'local' && digits(state.selection.zip).length !== 5) return showHint('Enter a valid 5-digit ZIP code.');
    if (!state.selection.dogs) return showHint('Select number of dogs.');
    if (!state.selection.frequency) return showHint('Select a frequency.');
    if ((s.require_phone_before_quote || s.zip_require_phone_before_quote) && digits(state.selection.phone).length !== 10) return showHint('Enter a valid phone number.');
    var payload = quotePayload();
    state.loading = true;
    render();
    post('price', payload).then(function(res){
      if (res && res.waitlist) {
        state.loading = false;
        render();
        emitEvent('zip_unserviceable', { zip: payload.zip, reason: 'waitlist' });
        return renderWaitlist(payload.zip);
      }
      if (res && res.ok === false) throw new Error(res.error || 'Could not fetch a price.');
      var p = extractPrice(res);
      if (p.per == null && p.monthly == null) throw new Error('No price available for this selection.');
      state.selection.dogs = String(payload.number_of_dogs || state.selection.dogs || '');
      state.selection.frequency = payload.clean_up_frequency || state.selection.frequency;
      state.price = { per:p.per, monthly:p.monthly, payload:payload, yard_size_label: res.yard_size_label || (res.yard_size_adjustment && res.yard_size_adjustment.yard_size_label) || '' };
      state.loading = false;
      render();
      emitEvent('quote_displayed', { zip: payload.zip, dogs: payload.number_of_dogs, frequency: payload.clean_up_frequency, yard_sqft: payload.yard_sqft, value: first(p.per, p.monthly), per_cleanup: p.per, monthly_price: p.monthly });
    }).catch(function(err){
      state.loading = false;
      render();
      emitEvent('quote_error', { message: err.message || 'Could not fetch a price.' });
      showHint(err.message || 'Could not fetch a price.');
    });
  }

  function showHint(message){
    var hint = mount.querySelector('.tqt-hosted-hint');
    if (hint) hint.textContent = message;
  }

  function renderWaitlist(zip){
    var c = state.cfg.copy;
    var box = mount.querySelector('.tqt-hosted-waitlist');
    box.hidden = false;
    box.innerHTML = '<div class="tqt-hosted-note">'+esc(c.waitlist_copy)+'</div><div class="tqt-hosted-row"><input class="tqt-hosted-input" type="email" placeholder="'+esc(c.waitlist_input_placeholder)+'"><button class="tqt-hosted-btn">'+esc(c.waitlist_button)+'</button></div><div class="tqt-hosted-hint"></div>';
    box.querySelector('button').addEventListener('click', function(){
      var email = box.querySelector('input').value;
      post('waitlist', { zip: zip, email: email }).then(function(){ emitEvent('waitlist_submitted', { zip: zip }); box.innerHTML = '<div class="tqt-hosted-success">Thanks. We will reach out when service opens up.</div>'; });
    });
  }

  function onOnboardSubmit(e){
    e.preventDefault();
    var form = e.currentTarget;
    var hint = form.querySelector('.tqt-hosted-hint');
    var submitBtn = form.querySelector('button:not([type="button"])');
    if (submitBtn) submitBtn.disabled = true;
    if (hint) hint.textContent = 'Submitting...';
    var fd = new FormData(e.currentTarget);
    var payload = Object.assign({}, state.price.payload, {
      per_cleanup: state.price.per,
      monthly_price: state.price.monthly,
      yard_sqft: state.selection.yard_sqft,
      yard_address: state.selection.yard_address,
      first_name: fd.get('first_name'),
      last_name: fd.get('last_name'),
      email: fd.get('email'),
      phone: digits(fd.get('phone')) || state.selection.phone,
      street: fd.get('street'),
      city: fd.get('city'),
      state: fd.get('state'),
      last_time_yard_was_thoroughly_cleaned: state.selection.last_time_yard_was_thoroughly_cleaned || 'one_week',
      consent: true
    });
    post('onboard', payload).then(function(res){
      if (res && res.ok === false) throw new Error(res.error || 'Could not submit.');
      emitEvent('lead_submitted', { zip: payload.zip, dogs: payload.number_of_dogs, frequency: payload.clean_up_frequency, yard_sqft: payload.yard_sqft, value: first(payload.per_cleanup, payload.monthly_price), per_cleanup: payload.per_cleanup, monthly_price: payload.monthly_price });
      var ccNote = state.cfg.settings.send_credit_card_link_after_registration ? '<div class="tqt-hosted-note">'+esc(state.cfg.copy.credit_card_link_success || state.cfg.settings.credit_card_link_message || '')+'</div>' : '';
      mount.querySelector('.tqt-hosted-card').innerHTML = '<div class="tqt-hosted-success">'+state.cfg.copy.success_title+'<div class="tqt-hosted-note">'+state.cfg.copy.success_body+'</div>'+ccNote+'</div>';
    }).catch(function(err){
      if (hint) hint.textContent = err.message || 'Could not submit.';
      if (submitBtn) submitBtn.disabled = false;
    });
  }

  function loadOptionsForZip(zip, refreshPrice){
    var s = state.cfg.settings;
    var path = 'options';
    if (s.service_data_source !== 'local' && digits(zip).length === 5) path += '?zip=' + encodeURIComponent(digits(zip));
    return get(path).then(function(options){
      if (options && options.ok === false) throw new Error(options.error || 'Could not load options.');
      state.options = options || null;
      render();
      if (refreshPrice) fetchPrice();
    }).catch(function(err){
      state.options = null;
      render();
      showHint(err.message || 'Could not load service options.');
    });
  }

  get('config').then(function(cfg){
    if (!cfg || cfg.ok === false) throw new Error(cfg && cfg.error || 'Widget unavailable.');
    state.cfg = cfg;
    initTracking();
    emitEvent('widget_loaded', { plan: cfg.account && cfg.account.plan });
    return loadOptionsForZip('', false);
  }).catch(function(err){ mount.innerHTML = '<div class="tqt-hosted-card">'+esc(err.message || 'Widget unavailable.')+'</div>'; });
})();
`;
