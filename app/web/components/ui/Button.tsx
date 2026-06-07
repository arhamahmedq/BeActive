import { type ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  pill?: boolean
  isLoading?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  pill = false,
  isLoading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'

  const variants: Record<string, string> = {
    primary:   'bg-black text-white hover:bg-gray-800 focus:ring-black',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:ring-gray-200',
    ghost:     'text-gray-500 hover:text-gray-900 hover:bg-black/5 focus:ring-gray-200',
    brand:     'bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-500 shadow-[0_2px_8px_rgba(34,197,94,0.25)]',
    danger:    'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
  }

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-xs min-h-[32px] rounded-md',
    md: 'px-4 py-2 text-sm min-h-[40px] rounded-lg',
    lg: 'px-6 py-3 text-[15px] min-h-[44px] rounded-lg',
  }

  const shape = pill ? 'rounded-full' : sizes[size].split(' ').find(c => c.startsWith('rounded')) ?? ''
  const sizeClasses = sizes[size].split(' ').filter(c => !c.startsWith('rounded')).join(' ')

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`${base} ${variants[variant]} ${sizeClasses} ${pill ? 'rounded-full' : shape} ${className}`}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  )
}
