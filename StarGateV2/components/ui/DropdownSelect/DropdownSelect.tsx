"use client";

import {
  type FocusEvent,
  type KeyboardEvent,
  useId,
  useRef,
  useState,
} from "react";

import styles from "./DropdownSelect.module.css";

export interface DropdownSelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  group?: string;
}

interface DropdownSelectProps<T extends string> {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly DropdownSelectOption<T>[];
  value: T;
}

export default function DropdownSelect<T extends string>({
  ariaLabel,
  className,
  disabled = false,
  onChange,
  options,
  value,
}: DropdownSelectProps<T>) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const enabledOptions = options
    .map((option, index) => ({ option, index }))
    .filter(({ option }) => !option.disabled);

  const selectedEnabledIndex = enabledOptions.findIndex(
    ({ option }) => option.value === value,
  );
  const selectedIndex = Math.max(0, selectedEnabledIndex);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function focusOption(enabledIndex: number) {
    const target = enabledOptions[enabledIndex];
    if (!target) return;
    requestAnimationFrame(() => optionRefs.current[target.index]?.focus());
  }

  function openAt(enabledIndex: number) {
    if (disabled || enabledOptions.length === 0) return;
    setOpen(true);
    focusOption(enabledIndex);
  }

  function select(option: DropdownSelectOption<T>) {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(
        selectedEnabledIndex < 0
          ? 0
          : Math.min(selectedEnabledIndex + 1, enabledOptions.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(
        selectedEnabledIndex < 0
          ? enabledOptions.length - 1
          : Math.max(selectedEnabledIndex - 1, 0),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      openAt(enabledOptions.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) close();
      else openAt(selectedIndex);
    } else if (event.key === "Escape") {
      close();
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    option: DropdownSelectOption<T>,
    optionIndex: number,
  ) {
    const enabledIndex = enabledOptions.findIndex(
      ({ index }) => index === optionIndex,
    );
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(Math.min(enabledIndex + 1, enabledOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(Math.max(enabledIndex - 1, 0));
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(enabledOptions.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const nextFocus = event.relatedTarget;
    if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) {
      return;
    }
    close();
  }

  return (
    <div
      className={[styles.dropdown, className].filter(Boolean).join(" ")}
      onBlur={handleBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.dropdown__trigger}
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openAt(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label ?? value}</span>
        <span className={styles.dropdown__caret} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={listboxId}
          className={styles.dropdown__menu}
          role="listbox"
          aria-label={ariaLabel}
        >
          {options.map((option, index) => {
            const previousGroup = options[index - 1]?.group;
            const startsGroup = option.group && option.group !== previousGroup;
            const active = option.value === value;
            return (
              <div key={option.value} className={styles.dropdown__optionWrap}>
                {startsGroup ? (
                  <span className={styles.dropdown__group} role="presentation">
                    {option.group}
                  </span>
                ) : null}
                <button
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={[
                    styles.dropdown__option,
                    active ? styles["dropdown__option--active"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={option.disabled}
                  onClick={() => select(option)}
                  onKeyDown={(event) =>
                    handleOptionKeyDown(event, option, index)
                  }
                >
                  {option.label}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
