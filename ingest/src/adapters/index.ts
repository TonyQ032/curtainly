import type { SourceKind } from '@curtainly/shared';
import type { Adapter } from '../types';

/**
 * Registered adapters by source kind. M3 adds Ticketmaster, OvationTix, JSON-LD,
 * Arts People, ThunderTix, VBO and custom site adapters here.
 * `manual` and `submission` sources have no adapter: they enter via the web app.
 */
export const adapters: Partial<Record<SourceKind, Adapter>> = {};
