import { describe, expect, it } from "vitest";
import { address, factsSentence, hoursText, kindOf, trimText } from "../../src/core/describe";

describe("describing places", () => {
  it("gives kinds of places friendly names", () => {
    expect(kindOf({ amenity: "restaurant", cuisine: "italian;pizza" })).toBe("Italian restaurant");
    expect(kindOf({ amenity: "fast_food", cuisine: "burger" })).toBe("Burger, quick bite");
    expect(kindOf({ amenity: "nightclub" })).toBe("Club");
    expect(kindOf({ leisure: "sports_centre", sport: "climbing" })).toBe("Climbing");
    expect(kindOf({ natural: "water", water: "lake" })).toBe("Lake");
    expect(kindOf({ amenity: "cafe" })).toBe("Café");
    expect(kindOf({ shop: "bakery" })).toBe("Somewhere new");
  });
  it("turns facts into one sentence", () => {
    expect(factsSentence({ outdoor_seating: "yes" }, "Café")).toBe("Café with outdoor seating.");
    expect(factsSentence({ outdoor_seating: "yes", "diet:vegan": "yes", wheelchair: "yes" }, "Bar"))
      .toBe("Bar with outdoor seating, vegan options and step-free access.");
    expect(factsSentence({ "diet:vegan": "only" }, "Restaurant")).toBe("Restaurant with a fully vegan menu.");
    expect(factsSentence({ natural: "peak", ele: "1234" }, "Peak")).toBe("Peak with an elevation of 1,234 m.");
    expect(factsSentence({}, "Park")).toBe("");
  });
  it("tidies addresses and opening hours", () => {
    expect(address({ "addr:street": "Linienstraße", "addr:housenumber": "12", "addr:city": "Berlin" })).toBe("Linienstraße 12, Berlin");
    expect(address({})).toBe("");
    expect(hoursText("Mo-Fr 12:00-22:00; Sa,Su off; PH off")).toBe("Mon-Fri 12:00-22:00\nSat,Sun closed\nHolidays closed");
    expect(hoursText("24/7")).toBe("Open 24/7");
    expect(hoursText(undefined)).toBe("");
  });
  it("shortens text without a stray ellipsis", () => {
    expect(trimText("Short.")).toBe("Short.");
    expect(trimText("First sentence is long enough to keep around for a while, really it is. " + "x".repeat(400)))
      .toBe("First sentence is long enough to keep around for a while, really it is.");
    expect(trimText("one two three four five six seven", 20)).toBe("one two three four…");
    expect(trimText("A".repeat(150) + ". " + "b ".repeat(200))).toBe("A".repeat(150) + ".");
  });
});
