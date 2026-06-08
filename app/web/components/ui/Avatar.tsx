'use client'

// Single source of truth for rendering a user's avatar everywhere (feed, profile,
// friends, search, comments). Falls back to the name's initial when there's no
// picture. Pass onClick to make it an activatable button (e.g. open the viewer).
const SIZES = {
  xs:  'h-6 w-6 text-[10px]',
  sm:  'h-8 w-8 text-xs',
  md:  'h-9 w-9 text-sm',
  lg:  'h-10 w-10 text-xs',
  xl:  'h-16 w-16 text-xl',
  '2xl': 'h-[82px] w-[82px] text-3xl',
} as const

interface AvatarProps {
  src: string | null
  name: string
  size?: keyof typeof SIZES
  className?: string
  onClick?: () => void
}

export function Avatar({ src, name, size = 'md', className = '', onClick }: AvatarProps) {
  const initial = (name || '?').charAt(0).toUpperCase()
  const box = `${SIZES[size]} rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center font-medium text-gray-500 ${className}`

  const inner = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={name ? `${name}'s profile picture` : ''} className="h-full w-full object-cover" />
  ) : (
    <span aria-hidden>{initial}</span>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${box} cursor-pointer transition-opacity hover:opacity-90`}
        aria-label={`View ${name}'s profile picture`}
      >
        {inner}
      </button>
    )
  }
  return <span className={box}>{inner}</span>
}
