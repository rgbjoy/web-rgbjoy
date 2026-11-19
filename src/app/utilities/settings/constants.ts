/** localStorage keys, namespaced so they cannot collide with experiment state. */
export const MOTION_KEY = "rgbjoy:motion"

export type Motion = "full" | "reduced"

/**
 * Runs before first paint so a stored choice never flashes the wrong way.
 *
 * The site is light only, so motion is the one setting left. It follows the OS
 * until the visitor overrides it, because someone who asked their system for
 * less motion should not have to ask this page too.
 */
export const SETTINGS_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement;
var m=localStorage.getItem("${MOTION_KEY}");
if(m!=="reduced"&&m!=="full"){m=window.matchMedia("(prefers-reduced-motion: reduce)").matches?"reduced":"full";}
d.setAttribute("data-motion",m);
}catch(e){}})()`
