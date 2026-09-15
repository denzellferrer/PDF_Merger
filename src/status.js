/** Transient message strip at the bottom of the window. */

let timer;

/**
 * @param {string}  msg
 * @param {boolean} isError  styles the strip red
 * @param {number}  ms       auto-hide delay; pass 0 to leave it up until the next call
 */
export function status(msg, isError = false, ms = 3200) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = 'status' + (isError ? ' error' : '');
  el.hidden = false;

  clearTimeout(timer);
  if (ms) timer = setTimeout(() => { el.hidden = true; }, ms);
}
