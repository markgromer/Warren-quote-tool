import { accountEntitlements, hasAddon, hasFeature, hasPlan, planCatalog, type AccountEntitlements, type FeatureKey } from './plans.js';

export type TqtSettings = typeof defaultSettings;

export const copySchema = {
  cta_check_area: 'CHECK MY AREA',
  cta_show_price: 'SHOW PRICE',
  cta_signup: 'SIGN UP',
  coupon_trigger_label: 'Have a coupon?',
  coupon_modal_title: 'Add a coupon',
  coupon_input_placeholder: 'Coupon code',
  zip_input_placeholder: 'ZIP code',
  coupon_apply_button: 'Apply',
  coupon_help_toggle: 'No code? Tap to get current specials.',
  coupon_help_copy: 'Enter your phone number and we will text the latest offers.',
  coupon_help_phone_placeholder: 'Phone number',
  coupon_help_button: 'Text me',
  waitlist_copy: 'Oh no - we are not in your area yet. Drop your email and we will reach out as soon as service opens up.',
  waitlist_input_placeholder: 'Email address',
  waitlist_button: 'NOTIFY ME',
  onboard_first_name_placeholder: 'First name',
  onboard_last_name_placeholder: 'Last name',
  onboard_email_placeholder: 'Email',
  onboard_phone_placeholder: 'Phone',
  onboard_street_placeholder: 'Home address',
  onboard_city_placeholder: 'City',
  onboard_state_placeholder: 'State',
  onboard_addons_label: 'Add-ons (optional)',
  onboard_secondary_button: 'More info',
  onboard_cancel_button: 'Cancel',
  onboard_submit_button: 'REGISTER',
  success_title: 'You are all set',
  success_body: 'We will reach out within <strong>24 hours</strong> to schedule your first visit.',
  success_button: 'Done',
  credit_card_link_success: 'We will send a secure card-on-file link shortly.',
};

