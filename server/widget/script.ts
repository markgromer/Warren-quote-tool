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
  function post(path, body){ return fetch(apiBase + '/public/widgets/' + widgetId + '/' + path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body||{}) }).then(function(r){ return r.json(); }); }
  function get(path){ return fetch(apiBase + '/public/widgets/' + widgetId + '/' + path).then(function(r){ return r.json(); }); }
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
      var v = typeof item === 'string' ? item : item.value;
      return String(v) === String(value);
    });
  }
  function optionValue(item){ return typeof item === 'string' ? item : item.value; }
  function optionLabel(item){ return typeof item === 'string' ? item.replace(/_/g,' ') : (item.label || item.value); }

  var style = document.createElement('style');
  style.textContent = '.tqt-hosted-widget{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif;max-width:760px;margin:0 auto;color:var(--tqt-ink,#263238)}.tqt-hosted-card{background:var(--tqt-panel,#e7e2d9);border:3px solid var(--tqt-border,#000);border-radius:var(--tqt-radius,16px);padding:16px}.tqt-hosted-title{font-size:22px;font-weight:900;margin:0 0 10px}.tqt-hosted-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:8px}.tqt-hosted-field{grid-column:span 12}.tqt-hosted-field.half{grid-column:span 6}.tqt-hosted-input,.tqt-hosted-select{width:100%;height:44px;border:1px solid #d9e3e7;border-radius:12px;padding:10px 12px;font-size:15px;background:#fff}.tqt-hosted-btn{height:46px;border:0;border-radius:14px;padding:0 18px;background:var(--tqt-cta,#1f86ea);color:var(--tqt-cta-text,#fff);font-weight:900;cursor:pointer}.tqt-hosted-btn:disabled{opacity:.55;cursor:not-allowed}.tqt-hosted-bar{margin-top:12px;padding:14px;border:3px solid var(--tqt-border,#000);border-radius:var(--tqt-radius,16px);background:var(--tqt-panel,#e7e2d9);display:flex;align-items:center;justify-content:space-between;gap:12px}.tqt-hosted-has-price .tqt-hosted-bar{flex-direction:column;text-align:center}.tqt-hosted-price{font-size:32px;font-weight:900}.tqt-hosted-has-price .tqt-hosted-btn{min-height:58px;width:min(100%,340px);font-size:22px}.tqt-hosted-note,.tqt-hosted-hint{font-size:12px;color:var(--tqt-muted,#6b7b83);margin-top:6px}.tqt-hosted-form{margin-top:12px}.tqt-hosted-success{padding:18px;text-align:center;font-weight:800}.tqt-hosted-waitlist{margin-top:12px}.tqt-hosted-row{display:flex;gap:8px;margin-top:8px}.tqt-hosted-row .tqt-hosted-input{flex:1}@media(max-width:560px){.tqt-hosted-field.half{grid-column:span 12}.tqt-hosted-bar{align-items:stretch}.tqt-hosted-row{flex-direction:column}}';
  document.head.appendChild(style);

  var state = {
    cfg:null,
    price:null,
    options:null,
    selection:{ zip:'', dogs:'', frequency:'', last_time_yard_was_thoroughly_cleaned:'one_week', phone:'' },
    loading:false
  };

  function getDogs(){
    var liveDogs = state.options && Array.isArray(state.options.dogs) && state.options.dogs.length ? state.options.dogs : null;
    return liveDogs || (state.cfg.options && state.cfg.options.dogDefaults && state.cfg.options.dogDefaults.length ? state.cfg.options.dogDefaults : null) || [1,2,3,4];
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
      lead_phone: state.selection.phone
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
    if (!state.selection.dogs || !hasOption(dogOptions, state.selection.dogs)) state.selection.dogs = String(dogOptions[0]);
    if (!state.selection.frequency || !hasOption(freqs, state.selection.frequency)) state.selection.frequency = normFreq(optionValue(freqs[0]));
    if (!state.selection.last_time_yard_was_thoroughly_cleaned || !hasOption(lastTimes, state.selection.last_time_yard_was_thoroughly_cleaned)) state.selection.last_time_yard_was_thoroughly_cleaned = optionValue(lastTimes[0]);
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
    var shownPrice = hasPrice ? first(state.price.per, state.price.monthly) : null;
    var priceHtml = hasPrice ? '<div class="tqt-hosted-note">YOUR PRICE</div><div class="tqt-hosted-price">'+money(shownPrice)+'</div>' : '<div class="tqt-hosted-note">Ready for your price?</div><div class="tqt-hosted-price">$--</div>';
    var areaField = s.service_data_source === 'local' && areaOptions.length
      ? '<select name="zip" class="tqt-hosted-select">'+areaOptions.map(function(o){ return '<option value="'+esc(o.value)+'"'+(String(o.value)===String(state.selection.zip)?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('')+'</select>'
      : '<input name="zip" class="tqt-hosted-input" placeholder="'+esc(c.zip_input_placeholder || 'ZIP code')+'" maxlength="5" value="'+esc(state.selection.zip)+'">';
    var dogHtml = dogOptions.map(function(d){ return '<option value="'+esc(d)+'"'+(String(d)===String(state.selection.dogs)?' selected':'')+'>'+esc(d)+' dog'+(Number(d)===1?'':'s')+'</option>'; }).join('');
    var freqHtml = freqs.map(function(f){ var value=normFreq(optionValue(f)); return '<option value="'+esc(value)+'"'+(value===state.selection.frequency?' selected':'')+'>'+esc(optionLabel(f))+'</option>'; }).join('');
    var requirePhone = !!(s.require_phone_before_quote || s.zip_require_phone_before_quote);
    var showLastCleaned = !!(s.show_last_cleaned || s.zip_show_last_cleaned);
    var lastHtml = showLastCleaned ? '<div class="tqt-hosted-field"><select name="last_time_yard_was_thoroughly_cleaned" class="tqt-hosted-select">'+lastTimes.map(function(o){ return '<option value="'+esc(o.value)+'"'+(String(o.value)===String(state.selection.last_time_yard_was_thoroughly_cleaned)?' selected':'')+'>'+esc(o.label)+'</option>'; }).join('')+'</select></div>' : '';
    var phoneHtml = requirePhone ? '<div class="tqt-hosted-field"><input name="phone" class="tqt-hosted-input" inputmode="tel" placeholder="'+esc(c.onboard_phone_placeholder || 'Phone')+'" value="'+esc(state.selection.phone)+'"></div>' : '';
    var buttonCopy = state.loading ? 'Calculating...' : (hasPrice ? c.cta_signup : c.cta_show_price);

    mount.innerHTML = '<div class="tqt-hosted-card"><h3 class="tqt-hosted-title">'+esc(title)+'</h3><form class="tqt-hosted-quote"><div class="tqt-hosted-grid"><div class="tqt-hosted-field">'+areaField+'</div><div class="tqt-hosted-field half"><select name="dogs" class="tqt-hosted-select">'+dogHtml+'</select></div><div class="tqt-hosted-field half"><select name="frequency" class="tqt-hosted-select">'+freqHtml+'</select></div>'+lastHtml+phoneHtml+'</div><div class="tqt-hosted-bar"><div>'+priceHtml+'</div><button type="submit" class="tqt-hosted-btn"'+(state.loading?' disabled':'')+'>'+esc(buttonCopy)+'</button></div><div class="tqt-hosted-hint">'+esc(s.hint_text || '')+'</div></form><div class="tqt-hosted-onboard" hidden></div><div class="tqt-hosted-waitlist" hidden></div></div>';
    var quoteForm = mount.querySelector('.tqt-hosted-quote');
    quoteForm.addEventListener('submit', onQuoteSubmit);
    quoteForm.addEventListener('change', onQuoteChange);
    quoteForm.addEventListener('input', onQuoteInput);
  }

  function renderOnboard(){
    var c = state.cfg.copy;
    var box = mount.querySelector('.tqt-hosted-onboard');
    mount.querySelector('.tqt-hosted-quote').hidden = true;
    box.hidden = false;
    box.innerHTML = '<form class="tqt-hosted-form"><div class="tqt-hosted-grid"><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="first_name" placeholder="'+esc(c.onboard_first_name_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="last_name" placeholder="'+esc(c.onboard_last_name_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="email" type="email" placeholder="'+esc(c.onboard_email_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="phone" placeholder="'+esc(c.onboard_phone_placeholder)+'" value="'+esc(state.selection.phone)+'"></div><div class="tqt-hosted-field"><input class="tqt-hosted-input" name="street" placeholder="'+esc(c.onboard_street_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="city" placeholder="'+esc(c.onboard_city_placeholder)+'"></div><div class="tqt-hosted-field half"><input class="tqt-hosted-input" name="state" placeholder="'+esc(c.onboard_state_placeholder)+'"></div></div><div class="tqt-hosted-row"><button type="button" class="tqt-hosted-btn tqt-hosted-back">'+esc(c.onboard_cancel_button)+'</button><button class="tqt-hosted-btn">'+esc(c.onboard_submit_button)+'</button></div><div class="tqt-hosted-hint"></div></form>';
    box.querySelector('.tqt-hosted-back').addEventListener('click', function(){ box.hidden=true; mount.querySelector('.tqt-hosted-quote').hidden=false; });
    box.querySelector('form').addEventListener('submit', onOnboardSubmit);
  }

  function onQuoteInput(e){
    if (!e.target || e.target.name !== 'phone') return;
    syncSelection(e.currentTarget);
    if (state.price) state.price = null;
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
      fetchPrice();
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
    if ((s.require_phone_before_quote || s.zip_require_phone_before_quote) && digits(state.selection.phone).length !== 10) return showHint('Enter a valid phone number.');
    state.loading = true;
    render();
    var payload = quotePayload();
    post('price', payload).then(function(res){
      if (res && res.waitlist) {
        state.loading = false;
        render();
        return renderWaitlist(payload.zip);
      }
      if (res && res.ok === false) throw new Error(res.error || 'Could not fetch a price.');
      var p = extractPrice(res);
      if (p.per == null && p.monthly == null) throw new Error('No price available for this selection.');
      state.price = { per:p.per, monthly:p.monthly, payload:payload };
      state.loading = false;
      render();
    }).catch(function(err){
      state.loading = false;
      render();
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
      phone: digits(fd.get('phone')) || state.selection.phone,
      street: fd.get('street'),
      city: fd.get('city'),
      state: fd.get('state'),
      last_time_yard_was_thoroughly_cleaned: state.selection.last_time_yard_was_thoroughly_cleaned || 'one_week',
      consent: true
    });
    post('onboard', payload).then(function(res){
      if (res && res.ok === false) throw new Error(res.error || 'Could not submit.');
      var ccNote = state.cfg.settings.send_credit_card_link_after_registration ? '<div class="tqt-hosted-note">'+esc(state.cfg.copy.credit_card_link_success || state.cfg.settings.credit_card_link_message || '')+'</div>' : '';
      mount.querySelector('.tqt-hosted-card').innerHTML = '<div class="tqt-hosted-success">'+state.cfg.copy.success_title+'<div class="tqt-hosted-note">'+state.cfg.copy.success_body+'</div>'+ccNote+'</div>';
    }).catch(function(err){ e.currentTarget.querySelector('.tqt-hosted-hint').textContent = err.message || 'Could not submit.'; });
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
    return loadOptionsForZip('', false);
  }).catch(function(err){ mount.innerHTML = '<div class="tqt-hosted-card">'+esc(err.message || 'Widget unavailable.')+'</div>'; });
})();
`;
