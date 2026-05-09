import { copyStrings, publicSettings } from './settings.js';
import { accountEntitlements } from './plans.js';

export const VPW: Record<string, number> = {
  seven_times_a_week: 7,
  six_times_a_week: 6,
  five_times_a_week: 5,
  four_times_a_week: 4,
  three_times_a_week: 3,
  two_times_a_week: 2,
  once_a_week: 1,
  bi_weekly: 0.5,
  twice_per_month: 0.5,
  every_three_weeks: 1 / 3,
  once_a_month: 0.25,
  every_four_weeks: 0.25,
  one_time: 0,
};

export function digits(value: unknown, max = 15) {
  return String(value ?? '').replace(/\D/g, '').slice(0, max);
}

export function normFreq(value: unknown) {
  let s = String(value ?? '').trim();
  if (!s) return '';
  if (s.includes('_')) return s.toLowerCase();
  s = s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const map: Record<string, string> = {
    'seven times a week': 'seven_times_a_week',
    '7 times a week': 'seven_times_a_week',
    'six times a week': 'six_times_a_week',
    '6 times a week': 'six_times_a_week',
    'five times a week': 'five_times_a_week',
    '5 times a week': 'five_times_a_week',
    'four times a week': 'four_times_a_week',
    '4 times a week': 'four_times_a_week',
    'three times a week': 'three_times_a_week',
    'two times a week': 'two_times_a_week',
    'once a week': 'once_a_week',
    biweekly: 'bi_weekly',
    'bi weekly': 'bi_weekly',
    'twice per month': 'twice_per_month',
    'every 3 weeks': 'every_three_weeks',
    'every three weeks': 'every_three_weeks',
    'once a month': 'once_a_month',
    monthly: 'once_a_month',
    'every 4 weeks': 'every_four_weeks',
    'every four weeks': 'every_four_weeks',
    'one time': 'one_time',
    'one time clean': 'one_time',
  };
  return map[s] || s.replace(/ /g, '_');
}

export function freqLabel(value: unknown) {
  const slug = normFreq(value);
  const map: Record<string, string> = {
    seven_times_a_week: 'Seven Times A Week',
    six_times_a_week: 'Six Times A Week',
    five_times_a_week: 'Five Times A Week',
    four_times_a_week: 'Four Times A Week',
    three_times_a_week: 'Three Times A Week',
    two_times_a_week: 'Two Times A Week',
    once_a_week: 'Once A Week',
    bi_weekly: 'Bi Weekly',
    twice_per_month: 'Twice Per Month',
    every_three_weeks: 'Every Three Weeks',
    once_a_month: 'Once A Month',
    every_four_weeks: 'Every Four Weeks',
    one_time: 'One Time',
  };
  return map[slug] || String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeYardSqft(value: unknown) {
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function yardBucket(sqft: number | null) {
  if (!sqft) return '';
  if (sqft <= 5445) return 'eighth_acre';
  if (sqft <= 10890) return 'quarter_acre';
  if (sqft <= 21780) return 'half_acre';
  if (sqft <= 43560) return 'one_acre';
  return 'xlarge';
}

export function yardBucketLabel(sqft: number | null) {
  if (!sqft) return '';
  if (sqft <= 5445) return 'Up to 1/8 acre';
  if (sqft <= 10890) return 'Up to 1/4 acre';
  if (sqft <= 21780) return 'Up to 1/2 acre';
  if (sqft <= 43560) return 'Up to 1 acre';
  return 'Over 1 acre';
}

export function manualDogOptions(settings: any) {
  return String(settings.manual_dogs || '')
    .split(/[\r\n,]+/)
    .map(s => Number(String(s).replace(/[^0-9]/g, '')))
    .filter(n => Number.isFinite(n) && n > 0)
    .filter((n, i, arr) => arr.indexOf(n) === i)
    .sort((a, b) => a - b);
}

export function manualFrequencyOptions(settings: any) {
  return String(settings.manual_frequencies || '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [rawSlug, rawLabel] = line.includes('|') ? line.split('|', 2).map(s => s.trim()) : [line, ''];
      const value = normFreq(rawSlug);
      return value ? { value, label: rawLabel || freqLabel(value) } : null;
    })
    .filter(Boolean) as Array<{ value: string; label: string }>;
}

export function localAreaOptions(settings: any) {
  const mode = settings.local_area_mode === 'locations' ? 'locations' : 'zip';
  return String(settings.local_area_values || '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [rawValue, rawLabel] = line.includes('|') ? line.split('|', 2).map(s => s.trim()) : [line, ''];
      const value = mode === 'zip' ? digits(rawValue, 10) : rawValue;
      if (!value) return null;
      return { value, label: rawLabel || value };
    })
    .filter(Boolean);
}

