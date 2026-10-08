import React from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * CPC brand logo — Construction Project Calculator.
 * Primary/full: wide brand scene (logo-cpc-full).
 * Compact/glass/icon: official square icon (logo-cpc-mark) used for favicon/PWA.
 */
interface LogoProps {
  variant?: 'full' | 'icon' | 'text' | 'glass'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** When false, logo is not clickable (default: navigates to Home). */
  linkToHome?: boolean
}

const FULL_SRC = '/logo-cpc-full.jpg'
const MARK_SRC = '/logo-cpc-mark.png'

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  size = 'md',
  className = '',
  linkToHome = true,
}) => {
  const navigate = useNavigate()

  const sizes = {
    sm: {
      icon: 24,
      text: 'text-base',
      glass: 'w-12 h-12',
      full: 'h-8 w-auto max-w-[10rem]',
    },
    md: {
      icon: 32,
      text: 'text-xl',
      glass: 'w-16 h-16',
      full: 'h-10 w-auto max-w-[14rem]',
    },
    lg: {
      icon: 48,
      text: 'text-3xl',
      glass: 'w-44 h-44',
      full: 'h-20 w-auto max-w-[min(100%,18rem)] sm:h-28 sm:max-w-[26rem]',
    },
    xl: {
      icon: 64,
      text: 'text-4xl',
      glass: 'w-56 h-56',
      full: 'h-32 w-auto max-w-[30rem]',
    },
  }

  const iconSize = sizes[size].icon
  const textSize = sizes[size].text
  const glassSize = sizes[size].glass
  const fullSize = sizes[size].full

  const MarkImg = ({
    boxClass,
    px,
  }: {
    boxClass?: string
    px?: number
  }) => (
    <img
      src={MARK_SRC}
      alt="CPC"
      width={px}
      height={px}
      className={`object-contain ${boxClass || ''}`}
      draggable={false}
    />
  )

  const FullImg = () => (
    <img
      src={FULL_SRC}
      alt="Construction Project Calculator"
      className={`object-contain ${fullSize}`}
      draggable={false}
    />
  )

  const TextLogo = () => (
    <div className={`font-bold tracking-tight ${textSize} leading-tight`}>
      <span className="text-orange-500">CPC</span>
      <span className="hidden sm:inline text-white/90 ml-1.5 font-medium text-[0.65em]">
        Construction Project Calculator
      </span>
    </div>
  )

  /** Compact mark for small badges (favicon / PWA share the same square asset). */
  const GlassLogo = () => (
    <div
      className={`${glassSize} rounded-2xl overflow-hidden bg-[#1e2126]
      flex items-center justify-center shadow-2xl
      border border-white/10 relative shrink-0 ${className}`}
    >
      <MarkImg boxClass="w-full h-full" />
    </div>
  )

  const content = (() => {
    if (variant === 'glass') return <GlassLogo />
    if (variant === 'icon') {
      // Wide copper wordmark reads better than a cramped square in app chrome
      return (
        <div className={`inline-flex shrink-0 items-center ${className}`}>
          <img
            src={FULL_SRC}
            alt="CPC"
            className="object-contain rounded-md"
            style={{ height: iconSize, width: 'auto', maxWidth: iconSize * 3.2 }}
            draggable={false}
          />
        </div>
      )
    }
    if (variant === 'text') return <div className={className}><TextLogo /></div>
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <FullImg />
      </div>
    )
  })()

  if (!linkToHome) return content

  return (
    <button
      type="button"
      onClick={() => navigate('/')}
      className="inline-flex items-center justify-center p-0 m-0 bg-transparent border-0 cursor-pointer shrink-0 active:scale-95 transition-transform"
      aria-label="Home"
      title="Home"
    >
      {content}
    </button>
  )
}
