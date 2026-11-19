// Slide navigation: arrow keys / PageUp / PageDown / Home / End, buttons, and ?slide=N.
const slides = [...document.querySelectorAll('.slide')];
const count = document.querySelector('.count');
const params = new URLSearchParams(location.search);
let index = Math.min(Math.max(Number(params.get('slide') ?? 1) - 1, 0), slides.length - 1);

function show(next) {
  index = Math.min(Math.max(next, 0), slides.length - 1);
  slides.forEach((slide, i) => slide.toggleAttribute('hidden', i !== index));
  count.textContent = `${index + 1} / ${slides.length}`;
  document.querySelector('[data-step="-1"]').disabled = index === 0;
  document.querySelector('[data-step="1"]').disabled = index === slides.length - 1;
  // Lets a slide with animation (flow.tsx) replay when it is shown.
  dispatchEvent(new CustomEvent('deck:slide', { detail: { id: slides[index].dataset.id ?? '' } }));
}

function fit() {
  const scale = Math.min(innerWidth / 1920, innerHeight / 1080);
  document.documentElement.style.setProperty('--scale', String(scale));
}

document.addEventListener('keydown', (event) => {
  const step = { ArrowRight: 1, PageDown: 1, ' ': 1, ArrowLeft: -1, PageUp: -1 }[event.key];
  if (step) { event.preventDefault(); show(index + step); }
  if (event.key === 'Home') show(0);
  if (event.key === 'End') show(slides.length - 1);
});
document.querySelectorAll('[data-step]').forEach((button) =>
  button.addEventListener('click', () => show(index + Number(button.dataset.step))),
);
addEventListener('resize', fit);

if (params.has('print')) document.documentElement.classList.add('print');
fit();
show(index);
