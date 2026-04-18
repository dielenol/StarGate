import type { SVGProps } from 'react'

export function IconCharacter(props: SVGProps<SVGSVGElement>) {
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
      <path d="M12 2l-2.5 2.5v10h5v-10L12 2z" />
      <path d="M6 14.5h12" />
      <path d="M11 14.5v5h2v-5" />
      <circle cx="12" cy="21" r="1.3" />
    </svg>
  )
}
