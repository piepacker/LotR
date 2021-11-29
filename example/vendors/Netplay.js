const rollbackMaxFrames = 10;

let tick = 0
let tickSyncing = false;
let tickOffset = 0.0;
let lastConfirmedTick = 0;
let syncedLastUpdate = false;
const detectDesyncs = false
const desyncCheckRate = 10;

const inputDelayFrames = 5;
const historySize = 60;
const sendHistorySize = 5;

// Network code indicating the type of message.
const MsgCodeHandshake   = 0x01; // Used when sending the hand shake.
const MsgCodePlayerInput = 0x02; // Sends part of the player's input buffer.
const MsgCodePing        = 0x03; // Used to tracking packet round trip time. Expect a "Pong" back.
const MsgCodePong        = 0x04; // Sent in reply to a Ping message for testing round trip time.
const MsgCodeSync        = 0x05; // Used to pass sync data

let connectedToClient = false;
let confirmedTick = 0;
let localSyncData = 0;
let remoteSyncData = 0;
let isStateDesynced = false;
let localSyncDataTick = -1;
let remoteSyncDataTick = -1;
let localTickDelta = 0;
let remoteTickDelta = 0;
let localInputHistory = new Uint32Array(historySize);
let remoteInputHistory = new Uint32Array(historySize);
let lastSyncedTick = -1;
// let messages chan []byte;

const MaxFrames = 60;
let inputBuffers = [
  Array.from(Array(MaxFrames), () => new Array(12)),
  Array.from(Array(MaxFrames), () => new Array(12)),
  Array.from(Array(MaxFrames), () => new Array(12)),
  Array.from(Array(MaxFrames), () => new Array(12)),
  Array.from(Array(MaxFrames), () => new Array(12)),
]; //[MaxPlayers][MaxFrames]PlayerState{}

let saved = {
	GameState: null,
	Inputs: null,
	Tick: 0,
}

export default class Netplay {
  constructor(conn, inputPollCb, inputStateCb, updateCb, serializeCb, unserializeCb, lpp, rpp) {
    this.conn = conn;
    this.inputPoll = inputPollCb;
    this.inputState = inputStateCb;
    this.gameUpdate = updateCb;
    this.serializeCb = serializeCb;
    this.unserializeCb = unserializeCb;
    this.localPlayerPort = lpp;
    this.remotePlayerPort = rpp;

    this.listen();

    this.sendPacket(this.makeHandshakePacket(), 1);
  }

  listen() {
    this.conn.on("data", (data) => {
      const pkt = JSON.parse(data);

      if (pkt.code == MsgCodeHandshake) {
        connectedToClient = true;
      }
      else if (pkt.code == MsgCodePlayerInput) {
        // console.log("Received", pkt.inputs);
        // Break apart the packet into its parts.
        const tickDelta = pkt.tickDelta;
        const receivedTick = pkt.receivedTick;

        // We only care about the latest tick delta, so make sure the confirmed frame is atleast the same or newer.
        // This would work better if we added a packet count.
        if (receivedTick >= confirmedTick)
          remoteTickDelta = tickDelta;

        if (receivedTick > confirmedTick) {
          if (receivedTick-confirmedTick > inputDelayFrames)
            console.log("Received packet with a tick too far ahead. Last: ", confirmedTick, " Current: ", receivedTick);

          confirmedTick = receivedTick;

          for (let offset = sendHistorySize - 1; offset >= 0; offset--) { // 4, 3, 2, 1, 0
            const encodedInput = pkt.inputs[offset];
            // Save the input history sent in the packet.
            this.setRemoteEncodedInput(encodedInput, receivedTick-offset);
          }
        }
      }
      else if (pkt.code == MsgCodePing) {
        const t = pkt.time;
        this.sendPacket(this.makePongPacket(t), 1);
      }
      else if (pkt.code == MsgCodePong) {
        const t = pkt.time;
        // console.log(t);
      }
      else if (pkt.code == MsgCodeSync) {
        // Ignore any tick that isn't more recent than the last sync data
        if (!isStateDesynced && pkt.tick > remoteSyncDataTick) {
          remoteSyncDataTick = pkt.tick;
          remoteSyncData = pkt.data;

          // Check for a desync
          isDesynced();
        }
      }
    });
  }

