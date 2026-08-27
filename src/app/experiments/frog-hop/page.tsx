"use client";

import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";

import { FIRST_HINT } from "./course";
import { FrogHopScene } from "./FrogHopScene";
import { type HudState } from "./game";
import styles from "./page.module.css";

// The first tutorial mark is always dead calm, so the run always opens becalmed.
const INITIAL_HUD: HudState = {
  phase: "idle",
  streak: 0,
  bestStreak: 0,
  level: 0,
  targetId: "mark-a",
  windAngle: 0,
  windSpeed: 0,
  hint: FIRST_HINT,
};

const DEFAULT_HINT = "Read the wind · pull back · release";
const PLAYER_DATA_KEY = "frog-ace-player-data";

type PlayerData = {
  version: 1;
  showInstructions: boolean;
  autoHiddenInstructions: boolean;
  highestLevel: number;
};

const DEFAULT_PLAYER_DATA: PlayerData = {
  version: 1,
  showInstructions: true,
  autoHiddenInstructions: false,
  highestLevel: 0,
};

const randomSeed = () => (Math.random() * 0xffffffff) >>> 0;

export default function Page() {
  const [hud, setHud] = useState(INITIAL_HUD);
  const [run, setRun] = useState(0);
  // Seeded once, lazily, at mount. Seeding on "Start round" instead meant the
  // pond you were looking at through the intro was thrown away and rebuilt the
  // instant the modal closed — the backdrop is only lightly blurred, so you
  // watched the world pop.
  const [seed, setSeed] = useState(randomSeed);
  const [showIntro, setShowIntro] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [playerData, setPlayerData] = useState(DEFAULT_PLAYER_DATA);
  const playerDataRef = useRef(DEFAULT_PLAYER_DATA);
  const windArrowRef = useRef<HTMLElement>(null);

  const savePlayerData = useCallback((next: PlayerData) => {
    playerDataRef.current = next;
    setPlayerData(next);
    try {
      window.localStorage.setItem(PLAYER_DATA_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable in privacy mode; the in-memory setting
      // still works for the current session.
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(
          window.localStorage.getItem(PLAYER_DATA_KEY) ?? "null",
        ) as Partial<PlayerData> | null;
        if (!saved) return;

        const highestLevel = Math.max(0, Number(saved.highestLevel) || 0);
        const needsLevelFiveDismissal =
          highestLevel >= 5 && saved.autoHiddenInstructions !== true;
        const autoHiddenInstructions =
          saved.autoHiddenInstructions === true || needsLevelFiveDismissal;
        const next: PlayerData = {
          version: 1,
          highestLevel,
          autoHiddenInstructions,
          showInstructions: needsLevelFiveDismissal
            ? false
            : typeof saved.showInstructions === "boolean"
              ? saved.showInstructions
              : !autoHiddenInstructions,
        };
        playerDataRef.current = next;
        setPlayerData(next);
      } catch {
        // Ignore malformed or unavailable storage and keep the defaults.
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleHudChange = useCallback(
    (next: HudState) => {
      setHud(next);

      const current = playerDataRef.current;
      const highestLevel = Math.max(current.highestLevel, next.level);
      const shouldAutoHide =
        next.level >= 5 && !current.autoHiddenInstructions;
      if (highestLevel === current.highestLevel && !shouldAutoHide) return;

      savePlayerData({
        ...current,
        highestLevel,
        showInstructions: shouldAutoHide
          ? false
          : current.showInstructions,
        autoHiddenInstructions:
          current.autoHiddenInstructions || shouldAutoHide,
      });
    },
    [savePlayerData],
  );

  const toggleInstructions = useCallback(() => {
    const current = playerDataRef.current;
    savePlayerData({
      ...current,
      showInstructions: !current.showInstructions,
    });
  }, [savePlayerData]);

  // Restart is the one place a fresh world is expected, so it remounts.
  const reseed = useCallback(() => {
    setHud(INITIAL_HUD);
    setSeed(randomSeed());
    setRun((value) => value + 1);
    setShowMenu(false);
  }, []);

  const startRound = useCallback(() => setShowIntro(false), []);

  return (
    <main className={styles.main}>
      <Canvas
        className={styles.canvas}
        dpr={1}
        shadows="basic"
        camera={{ position: [0, 6.2, 20], fov: 46, near: 0.1, far: 90 }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
        }}
      >
        <FrogHopScene
          key={run}
          seed={seed}
          onHudChange={handleHudChange}
          windArrowRef={windArrowRef}
        />
      </Canvas>

      <header className={styles.hud} aria-live="polite">
        <div className={styles.brand}>
          <h1>FrogAce</h1>
        </div>
        <div className={styles.hudActions}>
          <div className={styles.stats}>
            <div>
              <span>Streak</span>
              <strong>{String(hud.streak).padStart(2, "0")}</strong>
            </div>
            <div>
              <span>Best</span>
              <strong>{String(hud.bestStreak).padStart(2, "0")}</strong>
            </div>
          </div>
          <div className={styles.menuWrap}>
            <button
              className={styles.menuButton}
              type="button"
              aria-expanded={showMenu}
              aria-controls="frog-ace-menu"
              onClick={() => setShowMenu((open) => !open)}
            >
              Menu
            </button>
            {showMenu ? (
              <div id="frog-ace-menu" className={styles.menuPanel}>
                <button
                  className={styles.toggleRow}
                  type="button"
                  role="switch"
                  aria-checked={playerData.showInstructions}
                  onClick={toggleInstructions}
                >
                  <span>Instructions</span>
                  <i aria-hidden="true" />
                </button>
                <button type="button" onClick={reseed}>
                  Restart round
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={styles.windDisplay}
        aria-label={
          hud.windSpeed > 0
            ? `Wind ${hud.windSpeed} miles per hour`
            : "Wind calm"
        }
      >
        <span>Wind</span>
        <div className={styles.windReadout}>
          {hud.windSpeed > 0 ? (
            <>
              <i
                ref={windArrowRef}
                className={styles.windArrow}
                style={{ transform: `rotate(${hud.windAngle}deg)` }}
                aria-hidden="true"
              >
                ↑
              </i>
              <span className={styles.windSpeed}>
                <strong>{hud.windSpeed}</strong>
                <small>MPH</small>
              </span>
            </>
          ) : (
            <strong className={styles.calm}>Calm</strong>
          )}
        </div>
      </div>

      {playerData.showInstructions ? (
        <div className={styles.instructions}>
          <span className={styles.mouseIcon} aria-hidden="true" />
          <span>{hud.hint ?? DEFAULT_HINT}</span>
          <span className={styles.power} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : null}

      {showIntro ? (
        <section
          className={styles.intro}
          role="dialog"
          aria-modal="true"
          aria-labelledby="frog-ace-intro-title"
        >
          <div className={styles.introCard}>
            <span className={styles.introKicker}>A frog-sized golf game</span>
            <h2 id="frog-ace-intro-title">Read the wind. Ace the lilies.</h2>
            <p>
              Pull back from the frog to set direction and power, then release.
              Warm up on the dock — you get a landing marker there — then head
              out into an endless pond. See how far you can get.
            </p>
            <div className={styles.introTips} aria-label="How to play">
              <span>
                <b>01</b> Aim on dock
              </span>
              <span>
                <b>02</b> Learn the wind
              </span>
              <span>
                <b>03</b> Go as far as you can
              </span>
            </div>
            <button type="button" onClick={startRound}>
              Start round
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
