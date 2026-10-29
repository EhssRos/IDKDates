import { describe, expect, it } from "vitest";
import { addToList, createList, removeFromList, renameList, starterLists, toSaved } from "../../src/core/lists";
import { memoryStore } from "../../src/core/storage";
import { changesToPush, flatten, mergePulled, unflatten } from "../../src/core/sync";
import { SyncEngine } from "../../src/core/syncEngine";
import type { PlaceList, Visit } from "../../src/core/types";
import { FakeServer } from "./fakeBackend";

const place = (name: string, tags = { amenity: "restaurant" }) => toSaved({ id: "node/" + name, name, lat: 52.5, lon: 13.4, tags }, undefined, 1000 + name.length);
const visit = (id: string, name: string, over: Partial<Visit> = {}): Visit => ({
  visit: id, placeId: "node/" + name, name, kind: "Restaurant", mood: "food", lat: 52.5, lon: 13.4, date: Date.parse("2026-10-20"),
  loved: false, ratings: { a: 0, b: 0 }, note: "", ...over
});

/** One phone: its saved data and its sync engine. */
class Phone {
  lists: PlaceList[] = starterLists();
  visits: Visit[] = [];
  engine: SyncEngine;
  backend;
  constructor(server: FakeServer, public email: string) {
    this.backend = server.backendFor();
    this.engine = new SyncEngine(this.backend, memoryStore(), {
      read: () => ({ lists: this.lists, visits: this.visits }),
      write: (l, v) => { this.lists = l; this.visits = v; }
    });
  }
  async signIn() { return this.backend.verifyCode(this.email, "123456"); }
  async start(name: string) {
    const me = await this.signIn();
    this.engine.attach(me.id, await this.backend.createSpace(name));
    await this.engine.syncNow();
  }
  async join(code: string, name: string) {
    const me = await this.signIn();
    this.engine.attach(me.id, await this.backend.joinSpace(code, name));
    await this.engine.syncNow();
  }
  places(listName = "Our favorites") { return this.lists.find(l => l.name === listName)?.places.map(p => p.name).sort() ?? []; }
}

describe("flattening", () => {
  it("round-trips lists and visits", () => {
    let lists = addToList(starterLists(), "favorites", place("Nonna"));
    lists = createList(lists, "Lunch", 5).lists;
    const visits = [visit("v1", "Nonna", { ratings: { a: 4, b: 5 }, note: "Tiramisu", loved: true })];
    const people = { me: "u1", partner: "u2" };
    const back = unflatten(flatten(lists, visits, people), people);
    expect(back.lists.map(l => [l.name, l.places.map(p => p.name)])).toEqual([["Our favorites", ["Nonna"]], ["Lunch", []]]);
    expect(back.visits).toEqual(visits);
  });

  it("never sends the partner’s rating", () => {
    const people = { me: "u1", partner: "u2" };
    const local = flatten([], [visit("v1", "X", { ratings: { a: 3, b: 5 } })], people);
    const kinds = changesToPush({}, local, "u1").map(i => `${i.kind}:${i.owner ?? ""}`);
    expect(kinds.sort()).toEqual(["rating:u1", "visit:"]);
  });

  it("keeps changes made here when the server also changed them", () => {
    const shadow = { "list:a": { kind: "list" as const, id: "a", data: { name: "Old" }, deleted: false } };
    const local = { "list:a": { kind: "list" as const, id: "a", data: { name: "Mine" }, deleted: false } };
    const m = mergePulled(shadow, local, [{ kind: "list", id: "a", data: { name: "Theirs" }, deleted: false }]);
    expect(m.local["list:a"].data.name).toBe("Mine");
    expect(changesToPush(m.shadow, m.local, null)[0].data.name).toBe("Mine");
  });
});

