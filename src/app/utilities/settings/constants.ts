/** localStorage keys, namespaced so they cannot collide with experiment state. */
export const THEME_KEY = "rgbjoy:theme"
export const MOTION_KEY = "rgbjoy:motion"

export type Theme = "dark" | "light"
export type Motion = "full" | "reduced"

/**
 * Runs before first paint so a stored choice never flashes the wrong way.
 *
 * Colour defaults to dark — that is the site's own look, not a fallback — so
 * light is strictly opt-in. Motion is the opposite: it follows the OS until the
 * visitor overrides it, because someone who asked their system for less motion
 * should not have to ask this page too.
 */
export const SETTINGS_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem("${THEME_KEY}");
d.setAttribute("data-theme",t==="light"?"light":"dark");
var m=localStorage.getItem("${MOTION_KEY}");
if(m!=="reduced"&&m!=="full"){m=window.matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"full";}
d.setAttribute("data-motion",m);
}catch(e){}})()`
