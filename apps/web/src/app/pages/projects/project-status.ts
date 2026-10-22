import type { ProjectStatus } from '@silopro/contracts';

export const statusTone = (s: ProjectStatus) =>
  s === 'active' ? 'primary' : s === 'done' ? 'success' : 'neutral';
