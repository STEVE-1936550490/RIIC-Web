import { BUILDING_ROOM_LABELS, type BuildingRoomPrefix } from "../../../building-rooms.ts";
import type { RoomGroup } from "../../../schedule.ts";
import type { RoomKind } from "../../../types.ts";
import type { SafeCurrentPlanRoom } from "../context-contract.ts";

// Existing domain names only: RoomKind, MAA group and skill-room prefix/label.
const ROOM_ALIASES: Record<RoomKind, { prefix: BuildingRoomPrefix; group: RoomGroup }> = {
  control_center: { prefix: "control", group: "control" },
  trade_post: { prefix: "trade", group: "trading" },
  factory: { prefix: "manu", group: "manufacture" },
  power_plant: { prefix: "power", group: "power" },
  dormitory: { prefix: "dorm", group: "dormitory" },
  office: { prefix: "hire", group: "hire" },
  meeting_room: { prefix: "meet", group: "meeting" },
  workshop: { prefix: "workshop", group: "processing" },
  training_room: { prefix: "train", group: "training" },
};

export function normalizeRoomReference(value: string): string {
  return value.trim().replace(/\s+/gu, " ").replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** The caller validates the complete catalog before resolving; never truncate before matching. */
export function resolveCurrentPlanRooms(roomRef: string, rooms: readonly SafeCurrentPlanRoom[]): SafeCurrentPlanRoom[] {
  const exact = rooms.filter((room) => room.roomId === roomRef.trim());
  const normalized = normalizeRoomReference(roomRef);
  const labels = rooms.filter((room) => normalizeRoomReference(room.label) === normalized);
  const matches = exact.length ? exact : labels.length ? labels : rooms.filter((room) => {
    const alias = ROOM_ALIASES[room.kind];
    return [room.kind, alias.group, alias.prefix, BUILDING_ROOM_LABELS[alias.prefix]].includes(normalized);
  });
  return [...matches].sort((left, right) => left.layoutOrder - right.layoutOrder
    || (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER)
    || (left.roomId < right.roomId ? -1 : left.roomId > right.roomId ? 1 : 0));
}
