import OpeningHours from "opening_hours";
import { describe, expect, it } from "vitest";
import { openInfo, openLine, type OpeningHoursLib } from "../../src/core/hours";
import type { Place } from "../../src/core/types";

const lib = OpeningHours as unknown as OpeningHoursLib;
const berlin = { lat: 52.52, lon: 13.405, label: "Mitte", cc: "de", state: "Berlin" };
const place = (hours?: string): Place => ({ id: "node/1", name: "X", lat: 52.52, lon: 13.405, mood: "food", tags: hours ? { opening_hours: hours } : {} });
const at = (iso: string) => new Date(iso);
const state = (hours: string | undefined, iso: string) => openInfo(lib, place(hours), berlin, at(iso)).state;

describe("opening hours", () => {
  it("open, with the closing time", () => {
    const info = openInfo(lib, place("Mo-Su 12:00-22:00"), berlin, at("2026-10-24T19:00:00+02:00"));
    expect(info).toMatchObject({ state: "open", until: at("2026-10-24T22:00:00+02:00") });
    expect(openLine(info, at("2026-10-24T19:00:00+02:00"), "de-DE")).toBe("Open when you get there, until 22:00");
  });
  it("closed is closed", () => {
    expect(state("Mo-Fr 09:00-17:00", "2026-10-24T19:00:00+02:00")).toBe("closed");
  });
  it("closing within 45 minutes of arrival counts as closed", () => {
    expect(state("Mo-Su 10:00-19:30", "2026-10-24T19:00:00+02:00")).toBe("closed");
    expect(state("Mo-Su 10:00-19:50", "2026-10-24T19:00:00+02:00")).toBe("open");
  });
  it("clubs stay open past midnight", () => {
    expect(state("Fr,Sa 23:00-06:00", "2026-10-24T23:30:00+02:00")).toBe("open");
    expect(state("Fr,Sa 23:00-06:00", "2026-10-25T02:00:00+02:00")).toBe("open");
    expect(state("Fr,Sa 23:00-06:00", "2026-10-27T23:30:00+01:00")).toBe("closed");
  });
  it("missing, unreadable or marked-unknown hours are unknown", () => {
    for (const h of [undefined, "ask the owner", "Mo-Su 18:00-23:00 unknown"]) expect(state(h, "2026-10-24T19:00:00+02:00")).toBe("unknown");
    expect(openLine({ state: "unknown" }, new Date())).toBe("Hours unknown. Check before you go.");
  });
  it("without the engine everything is unknown", () => {
    expect(openInfo(null, place("Mo-Su 12:00-22:00"), berlin, new Date()).state).toBe("unknown");
  });
  it("round the clock", () => {
    const info = openInfo(lib, place("24/7"), berlin, at("2026-10-24T19:00:00+02:00"));
    expect(info).toMatchObject({ state: "open", always: true });
    expect(openLine(info, new Date())).toBe("Open 24/7");
  });
  it("public holidays follow the local calendar", () => {
    // 3 October is German Unity Day.
    expect(state("Mo-Su 10:00-22:00; PH off", "2026-10-03T19:00:00+02:00")).toBe("closed");
    expect(state("Mo-Su 10:00-22:00; PH off", "2026-10-04T19:00:00+02:00")).toBe("open");
  });
});
