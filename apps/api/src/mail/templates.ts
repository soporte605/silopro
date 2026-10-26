import type { MailMessage } from './mail.service.js';

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Correo sencillo con un botón; el texto plano lleva el mismo enlace. */
function layout(
  to: string,
  subject: string,
  paragraphs: string[],
  action: { label: string; url: string },
  footer: string,
): MailMessage {
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f6f7;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1c2024">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:8px;border:1px solid #e3e5e8">
<tr><td style="padding:24px 28px">
<p style="margin:0 0 16px;font-weight:600;font-size:16px">SiloPro</p>
${paragraphs.map((p) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.5">${esc(p)}</p>`).join('\n')}
<p style="margin:20px 0"><a href="${esc(action.url)}" style="display:inline-block;background:#1c2024;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-size:14px;font-weight:500">${esc(action.label)}</a></p>
<p style="margin:0 0 4px;font-size:12px;color:#60646c">Si el botón no funciona, copie este enlace:</p>
<p style="margin:0 0 16px;font-size:12px;word-break:break-all"><a href="${esc(action.url)}" style="color:#60646c">${esc(action.url)}</a></p>
<p style="margin:0;font-size:12px;color:#60646c">${esc(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [...paragraphs, '', `${action.label}: ${action.url}`, '', footer].join('\n');
  return { to, subject, text, html };
}

export function verifyEmailMail(to: string, name: string, url: string): MailMessage {
  return layout(
    to,
    'Confirme su correo en SiloPro',
    [`Hola, ${name}.`, 'Para terminar de crear su cuenta, confirme que este correo es suyo.'],
    { label: 'Confirmar correo', url },
    'El enlace vence en 24 horas. Si no creó una cuenta en SiloPro, ignore este mensaje.',
  );
}

export function resetPasswordMail(to: string, name: string, url: string): MailMessage {
  return layout(
    to,
    'Restablecer su contraseña de SiloPro',
    [`Hola, ${name}.`, 'Recibimos una solicitud para cambiar la contraseña de su cuenta.'],
    { label: 'Elegir una contraseña nueva', url },
    'El enlace vence en 1 hora y solo sirve una vez. Si usted no lo pidió, ignore este mensaje: su contraseña no cambia.',
  );
}

export function invitationMail(
  to: string,
  inviter: string,
  organization: string,
  role: string,
  url: string,
): MailMessage {
  return layout(
    to,
    `${inviter} le invitó a ${organization} en SiloPro`,
    [`${inviter} le invitó a unirse a «${organization}» en SiloPro como ${role}.`],
    { label: 'Aceptar invitación', url },
    'Si no esperaba esta invitación, ignore este mensaje.',
  );
}
