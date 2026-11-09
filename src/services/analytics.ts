export interface AnalyticsEvent {
  eventName: string;
  timestamp: string;
  params: Record<string, any>;
}

export class AnalyticsService {
  private hasConsent: boolean = false;
  private queue: AnalyticsEvent[] = [];

  public setConsent(consentGiven: boolean): void {
    this.hasConsent = consentGiven;
    if (this.hasConsent && this.queue.length > 0) {
      this.flushQueue();
    }
  }

  public logEvent(eventName: string, params: Record<string, any> = {}): void {
    const event: AnalyticsEvent = {
      eventName,
      timestamp: new Date().toISOString(),
      params: this.sanitizeParams(params),
    };

    if (!this.hasConsent) {
      // Keep only anonymous telemetry or drop
      if (['stage_start', 'stage_clear', 'attempt_fail'].includes(eventName)) {
        this.queue.push(event);
      }
      return;
    }

    this.send(event);
  }

  private sanitizeParams(params: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      // Strip any sensitive personal data
      if (!['email', 'ip', 'name'].includes(key.toLowerCase())) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private send(event: AnalyticsEvent): void {
    // Console log in development
    if ((import.meta as any).env?.DEV) {
      console.log(`[Analytics] ${event.eventName}:`, event.params);
    }

    // Optional fire-and-forget beacon to backend if consent granted
    if (this.hasConsent && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        navigator.sendBeacon('/api/analytics', JSON.stringify(event));
      } catch (e) {}
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0) {
      const ev = this.queue.shift();
      if (ev) this.send(ev);
    }
  }
}
