export class InterruptManager {
  constructor(epochRef) {
    this._epochRef = epochRef;
  }

  snapshot() {
    const v = this._epochRef ? Number(this._epochRef.current) : 0;
    return Number.isFinite(v) ? v : 0;
  }

  isCurrent(epoch) {
    const e = Number(epoch);
    if (!Number.isFinite(e)) return false;
    return this.snapshot() === e;
  }

  bump(reason) {
    const next = this.snapshot() + 1;
    if (this._epochRef) this._epochRef.current = next;
    // eslint-disable-next-line no-console
    if (reason) console.log('[INTERRUPT_EPOCH] bump', String(reason || ''));
    return next;
  }
}

