export function createTimelineScheduler() { return { timelines: [], activeCommands: [] }; }
export function scheduleTimeline(scheduler, timeline) { scheduler.timelines.push({ ...timeline, status: "running", elapsed: 0 }); }
export function cancelTimeline(scheduler, id) { for (const t of scheduler.timelines) if (t.id === id) t.cancelled = true; }
export function pauseScheduler(scheduler) { scheduler.paused = true; }
export function resumeScheduler(scheduler) { scheduler.paused = false; }
export function updateTimelineScheduler(scheduler, dt, enqueue) {
  if (scheduler.paused) return;
  for (const timeline of scheduler.timelines) {
    if (timeline.cancelled || timeline.paused) continue;
    timeline.elapsed += dt * 1000;
    for (const command of timeline.commands) {
      const start = (command.startTime || 0) + (command.delay || 0);
      if (command.status === "pending" && timeline.elapsed >= start) {
        command.status = "active";
        command.elapsed = 0;
        enqueue?.({ ...command, timelineId: timeline.id });
      }
    }
    const endAt = Math.max(0, ...timeline.commands.map((c) => (c.startTime || 0) + (c.delay || 0) + (c.duration || 0)));
    if (timeline.elapsed >= endAt) timeline.status = timeline.loop ? "running" : "complete";
    if (timeline.loop && timeline.elapsed >= endAt) {
      timeline.elapsed = 0;
      timeline.commands = timeline.commands.map((c) => ({ ...c, status: "pending", elapsed: 0 }));
    }
  }
  scheduler.timelines = scheduler.timelines.filter((t) => !t.cancelled && t.status !== "complete");
}
