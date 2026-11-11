/** Tokens shown on /admin/theme. Mirror of section 2 in app/theme.css. */
export const TOKEN_GROUPS: { label: string; tokens: { name: string; use: string }[] }[] = [
  {
    label: 'Surfaces',
    tokens: [
      { name: '--bg', use: 'Page background' },
      { name: '--surface', use: 'Table headers, hover' },
      { name: '--surface-raised', use: 'Inputs, cards' },
      { name: '--line', use: 'Dividers' },
      { name: '--control-border', use: 'Input and button outlines' },
    ],
  },
  {
    label: 'Text',
    tokens: [
      { name: '--fg', use: 'Body text' },
      { name: '--muted', use: 'Secondary text' },
      { name: '--link', use: 'Links' },
    ],
  },
  {
    label: 'Accent',
    tokens: [
      { name: '--accent', use: 'Primary buttons, active marks' },
      { name: '--accent-hover', use: 'Primary hover' },
      { name: '--accent-fg', use: 'Text on accent' },
      { name: '--accent-soft', use: 'Selected nav, tags' },
      { name: '--accent-soft-fg', use: 'Text on accent-soft' },
      { name: '--highlight', use: 'Live / spotlight' },
      { name: '--focus', use: 'Keyboard focus ring' },
    ],
  },
  {
    label: 'Status',
    tokens: [
      { name: '--error', use: 'Errors' },
      { name: '--success', use: 'Confirmations' },
    ],
  },
];
