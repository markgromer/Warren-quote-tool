export const widgetScript = String.raw`
(function(){
  var script = document.currentScript;
  var widgetId = script && (script.getAttribute('data-widget-id') || script.dataset.widgetId);
  if (!widgetId) { console.error('Titan Quote Tool: missing data-widget-id'); return; }
  var apiBase = (script && script.getAttribute('data-api-base')) || new URL(script.src).origin;
  var mountSelector = (script && script.getAttribute('data-mount')) || '#tqt-widget';
  var mount = document.querySelector(mountSelector) || document.createElement('div');
  if (!mount.parentNode) script.parentNode.insertBefore(mount, script);
  mount.className = 'tqt-hosted-widget';

  function money(n){ return '$' + (Number(n)||0).toFixed(2); }
  function digits(v){ return String(v||'').replace(/\D/g,'').slice(0,10); }
  function post(path, body){ return fetch(apiBase + '/public/widgets/' + widgetId + '/' + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{}) }).then(r=>r.json()); }
  function get(path){ return fetch(apiBase + '/public/widgets/' + widgetId + '/' + path).then(r=>r.json()); }
  function normFreq(v){ return String(v||'once_a_week').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,''); }
  function extractPrice(res){
    var p = res && (res.price || res.quote || res);
    var per = p && (p.price_per_cleanup ?? p.per_cleanup ?? p.pricePerCleanup ?? p.display_price);
    var monthly = p && (p.monthly_price ?? p.monthlyPrice ?? p.monthly_total);
    return { per: per == null ? null : Number(per), monthly: monthly == null ? null : Number(monthly) };
  }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }

  var style = document.createElement('style');
  style.textContent = '.tqt-hosted-widget{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:760px;margin:0 auto;color:var(--tqt-ink,#263238)}.tqt-hosted-card{background:var(--tqt-panel,#e7e2d9);border:3px solid var(--tqt-border,#000);border-radius:var(--tqt-radius,16px);padding:16px}.tqt-hosted-title{font-size:22px;font-weight:900;margin:0 0 10px}.tqt-hosted-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:8px}.tqt-hosted-field{grid-column:span 12}.tqt-hosted-field.half{grid-column:span 6}.tqt-hosted-input,.tqt-hosted-select{width:100%;height:44px;border:1px solid #d9e3e7;border-radius:12px;padding:10px 12px;font-size:15px;background:#fff}.tqt-hosted-btn{height:46px;border:0;border-radius:14px;padding:0 18px;background:var(--tqt-cta,#1f86ea);color:var(--tqt-cta-text,#fff);font-weight:900;cursor:pointer}.tqt-hosted-btn:disabled{opacity:.55;cursor:not-allowed}.tqt-hosted-bar{margin-top:12px;padding:14px;border:3px solid var(--tqt-border,#000);border-radius:var(--tqt-radius,16px);background:var(--tqt-panel,#e7e2d9);display:flex;align-items:center;justify-content:space-between;gap:12px}.tqt-hosted-has-price .tqt-hosted-bar{flex-direction:column;text-align:center}.tqt-hosted-price{font-size:32px;font-weight:900}.tqt-hosted-has-price .tqt-hosted-btn{min-height:58px;width:min(100%,340px);font-size:22px}.tqt-hosted-note,.tqt-hosted-hint{font-size:12px;color:var(--tqt-muted,#6b7b83);margin-top:6px}.tqt-hosted-form{margin-top:12px}.tqt-hosted-success{padding:18px;text-align:center;font-weight:800}.tqt-hosted-waitlist{margin-top:12px}.tqt-hosted-row{display:flex;gap:8px;margin-top:8px}.tqt-hosted-row .tqt-hosted-input{flex:1}@media(max-width:560px){.tqt-hosted-field.half{grid-column:span 12}.tqt-hosted-bar{align-items:stretch}.tqt-hosted-row{flex-direction:column}}';
  document.head.appendChild(style);

  var state = { cfg:null, price:null, options:null };

  function render(){
    var cfg = state.cfg;
    var s = cfg.settings;
    var c = cfg.copy;
    var areaOptions = (cfg.options && cfg.options.areaOptions) || [];
    var liveDogs = state.options && Array.isArray(state.options.dogs) && state.options.dogs.length ? state.options.dogs : null;
    var liveFreqs = state.options && Array.isArray(state.options.frequencies_meta) && state.options.frequencies_meta.length ? state.options.frequencies_meta : null;
    if (!liveFreqs && state.options && Array.isArray(state.options.frequencies) && state.options.frequencies.length) liveFreqs = state.options.frequencies;
    var dogOptions = liveDogs || (cfg.options && cfg.options.dogDefaults && cfg.options.dogDefaults.length ? cfg.options.dogDefaults : null) || [1,2,3,4];
    var freqs = liveFreqs || (cfg.options && cfg.options.frequencyDefaults && cfg.options.frequencyDefaults.length ? cfg.options.frequencyDefaults : null) || [{value:'once_a_week',label:'Weekly'}];
    var hasPrice = !!state.price;
    mount.style.setProperty('--tqt-panel', s.panel_transparent ? 'transparent' : s.panel_bg);
    mount.style.setProperty('--tqt-border', s.panel_border);
    mount.style.setProperty('--tqt-ink', s.text);
    mount.style.setProperty('--tqt-muted', s.muted);
    mount.style.setProperty('--tqt-cta', s.cta);
    mount.style.setProperty('--tqt-cta-text', s.cta_text_color);
    mount.style.setProperty('--tqt-radius', (s.radius || 16) + 'px');
    mount.classList.toggle('tqt-hosted-has-price', hasPrice);
    var title = s.widget_title || 'Get an Instant Quote';
    var priceHtml = hasPrice ? '<div class="tqt-hosted-note">YOUR PRICE</div><div class="tqt-hosted-price">'+money(state.price.per ?? state.price.monthly)+'</div>' : '<div class="tqt-hosted-note">Ready for your price?</div><div class="tqt-hosted-price">$--</div>';
    var areaField = s.service_data_source === 'local' && areaOptions.length
      ? '<select name="zip" class="tqt-hosted-select">'+areaOptions.map(function(o){ return '<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>'; }).join('')+'</select>'
      : '<input name="zip" class="tqt-hosted-input" placeholder="'+esc(c.zip_input_placeholder || 'ZIP code')+'" maxlength="5">';
    mount.innerHTML = '<div class="tqt-hosted-card"><h3 class="tqt-hosted-title">'+esc(title)+'</h3><form class="tqt-hosted-quote"><div class="tqt-hosted-grid"><div class="tqt-hosted-field">'+areaField+'</div><div class="tqt-hosted-field half"><select name="dogs" class="tqt-hosted-select">'+dogOptions.map(function(d){ return '<option value="'+esc(d)+'">'+esc(d)+' dog'+(Number(d)===1?'':'s')+'</option>'; }).join('')+'</select></div><div class="tqt-hosted-field half"><select name="frequency" class="tqt-hosted-select">'+freqs.map(function(f){ var value=typeof f === 'string' ? f : f.value; var label=typeof f === 'string' ? f.replace(/_/g,' ') : (f.label || f.value); return '<option value="'+esc(value)+'">'+esc(label)+'</option>'; }).join('')+'</select></div></div><div class="tqt-hosted-bar"><div>'+priceHtml+'</div><button type="submit" class="tqt-hosted-btn">'+esc(hasPrice ? c.cta_signup : c.cta_show_price)+'</button></div><div class="tqt-hosted-hint">'+esc(s.hint_text || '')+'</div></form><div class="tqt-hosted-onboard" hidden></div><div class="tqt-hosted-waitlist" hidden></div></div>';
    mount.querySelector('.tqt-hosted-quote').addEventListener('submit', onQuoteSubmit);
  }

  function renderOnboard(){
    var c = state.cfg.copy;
    var box = mount.querySelector('.tqt-hosted-onboard');
    mount.querySelector('.tqt-hosted-quote').hidden = true;
    box.hidden = false;
    box.innerHTML = '<form class="tqt-hosted-form"><div class="tqt-hosted-grid"><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="first_name" placeholder="'+esc(c.onboard_first_name_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="last_name" placeholder="'+esc(c.onboard_last_name_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="email" type="email" placeholder="'+esc(c.onboard_email_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="phone" placeholder="'+esc(c.onboard_phone_placeholder)+'"></div><div class="tqt-hosted-field"><input class="tqt-hosted-input" name="street" placeholder="'+esc(c.onboard_street_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="city" placeholder="'+esc(c.onboard_city_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="state" placeholder="'+esc(c.onboard_state_placeholder)+'"></div></div><div class="tqt-hosted-row"><button type="button" class="tqt-hosted-btn tqt-hosted-back">'+esc(c.onboard_cancel_button)+'</button><button class="tqt-hosted-btn">'+esc(c.onboard_submit_button)+'</button></div><div class="tqt-hosted-hint"></div></form>';
    box.querySelector('.tqt-hosted-back').addEventListener('click', function(){ box.hidden=true; mount.querySelector('.tqt-hosted-quote').hidden=false; });
    box.querySelector('form').addEventListener('submit', onOnboardSubmit);
  }

  function onQuoteSubmit(e){
    e.preventDefault();
    if (state.price) return renderOnboard();
    var fd = new FormData(e.currentTarget);
    var payload = { zip: fd.get('zip'), dogs: fd.get('dogs'), frequency: normFreq(fd.get('frequency')), number_of_dogs: Number(fd.get('dogs')), clean_up_frequency: normFreq(fd.get('frequency')) };
    post('price', payload).then(function(res){
      if (res && res.waitlist) return renderWaitlist(payload.zip);
      if (res && res.ok === false) throw new Error(res.error || 'Could not fetch a price.');
      var p = extractPrice(res);
      if (p.per == null && p.monthly == null) throw new Error('No price available for this selection.');
      state.price = { per:p.per, monthly:p.monthly, payload:payload };
      render();
    }).catch(function(err){ mount.querySelector('.tqt-hosted-hint').textContent = err.message || 'Could not fetch a price.'; });
  }

  function renderWaitlist(zip){
    var c = state.cfg.copy;
    var box = mount.querySelector('.tqt-hosted-waitlist');
    box.hidden = false;
    box.innerHTML = '<div class="tqt-hosted-note">'+esc(c.waitlist_copy)+'</div><div class="tqt-hosted-row"><input class="tqt-hosted-input" type="email" placeholder="'+esc(c.waitlist_input_placeholder)+'"><button class="tqt-hosted-btn">'+esc(c.waitlist_button)+'</button></div><div class="tqt-hosted-hint"></div>';
    box.querySelector('button').addEventListener('click', function(){
      var email = box.querySelector('input').value;
      post('waitlist', { zip: zip, email: email }).then(function(){ box.innerHTML = '<div class="tqt-hosted-success">Thanks. We will reach out when service opens up.</div>'; });
    });
  }

  function onOnboardSubmit(e){
    e.preventDefault();
    var fd = new FormData(e.currentTarget);
    var payload = Object.assign({}, state.price.payload, {
      per_cleanup: state.price.per,
      monthly_price: state.price.monthly,
      first_name: fd.get('first_name'),
      last_name: fd.get('last_name'),
      email: fd.get('email'),
      phone: digits(fd.get('phone')),
      street: fd.get('street'),
      city: fd.get('city'),
      state: fd.get('state'),
      consent: true
    });
    post('onboard', payload).then(function(res){
      if (res && res.ok === false) throw new Error(res.error || 'Could not submit.');
      mount.querySelector('.tqt-hosted-card').innerHTML = '<div class="tqt-hosted-success">'+state.cfg.copy.success_title+'<div class="tqt-hosted-note">'+state.cfg.copy.success_body+'</div></div>';
    }).catch(function(err){ e.currentTarget.querySelector('.tqt-hosted-hint').textContent = err.message || 'Could not submit.'; });
  }

  get('config').then(function(cfg){
    if (!cfg || cfg.ok === false) throw new Error(cfg && cfg.error || 'Widget unavailable.');
    state.cfg = cfg;
    return get('options').catch(function(){ return null; });
  }).then(function(options){
    state.options = options && options.ok !== false ? options : null;
    render();
  }).catch(function(err){ mount.innerHTML = '<div class="tqt-hosted-card">'+esc(err.message || 'Widget unavailable.')+'</div>'; });
})();
`;
