/**
 * N64.wasm AudioWorklet Processor
 *
 * Runs on a dedicated audio thread (not the main thread).
 * Reads interleaved stereo i16 samples from a SharedArrayBuffer ring buffer.
 * Converts to float32 and outputs to speakers.
 *
 * Communication:
 *   Main thread writes samples to ring buffer + updates writeHead atomically.
 *   This worklet reads from ring buffer + updates readHead atomically.
 *   No locks needed — single producer, single consumer, atomic heads.
 */
class N64AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ringBuffer = null;
    this.writeHead = null;
    this.readHead = null;
    this.capacity = 0;
    this.initialized = false;
    this.underrunCount = 0;
    this.lastSampleL = 0;
    this.lastSampleR = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'init') {
        // SharedArrayBuffer-backed ring buffer
        this.ringBuffer = new Int16Array(e.data.ringBuffer);
        this.writeHead = new Int32Array(e.data.controlBuffer, 0, 1);
        this.readHead = new Int32Array(e.data.controlBuffer, 4, 1);
        this.capacity = e.data.capacity;
        this.initialized = true;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.initialized) return true;

    const output = outputs[0];
    if (!output || output.length < 2) return true;

    const left = output[0];
    const right = output[1];
    const frameCount = left.length; // typically 128

    const write = Atomics.load(this.writeHead, 0);
    const read = Atomics.load(this.readHead, 0);

    // Calculate available samples (interleaved stereo, so /2 for frames)
    let available;
    if (write >= read) {
      available = (write - read) / 2;
    } else {
      available = (this.capacity - read + write) / 2;
    }

    let newRead = read;

    for (let i = 0; i < frameCount; i++) {
      if (available > 0) {
        // Read interleaved L,R pair
        this.lastSampleL = this.ringBuffer[newRead] / 32768.0;
        this.lastSampleR = this.ringBuffer[newRead + 1] / 32768.0;

        newRead += 2;
        if (newRead >= this.capacity) newRead = 0;
        available--;

        left[i] = this.lastSampleL;
        right[i] = this.lastSampleR;
      } else {
        // Underrun — interpolate toward silence smoothly (no pop)
        this.lastSampleL *= 0.95;
        this.lastSampleR *= 0.95;
        left[i] = this.lastSampleL;
        right[i] = this.lastSampleR;
        this.underrunCount++;
      }
    }

    Atomics.store(this.readHead, 0, newRead);

    // Report underruns periodically
    if (this.underrunCount > 0 && this.underrunCount % 1000 === 0) {
      this.port.postMessage({ type: 'underrun', count: this.underrunCount });
    }

    return true;
  }
}

registerProcessor('n64-audio-processor', N64AudioProcessor);
