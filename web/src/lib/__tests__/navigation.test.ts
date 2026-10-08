import { describe, it, expect } from "vitest";
import {
  advanceStep,
  bearingDegrees,
  distanceToPathMeters,
  haversineMeters,
  nearestPathIndex,
  remainingPathMeters,
} from "../navigation";

describe("bearingDegrees", () => {
  const o = { lat: 7.0, lng: 80.0 };
  it("returns compass bearings for the four directions", () => {
    expect(bearingDegrees(o, { lat: 7.1, lng: 80.0 })).toBeCloseTo(0, 0);
    expect(bearingDegrees(o, { lat: 7.0, lng: 80.1 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(o, { lat: 6.9, lng: 80.0 })).toBeCloseTo(180, 0);
    expect(bearingDegrees(o, { lat: 7.0, lng: 79.9 })).toBeCloseTo(270, 0);
  });
});

describe("nearestPathIndex / remainingPathMeters", () => {
  const path: [number, number][] = [
    [7.0, 80.0],
    [7.0, 80.01],
    [7.0, 80.02],
    [7.0, 80.03],
  ];
  it("finds the closest vertex and only searches forward", () => {
    expect(nearestPathIndex({ lat: 7.0, lng: 80.021 }, path)).toBe(2);
    expect(nearestPathIndex({ lat: 7.0, lng: 80.0 }, path, 2)).toBe(2);
  });
  it("sums the remaining distance (0.01 deg lng at 7N is ~1.1 km)", () => {
    const m = remainingPathMeters(path, 1);
    expect(m).toBeGreaterThan(2150);
    expect(m).toBeLessThan(2260);
    expect(remainingPathMeters(path, 3)).toBe(0);
  });
});

const colombo = { lat: 6.9271, lng: 79.8612 };
const kandy = { lat: 7.2906, lng: 80.6337 };

describe("haversineMeters", () => {
  it("is zero for the same point and plausible Colombo-Kandy (~94 km)", () => {
    expect(haversineMeters(colombo, colombo)).toBe(0);
    const km = haversineMeters(colombo, kandy) / 1000;
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(105);
  });
});

describe("distanceToPathMeters", () => {
  const path: [number, number][] = [
    [7.0, 80.0],
    [7.0, 80.1],
  ];

  it("is ~0 for a point on the line", () => {
    expect(distanceToPathMeters({ lat: 7.0, lng: 80.05 }, path)).toBeLessThan(1);
  });

  it("measures perpendicular offset (~0.001 deg lat is ~111 m)", () => {
    const d = distanceToPathMeters({ lat: 7.001, lng: 80.05 }, path);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });

  it("measures distance to the nearest endpoint past the end of the line", () => {
    const d = distanceToPathMeters({ lat: 7.0, lng: 80.101 }, path);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(117);
  });

  it("returns Infinity for an empty path", () => {
    expect(distanceToPathMeters(colombo, [])).toBe(Infinity);
  });
});

describe("advanceStep", () => {
  // maneuvers sit at route vertices 0, 10, 20 and 30
  const stepPathIndex = [0, 10, 20, 30];

  it("stays on the current maneuver until the vehicle has passed it", () => {
    expect(advanceStep(5, stepPathIndex, 1)).toBe(1);
  });

  it("advances once the maneuver vertex is reached", () => {
    expect(advanceStep(10, stepPathIndex, 1)).toBe(2);
  });

  it("skips every maneuver already driven through, even if GPS jumped past them", () => {
    expect(advanceStep(25, stepPathIndex, 1)).toBe(3);
  });

  it("never goes past the final step and never moves backwards", () => {
    expect(advanceStep(99, stepPathIndex, 1)).toBe(3);
    expect(advanceStep(0, stepPathIndex, 2)).toBe(2);
  });
});
