# Phase 3.5 Architecture Notes

## Architecture Diagram

```text
AI Provider -> Prompt Builder -> Decision Engine -> Reality Authority Layer
                                      |                    |
                                      v                    v
Memory Manager <- Battle Result <- Battle Engine <- Reality Interpreter
      |                                |
      v                                v
Memory Compressor                Renderer / HUD / Battle Log / Debug Panels
```
## Memory Flow Diagram

```text
Completed Turn
  -> Self Memory update
  -> Opponent Analyzer profile update
  -> Arena Tracker update
  -> Power Tracker + Transformation Tracker
  -> Short-Term Memory append (last 10 turns)
  -> Memory Compressor periodically folds older context into Long-Term Summary
  -> Prompt Builder sends only compact memory on the next turn
```
## Reality Authority Diagram

```text
AI Action Claim
  -> Reality Interpreter (type, element, scale, effects, renderer hints)
  -> Authority Manager
       |-- Engine Authority: engine resolves all gameplay truth
       |-- AI Authority: AI claims are accepted/displayed without rejection
       |-- Hybrid Authority: narrative accepted; engine maps it to gameplay
  -> Final Battle Event
  -> Log, HUD, animation, memory update
```
## Authority Modes
- **Engine Authority** is the default rules-first mode. AI output is intent; the engine owns HP, damage, healing, cooldowns, death, victory, movement validation, status effects, and power scaling.
- **AI Authority** is free reality mode. The engine coordinates turns and displays the AI-authored event while preserving memory updates and renderer integration. Anti-boring guidance discourages instant endings.
- **Hybrid Authority** accepts imaginative claims, then translates them into structured gameplay events with calculated engine outcomes.
## Future Integration

The Reality Interpreter already emits normalized event type, element, scale, intensity, special effects, and renderer hints. Future Particle/VFX engines can consume those hints without changing AI prompts or battle resolution. Power Evolution can extend Power Memory and Transformation Memory with persistent unlocks, counters, and evolution trees while keeping prompt payloads compressed through the Memory Compressor.
