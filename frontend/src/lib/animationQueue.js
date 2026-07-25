export function createAnimationQueue() { return { layers: {}, active: [] }; }
export function enqueueAnimation(queue, command) {
  const layer = command.layer || "effects";
  queue.layers[layer] ||= [];
  if (command.metadata?.replace) queue.layers[layer] = queue.layers[layer].filter((c) => c.target !== command.target || c.type !== command.type);
  queue.layers[layer].push(command);
  queue.layers[layer].sort((a, b) => (b.priority || 0) - (a.priority || 0));
}
export function updateAnimationQueue(queue, dt) {
  const all = [];
  for (const [layer, commands] of Object.entries(queue.layers)) {
    queue.layers[layer] = commands.filter((command) => {
      command.elapsed = (command.elapsed || 0) + dt * 1000;
      const alive = command.elapsed <= (command.duration || 0);
      if (alive) all.push(command);
      return alive;
    });
  }
  queue.active = all.sort((a, b) => (a.priority || 0) - (b.priority || 0));
  return queue.active;
}
