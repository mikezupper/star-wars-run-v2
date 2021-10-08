var DOMEventProducer = (function () {
  function DOMEventProducer(node, eventType, useCapture) {
    this.node = node;
    this.eventType = eventType;
    this.useCapture = useCapture;
    this.type = "fromEvent";
  }
  DOMEventProducer.prototype._start = function (out) {
    this.listener = function (e) {
      return out._n(e);
    };
    this.node.addEventListener(this.eventType, this.listener, this.useCapture);
  };
  DOMEventProducer.prototype._stop = function () {
    this.node.removeEventListener(
      this.eventType,
      this.listener,
      this.useCapture
    );
    this.listener = null;
  };
  return DOMEventProducer;
})();
var NodeEventProducer = (function () {
  function NodeEventProducer(node, eventName) {
    this.node = node;
    this.eventName = eventName;
    this.type = "fromEvent";
  }
  NodeEventProducer.prototype._start = function (out) {
    this.listener = function () {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return args.length > 1 ? out._n(args) : out._n(args[0]);
    };
    this.node.addListener(this.eventName, this.listener);
  };
  NodeEventProducer.prototype._stop = function () {
    this.node.removeListener(this.eventName, this.listener);
    this.listener = null;
  };
  return NodeEventProducer;
})();
function isEmitter(element) {
  return element.emit && element.addListener;
}

export const fromEvent = function fromEvent(element, eventName, useCapture) {
  if (useCapture === void 0) {
    useCapture = false;
  }
  if (isEmitter(element)) {
    return new xstream.Stream(new NodeEventProducer(element, eventName));
  } else {
    return new xstream.Stream(
      new DOMEventProducer(element, eventName, useCapture)
    );
  }
}
