import adminEntryHandler from './admin-entry.js';

/** Dedicated route for importing legacy event notices into the audit timeline. */
export default async function handler(req, res) {
  if (!req.body || typeof req.body !== 'object') req.body = {};
  req.body.action = 'backfill-audit-notices';
  return adminEntryHandler(req, res);
}
