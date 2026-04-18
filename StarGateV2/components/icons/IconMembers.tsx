import type { SVGProps } from 'react'

export function IconMembers(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
      <circle cx="17" cy="6" r="2.5" />
      <path d="M17 11c2.8 0 5 2.2 5 5" />
    </svg>
  )
}
