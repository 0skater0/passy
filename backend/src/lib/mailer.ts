import nodemailer from 'nodemailer';
import {config} from '../config.js';

// --- HTML email template system ---
// All templates use inline CSS for maximum email client compatibility.

const BRAND_COLOR = '#6d28d9'; // violet-700
const BG_DARK = '#1a1a2e';
const BG_CARD = '#16213e';
const TEXT_PRIMARY = '#e2e8f0';
const TEXT_MUTED = '#94a3b8';

function escape_html(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Wrap body content in a responsive HTML email layout with Passy branding. */
function html_layout(title: string, body: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:${BG_DARK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_DARK};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:${BG_CARD};border-radius:12px;overflow:hidden;">
<tr><td style="padding:32px 32px 0;text-align:center;">
  <div style="font-size:28px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.5px;">Passy</div>
</td></tr>
<tr><td style="padding:24px 32px 32px;color:${TEXT_PRIMARY};font-size:15px;line-height:1.6;">
${body}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
  <div style="font-size:12px;color:${TEXT_MUTED};">This is an automated message from Passy. Please do not reply.</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// --- Template definitions ---

type template_vars = Record<string, string | number>;

interface email_template {
    subject: string;
    html: string;
    text: string;
}

function template_welcome(vars: template_vars): email_template {
    const name = escape_html(String(vars.name || 'there'));
    return {
        subject: 'Welcome to Passy',
        html: html_layout('Welcome to Passy', `
  <div style="font-size:18px;font-weight:600;margin-bottom:12px;">Welcome, ${name}!</div>
  <p style="margin:0 0 16px;">Your Passy account has been created successfully. You can now save your generated passwords, sync settings across devices, and manage your security preferences.</p>
  <p style="margin:0;color:${TEXT_MUTED};">If you didn't create this account, you can safely ignore this email.</p>
`),
        text: `Welcome to Passy!\n\nHi ${name},\n\nyour Passy account has been created successfully. You can now save your generated passwords, sync settings across devices, and manage your security preferences.\n\nIf you didn't create this account, you can safely ignore this email.`
    };
}

function template_password_reset(vars: template_vars): email_template {
    const reset_link = escape_html(String(vars.reset_link || ''));
    const expiry = vars.expiry_minutes ?? 60;
    const link_block = reset_link ? `
  <div style="margin:20px 0;text-align:center;">
    <a href="${reset_link}" style="display:inline-block;padding:14px 32px;background-color:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Reset Password</a>
  </div>
  <p style="margin:0 0 8px;color:${TEXT_MUTED};font-size:12px;text-align:center;word-break:break-all;">Or copy this link: ${reset_link}</p>` : '';
    return {
        subject: 'Passy — Password Reset',
        html: html_layout('Password Reset', `
  <div style="font-size:18px;font-weight:600;margin-bottom:12px;">Password Reset</div>
  <p style="margin:0 0 8px;">You requested a password reset for your Passy account. Click the button below to set a new password:</p>
  ${link_block}
  <p style="margin:16px 0 0;color:${TEXT_MUTED};font-size:13px;">This link expires in <strong style="color:${TEXT_PRIMARY};">${expiry} minutes</strong> and can only be used once.</p>
  <p style="margin:8px 0 0;color:${TEXT_MUTED};font-size:13px;">If you didn't request this reset, you can safely ignore this email. Your password will remain unchanged.</p>
`),
        text: `Passy — Password Reset\n\nYou requested a password reset for your Passy account.\n\n${reset_link ? `Reset your password: ${reset_link}\n\n` : ''}This link expires in ${expiry} minutes and can only be used once.\n\nIf you didn't request this reset, you can safely ignore this email.`
    };
}

const TEMPLATES: Record<string, (vars: template_vars) => email_template> = {
    welcome: template_welcome,
    password_reset: template_password_reset,
};

// --- Public API ---

let cached_transporter: nodemailer.Transporter | null | undefined;

export function get_transporter() {
    if (cached_transporter !== undefined) return cached_transporter;
    const smtp = config.accounts.smtp;
    if (!smtp.host) {
        cached_transporter = null;
        return null;
    }
    // Auth is optional: internal relays (e.g. mail-relay container on port 25) accept unauthenticated delivery.
    const has_auth = Boolean(smtp.user && smtp.pass);
    // Port 465 → implicit TLS. Port 587 (submission) → enforce STARTTLS to prevent MITM downgrade.
    // Port 25 (internal relay) → opportunistic, no enforcement.
    const is_implicit_tls = smtp.port === 465;
    const require_starttls = smtp.port === 587;
    cached_transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: is_implicit_tls,
        requireTLS: require_starttls,
        ...(has_auth ? {auth: {user: smtp.user, pass: smtp.pass}} : {}),
    });
    return cached_transporter;
}

/** Send an email using a named template with variables. Falls back to plaintext if template not found. */
export async function send_template_email(to: string, template: string, vars: template_vars = {}): Promise<boolean> {
    const t = get_transporter();
    if (!t) {
        console.warn(`[warn] Email not sent (no SMTP configured): template=${template}`);
        return false;
    }
    const builder = TEMPLATES[template];
    if (!builder) {
        console.warn(`[warn] Unknown email template: ${template}`);
        return false;
    }
    const email = builder(vars);
    try {
        await t.sendMail({
            from: config.accounts.smtp.from || config.accounts.smtp.user,
            to,
            subject: email.subject,
            text: email.text,
            html: email.html,
        });
        return true;
    } catch (err) {
        console.error(`[error] Failed to send email: template=${template} error=${err instanceof Error ? err.message : err}`);
        return false;
    }
}

