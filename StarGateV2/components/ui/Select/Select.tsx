import type { ReactNode, SelectHTMLAttributes } from "react";
import { forwardRef } from "react";

import styles from "./Select.module.css";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  children: ReactNode;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={[styles.select, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </select>
  );
});

export default Select;
