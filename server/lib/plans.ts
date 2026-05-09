export type AccountEntitlements = {
  plan?: string;
  billing_status?: string;
  addons?: Record<string, any> | null;
};

export type FeatureKey =
  | 'advancedTracking'
  | 'crmWebhooks'
  | 'customBranding'
  | 'developerEvents'
  | 'managedMapbox'
  | 'yardMap';

export const planCatalog = {
  free: {
    label: 'Free',
    description: 'Basic hosted quote widget for trying the CRM add-on.',
    features: ['Instant quote embed', 'Sweep&Go or email lead capture', 'Titan branding'],
  },
  starter: {
    label: 'Starter',
    description: 'One-time setup for a production quote widget connected to the CRM you already use.',
    features: ['Everything in Free', 'Custom copy and colors', 'Manual pricing', 'Basic lead history'],
  },
  pro: {
    label: 'Pro Add-on',
    description: 'Monthly add-on for serious lead capture, tracking, and CRM routing.',
    features: ['Everything in Starter', 'Tracking pixels', 'Webhooks', 'Custom CSS', 'Developer event log', 'Yard map with customer Mapbox token'],
  },
  agency: {
    label: 'Agency',
    description: 'Multi-client add-on plan for operators and agencies managing more than one widget.',
    features: ['Everything in Pro', 'Managed Mapbox option', 'Agency support', 'Multiple client workflows'],
  },
} as const;

const planRank: Record<string, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  agency: 3,
};

const featureMinimumPlan: Record<FeatureKey, string> = {
  advancedTracking: 'pro',
  crmWebhooks: 'pro',
  customBranding: 'pro',
  developerEvents: 'pro',
  managedMapbox: 'agency',
  yardMap: 'pro',
};

function normalizedPlan(account?: AccountEntitlements | null) {
  const raw = String(account?.plan || 'free').toLowerCase();
  return raw in planRank ? raw : 'free';
}

function billingActive(account?: AccountEntitlements | null) {
  const status = String(account?.billing_status || 'active').toLowerCase();
  return !['canceled', 'past_due', 'unpaid', 'disabled', 'inactive'].includes(status);
}

export function hasPlan(account: AccountEntitlements | null | undefined, minimumPlan: string) {
  if (!billingActive(account)) return false;
  const current = normalizedPlan(account);
  const required = String(minimumPlan || 'free').toLowerCase();
  return (planRank[current] ?? 0) >= (planRank[required] ?? 0);
}

export function hasAddon(account: AccountEntitlements | null | undefined, addon: string) {
  if (!billingActive(account)) return false;
  const addons = account?.addons || {};
  const value = addons[addon];
  return value === true || value === 'true' || value === 'active' || value === 1;
}

export function hasFeature(account: AccountEntitlements | null | undefined, feature: FeatureKey) {
  if (feature === 'yardMap') return hasPlan(account, featureMinimumPlan.yardMap) || hasAddon(account, 'yard_map');
  if (feature === 'managedMapbox') return hasPlan(account, featureMinimumPlan.managedMapbox) || hasAddon(account, 'managed_mapbox');
  return hasPlan(account, featureMinimumPlan[feature]);
}

export function accountEntitlements(account: AccountEntitlements | null | undefined) {
  const normalized = {
    plan: normalizedPlan(account),
    billing_status: account?.billing_status || 'active',
    addons: account?.addons || {},
  };
  return {
    ...normalized,
    features: {
      advancedTracking: hasFeature(normalized, 'advancedTracking'),
      crmWebhooks: hasFeature(normalized, 'crmWebhooks'),
      customBranding: hasFeature(normalized, 'customBranding'),
      developerEvents: hasFeature(normalized, 'developerEvents'),
      managedMapbox: hasFeature(normalized, 'managedMapbox'),
      yardMap: hasFeature(normalized, 'yardMap'),
    },
  };
}

export function billingLinksFromEnv() {
  return {
    starter: process.env.STRIPE_STARTER_PAYMENT_LINK || process.env.TQT_STARTER_PAYMENT_LINK || '',
    pro: process.env.STRIPE_PRO_PAYMENT_LINK || process.env.TQT_PRO_PAYMENT_LINK || '',
    agency: process.env.STRIPE_AGENCY_PAYMENT_LINK || process.env.TQT_AGENCY_PAYMENT_LINK || '',
    map: process.env.STRIPE_MAP_PAYMENT_LINK || process.env.TQT_MAP_PAYMENT_LINK || '',
    portal: process.env.STRIPE_CUSTOMER_PORTAL_LINK || process.env.TQT_CUSTOMER_PORTAL_LINK || '',
  };
}
