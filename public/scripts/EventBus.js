import { Subject } from "https://cdn.skypack.dev/rxjs";
/**
 * Initialize event bus instance
 *
 * @returns {EventEmitter}
 */
export default class EventBus {
  constructor() {
    this.subject = new Subject();
    this.subscriptions = new Map();
  }

  emit(event) {
    console.log("[EventBus EMIT]", event);
    var t = this.subscriptions.get(event.type);
    if (t) t.next(event);
  }
  on(eventName, listener) {
    console.log("[EventBus ON] subscribing for event", eventName);
    this.subscriptions.set(eventName, this.subject.subscribe(listener));
  }

  off(eventName, listener) {
    console.log("[EventBus OFF]", eventName, listener);
    this.subscriptions.remove(eventName);
  }
}