export function parseManualPricing(settings: any) {
  const lines = String(settings.manual_pricing || '').split(/\r\n|\r|\n/);
  const rules: Array<{ dogs: number; frequency: string; per_cleanup: number | null; monthly: number | null; yard_size?: string; min_sqft?: number; max_sqft?: number }> = [];
  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const parts = raw.split('|').map(s => s.trim());
    if (parts.length < 4) continue;
    const dogs = Number(parts[0]);
    const frequency = normFreq(parts[1]);
    const per_cleanup = numberValue(parts[2]);
    const monthly = numberValue(parts[3]);
    if (!dogs || !frequency) continue;
    const extra: any = {};
    for (const bit of parts.slice(4)) {
      const [k, v] = bit.split('=').map(s => s.trim());
      if (k === 'yard_size') extra.yard_size = v;
      if (k === 'min_sqft') extra.min_sqft = Number(v);
      if (k === 'max_sqft') extra.max_sqft = Number(v);
    }
    rules.push({ dogs, frequency, per_cleanup, monthly, ...extra });
  }
  return rules;
}

export function parseYardSizeAdjustments(settings: any) {
  const lines = String(settings.yard_size_adjustments || '').split(/\r\n|\r|\n/);
  const rules: Array<{ min_sqft: number | null; max_sqft: number | null; label: string; monthly_delta: number; per_cleanup_delta: number }> = [];
  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const parts = raw.split('|').map(s => s.trim());
    if (parts.length < 4) continue;
    const min_sqft = numberValue(parts[0]);
    const max_sqft = numberValue(parts[1]);
    const label = parts[2] || '';
    const monthly_delta = numberValue(parts[3]) || 0;
    const per_cleanup_delta = numberValue(parts[4]) || 0;
    rules.push({ min_sqft, max_sqft, label, monthly_delta, per_cleanup_delta });
  }
  return rules;
}

export function yardSizeAdjustment(settings: any, yardSqft: number | null) {
  if (!yardSqft) return null;
  const rules = parseYardSizeAdjustments(settings);
  const match = rules.find(rule => {
    if (rule.min_sqft != null && yardSqft < rule.min_sqft) return false;
    if (rule.max_sqft != null && yardSqft > rule.max_sqft) return false;
    return true;
  });
  if (!match) return null;
  return {
    yard_sqft: yardSqft,
    yard_size: yardBucket(yardSqft),
    yard_size_label: match.label || yardBucketLabel(yardSqft),
    monthly_delta: match.monthly_delta,
    per_cleanup_delta: match.per_cleanup_delta,
  };
}

export function normalizeQuotePrice(settings: any, data: any, frequencyValue: unknown, yardSqftInput: unknown) {
  if (!data || !data.price || typeof data.price !== 'object') return data;
  const frequency = normFreq(frequencyValue);
  const vpw = VPW[frequency] || 0;
  const factor = settings.recurring_calc_mode === 'four_weeks' ? 4 : 52 / 12;
  let perCleanup = numberValue(data.price.price_per_cleanup ?? data.price.per_cleanup ?? data.price.pricePerCleanup);
  let monthly = numberValue(data.price.monthly_price ?? data.price.monthlyPrice ?? data.price.monthly_total ?? data.price.value);
  if (frequency !== 'one_time' && vpw > 0) {
    if (perCleanup == null && monthly != null) perCleanup = monthly / (vpw * factor);
    if (monthly == null && perCleanup != null) monthly = perCleanup * (vpw * factor);
  }

  const yardSqft = normalizeYardSqft(yardSqftInput);
  const adjustment = yardSizeAdjustment(settings, yardSqft);
  if (adjustment) {
    if (monthly != null && adjustment.monthly_delta) monthly += adjustment.monthly_delta;
    if (perCleanup != null && adjustment.per_cleanup_delta) perCleanup += adjustment.per_cleanup_delta;
    if (frequency !== 'one_time' && vpw > 0) {
      if (adjustment.monthly_delta && perCleanup != null) perCleanup += adjustment.monthly_delta / (vpw * factor);
      if (adjustment.per_cleanup_delta && monthly != null) monthly += adjustment.per_cleanup_delta * (vpw * factor);
    }
  }

  data.price = {
    ...data.price,
    price_per_cleanup: perCleanup,
    monthly_price: monthly,
  };
  if (yardSqft) {
    data.yard_sqft = yardSqft;
    data.yard_size = yardBucket(yardSqft);
    data.yard_size_label = adjustment?.yard_size_label || yardBucketLabel(yardSqft);
  }
  if (adjustment) data.yard_size_adjustment = adjustment;
  return data;
}

