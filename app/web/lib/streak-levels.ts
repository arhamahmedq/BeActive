/**
 * Single source of truth for the plant evolution ladder.
 * Both StreakWidget and StreakPlantCard MUST import from here
 * so they always show the same emoji for the same streak count.
 */

export const PLANT_LEVELS = [
  {
    level: 0,
    emoji: '🌱',
    name: 'Dormant Seed',
    shortName: 'Seed',
    from: 0,
    nextAt: 1,
    description: 'Post your first workout to wake your seed.',
    color: '#9ca3af',
    bgColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  {
    level: 1,
    emoji: '🌿',
    name: 'Sprout',
    shortName: 'Sprout',
    from: 1,
    nextAt: 7,
    description: 'A tiny sprout! Keep your streak going.',
    color: '#22c55e',
    bgColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  {
    level: 2,
    emoji: '🪴',
    name: 'Young Plant',
    shortName: 'Young Plant',
    from: 7,
    nextAt: 30,
    description: '1 week strong. The roots are setting in.',
    color: '#16a34a',
    bgColor: '#dcfce7',
    borderColor: '#86efac',
  },
  {
    level: 3,
    emoji: '🌲',
    name: 'Strong Tree',
    shortName: 'Strong Tree',
    from: 30,
    nextAt: 100,
    description: '30 days. You\'ve built a real habit.',
    color: '#15803d',
    bgColor: '#dcfce7',
    borderColor: '#4ade80',
  },
  {
    level: 4,
    emoji: '🌳',
    name: 'Ancient Tree',
    shortName: 'Ancient Tree',
    from: 100,
    nextAt: 200,
    description: '100 days. Most people never get here.',
    color: '#166534',
    bgColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  {
    level: 5,
    emoji: '🎄',
    name: 'Elder Tree',
    shortName: 'Elder',
    from: 200,
    nextAt: 365,
    description: '200 days. A monument to consistency.',
    color: '#14532d',
    bgColor: '#dcfce7',
    borderColor: '#15803d',
  },
  {
    level: 6,
    emoji: '🌸',
    name: 'Legendary Bloom',
    shortName: 'Legendary',
    from: 365,
    nextAt: Infinity,
    description: '365 days. You have achieved the legendary bloom.',
    color: '#be185d',
    bgColor: '#fdf2f8',
    borderColor: '#f9a8d4',
  },
] as const

export type PlantLevel = typeof PLANT_LEVELS[number]

export function getPlantLevel(days: number): PlantLevel {
  let current: PlantLevel = PLANT_LEVELS[0]
  for (const lvl of PLANT_LEVELS) {
    if (days >= lvl.from) current = lvl
    else break
  }
  return current
}

export function getPlantLevelProgress(days: number, lvl: PlantLevel): number {
  if (lvl.nextAt === Infinity) return 1
  return (days - lvl.from) / (lvl.nextAt - lvl.from)
}
