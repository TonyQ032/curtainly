import 'server-only';

/** IANA timezones for the picker, with `current` kept even if the runtime doesn't list it. */
export function timeZoneOptions(current?: string): string[] {
  const zones = Intl.supportedValuesOf('timeZone');
  if (!zones.includes('UTC')) zones.push('UTC');
  if (current && !zones.includes(current)) zones.push(current);
  return zones.sort();
}
