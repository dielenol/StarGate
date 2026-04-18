import type { SVGProps } from 'react'

export function IconNotes(props: SVGProps<SVGSVGElement>) {
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
      <path d="M5 3h9l5 5v13H5V3z" />
      <path d="M14 3v5h5" />
      <path d="M8 13h8M8 16h8M8 19h5" />
    </svg>
  )
}
