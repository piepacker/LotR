export default class Audio {
  create() {
    this.numSamples = 2048;

    this.ctx = new AudioContext();

    this.node = this.ctx.createScriptProcessor(
      this.numSamples,
      0,
      this.numChannels
    );
    this.node.connect(this.ctx.destination);

    this.minBufferSize = this.numSamples * this.numChannels;
    this.maxBufferSize = 4096 * this.numChannels;

    const ratio = this.ctx.sampleRate / this.sampleRate;

    this.audioBuffer = new Float32Array(this.maxBufferSize);
    this.audioBufferSize = 0;

    this.resampleBufferStart = this.resampleBufferEnd = 0;
    this.resampleBufferSize =
      Math.ceil((this.maxBufferSize * ratio) / this.numChannels) *
        this.numChannels +
      this.numChannels;

    this.resampleBuffer = new Float32Array(this.resampleBufferSize);
    this.resampler = new Resampler({
      inputSampleRate: this.sampleRate,
      outputSampleRate: this.ctx.sampleRate,
      numChannels: this.numChannels,
      outputBufferSize: this.resampleBufferSize,
    });

    this.attachWebAudioApi();
  }

  constructor() {
    this.volume = 1.0;
  }

  attachWebAudioApi() {
    this.node.addEventListener(`audioprocess`, (e) => {
      let buffers = new Array(this.numChannels);

      for (let t = 0; t < buffers.length; ++t)
        buffers[t] = e.outputBuffer.getChannelData(t);

      this.refillResampleBuffer();

      let written = 0;

      for (
        ;
        written < this.numSamples &&
        this.resampleBufferStart !== this.resampleBufferEnd;
        ++written
      ) {
        for (let t = 0; t < this.numChannels; ++t)
          buffers[t][written] =
            this.resampleBuffer[this.resampleBufferStart++] * this.volume;

        if (this.resampleBufferStart === this.resampleBufferSize) {
          this.resampleBufferStart = 0;
        }
      }

      for (; written < this.numSamples; ++written) {
        for (let t = 0; t < this.numChannels; ++t) {
          buffers[t][written] = 0;
        }
      }
    });
  }

  refillResampleBuffer() {
    if (this.audioBufferSize === 0) return;

    const resampleLength = this.resampler.resample(
      this.audioBuffer.subarray(0, this.audioBufferSize)
    );
    const resampleResult = this.resampler.outputBuffer;

    for (let t = 0; t < resampleLength; ) {
      this.resampleBuffer[this.resampleBufferEnd++] = resampleResult[t++];

      if (this.resampleBufferEnd === this.resampleBufferSize)
        this.resampleBufferEnd = 0;

      if (this.resampleBufferStart === this.resampleBufferEnd) {
        this.resampleBufferStart += this.numChannels;
        if (this.resampleBufferStart === this.resampleBufferSize) {
          this.resampleBufferStart = 0;
        }
      }
    }

    this.audioBufferSize = 0;
  }

  writeAudioNoCallback(samples) {
    let t = 0;

    while (t < samples.length && this.audioBufferSize < this.maxBufferSize) {
      this.audioBuffer[this.audioBufferSize++] = samples[t++] / 0x8000;
    }
  }

  configure(sampleRate, channels) {
    this.sampleRate = sampleRate;
    this.numChannels = channels;
    this.create();
  }

  pushSampleBatch(samples) {
    this.writeAudioNoCallback(samples);
  }
}

class Resampler {
  constructor({
    inputSampleRate,
    outputSampleRate,

    numChannels,

    outputBufferSize,
  } = {}) {
    this.inputSampleRate = inputSampleRate;
    this.outputSampleRate = outputSampleRate;

    this.numChannels = numChannels;

    this.outputBufferSize = outputBufferSize;

    this.outputBuffer = new Float32Array(this.outputBufferSize);
    this.lastOutput = new Float32Array(this.numChannels);

    if (this.inputSampleRate === this.outputSampleRate) {
      this.resample = Reflect.apply(this.passthrough, this, []);

      this.ratioWeight = 1;
    } else {
      this.ratioWeight = this.inputSampleRate / this.outputSampleRate;

      if (this.inputSampleRate < this.outputSampleRate) {
        this.resample = Reflect.apply(this.linearInterpolation, this, []);

        this.lastWeight = 1;
      } else if (this.inputSampleRate > this.outputSampleRate) {
        this.resample = Reflect.apply(this.multiTap, this, []);

        this.tailExists = false;
        this.lastWeight = 0;
      }
    }
  }