export function manualPricingLookup(settings: any, dogs: number, frequency: string, yardSqft: number | null) {
  const bucket = yardBucket(yardSqft);
  const rules = parseManualPricing(settings).filter(rule => rule.dogs === dogs && rule.frequency === frequency);
  if (!rules.length) return null;
  const withSqft = rules.find(rule => {
    if (rule.yard_size && rule.yard_size !== bucket) return false;
    if (rule.min_sqft && (!yardSqft || yardSqft < rule.min_sqft)) return false;
    if (rule.max_sqft && (!yardSqft || yardSqft > rule.max_sqft)) return false;
    return !!rule.yard_size || !!rule.min_sqft || !!rule.max_sqft;
  });
  return withSqft || rules[0] || null;
}

export function computeManualPrice(settings: any, body: any) {
  let dogs = Math.max(1, Number(body.number_of_dogs ?? body.dogs ?? 1) || 1);
  let frequency = normFreq(body.clean_up_frequency ?? body.frequency ?? 'once_a_week') || 'once_a_week';
  if (settings.recurring_calc_mode === 'four_weeks' && frequency === 'once_a_month') frequency = 'every_four_weeks';
  const allowedDogs = manualDogOptions(settings);
  if (allowedDogs.length && !allowedDogs.includes(dogs)) dogs = allowedDogs[0];
  const allowedFreqs = manualFrequencyOptions(settings).map(row => row.value);
  if (allowedFreqs.length && !allowedFreqs.includes(frequency)) frequency = allowedFreqs[0];
  const yard_sqft = normalizeYardSqft(body.yard_sqft ?? body.yardSqft ?? body.square_feet ?? body.squareFeet);
  const match = manualPricingLookup(settings, dogs, frequency, yard_sqft);
  if (match) {
    let perCleanup = match.per_cleanup;
    let monthly = match.monthly;
    const vpw = VPW[frequency] || 0;
    const factor = settings.recurring_calc_mode === 'four_weeks' ? 4 : 52 / 12;
    if (perCleanup == null && monthly != null && vpw > 0) perCleanup = monthly / (vpw * factor);
    if (monthly == null && perCleanup != null && vpw > 0) monthly = perCleanup * (vpw * factor);
    return normalizeQuotePrice(settings, { dogs, frequency, yard_sqft, price: { price_per_cleanup: perCleanup, monthly_price: monthly }, manual_pricing: true }, frequency, yard_sqft);
  }
  if (frequency === 'one_time' && String(settings.one_time_price || '').trim() !== '') {
    const base = Number(settings.one_time_price) || 0;
    const extra = Number(settings.one_time_price_per_extra_dog) || 0;
    return normalizeQuotePrice(settings, {
      dogs,
      frequency,
      yard_sqft,
      price: { price_per_cleanup: base + extra * Math.max(0, dogs - 1), monthly_price: null },
      manual_pricing: true,
      manual_one_time: true,
    }, frequency, yard_sqft);
  }
  return null;
}

export function publicWidgetConfig(widget: any, settings: any) {
  const copy = copyStrings(settings);
  const account = {
    plan: widget.account_plan || widget.plan || 'free',
    billing_status: widget.billing_status || 'active',
    addons: widget.account_addons || widget.addons || {},
  };
  return {
    widgetId: widget.public_id,
    enabled: widget.enabled,
    account: accountEntitlements(account),
    settings: publicSettings(settings, account),
    copy,
    options: {
      dogDefaults: manualDogOptions(settings),
      frequencyDefaults: manualFrequencyOptions(settings),
      areaOptions: localAreaOptions(settings),
    },
  };
}
