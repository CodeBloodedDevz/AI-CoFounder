// Writes one line to public.admin_audit_log for every admin sign-in and every change an admin makes.
// Never stops the request: a failed write is only logged on the server.

const supabase = require('../supabaseClient');

async function writeAudit(admin, { action, level = 'info', targetType = null, targetId = null, message, details = {} }) {
  const { error } = await supabase.from('admin_audit_log').insert({
    admin_id: admin?.id || null,
    admin_email: admin?.email || null,
    action,
    level,
    target_type: targetType,
    target_id: targetId == null ? null : String(targetId),
    message: String(message || action).slice(0, 500),
    details,
  });
  if (error) console.warn(`[admin] could not write the audit log: ${error.message}`);
}

module.exports = { writeAudit };
