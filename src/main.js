import { init } from './ui.js?v=23replay';
document.addEventListener('DOMContentLoaded', init);

// Auto-set controls height CSS var for responsive layout
(function setControlsHeight(){
  const controls = document.querySelector('.controls');
  if(!controls) return;
  const update = ()=> {
    const h = Math.max(48, Math.ceil(controls.getBoundingClientRect().height));
    document.documentElement.style.setProperty('--controls-height', `${h}px`);
  };
  update();
  if (window.ResizeObserver) {
    new ResizeObserver(update).observe(controls);
  } else {
    window.addEventListener('resize', update);
  }
})();
