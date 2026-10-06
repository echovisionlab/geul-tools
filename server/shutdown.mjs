/** Stop accepting requests while allowing in-flight responses to finish. */
export function drainOnSignal(server) {
  let draining = false;
  const shutdown = () => {
    if (draining) return;
    draining = true;
    server.close((error) => {
      process.exitCode = error ? 1 : 0;
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  return () => {
    process.off("SIGTERM", shutdown);
    process.off("SIGINT", shutdown);
  };
}
