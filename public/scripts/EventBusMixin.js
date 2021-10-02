/**
 *  EventBus Class Mixin
 *  targetClass: HtmlElement
 */
export const useEventBusMixin = (targetClass, eventBus) => {
  return class extends targetClass {
    constructor() {
      super();
      this.eventBus = eventBus;
    }

    connectedCallback() {
      super.connectedCallback();
    }

    disconnectedCallback() {
      super.disconnectedCallback();
    }

    //TODO: need to delegate events to listen for
    emitEvent(event) {
      this.eventBus.emit(event);
    }
  };
};

/**
 *  Decorator Factory
 */
export const useEventBus = (options) => (descriptor) => {
  if (typeof descriptor === "function") return false;

  const { kind, elements } = descriptor;

  return {
    kind,
    elements,
    finisher(targetClass) {
      return useEventBus(targetClass);
    },
  };
};

export default useEventBus;
