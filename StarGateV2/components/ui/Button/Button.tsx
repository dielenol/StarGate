import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import styles from "./Button.module.css";

type ButtonVariant = "default" | "primary";
type ButtonSize = "sm" | "md";

interface BaseProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

type ButtonAsButton = BaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps | "href"> & {
    as?: "button";
    href?: never;
  };

type ButtonAsAnchor = BaseProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps> & {
    as: "a";
    href: string;
  };

type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export default function Button(props: ButtonProps) {
  const {
    children,
    variant = "default",
    size = "md",
    className,
    as,
    ...rest
  } = props;

  const classes = [
    styles.btn,
    size === "sm" ? styles["btn--sm"] : "",
    variant === "primary" ? styles["btn--primary"] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (as === "a") {
    const anchorProps = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a className={classes} {...anchorProps}>
        {children}
      </a>
    );
  }

  const buttonProps = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      className={classes}
      {...buttonProps}
      type={buttonProps.type ?? "button"}
    >
      {children}
    </button>
  );
}