  range(from, to) {
    return Array.from(new Array(to - from), (x, i) => from + i);
  }

  passthrough() {
    return (buffer) => {
      this.outputBuffer = buffer;

      return this.outputBuffer.length;
    };
  }

  linearInterpolation() {
    return (buffer) => {
      let bufferLength = buffer.length;
      let channels = this.numChannels;
      let outLength = this.outputBufferSize;
      let ratioWeight = this.ratioWeight;
      let weight = this.lastWeight;
      let firstWeight = 0;
      let secondWeight = 0;
      let sourceOffset = 0;
      let outputOffset = 0;

      if (bufferLength % channels !== 0) {
        throw new Error("Buffer was of incorrect sample length.");
      }
      if (bufferLength <= 0) {
        return [];
      }

      for (; weight < 1; weight += ratioWeight) {
        secondWeight = weight % 1;
        firstWeight = 1 - secondWeight;
        this.lastWeight = weight % 1;
        for (let channel = 0; channel < this.numChannels; ++channel) {
          this.outputBuffer[outputOffset++] =
            this.lastOutput[channel] * firstWeight +
            buffer[channel] * secondWeight;
        }
      }
      weight -= 1;
      for (
        bufferLength -= channels, sourceOffset = Math.floor(weight) * channels;
        outputOffset < outLength && sourceOffset < bufferLength;

      ) {
        secondWeight = weight % 1;
        firstWeight = 1 - secondWeight;
        for (let channel = 0; channel < this.numChannels; ++channel) {
          this.outputBuffer[outputOffset++] =
            buffer[sourceOffset + (channel > 0 ? channel : 0)] * firstWeight +
            buffer[sourceOffset + (channels + channel)] * secondWeight;
        }
        weight += ratioWeight;
        sourceOffset = Math.floor(weight) * channels;
      }
      for (let channel = 0; channel < channels; ++channel) {
        this.lastOutput[channel] = buffer[sourceOffset++];
      }
      return outputOffset;
    };
  }

  multiTap() {
    return (buffer) => {
      let bufferLength = buffer.length;
      let outLength = this.outputBufferSize;
      let output_variable_list = [];
      let channels = this.numChannels;
      let ratioWeight = this.ratioWeight;
      let weight = 0;
      let actualPosition = 0;
      let amountToNext = 0;
      let alreadyProcessedTail = !this.tailExists;
      let outputBuffer = this.outputBuffer;
      let outputOffset = 0;
      let currentPosition = 0;

      this.tailExists = false;

      if (bufferLength % channels !== 0) {
        throw new Error("Buffer was of incorrect sample length.");
      }
      if (bufferLength <= 0) {
        return [];
      }

      for (let channel = 0; channel < channels; ++channel) {
        output_variable_list[channel] = 0;
      }

      do {
        if (alreadyProcessedTail) {
          weight = ratioWeight;
          for (let channel = 0; channel < channels; ++channel) {
            output_variable_list[channel] = 0;
          }
        } else {
          weight = this.lastWeight;
          for (let channel = 0; channel < channels; ++channel) {
            output_variable_list[channel] = this.lastOutput[channel];
          }
          alreadyProcessedTail = true;
        }
        while (weight > 0 && actualPosition < bufferLength) {
          amountToNext = 1 + actualPosition - currentPosition;
          if (weight >= amountToNext) {
            for (let channel = 0; channel < channels; ++channel) {
              output_variable_list[channel] +=
                buffer[actualPosition++] * amountToNext;
            }
            currentPosition = actualPosition;
            weight -= amountToNext;
          } else {
            for (let channel = 0; channel < channels; ++channel) {
              output_variable_list[channel] +=
                buffer[actualPosition + (channel > 0 ? channel : 0)] * weight;
            }
            currentPosition += weight;
            weight = 0;
            break;
          }
        }

        if (weight === 0) {
          for (let channel = 0; channel < channels; ++channel) {
            outputBuffer[outputOffset++] =
              output_variable_list[channel] / ratioWeight;
          }
        } else {
          this.lastWeight = weight;
          for (let channel = 0; channel < channels; ++channel) {
            this.lastOutput[channel] = output_variable_list[channel];
          }
          this.tailExists = true;
          break;
        }
      } while (actualPosition < bufferLength && outputOffset < outLength);
      return outputOffset;
    };
  }
}