  update() {
    let lastGameTick = tick;
    let shouldUpdate = false;

    // receiveData();

    if (connectedToClient) {
      // First we assume that the game can be updated, sync checks below can halt updates
      shouldUpdate = true;

      // Run any rollbacks that can be processed before the next game update
      this.handleRollbacks();

      // Calculate the difference between remote game tick and the local. This will be used for syncing.
      // We don't use the latest local tick, but the tick for the latest input sent to the remote client.
      localTickDelta = lastGameTick - confirmedTick;

      // Only do time sync check when the previous confirmed tick from the remote client hasn't been used yet.
      if (confirmedTick > lastConfirmedTick) {

        lastConfirmedTick = confirmedTick;

        // Prevent updating the game when the tick difference is greater on this end.
        // This allows the game deltas to be off by 2 frames.
        // Our timing is only accurate to one frame so any slight increase in network latency would cause the
        // game to constantly hold. You could increase this tolerance, but this would increase the advantage
        // for one player over the other.

        // Only calculate time sync frames when we are not currently time syncing.
        if (!tickSyncing) {
          // Calculate tick offset using the clock synchronization algorithm.
          // See https://en.wikipedia.org/wiki/Network_Time_Protocol#Clock_synchronization_algorithm
          tickOffset = (localTickDelta - remoteTickDelta) / 2.0;

          // Only sync when the tick difference is more than one frame.
          if (tickOffset >= 1)
            tickSyncing = true;
        }

        if (tickSyncing && !syncedLastUpdate) {
          shouldUpdate = false;
          syncedLastUpdate = true;

          tickOffset--;

          // Stop time syncing when the tick difference is less than 1 so we don't overshoot
          if (tickOffset < 1)
            tickSyncing = false;
        } else {
          syncedLastUpdate = false;
        }
      }

      // Only halt the game update based on exceeding the rollback window when the game updated hasn't previously
      // been stopped by time sync code
      if (shouldUpdate) {
        // We allow the game to run for rollbackMaxFrames updates without having input for the current frame.
        // Once the game can no longer update, it will wait until the other player's client can catch up.
        shouldUpdate = lastGameTick <= (confirmedTick + rollbackMaxFrames);
      }
    }

    if (shouldUpdate) {
      // Poll inputs for this frame.
      this.inputPoll();

      // Update local input history
      let sendInput = this.inputGetLatest(this.localPlayerPort);
      this.setLocalInput(sendInput, lastGameTick+inputDelayFrames);

      // Set the input state for the current tick for the remote player's character.
      this.inputSetState(this.localPlayerPort, this.getLocalInputState(lastGameTick));
      this.inputSetState(this.remotePlayerPort, this.getRemoteInputState(lastGameTick));

      // Increment the tick count only when the game actually updates.
      this.gameUpdate();

      tick++;

      // Check whether or not the game state is confirmed to be in sync.
      // Since we previously rolled back, it's safe to set the lastSyncedTick here since we know any previous
      // frames will be synced.
      if (lastSyncedTick+1 == lastGameTick && lastGameTick <= confirmedTick) {
        // Increment the synced tick number if we have inputs
        lastSyncedTick = lastGameTick;

        // Applied the remote player's input, so this game frame should synced.
        this.serialize();

        // Confirm the game clients are in sync
        this.checkSync();
      }
    }

    // Since our input is update in gameupdate() we want to send the input as soon as possible.
    // Previously this as happening before the gameupdate() and adding uneeded latency.
    if (connectedToClient) {
      // Send this player's input state. We when inputDelayFrames frames ahead.
      // Note: This input comes from the last game update, so we subtract 1 to set the correct tick.
      this.sendInputData(tick - 1 + inputDelayFrames);

      // Send ping so we can test network latency.
      this.sendPingMessage();
    }
  }

  serialize() {
    saved.GameState = this.serializeCb();
    // saved.Inputs = input.Serialize();
    saved.Tick = tick;
  }

  unserialize() {
    if (saved.GameState.length == 0) {
      console.log("Trying to unserialize a savestate of len 0");
      return;
    }

    this.unserializeCb(saved.GameState);
    // input.Unserialize(saved.Inputs);
    tick = saved.Tick;
  }

