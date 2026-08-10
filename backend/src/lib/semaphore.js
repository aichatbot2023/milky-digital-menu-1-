/** Minimal counting semaphore used to bound concurrent Claude vision calls. */
export class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max);
    this.count = 0;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (this.count < this.max) {
          this.count += 1;
          resolve(() => this._release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }

  _release() {
    this.count -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}
