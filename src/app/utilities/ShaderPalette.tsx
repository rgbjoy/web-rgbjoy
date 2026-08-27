"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EXPERIMENTS, experimentSearchText } from "../data/experiments";
import styles from "./ShaderPalette.module.css";

function ShaderPalettePanel({ pathname }: { pathname: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredRoutes = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return EXPERIMENTS;
    }

    return EXPERIMENTS.filter((experiment) =>
      experimentSearchText(experiment).includes(normalized),
    );
  }, [query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isToggle =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f";

      if (isToggle) {
        event.preventDefault();
        setIsOpen((current) => {
          if (current) return false;
          setSelectedIndex(0);
          return true;
        });
        return;
      }

      if (!isOpen) return;

      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredRoutes.length === 0
            ? 0
            : (current + 1) % filteredRoutes.length,
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) =>
          filteredRoutes.length === 0
            ? 0
            : (current - 1 + filteredRoutes.length) % filteredRoutes.length,
        );
        return;
      }

      if (event.key === "Enter") {
        const selectedRoute = filteredRoutes[selectedIndex];
        if (!selectedRoute) return;
        event.preventDefault();
        router.push(selectedRoute.href);
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filteredRoutes, isOpen, router, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={() => setIsOpen(false)}>
      <div
        className={styles.panel}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Experiment menu"
      >
        <div className={styles.header}>
          <p className={styles.kicker}>Experiments</p>
          <p className={styles.hint}>
            Cmd/Ctrl+F to toggle, arrows to navigate, Enter to open
          </p>
        </div>

        <div className={styles.search}>
          <span className={styles.searchSlash}>/</span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search title, tag, description"
            spellCheck={false}
          />
        </div>

        <div className={styles.results}>
          {filteredRoutes.length === 0 ? (
            <div className={styles.empty}>No matching experiments.</div>
          ) : (
            filteredRoutes.map((experiment, index) => {
              const isSelected = index === selectedIndex;
              const isActive = experiment.href === pathname;

              return (
                <button
                  key={experiment.href}
                  type="button"
                  className={`${styles.item} ${isSelected ? styles.itemSelected : ""}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    router.push(experiment.href);
                    setIsOpen(false);
                  }}
                >
                  <span className={styles.itemName}>
                    {experiment.title}
                    {isActive ? (
                      <span className={styles.badge}>Current</span>
                    ) : null}
                  </span>
                  <span className={styles.itemMeta}>{experiment.href}</span>
                  <span className={styles.itemDescription}>
                    {experiment.description}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function ShaderPalette() {
  const pathname = usePathname();

  return <ShaderPalettePanel key={pathname} pathname={pathname} />;
}
