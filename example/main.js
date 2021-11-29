import Video from "./vendors/Video.js";
import Audio from "./vendors/Audio.js";
import Netplay from "./vendors/Netplay.js";

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

let polled = [{},{},{},{},{}];

function pollInputs(retro) {
  window.addEventListener(`keydown`, e => {
    e.preventDefault();
    if (keyMapping.hasOwnProperty(e.code)) {
      polled[0][keyMapping[e.code]] = true;
    }
  });

  window.addEventListener(`keyup`, e => {
    e.preventDefault();
    if (keyMapping.hasOwnProperty(e.code)) {
      polled[0][keyMapping[e.code]] = false;
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

  // window.addEventListener(`gamepadconnected`, e => {
  //   console.log("pad connected:", e.gamepad.id);
  // });

  // window.setInterval(() => {
  //   for (const pad of navigator.getGamepads()) {
  //     if (!pad) continue;
  //     pad.buttons.forEach((v, code) => {
  //       if (joyMapping.hasOwnProperty(code))
  //         polled[pad.index][joyMapping[code]] = v.pressed
  //     });
  //     if (pad.axes[0] >  0.5) polled[pad.index][7] = true;
  //     if (pad.axes[0] < -0.5) polled[pad.index][6] = true;
  //     if (pad.axes[1] >  0.5) polled[pad.index][5] = true;
  //     if (pad.axes[1] < -0.5) polled[pad.index][4] = true;
  //   }
  // }, 8)
}

function run(gamePath, conn, lpp, rpp) {
  const canvas = document.querySelector("#screen");
  const video = new Video(canvas);
  const audio = new Audio();

  Module.video = video;
  Module.audio = audio;

  libretro(Module).then((retro) => {
    const netplay = new Netplay(
      conn,                                              // p2p connection
      () => { retro.input_user_state[lpp] = polled[0] }, // input poll callback
      (port) => { return retro.input_user_state[port] }, // input state callback
      () => retro.iterate(),                             // update game callback
      () => retro.getState(),                            // serialize callback
      (st) => retro.setState(st),                        // unserialize callback
      () => retro.setFast(),
      () => retro.unsetFast(),
      lpp,                                               // local player port
      rpp,                                               // remote player port
    );
    retro.inputState = (port, id) => { return netplay.inputCurrentState(port)[id] };

    retro.loadGame(gamePath);
    pollInputs(retro);
    document.querySelector("#loading").style.display = "none";

    const iterate = () => {
      netplay.update();
      window.requestAnimationFrame(iterate);
    }
    window.requestAnimationFrame(iterate);
  });
}

const btn = document.querySelector("button");
const secret = document.querySelector("#peerId");

let peer = new Peer();

peer.on("open", (id) => {
  console.log("My peer ID is: " + id);
  secret.innerHTML = id;
});

function registerConn(conn, lpp, rpp) {
  console.log("connection", conn);

  conn.on("open", () => {
    run("main.lua", conn, lpp, rpp);
    document.querySelector("#loading").style.display = "block";
    btn.style.display = "none";
    secret.style.display = "none";
  });
}

peer.on("connection", (conn) => registerConn(conn, 1, 0));

btn.addEventListener("click", () => {
  const peerId = window.prompt('Peer ID');
  if (!peerId)
    return;

  const conn = peer.connect(peerId);
  registerConn(conn, 0, 1);
});

