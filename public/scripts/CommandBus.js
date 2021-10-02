function CommandBus() {
  const registeredHandlers = new Map();

  /**
   * Returns true if handler for a command is registered
   *
   * @param {String} commandName
   * @returns Boolean
   */
  const isHandlerRegistered = (commandName) => {
    return registeredHandlers.has(commandName);
  };

  /**
   * Register command handler
   *
   * @param {String} commandName
   * @param {Function} handler
   */
  const registerHandler = (commandName, handler) => {
    if (registeredHandlers.has(commandName)) {
      throw new Error("handler already registered");
    }
    registeredHandlers.set(commandName, handler);
  };

  const unregisterHandler = (commandName) => {
    if (!registeredHandlers.has(commandName)) {
      throw new Error("handler not registered");
    }
    registeredHandlers.delete(commandName);
  };

  /**
   * Invoke command handler for given command
   *
   * @param {Object} command
   * @returns {Promise}
   */
  const handle = (command) => {
    const { type } = command;
    console.log("[CommandBus Handle] ", command);
    if (!registeredHandlers.has(type)) {
      throw new Error("handler not registered");
    }
    const handler = registeredHandlers.get(type);
    return handler.handle(command);
  };

  return {
    isHandlerRegistered,
    registerHandler,
    unregisterHandler,
    handle,
  };
}

export default CommandBus;
