export class XorShift32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed || 0x9e3779b9;
  }

  nextU32() {
    let x = this.state >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state;
  }

  nextFloat() {
    return this.nextU32() / 0xffffffff;
  }
}

export function hashSeed(input: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRandomSeed(timestamp = Date.now()) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const stamp = timestamp.toString(36).toUpperCase();
  for (let i = 0; i < 8; i++) {
    out += chars[(i * 7 + stamp.charCodeAt(i % stamp.length)) % chars.length];
  }
  return `SEED-${out}`;
}
