import type { Role } from '@silopro/domain';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  sessionId: string;
}

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: Role;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  org?: OrgContext;
}

export const SESSION_COOKIE = 'sp_session';
