import styles from "./RgbLogo.module.css"

/**
 * The mark: three bars in ink. Hovering it turns them red, green and blue, one
 * after another. Plain elements, so it stays crisp at any size and costs nothing
 * while it sits there.
 */
export function RgbLogo() {
  return (
    <span className={styles.logo} role="img" aria-label="rgbjoy">
      <span className={styles.bar} />
      <span className={styles.bar} />
      <span className={styles.bar} />
    </span>
  )
}
