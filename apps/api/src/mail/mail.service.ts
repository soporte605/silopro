import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Correos enviados durante las pruebas (`NODE_ENV=test`), del más antiguo al más nuevo. */
export const testOutbox: MailMessage[] = [];

/**
 * Correos transaccionales con Resend (API HTTP, sin SDK). Sin `RESEND_API_KEY`
 * se escriben en el registro para desarrollo; en pruebas van a `testOutbox`.
 * Un fallo de envío se registra y no interrumpe la operación que lo pidió.
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Correo');

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(msg: MailMessage): Promise<boolean> {
    if (this.env.NODE_ENV === 'test') {
      testOutbox.push(msg);
      return true;
    }
    if (!this.env.RESEND_API_KEY) {
      this.log.log(`(sin RESEND_API_KEY) Para ${msg.to}: ${msg.subject}\n${msg.text}`);
      if (this.env.MAIL_OUTBOX_DIR) {
        await mkdir(this.env.MAIL_OUTBOX_DIR, { recursive: true });
        const name = `${Date.now()}-${msg.to.replace(/[^a-z0-9@._-]/gi, '_')}.json`;
        await writeFile(join(this.env.MAIL_OUTBOX_DIR, name), JSON.stringify(msg));
      }
      return true;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.env.MAIL_FROM,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.log.error(`Resend respondió ${res.status} al enviar «${msg.subject}»`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.error(`No se pudo enviar «${msg.subject}»: ${(e as Error).message}`);
      return false;
    }
  }
}
