import type { SVGProps } from 'react'

export function IconCrown(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2v2M10 4h4" />
      <path d="M6 9l2-4h8l2 4v2c-2 1.5-4 2-6 2s-4-.5-6-2V9z" />
      <path d="M5 13h14l-1 7H6l-1-7z" />
      <path d="M9 16h6" />
    </svg>
  )
}
