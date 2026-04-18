import type { SVGProps } from 'react'

export function IconPlayer(props: SVGProps<SVGSVGElement>) {
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
      <circle cx="12" cy="6" r="3" />
      <path d="M9.5 9c0 2-1.5 3-2.5 5h10c-1-2-2.5-3-2.5-5" />
      <path d="M7 14h10" />
      <path d="M6 20l1-6h10l1 6H6z" />
    </svg>
  )
}