  // handleRollbacks will rollback if needed.
  handleRollbacks() {
    const lastGameTick = tick - 1;
    // The input needed to resync state is available so rollback.
    // lastSyncedTick keeps track of the lastest synced game tick.
    // When the tick count for the inputs we have is more than the number of synced ticks it's possible to rerun those
    // game updates with a rollback.

    if (lastGameTick >= 0 && lastGameTick > (lastSyncedTick+1) && confirmedTick > lastSyncedTick) {

      // The number of frames that's elasped since the game has been out of sync.
      // Rerun rollbackFrames number of updates.
      const rollbackFrames = lastGameTick - lastSyncedTick;

      // console.log("Rollback", rollbackFrames, "frames");

      // Must revert back to the last known synced game frame.
      this.unserialize();

      for (let i = 0; i < rollbackFrames; i++) {
        // Get input from the input history buffer.
        // The network system can predict input after the last confirmed tick (for the remote player).
        this.inputSetState(this.localPlayerPort, this.getLocalInputState(tick));
        this.inputSetState(this.remotePlayerPort, this.getRemoteInputState(tick));

        const lastRolledBackGameTick = tick;
        this.gameUpdate();
        tick++;

        // Confirm that we are indeed still synced
        if (lastRolledBackGameTick <= confirmedTick) {
          // console.log("Saving after a rollback");

          this.serialize();

          lastSyncedTick = lastRolledBackGameTick;

          // Confirm the game clients are in sync
          this.checkSync();
        }
      }
    }
  }

  // Gets the sync data to confirm the client game states are in sync
  gameGetSyncData() {
    const bytes = this.serializeCb();
    return b_crc32(bytes);
  }

  // Checks whether or not a game state desync has occurred between the local and remote clients.
  checkSync() {
    if (!detectDesyncs)
      return;

    if (lastSyncedTick < 0)
      return;

    // Check desyncs at a fixed rate.
    if ((lastSyncedTick % desyncCheckRate) != 0)
      return;

    // Generate the data we'll send to the other player for testing that their game state is in sync.
    this.setLocalSyncData(lastSyncedTick, this.gameGetSyncData());

    // Send sync data everytime we've applied from the remote player to a game frame.
    this.sendSyncData();

    if (!this.isDesynced())
      return;

    // Detect when the sync data doesn't match then halt the game
    console.log("Desync detected");

    // os.Exit(0)
  }

  // Check for a desync.
  isDesynced() {
    if (localSyncDataTick < 0)
      return false;

    // When the local sync data does not match the remote data indicate a desync has occurred.
    if (isStateDesynced || localSyncDataTick == remoteSyncDataTick) {
      console.log("Desync Check at: ", localSyncDataTick);

      if (localSyncData != remoteSyncData) {
        console.log(localSyncDataTick, localSyncData, remoteSyncData);
        isStateDesynced = true;
        return true;
      }
    }

    return false;
  }

  // Set sync data for a game tick
  setLocalSyncData(tck, syncData) {
    if (!isStateDesynced) {
      console.log("setLocalSyncData", tck, syncData);
      localSyncData = syncData;
      localSyncDataTick = tck;
    }
  }

  // Get input from the remote player for the passed in game tick.
  getRemoteInputState(tck /*int64*/) /*input.PlayerState*/ {
    if (tck > confirmedTick) {
      // Repeat the last confirmed input when we don't have a confirmed tck
      tck = confirmedTick;
      // console.log("Predict:", confirmedTick, remoteInputHistory[(historySize+tck)%historySize]);
    }
    return this.decodeInput(remoteInputHistory[(historySize+tck)%historySize]);
  }

  // Get input state for the local client
  getLocalInputState(tck /*int64*/) /*input.PlayerState*/ {
    return this.decodeInput(localInputHistory[(historySize+tck)%historySize]);
  }

  // Send the inputState for the local player to the remote player for the given game tick.
  sendInputData(tck /*int64*/) {
    // Don't send input data when not connect to another player's game client.
    if (!connectedToClient)
      return;

    // console.log("Send input packet", tck)

    this.sendPacket(this.makeInputPacket(tck), 1);
  }

