/**
 * (very) Simple in-memory event store
 * *
 * @param {EventBus} eventBus Instance of EventBus to emit stored events to
 * @param {String} storedEventName Event name (for example 'event' or 'stored')
 */
function EventStore(eventBus, storedEventName) {
  if (!eventBus) {
    throw new Error("missing eventBus param");
  }

  if (!storedEventName) {
    throw new Error("missing storedEventName param");
  }
  const store = new Map();

  /**
   * Loads all the events for a given aggregate Id
   *
   * @param {any} id
   */
  async function readEvents(id) {
    let storedEvents = new Set();
    if (store.has(id)) {
      storedEvents = store.get(id);
    }
    const events = new Set();
    storedEvents.forEach((storedEvent) => {
      events.add(storedEvent.event);
    });
    return events;
  }

  /**
   * Store uncommited events from aggregate
   *
   * @param {String} id Aggregate Id
   * @param {Set} events Set of uncommited events
   * @param {Number} expectedVersion the version of the aggregate prior to committing new events
   */
  async function storeEvents(id, events, expectedVersion) {
    let storedEvents = new Set();
    if (store.has(id)) {
      storedEvents = store.get(id);
    }
    //  version check
    const currentVersion = await getCurrentVersion(id);
    if (currentVersion !== expectedVersion) {
      throw new Error(
        `Expected version was ${expectedVersion} but last commited version was ${currentVersion}`
      );
    }
    //  store new events
    let version = expectedVersion;
    events.forEach((event) => {
      version++;
      storedEvents.add({
        event,
        version,
      });
      eventBus.emit(storedEventName, event);
    });
    store.set(id, storedEvents);
  }

  /**
   * Get last version for given aggregate
   *
   * @param {String} id Aggregate Id
   * @returns
   */
  async function getCurrentVersion(id) {
    if (store.has(id)) {
      const storedEvents = store.get(id);
      const lastStoredEvent = Array.from(storedEvents).pop();
      return lastStoredEvent.version;
    } else {
      return 0;
    }
  }

  return {
    readEvents,
    storeEvents,
    getCurrentVersion,
    store,
  };
}

export default EventStore;
