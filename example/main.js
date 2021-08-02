import Video from "./vendors/Video.js";
import Audio from "./vendors/Audio.js";

const mapping = {
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

let sram = null;
let savestate = null;
let paused = false;

function listenKeyboard(retro) {
  window.addEventListener(`keydown`, (e) => {
    e.preventDefault();
    if (mapping.hasOwnProperty(e.code)) {
      retro.input_user_state[0][mapping[e.code]] = true;
    }
  });

  window.addEventListener(`keyup`, (e) => {
    e.preventDefault();
    if (mapping.hasOwnProperty(e.code)) {
      retro.input_user_state[0][mapping[e.code]] = false;
    }
  });

  window.addEventListener(`keydown`, (e) => {
    e.preventDefault();
    if (e.code == "KeyF") {
      const wrapper = document.querySelector("#wrapper");
      wrapper.webkitRequestFullScreen && wrapper.webkitRequestFullScreen();
      wrapper.mozRequestFullScreen && wrapper.mozRequestFullScreen();
    }
    if (e.code == "KeyR") {
      // reset
      retro.reset();
      if (sram !== null && sram.length > 0) retro.setSRAM(sram);
    }
    if (e.code == "KeyY") {
      // savestate
      savestate = retro.getState();
    }
    if (e.code == "KeyU") {
      // loadstate
      retro.setState(savestate);
    }
    if (e.code == "KeyG") {
      // screenshot
      const canvas = document.querySelector("#screen");
      const dataURL = canvas.toDataURL("png");
      console.log(dataURL);

      const img = document.createElement("img");
      img.src = dataURL;
      document.body.appendChild(img);
    }
    if (e.code == "KeyH") {
      // savefile
      sram = retro.getSRAM();
      console.log(sram);
    }
    if (e.code == "KeyP") {
      paused = !paused;
      console.log(paused)
      retro.setPaused(paused);
    }
    if (e.code == "KeyQ") {
      retro.unloadGame();
    }
  });
}

// export run() into the window, so that <script> tags in index.html can access it.
window.run = function(gamePath) {
  const canvas = document.querySelector("#screen");
  const video = new Video(canvas);
  const audio = new Audio();

  Module.video = video;
  Module.audio = audio;

  libretro(Module).then((retro) => {
    retro.setOptions("fceumm_palette", "yuv-v3");
    retro.loadGame(gamePath);

    // Example to set the controller type
    // Controller name depends on the emulator/port
    let controller = 'SNES Controller'
    let controller_id = retro.env_controller_info[0].get(controller)
    if (controller_id) {
        retro.setControllerPortDevice(0, controller_id);
    }

    listenKeyboard(retro);

    document.querySelector("#loading").style.display = "none";

    if (retro.skip_frame) {
      // keep a single frame for testing purpose
      retro.skip_frame(1);
    }

    retro.loop(-1);
  });
}
