
// M1 Physics Engine - additive, doesn't break existing
const BASE_GRAVITY = 1400;
export function createPhysicsState(x, y, physicsProfile, groundY) {
  return { x, y, vx:0, vy:0, ax:0, ay:0, mass: physicsProfile.mass, density: physicsProfile.density, groundY, grounded:true, momentum:{x:0,y:0}, weightTransfer:0, landingForce:0, airTime:0, friction: physicsProfile.collisionBehaviour?.groundFriction||0.6 };
}
export function applyForce(state, fx, fy){ state.ax+=fx/state.mass; state.ay+=fy/state.mass; }
export function updatePhysics(state, profile, dt, bounds){ return { moved:0, landed:false, landingForce:0 }; }
export function computeLandingForce(vy, mass){ return Math.max(0, vy*mass*0.0008); }
export function getWeightTransfer(state){ return state.weightTransfer||0; }