  setLocalInput(st /*input.PlayerState*/, tck /*int64*/) {
    const encodedInput = this.encodeInput(st);
    localInputHistory[(historySize+tck)%historySize] = encodedInput;
  }

  setRemoteEncodedInput(encodedInput /*uint32*/, tck /*int64*/) {
    remoteInputHistory[(historySize+tck)%historySize] = encodedInput;
  }

  // Handles sending packets to the other client. Set duplicates to something > 0 to send more than once.
  sendPacket(packet /*[]byte*/, duplicates /*int*/) {
    if (duplicates == 0)
      duplicates = 1;

    for (let i = 0; i < duplicates; i++)
      this.conn.send(packet);
  }

  inputGetState(port /*uint*/, tck /*int64*/) /*PlayerState*/ {
    const frame = (MaxFrames + tck) % MaxFrames;
    const st = inputBuffers[port][frame];
    return st;
  }

  // inputGetLatest returns the most recently polled inputs
  inputGetLatest(port /*uint*/) /*PlayerState*/ {
    return this.inputState(port);
  }

  // returns the input state at the current tick
  inputCurrentState(port /*uint*/) /*PlayerState*/ {
    return this.inputGetState(port, tick);
  }

  inputIndex(offset /*int64*/) /*int64*/ {
    let tck = tick;
    tck += offset;
    return (MaxFrames + tick) % MaxFrames;
  }

  // inputSetState forces the input state for a given player
  inputSetState(port /*uint*/, st /*PlayerState*/) {
    for (let i = 0; i < 12; i++) {
      const b = st[i];
      inputBuffers[port][this.inputIndex(0)][i] = b;
    }
  }

  // Generate a packet containing information about player input.
  makeInputPacket(tck /*int64*/) /*[]byte*/ {
    let pkt = {
      code: MsgCodePlayerInput,
      tickDelta: localTickDelta,
      receivedTick: tck,
      inputs: [],
    };

    const historyIndexStart = tck - sendHistorySize + 1;
    // console.log("Make input", tck, historyIndexStart)
    for (let i = 0; i < sendHistorySize; i++) {
      const encodedInput = localInputHistory[(historySize+historyIndexStart+i)%historySize];
      // binary.Write(buf, binary.LittleEndian, encodedInput);
      pkt.inputs[i] = encodedInput;
      // console.log((historySize + historyIndexStart + i) % historySize)
    }

    return JSON.stringify(pkt);
  }

  // Send a ping message in order to test network latency
  sendPingMessage() {
    this.sendPacket(this.makePingPacket(Date.now()), 1);
  }

  // Make a ping packet
  makePingPacket(t /*time.Time*/) /*[]byte*/ {
    return JSON.stringify({
      code: MsgCodePing,
      time: t,
    });
  }

  // Make pong packet
  makePongPacket(t /*time.Time*/) /*[]byte*/ {
    return JSON.stringify({
      code: MsgCodePong,
      time: t,
    });
  }

  // Sends sync data
  sendSyncData() {
    this.sendPacket(this.makeSyncDataPacket(localSyncDataTick, localSyncData), 5);
  }

  // Make a sync data packet
  makeSyncDataPacket(tck, syncData) /*[]byte*/ {
    return JSON.stringify({
      code: MsgCodeSync,
      tick: tck,
      data: syncData,
    });
  }

  // Generate handshake packet for connecting with another client.
  makeHandshakePacket() /*[]byte*/ {
    return JSON.stringify({code: MsgCodeHandshake});
  }

  // Encodes the player input state into a compact form for network transmission.
  encodeInput(st /*input.PlayerState*/) /*uint32*/ {
    let out = 0;
    for (let i = 0; i < 12; i++) {
      const b = st[i];
      out |= (b << i);
    }
    return out;
  }

  // Decodes the input from a packet generated by encodeInput().
  decodeInput(inp /*uint32*/) /*input.PlayerState*/ {
    let st = {}; /*input.PlayerState{}*/
    for (let i = 0; i < 12; i++) {
      st[i] = (inp & (1 << i)) != 0;
    }
    return st;
  }
}
