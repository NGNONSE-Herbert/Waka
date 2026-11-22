/** Design « Canopée, plein jour en forêt » : valeurs reprises des maquettes. */
export const c = {
  bg: '#F3F7EE',
  ink: '#0B1F17',
  forest: '#123A2A',
  forestSoft: '#1A5239',
  leaf: '#1F7A4C',
  lime: '#D9F27B',
  white: '#FFFFFF',
  muted: '#3D5346',
  line: '#D7E3D0',
  lineStrong: '#B9CDB4',
  dots: '#8FB088',
  sage: '#E4EFDD',
  mist: '#DCEDD2',
  onDark: '#D6E6D2',
  onDarkMuted: '#BFD6BA',
  navIcon: '#C8D6CB',
  danger: '#9B2C1F',
  dangerBg: '#FBE9E4',
} as const;

export const f = {
  display: 'BricolageGrotesque_800ExtraBold',
  displayBold: 'BricolageGrotesque_700Bold',
  body: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semi: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
} as const;

/** Coins asymétriques, signature du design. */
export const leaf = { borderTopLeftRadius: 32, borderTopRightRadius: 10, borderBottomRightRadius: 32, borderBottomLeftRadius: 10 } as const;
export const leafAlt = { borderTopLeftRadius: 10, borderTopRightRadius: 32, borderBottomRightRadius: 10, borderBottomLeftRadius: 32 } as const;

export const shadow = {
  shadowColor: c.ink,
  shadowOpacity: 0.14,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 5,
} as const;
