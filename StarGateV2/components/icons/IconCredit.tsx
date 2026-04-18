import type { SVGProps } from 'react'

export function IconCredit(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={24}
      height={24}
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.5-1-1.7-1.5-3-1.5-1.7 0-3 1-3 2.2 0 1 .8 1.5 2.5 1.8l1 .2c1.7.3 2.5.8 2.5 1.8 0 1.2-1.3 2.2-3 2.2-1.3 0-2.5-.5-3-1.5" />
      <path d="M12 6v2M12 16v2" />
    </svg>
  )
}
