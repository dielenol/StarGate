import type { SVGProps } from 'react'

export function IconNotification(props: SVGProps<SVGSVGElement>) {
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
      <path d="M6 9a6 6 0 0112 0v5l1.5 2.5h-15L6 14V9z" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  )
}
