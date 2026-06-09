const frames = Array.from({ length: 10 }, (_, index) =>
  `assets/animations/splash/${String(index + 1).padStart(2, "0")}.png`
);

const splash = document.getElementById("splash");
const frame = document.getElementById("splashFrame");
const siteShell = document.getElementById("siteShell");
const skipButton = document.getElementById("skipSplash");
const homePage = document.getElementById("homePage");
const backHomeButton = document.getElementById("backHome");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const forwardDuration = prefersReducedMotion ? 900 : 4000;
const reverseDuration = prefersReducedMotion ? 760 : 2800;
let startedAt = 0;
let rafId = 0;
let direction = "forward";
let phase = "home";

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeInQuart(value) {
  return value * value * value * value;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function preloadFrames() {
  frames.forEach((source) => {
    const image = new Image();
    image.src = source;
  });
}

function setFrame(progress) {
  const eased = easeInOutCubic(progress);
  const index = Math.min(frames.length - 1, Math.floor(eased * frames.length));
  frame.src = frames[index];

  const cameraScale = 1 + easeInQuart(progress) * 1.75;
  const darkness = clamp((progress - 0.68) / 0.32, 0, 1);
  const finalFade = clamp((progress - 0.94) / 0.06, 0, 1);

  splash.style.setProperty("--camera-scale", cameraScale.toFixed(4));
  splash.style.setProperty("--vignette-opacity", (0.55 + darkness * 0.4).toFixed(3));
  splash.style.setProperty("--blackout-opacity", finalFade.toFixed(3));
  splash.style.setProperty("--brightness", (1 - darkness * 0.28).toFixed(3));
  splash.style.setProperty("--contrast", (1.04 + darkness * 0.24).toFixed(3));
  splash.style.setProperty("--saturation", (1.02 - darkness * 0.32).toFixed(3));
}

function hideSplash() {
  splash.classList.remove("is-active");
  splash.classList.remove("is-reversing");
  splash.classList.add("is-done");
}

function finishForward() {
  phase = "chat";
  cancelAnimationFrame(rafId);
  setFrame(1);
  siteShell.classList.add("is-visible");
  homePage.classList.add("is-suspended");

  window.setTimeout(hideSplash, prefersReducedMotion ? 20 : 70);
}

function finishReverse() {
  phase = "home";
  cancelAnimationFrame(rafId);
  setFrame(0);
  siteShell.classList.remove("is-visible");
  homePage.classList.remove("is-leaving");
  document.body.classList.remove("is-entering-gold");

  window.setTimeout(hideSplash, prefersReducedMotion ? 20 : 90);
}

function animateSplash(timestamp) {
  if (!startedAt) startedAt = timestamp;
  const duration = direction === "forward" ? forwardDuration : reverseDuration;
  const elapsed = clamp((timestamp - startedAt) / duration, 0, 1);
  const progress = direction === "forward" ? elapsed : 1 - elapsed;

  setFrame(progress);

  if (elapsed >= 1) {
    if (direction === "forward") finishForward();
    else finishReverse();
    return;
  }

  rafId = requestAnimationFrame(animateSplash);
}

function beginSplash(nextDirection) {
  direction = nextDirection;
  startedAt = 0;
  splash.classList.remove("is-done");
  splash.classList.toggle("is-reversing", nextDirection === "reverse");
  setFrame(nextDirection === "forward" ? 0 : 1);
  splash.classList.add("is-active");
  skipButton.style.opacity = nextDirection === "forward" ? "1" : "0";
  rafId = requestAnimationFrame(animateSplash);
}

function startGoldExperience() {
  if (phase !== "home") return;
  phase = "forward";
  homePage.classList.add("is-leaving");
  document.body.classList.add("is-entering-gold");
  beginSplash("forward");
}

function returnToHome() {
  if (phase !== "chat") return;
  phase = "reverse";
  beginSplash("reverse");
  requestAnimationFrame(() => {
    homePage.classList.remove("is-suspended");
  });
}

window.startGoldExperience = startGoldExperience;
window.returnToHome = returnToHome;

skipButton.addEventListener("click", () => {
  if (direction === "reverse") finishReverse();
  else finishForward();
});
backHomeButton.addEventListener("click", returnToHome);

preloadFrames();
setFrame(0);

const searchParams = new URLSearchParams(window.location.search);
if (searchParams.has("skipSplash")) {
  homePage.classList.add("is-leaving");
  document.body.classList.add("is-entering-gold");
  finishForward();
} else if (searchParams.has("openGold")) {
  startGoldExperience();
}
