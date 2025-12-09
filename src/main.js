import { App } from "./core/App.js";

const canvas = document.getElementById("c");
const modeCheckbox = document.getElementById("modeCheckbox");
const overlayRoot = document.getElementById("overlay");
const hintEl = document.getElementById("hint");

const app = new App({
  canvas,
  modeCheckbox,
  overlayRoot,
  hintEl,
});

app.start();
