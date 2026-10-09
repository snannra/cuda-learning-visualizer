"use strict";
// Keep the active page tab visible within the mobile horizontal tab strip.
const tabs = document.querySelector(".page-tabs");
if (tabs) {
  const reveal = () => {
    const active = tabs.querySelector('[aria-current="page"]');
    if (!active || tabs.scrollWidth <= tabs.clientWidth) return;
    const bar = tabs.getBoundingClientRect(),
      item = active.getBoundingClientRect();
    if (item.right > bar.right) tabs.scrollLeft += item.right - bar.right + 4;
    else if (item.left < bar.left) tabs.scrollLeft -= bar.left - item.left + 4;
  };
  new ResizeObserver(reveal).observe(tabs);
  requestAnimationFrame(reveal);
}
