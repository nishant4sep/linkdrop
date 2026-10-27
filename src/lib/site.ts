/**
 * Single place to edit before launch: the public contact points for reports,
 * privacy requests, and DMCA notices. All legal pages read from here.
 *
 * TODO(owner): set real, monitored addresses before the site goes public.
 * They do not have to be mailboxes — any inbox you actually read works.
 */
export const SITE_NAME = 'LinkDrop';
export const CONTACT_EMAIL = 'YOUR-CONTACT-EMAIL@example.com';
export const DMCA_EMAIL = 'YOUR-DMCA-EMAIL@example.com';

export const SITE_NOTAFFILIATED = 'LinkDrop is an independent project and is not affiliated with Instagram or Meta Platforms, Inc.';

// ---------------------------------------------------------------------------
// Phase 2 policy: NO points, NO rewards earning. The live leaderboard ranks
// contributors by how many of their links are GENUINE and live right now.
// The top names may promote their own ad, subject to these owner-tunable
// thresholds (mirrored in the SQL defaults; keep both sides in sync).
// ---------------------------------------------------------------------------
export const PROMO_TOP_N = 3;          // must be inside the leaderboard top
export const PROMO_MIN_LINKS = 5;      // …and have at least this many live links
export const PROMO_WINDOW_HOURS = 24;  // approval window; owner can extend

export const PROMO_GUIDELINES = [
  'Your link must lead where it says (no redirect tricks or fake buttons).',
  'No adult content, malware, scams, or anything illegal.',
  'Self-promotion is fine — tricking people is not.',
];

export const PROMO_HEADLINE_MAX = 80;
export const PROMO_DETAIL_MAX = 200;

// ---------------------------------------------------------------------------
// Username-account rules. Passwords are never validated or stored outside
// Supabase Auth. The auth email is synthesized and must never be shown.
// ---------------------------------------------------------------------------
export const ACCOUNT_AUTH_EMAIL_SUFFIX = '@users.linkdrop.internal';
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** Identity roles the platform itself answers for — nobody signs up as them. */
export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'owner', 'linkdrop', 'support', 'help',
  'staff', 'moderator', 'mod', 'official', 'team', 'system', 'security',
  'dmca', 'privacy', 'terms', 'leaderboard', 'dashboard', 'login', 'signup',
  'account', 'bot', 'linkdrop_team',
]);
