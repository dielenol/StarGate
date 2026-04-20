import type { InputHTMLAttributes } from "react";
import { forwardRef } from "react";

import styles from "./Input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={[styles.input, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

export default Input;