export const defaultSettings = {
  org_slug: '',
  base_url: 'https://openapi.sweepandgo.com',
  email_to: '',
  email_cc: '',
  email_bcc: '',
  lead_email_subject_prefix: 'WARREN Quote Tool',
  enable_partial_lead_email: false,
  contact_phone: '',
  tracking_enabled: true,
  data_layer_enabled: true,
  ga4_enabled: true,
  google_tag_id: '',
  google_tag_manager_id: '',
  google_ads_conversion_id: '',
  google_ads_lead_label: '',
  google_ads_quote_label: '',
  meta_pixel_enabled: true,
  meta_pixel_id: '',
  dom_events_enabled: true,
  developer_events_enabled: true,
  debug_events_enabled: false,
  event_prefix: 'tqt_',
  custom_event_map: '',
  privacy_url: 'https://example.com/privacy-policy',
  terms_url: 'https://example.com/terms',
  location_id: '',
  organization_form_id: '',
  manual_dogs: '',
  manual_frequencies: '',
  manual_pricing: '',
  yard_size_adjustments: '',
  one_time_price: '',
  one_time_price_per_extra_dog: '',
  one_time_extra_time_block_minutes: '30',
  one_time_extra_time_block_price: '',
  pricing_notice_recurring: '',
  pricing_notice_one_time: '',
  service_data_source: 'sng',
  local_area_mode: 'zip',
  local_area_values: '',
  lead_destination: 'sng',
  generic_webhook_url: '',
  generic_webhook_secret: '',
  ghl_webhook_url: '',
  jobber_webhook_url: '',
  jobber_webhook_secret: '',
  openphone_enabled: false,
  openphone_from_number: '',
  openphone_phone_number_id: '',
  openphone_user_id: '',
  openphone_set_inbox_status: '',
  openphone_partial_quote_sms_enabled: false,
  openphone_signup_sms_enabled: false,
  openphone_partial_quote_sms_template: 'Thanks for checking your {dog_label} {frequency_label} quote. Your estimated price is {per_cleanup} per visit. Reply here if you want help finishing signup.',
  openphone_signup_sms_template: 'Thanks {first_name}, you are signed up. We will reach out shortly to schedule your first visit.',
  send_credit_card_link_after_registration: false,
  credit_card_link_message: 'Thanks for signing up. Please use the secure Sweep&Go link to add your card on file.',
  dog_slider_icon_mode: 'emoji',
  dog_slider_icon_emoji: '💩',
  dog_slider_icon_image: '',
  freq_slider_icon_mode: 'emoji',
  freq_slider_icon_emoji: '⏱️',
  freq_slider_icon_image: '',
  slider_track_color: '#e2e8f0',
  slider_fill_color: '#1f86ea',
  slider_thumb_color: '#1f86ea',
  slider_thumb_size: '28',
  slider_track_height: '6',
  slider_icon_size: '28',
  panel_bg: '#e7e2d9',
  panel_transparent: false,
  panel_border: '#000000',
  text: '#263238',
  muted: '#6b7b83',
  trust_color: '#6b7b83',
  accent: '#ff8a00',
  cta: '#1f86ea',
  cta_text_color: '#ffffff',
  cta_font_size: '18',
  cta_font_weight: '900',
  price_font_size: '32',
  price_font_weight: '900',
  heading_font_url: '',
  heading_font_family: '"Luckiest Guy", system-ui, sans-serif',
  body_font_url: '',
  body_font_family: 'ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  title_font_url: '',
  title_font_family: '',
  title_font_size: '22',
  title_align: 'left',
  zip_heading_font_url: '',
  zip_heading_font_family: '',
  zip_body_font_url: '',
  zip_body_font_family: '',
  zip_title_font_url: '',
  zip_title_font_family: '',
  zip_title_font_size: '',
  zip_title_align: '',
  zip_widget_title: '',
  zip_hint_text: '',
  zip_require_phone_before_quote: false,
  zip_require_name_before_quote: false,
  zip_require_consent_before_quote: false,
  zip_show_last_cleaned: false,
  zip_enable_coupon_field: false,
  zip_cta_text_color: '',
  zip_cta_font_size: '',
  zip_cta_font_weight: '',
  widget_title: 'Get an Instant Quote',
  hint_text: 'Enter ZIP, then pick dogs & frequency.',
  radius: '16',
  bullets: 'Local, insured techs\nNo contracts - cancel anytime',
  custom_css: '',
  require_phone_before_quote: false,
  require_name_before_quote: false,
  require_consent_before_quote: true,
  show_last_cleaned: true,
  enable_coupon_field: true,
  dog_control_type: 'dropdown',
  frequency_control_type: 'dropdown',
  addon2_label: '',
  addon2_price: '',
  addon2_desc: '',
  show_sng_addons_by_default: true,
  show_per_cleanup_price: true,
  recurring_calc_mode: 'standard',
  loader_message: 'Creating your personalized quote...',
  loader_min_time: '1500',
  copy_overrides: {} as Record<string, string>,
  mapbox_token: '',
  use_managed_mapbox_token: false,
  enable_yard_map: false,
  map_initial_zoom: '19',
  map_search_zoom: '20',
  map_default_lng: '-111.0',
  map_default_lat: '32.2',
};

