export class RingBuffer {
  /**
   * @param {number} capacity
   * @param {number} elSize
   */
  constructor(capacity) {
    /** @type {Uint8Array[]} */
    this.buffer = [];
    this.capacity = capacity;
  }

  // Keep the newest item at index 0 and discard values beyond capacity.
  push(value) {
    this.buffer.unshift(value);

    if (this.buffer.length > this.capacity) {
      this.buffer.pop();
    }
  }
}
