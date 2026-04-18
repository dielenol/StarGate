import type { SVGProps } from 'react'

export function IconReturn(props: SVGProps<SVGSVGElement>) {
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
      <path d="M9 14l-5-5 5-5" />
      <path d="M4 9h8a7 7 0 017 7v4" />
    </svg>
  )
}
