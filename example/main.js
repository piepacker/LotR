import Video from "./vendors/Video.js";
import Audio from "./vendors/Audio.js";

const keyMapping = {
  KeyZ: 0, // RETRO_DEVICE_ID_JOYPAD_B
  KeyA: 1, // RETRO_DEVICE_ID_JOYPAD_Y
  ShiftRight: 2, // RETRO_DEVICE_ID_JOYPAD_SELECT
  Enter: 3, // RETRO_DEVICE_ID_JOYPAD_START
  ArrowUp: 4, // RETRO_DEVICE_ID_JOYPAD_UP
  ArrowDown: 5, // RETRO_DEVICE_ID_JOYPAD_DOWN
  ArrowLeft: 6, // RETRO_DEVICE_ID_JOYPAD_LEFT
  ArrowRight: 7, // RETRO_DEVICE_ID_JOYPAD_RIGHT
  KeyX: 8, // RETRO_DEVICE_ID_JOYPAD_A
  KeyS: 9, // RETRO_DEVICE_ID_JOYPAD_X
  KeyQ: 10, // RETRO_DEVICE_ID_JOYPAD_L
  KeyW: 11, // RETRO_DEVICE_ID_JOYPAD_R
};

const joyMapping = {
  0: 0, // RETRO_DEVICE_ID_JOYPAD_B
  2: 1, // RETRO_DEVICE_ID_JOYPAD_Y
  8: 2, // RETRO_DEVICE_ID_JOYPAD_SELECT
  9: 3, // RETRO_DEVICE_ID_JOYPAD_START
  12: 4, // RETRO_DEVICE_ID_JOYPAD_UP
  13: 5, // RETRO_DEVICE_ID_JOYPAD_DOWN
  14: 6, // RETRO_DEVICE_ID_JOYPAD_LEFT
  15: 7, // RETRO_DEVICE_ID_JOYPAD_RIGHT
  1: 8, // RETRO_DEVICE_ID_JOYPAD_A
  3: 9, // RETRO_DEVICE_ID_JOYPAD_X
  4: 10, // RETRO_DEVICE_ID_JOYPAD_L
  5: 11, // RETRO_DEVICE_ID_JOYPAD_R
}

function pollInputs(retro) {
  window.addEventListener(`keydown`, e => {
    e.preventDefault();
    if (keyMapping.hasOwnProperty(e.code)) {
      retro.input_user_state[0][keyMapping[e.code]] = true;
    }
  });

  window.addEventListener(`keyup`, e => {
    e.preventDefault();
    if (keyMapping.hasOwnProperty(e.code)) {
      retro.input_user_state[0][keyMapping[e.code]] = false;
    }
  });

  window.addEventListener(`keydown`, e => {
    e.preventDefault();
    if (e.code == "KeyF") {
      const wrapper = document.querySelector("#wrapper");
      wrapper.webkitRequestFullScreen && wrapper.webkitRequestFullScreen();
      wrapper.mozRequestFullScreen && wrapper.mozRequestFullScreen();
    }
  });

  window.addEventListener(`gamepadconnected`, e => {
    console.log("pad connected:", e.gamepad.id);
  });

  window.setInterval(() => {
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      pad.buttons.forEach((v, code) => {
        if (joyMapping.hasOwnProperty(code))
          retro.input_user_state[pad.index][joyMapping[code]] = v.pressed
      });
    }
  }, 8)
}

function run(gamePath) {
  const canvas = document.querySelector("#screen");
  const video = new Video(canvas);
  const audio = new Audio();

  Module.video = video;
  Module.audio = audio;

  libretro(Module).then((retro) => {
    retro.loadGame(gamePath);
    pollInputs(retro);
    document.querySelector("#loading").style.display = "none";
    retro.loop(-1);
  });
}

const btn = document.querySelector("button");
btn.addEventListener("click", function () {
  run("main.lua");
  document.querySelector("#loading").style.display = "block";
  btn.style.display = "none";
});