export function mergeSettings(raw: any) {
  return { ...defaultSettings, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export function copyStrings(settings: any) {
  const overrides = settings?.copy_overrides && typeof settings.copy_overrides === 'object' ? settings.copy_overrides : {};
  return Object.fromEntries(Object.entries(copySchema).map(([key, value]) => [key, overrides[key] || value]));
}

export type SettingField = {
  key: string;
  label: string;
  group: string;
  type: 'text' | 'textarea' | 'boolean' | 'select' | 'color' | 'number' | 'json';
  public?: boolean;
  secret?: boolean;
  plan?: 'free' | 'pro' | 'agency';
  feature?: FeatureKey;
  addon?: string;
  options?: Array<{ value: string; label: string }>;
  rows?: number;
  help?: string;
};

export const settingFields: SettingField[] = [
  { group: 'Business', key: 'org_slug', label: 'Sweep&Go organization slug', type: 'text', public: true },
  { group: 'Business', key: 'email_to', label: 'Lead notification email', type: 'text' },
  { group: 'Business', key: 'email_cc', label: 'Lead email CC', type: 'text' },
  { group: 'Business', key: 'email_bcc', label: 'Lead email BCC', type: 'text' },
  { group: 'Business', key: 'lead_email_subject_prefix', label: 'Lead email subject prefix', type: 'text' },
  { group: 'Business', key: 'contact_phone', label: 'Public contact phone', type: 'text', public: true },
  { group: 'Business', key: 'privacy_url', label: 'Privacy policy URL', type: 'text', public: true },
  { group: 'Business', key: 'terms_url', label: 'Terms URL', type: 'text', public: true },

  { group: 'Connections', key: 'base_url', label: 'Sweep&Go API base URL', type: 'text', public: true },
  { group: 'Connections', key: 'location_id', label: 'Sweep&Go location ID', type: 'text', public: true },
  { group: 'Connections', key: 'organization_form_id', label: 'Sweep&Go registration form ID', type: 'text', public: true },
  { group: 'Connections', key: 'lead_destination', label: 'Lead destination', type: 'select', options: [
    { value: 'sng', label: 'Sweep&Go' },
    { value: 'email', label: 'Email only' },
    { value: 'generic', label: 'Generic webhook' },
    { value: 'ghl', label: 'GoHighLevel webhook' },
    { value: 'jobber', label: 'Jobber webhook' },
  ] },
  { group: 'Connections', key: 'generic_webhook_url', label: 'Generic webhook URL', type: 'text', plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Connections', key: 'generic_webhook_secret', label: 'Generic webhook signing secret', type: 'text', secret: true, plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Connections', key: 'ghl_webhook_url', label: 'GoHighLevel webhook URL', type: 'text', plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Connections', key: 'jobber_webhook_url', label: 'Jobber webhook URL', type: 'text', plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Connections', key: 'jobber_webhook_secret', label: 'Jobber webhook signing secret', type: 'text', secret: true, plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Connections', key: 'openphone_enabled', label: 'Enable OpenPhone SMS', type: 'boolean', plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Connections', key: 'openphone_from_number', label: 'OpenPhone from number', type: 'text', plan: 'pro', feature: 'crmWebhooks', help: 'Use E.164 format, like +15555555555.' },
  { group: 'Connections', key: 'openphone_phone_number_id', label: 'OpenPhone phone number ID', type: 'text', plan: 'pro', feature: 'crmWebhooks', help: 'Optional. Use this instead of, or alongside, the from number if OpenPhone provides it.' },
  { group: 'Connections', key: 'openphone_user_id', label: 'OpenPhone user ID', type: 'text', plan: 'pro', feature: 'crmWebhooks', help: 'Optional sender user ID.' },
  { group: 'Connections', key: 'openphone_set_inbox_status', label: 'OpenPhone inbox status', type: 'select', plan: 'pro', feature: 'crmWebhooks', options: [
    { value: '', label: 'Leave unchanged' },
    { value: 'done', label: 'Done' },
  ] },

  { group: 'Tracking', key: 'tracking_enabled', label: 'Enable tracking', type: 'boolean', public: true },
  { group: 'Tracking', key: 'data_layer_enabled', label: 'Push dataLayer events', type: 'boolean', public: true },
  { group: 'Tracking', key: 'ga4_enabled', label: 'Send GA4 events', type: 'boolean', public: true },
  { group: 'Tracking', key: 'google_tag_id', label: 'GA4 measurement ID', type: 'text', public: true, plan: 'pro', feature: 'advancedTracking' },
  { group: 'Tracking', key: 'google_tag_manager_id', label: 'GTM container ID', type: 'text', public: true, plan: 'pro', feature: 'advancedTracking' },
  { group: 'Tracking', key: 'google_ads_conversion_id', label: 'Google Ads conversion ID', type: 'text', public: true, plan: 'pro', feature: 'advancedTracking' },
  { group: 'Tracking', key: 'google_ads_lead_label', label: 'Google Ads lead label', type: 'text', public: true, plan: 'pro', feature: 'advancedTracking' },
  { group: 'Tracking', key: 'google_ads_quote_label', label: 'Google Ads quote label', type: 'text', public: true, plan: 'pro', feature: 'advancedTracking' },
  { group: 'Tracking', key: 'meta_pixel_enabled', label: 'Send Meta Pixel events', type: 'boolean', public: true },
  { group: 'Tracking', key: 'meta_pixel_id', label: 'Meta Pixel ID', type: 'text', public: true, plan: 'pro', feature: 'advancedTracking' },
  { group: 'Tracking', key: 'dom_events_enabled', label: 'Dispatch browser CustomEvents', type: 'boolean', public: true },
  { group: 'Tracking', key: 'event_prefix', label: 'Event name prefix', type: 'text', public: true },
  { group: 'Tracking', key: 'custom_event_map', label: 'Custom event name map JSON', type: 'textarea', rows: 6, public: true, help: '{"quote_displayed":"my_quote_event"}' },

  { group: 'Developer', key: 'developer_events_enabled', label: 'Store developer events', type: 'boolean', public: true, plan: 'pro', feature: 'developerEvents' },
  { group: 'Developer', key: 'debug_events_enabled', label: 'Include debug events', type: 'boolean', public: true, plan: 'pro', feature: 'developerEvents' },

  { group: 'Follow Up', key: 'enable_partial_lead_email', label: 'Email partial quote leads', type: 'boolean' },
  { group: 'Follow Up', key: 'openphone_partial_quote_sms_enabled', label: 'Text partial quote leads with OpenPhone', type: 'boolean', plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Follow Up', key: 'openphone_signup_sms_enabled', label: 'Text completed signups with OpenPhone', type: 'boolean', plan: 'pro', feature: 'crmWebhooks' },
  { group: 'Follow Up', key: 'openphone_partial_quote_sms_template', label: 'Partial quote SMS template', type: 'textarea', rows: 4, plan: 'pro', feature: 'crmWebhooks', help: 'Tokens: {first_name}, {dog_label}, {frequency_label}, {per_cleanup}, {monthly}, {zip}, {yard_sqft}' },
  { group: 'Follow Up', key: 'openphone_signup_sms_template', label: 'Signup SMS template', type: 'textarea', rows: 4, plan: 'pro', feature: 'crmWebhooks', help: 'Tokens: {first_name}, {dog_label}, {frequency_label}, {per_cleanup}, {monthly}, {zip}, {yard_sqft}' },
  { group: 'Follow Up', key: 'send_credit_card_link_after_registration', label: 'Send card-on-file link after registration', type: 'boolean' },
  { group: 'Follow Up', key: 'credit_card_link_message', label: 'Card link success message', type: 'textarea', rows: 4, public: true },

  { group: 'Pricing', key: 'service_data_source', label: 'Service data source', type: 'select', public: true, options: [
    { value: 'sng', label: 'Sweep&Go' },
    { value: 'local', label: 'Local/manual' },
  ] },
  { group: 'Pricing', key: 'local_area_mode', label: 'Local area mode', type: 'select', public: true, options: [
    { value: 'zip', label: 'ZIP codes' },
    { value: 'locations', label: 'Locations/cities' },
  ] },
  { group: 'Pricing', key: 'local_area_values', label: 'Local areas', type: 'textarea', rows: 5, public: true },
  { group: 'Pricing', key: 'manual_dogs', label: 'Manual dog counts', type: 'textarea', rows: 3, public: true },
  { group: 'Pricing', key: 'manual_frequencies', label: 'Manual frequencies', type: 'textarea', rows: 5, public: true },
  { group: 'Pricing', key: 'manual_pricing', label: 'Manual pricing rules', type: 'textarea', rows: 8 },
  { group: 'Pricing', key: 'yard_size_adjustments', label: 'Yard size adjustments', type: 'textarea', rows: 6 },
  { group: 'Pricing', key: 'one_time_price', label: 'One-time starting price', type: 'text' },
  { group: 'Pricing', key: 'one_time_price_per_extra_dog', label: 'One-time price per extra dog', type: 'text' },
  { group: 'Pricing', key: 'show_per_cleanup_price', label: 'Show per-visit price first', type: 'boolean', public: true },
  { group: 'Pricing', key: 'recurring_calc_mode', label: 'Recurring calculation mode', type: 'select', public: true, options: [
    { value: 'standard', label: '52 weeks / 12 months' },
    { value: 'four_weeks', label: '4 weeks' },
  ] },
  { group: 'Pricing', key: 'pricing_notice_recurring', label: 'Recurring pricing notice', type: 'textarea', rows: 3, public: true },
  { group: 'Pricing', key: 'pricing_notice_one_time', label: 'One-time pricing notice', type: 'textarea', rows: 3, public: true },

  { group: 'Quote Rules', key: 'require_phone_before_quote', label: 'Require phone before quote', type: 'boolean', public: true },
  { group: 'Quote Rules', key: 'require_name_before_quote', label: 'Require name before quote', type: 'boolean', public: true },
  { group: 'Quote Rules', key: 'require_consent_before_quote', label: 'Require consent before quote', type: 'boolean', public: true },
  { group: 'Quote Rules', key: 'show_last_cleaned', label: 'Show last-cleaned field', type: 'boolean', public: true },
  { group: 'Quote Rules', key: 'enable_coupon_field', label: 'Enable coupon field', type: 'boolean', public: true },
  { group: 'Quote Rules', key: 'show_sng_addons_by_default', label: 'Show SNG add-ons by default', type: 'boolean', public: true },

  { group: 'Map', key: 'enable_yard_map', label: 'Enable yard map', type: 'boolean', public: true, plan: 'pro', feature: 'yardMap', addon: 'yard_map', help: 'Included in Pro/Agency, or sold as a standalone map add-on.' },
  { group: 'Map', key: 'use_managed_mapbox_token', label: 'Use hosted Mapbox token', type: 'boolean', public: true, plan: 'agency', feature: 'managedMapbox', addon: 'managed_mapbox', help: 'Use this only for customers paying for managed Mapbox usage.' },
  { group: 'Map', key: 'mapbox_token', label: 'Customer Mapbox public token', type: 'text', public: true, plan: 'pro', feature: 'yardMap', addon: 'yard_map', help: 'Leave blank when using the hosted token.' },
  { group: 'Map', key: 'map_initial_zoom', label: 'Map initial zoom', type: 'number', public: true },
  { group: 'Map', key: 'map_search_zoom', label: 'Map search zoom', type: 'number', public: true },
  { group: 'Map', key: 'map_default_lng', label: 'Map default longitude', type: 'text', public: true },
  { group: 'Map', key: 'map_default_lat', label: 'Map default latitude', type: 'text', public: true },

  { group: 'Branding', key: 'panel_bg', label: 'Panel background', type: 'color', public: true },
  { group: 'Branding', key: 'panel_transparent', label: 'Transparent panel', type: 'boolean', public: true },
  { group: 'Branding', key: 'panel_border', label: 'Panel border', type: 'color', public: true },
  { group: 'Branding', key: 'text', label: 'Text color', type: 'color', public: true },
  { group: 'Branding', key: 'muted', label: 'Muted text color', type: 'color', public: true },
  { group: 'Branding', key: 'accent', label: 'Accent color', type: 'color', public: true },
  { group: 'Branding', key: 'cta', label: 'Button color', type: 'color', public: true },
  { group: 'Branding', key: 'cta_text_color', label: 'Button text color', type: 'color', public: true },
  { group: 'Branding', key: 'radius', label: 'Corner radius', type: 'number', public: true },
  { group: 'Branding', key: 'widget_title', label: 'Widget title', type: 'text', public: true },
  { group: 'Branding', key: 'hint_text', label: 'Hint text', type: 'text', public: true },
  { group: 'Branding', key: 'bullets', label: 'Bullet copy', type: 'textarea', rows: 4, public: true },
  { group: 'Branding', key: 'custom_css', label: 'Custom CSS', type: 'textarea', rows: 8, public: true, plan: 'pro', feature: 'customBranding' },

  { group: 'Typography', key: 'heading_font_url', label: 'Heading font URL', type: 'text', public: true },
  { group: 'Typography', key: 'heading_font_family', label: 'Heading font family', type: 'text', public: true },
  { group: 'Typography', key: 'body_font_url', label: 'Body font URL', type: 'text', public: true },
  { group: 'Typography', key: 'body_font_family', label: 'Body font family', type: 'text', public: true },
  { group: 'Typography', key: 'title_font_size', label: 'Title font size', type: 'number', public: true },
  { group: 'Typography', key: 'title_align', label: 'Title alignment', type: 'select', public: true, options: [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
  ] },
  { group: 'Typography', key: 'cta_font_size', label: 'CTA font size', type: 'number', public: true },
  { group: 'Typography', key: 'cta_font_weight', label: 'CTA font weight', type: 'text', public: true },
  { group: 'Typography', key: 'price_font_size', label: 'Price font size', type: 'number', public: true },
  { group: 'Typography', key: 'price_font_weight', label: 'Price font weight', type: 'text', public: true },

  { group: 'Controls', key: 'dog_control_type', label: 'Dog control type', type: 'select', public: true, options: [
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'slider', label: 'Slider' },
  ] },
  { group: 'Controls', key: 'frequency_control_type', label: 'Frequency control type', type: 'select', public: true, options: [
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'slider', label: 'Slider' },
  ] },
  { group: 'Controls', key: 'slider_track_color', label: 'Slider track color', type: 'color', public: true },
  { group: 'Controls', key: 'slider_fill_color', label: 'Slider fill color', type: 'color', public: true },
  { group: 'Controls', key: 'slider_thumb_color', label: 'Slider thumb color', type: 'color', public: true },
  { group: 'Controls', key: 'addon2_label', label: 'Optional add-on label', type: 'text', public: true },
  { group: 'Controls', key: 'addon2_price', label: 'Optional add-on price', type: 'text', public: true },
  { group: 'Controls', key: 'addon2_desc', label: 'Optional add-on description', type: 'textarea', rows: 4, public: true },
];

export function fieldAllowed(field: SettingField, account?: AccountEntitlements | null) {
  if (field.feature && hasFeature(account, field.feature)) return true;
  if (field.addon && hasAddon(account, field.addon)) return true;
  if (field.plan && !hasPlan(account, field.plan)) return false;
  if (field.feature) return false;
  return true;
}

export function sanitizeSettingsForAccount(settings: any, account?: AccountEntitlements | null) {
  const merged = mergeSettings(settings);
  const out: Record<string, any> = { ...merged };
  for (const field of settingFields) {
    if (fieldAllowed(field, account)) continue;
    out[field.key] = defaultSettings[field.key as keyof typeof defaultSettings];
  }
  return out;
}

export function settingsSchema() {
  const groups = Array.from(new Set(settingFields.map(field => field.group)));
  return {
    groups: groups.map(group => ({ title: group, fields: settingFields.filter(field => field.group === group) })),
    defaults: defaultSettings,
    plans: planCatalog,
  };
}

export function publicSettings(settings: any, account?: AccountEntitlements | null) {
  const merged = sanitizeSettingsForAccount(settings, account);
  const allowed = new Set(settingFields.filter(field => field.public).map(field => field.key));
  const out: Record<string, any> = {};
  for (const key of allowed) out[key] = merged[key as keyof typeof merged];
  if (out.use_managed_mapbox_token) {
    out.mapbox_token = hasFeature(account, 'managedMapbox') ? String(process.env.WARREN_MAPBOX_TOKEN || process.env.TQT_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || '') : '';
  }
  if (!hasFeature(account, 'yardMap')) {
    out.enable_yard_map = false;
    out.mapbox_token = '';
    out.use_managed_mapbox_token = false;
  }
  out.copy_overrides = merged.copy_overrides;
  out.entitlements = accountEntitlements(account);
  return out;
}
