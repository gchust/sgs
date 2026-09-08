// Count only active decision time; animation, reading a dialog, and background tabs
// never consume the player's allowance. A response has its own clock.
export class DecisionClock {
    constructor() { this.key = null; this.remaining = 0; this.fired = false; }
    tick(key, seconds, elapsed, running) {
        if (key !== this.key) {
            this.key = key;
            this.remaining = seconds * 1000;
            this.fired = false;
        }
        if (running && !this.fired) this.remaining = Math.max(0, this.remaining - elapsed);
        const expired = running && this.remaining === 0 && !this.fired;
        if (expired) this.fired = true;
        return { seconds: Math.ceil(this.remaining / 1000), expired };
    }
}

export const SPEEDS = { slow: 2300, normal: 1500, fast: 750 };
export const timeoutChoice = prompt => prompt.optional ? null : prompt.options[0]?.value ?? null;