describe("two phones sharing", () => {
  it("your first sign-in saves what’s already on the phone", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com");
    alex.lists = addToList(alex.lists, "favorites", place("Nonna"));
    await alex.start("Alex");
    expect(alex.engine.status.kind).toBe("synced");
    const alexTablet = new Phone(server, "alex@example.com");
    alexTablet.lists = [];
    await alexTablet.start("Alex");
    expect(alexTablet.places()).toEqual(["Nonna"]);
  });

  it("when the partner joins, both lists merge and both phones see everything", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    alex.lists = addToList(alex.lists, "favorites", place("Nonna"));
    sam.lists = addToList(sam.lists, "favorites", place("Thai Corner"));
    sam.visits = [visit("v-sam", "Thai Corner", { ratings: { a: 5, b: 0 } })];
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    await alex.engine.syncNow();
    expect(alex.places()).toEqual(["Nonna", "Thai Corner"]);
    expect(sam.places()).toEqual(["Nonna", "Thai Corner"]);
    expect(alex.lists.filter(l => l.name === "Our favorites")).toHaveLength(1);
    expect(alex.engine.partner?.name).toBe("Sam");
    // Sam’s own rating is “a” on Sam’s phone and “b” (the partner) on Alex’s.
    expect(alex.visits[0].ratings).toEqual({ a: 0, b: 5 });
  });

  it("each person rates for themselves, and can’t change the other’s rating", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    alex.visits = [visit("v1", "Ramen Bar")];
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    alex.visits = alex.visits.map(v => ({ ...v, ratings: { ...v.ratings, a: 4 } }));
    sam.visits = sam.visits.map(v => ({ ...v, ratings: { a: 5, b: 1 } })); // Sam tries to change Alex’s rating too
    await alex.engine.syncNow(); await sam.engine.syncNow(); await alex.engine.syncNow(); await sam.engine.syncNow();
    expect(alex.visits[0].ratings).toEqual({ a: 4, b: 5 });
    expect(sam.visits[0].ratings).toEqual({ a: 5, b: 4 });
    expect(sam.engine.status.kind).toBe("synced");
  });

  it("removals, renames, notes and loves reach the other phone", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    alex.lists = addToList(addToList(alex.lists, "favorites", place("Nonna")), "favorites", place("Pho"));
    alex.visits = [visit("v1", "Nonna")];
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    sam.lists = renameList(removeFromList(sam.lists, "favorites", "node/Pho"), "favorites", "Date night");
    sam.visits = sam.visits.map(v => ({ ...v, note: "The tiramisu", loved: true }));
    await sam.engine.syncNow();
    await alex.engine.syncNow();
    expect(alex.places("Date night")).toEqual(["Nonna"]);
    expect(alex.visits[0]).toMatchObject({ note: "The tiramisu", loved: true });
    sam.visits = [];
    await sam.engine.syncNow(); await alex.engine.syncNow();
    expect(alex.visits).toEqual([]);
  });

  it("when both change the same thing, the last change wins and both end up the same", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    alex.lists = renameList(alex.lists, "favorites", "Alex’s name");
    sam.lists = renameList(sam.lists, "favorites", "Sam’s name");
    await alex.engine.syncNow(); await sam.engine.syncNow(); await alex.engine.syncNow();
    expect(alex.lists[0].name).toBe("Sam’s name");
    expect(sam.lists[0].name).toBe("Sam’s name");
  });

  it("offline: keeps everything, says so, and catches up later", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    server.offline = true;
    alex.lists = addToList(alex.lists, "favorites", place("Offline Find"));
    await alex.engine.syncNow();
    expect(alex.engine.status.kind).toBe("offline");
    expect(alex.places()).toEqual(["Offline Find"]);
    server.offline = false;
    await alex.engine.syncNow(); await sam.engine.syncNow();
    expect(sam.places()).toEqual(["Offline Find"]);
  });

  it("ratings entered for the partner before they joined stay until they rate it themselves", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    alex.visits = [visit("v1", "Ramen", { ratings: { a: 4, b: 3 } })];
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    await alex.engine.syncNow();
    expect(alex.visits[0].ratings).toEqual({ a: 4, b: 3 });
    sam.visits = sam.visits.map(v => ({ ...v, ratings: { ...v.ratings, a: 5 } }));
    await sam.engine.syncNow(); await alex.engine.syncNow();
    expect(alex.visits[0].ratings).toEqual({ a: 4, b: 5 });
  });

  it("leaving keeps a copy on the phone and stops syncing", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com");
    alex.lists = addToList(alex.lists, "favorites", place("Nonna"));
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    await sam.backend.leaveSpace();
    await sam.engine.syncNow();
    expect(sam.engine.active).toBe(false);
    expect(sam.places()).toEqual(["Nonna"]);
    alex.lists = addToList(alex.lists, "favorites", place("New"));
    await alex.engine.syncNow();
    expect(sam.places()).toEqual(["Nonna"]);
  });

  it("a full space can’t be joined", async () => {
    const server = new FakeServer();
    const alex = new Phone(server, "alex@example.com"), sam = new Phone(server, "sam@example.com"), eve = new Phone(server, "eve@example.com");
    await alex.start("Alex");
    await sam.join(alex.engine.spaceInfo!.inviteCode, "Sam");
    await eve.signIn();
    await expect(eve.backend.joinSpace(alex.engine.spaceInfo!.inviteCode, "Eve")).rejects.toThrow("space_full");
  });
});
