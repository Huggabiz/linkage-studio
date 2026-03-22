import { create } from 'zustand';
import type { Joint, Link, Body, JointType } from '../types';
import type { Vec2 } from '../types';
import { createId } from '../utils/id';
import { generateBodyLinks } from '../core/body-links';
import { BASE_BODY_COLOR, BODY_COLORS } from '../utils/constants';

interface HistorySnapshot {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
}

const BASE_BODY_ID = 'base';

function createBaseBody(): Body {
  return { id: BASE_BODY_ID, name: 'Base', color: BASE_BODY_COLOR, jointIds: [] };
}

interface MechanismStore {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;

  past: HistorySnapshot[];
  future: HistorySnapshot[];

  addJoint(type: JointType, position: Vec2, bodyIds?: string[]): string;
  removeJoint(id: string): void;
  moveJoint(id: string, position: Vec2): void;
  updateJointType(id: string, type: JointType): void;
  addLink(jointIdA: string, jointIdB: string): string | null;
  removeLink(id: string): void;

  addBody(name: string): string;
  removeBody(id: string): void;
  renameBody(id: string, name: string): void;
  setBodyColor(id: string, color: string): void;
  addJointToBody(jointId: string, bodyId: string): void;
  removeJointFromBody(jointId: string, bodyId: string): void;
  regenerateLinks(): void;

  pushHistory(): void;
  undo(): void;
  redo(): void;
}

export const useMechanismStore = create<MechanismStore>((set, get) => ({
  joints: {},
  links: {},
  bodies: { [BASE_BODY_ID]: createBaseBody() },
  baseBodyId: BASE_BODY_ID,
  past: [],
  future: [],

  pushHistory() {
    const { joints, links, bodies, baseBodyId, past } = get();
    set({
      past: [...past.slice(-50), { joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId }],
      future: [],
    });
  },

  undo() {
    const { past, joints, links, bodies, baseBodyId } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      joints: prev.joints,
      links: prev.links,
      bodies: prev.bodies,
      baseBodyId: prev.baseBodyId,
      past: past.slice(0, -1),
      future: [{ joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId }, ...get().future],
    });
  },

  redo() {
    const { future, joints, links, bodies, baseBodyId } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      joints: next.joints,
      links: next.links,
      bodies: next.bodies,
      baseBodyId: next.baseBodyId,
      future: future.slice(1),
      past: [...get().past, { joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId }],
    });
  },

  addJoint(type, position, bodyIds) {
    const id = createId();
    get().pushHistory();
    const joint: Joint = { id, type, position, connectedLinkIds: [] };

    // Add joint to state
    const newJoints = { ...get().joints, [id]: joint };
    const newBodies = { ...get().bodies };

    // Add to specified bodies
    if (bodyIds) {
      for (const bodyId of bodyIds) {
        if (newBodies[bodyId]) {
          newBodies[bodyId] = { ...newBodies[bodyId], jointIds: [...newBodies[bodyId].jointIds, id] };
        }
      }
    }

    // Derive joint type from base body membership
    const isFixed = newBodies[get().baseBodyId]?.jointIds.includes(id) ?? false;
    if (isFixed && type !== 'fixed') {
      newJoints[id] = { ...newJoints[id], type: 'fixed' };
    }

    // Regenerate links
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ joints: newJoints, links: newLinks, bodies: newBodies });
    return id;
  },

  removeJoint(id) {
    get().pushHistory();
    const newJoints = { ...get().joints };
    const newBodies = { ...get().bodies };

    // Remove joint from all bodies
    for (const bodyId of Object.keys(newBodies)) {
      const body = newBodies[bodyId];
      if (body.jointIds.includes(id)) {
        newBodies[bodyId] = { ...body, jointIds: body.jointIds.filter((jid) => jid !== id) };
      }
    }

    delete newJoints[id];

    // Regenerate links
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ joints: newJoints, links: newLinks, bodies: newBodies });
  },

  moveJoint(id, position) {
    set((s) => {
      const joint = s.joints[id];
      if (!joint) return s;
      return { joints: { ...s.joints, [id]: { ...joint, position } } };
    });
  },

  updateJointType(id, type) {
    get().pushHistory();
    set((s) => {
      const joint = s.joints[id];
      if (!joint) return s;
      return { joints: { ...s.joints, [id]: { ...joint, type } } };
    });
  },

  addLink(jointIdA, jointIdB) {
    // Legacy — links are now auto-generated. Keep for backward compat.
    if (jointIdA === jointIdB) return null;
    const { joints, links } = get();
    const jA = joints[jointIdA];
    const jB = joints[jointIdB];
    if (!jA || !jB) return null;
    const exists = Object.values(links).some(
      (l) =>
        (l.jointIds[0] === jointIdA && l.jointIds[1] === jointIdB) ||
        (l.jointIds[0] === jointIdB && l.jointIds[1] === jointIdA)
    );
    if (exists) return null;

    get().pushHistory();
    const id = createId();
    const link: Link = {
      id,
      jointIds: [jointIdA, jointIdB],
      restLength: Math.sqrt(
        (jA.position.x - jB.position.x) ** 2 + (jA.position.y - jB.position.y) ** 2
      ),
      mass: 1,
    };
    set((s) => ({
      links: { ...s.links, [id]: link },
      joints: {
        ...s.joints,
        [jointIdA]: { ...s.joints[jointIdA], connectedLinkIds: [...s.joints[jointIdA].connectedLinkIds, id] },
        [jointIdB]: { ...s.joints[jointIdB], connectedLinkIds: [...s.joints[jointIdB].connectedLinkIds, id] },
      },
    }));
    return id;
  },

  removeLink(id) {
    get().pushHistory();
    const link = get().links[id];
    if (!link) return;
    set((s) => {
      const newLinks = { ...s.links };
      delete newLinks[id];
      const newJoints = { ...s.joints };
      for (const jId of link.jointIds) {
        if (newJoints[jId]) {
          newJoints[jId] = {
            ...newJoints[jId],
            connectedLinkIds: newJoints[jId].connectedLinkIds.filter((l) => l !== id),
          };
        }
      }
      return { links: newLinks, joints: newJoints };
    });
  },

  addBody(name) {
    const id = createId();
    get().pushHistory();
    // Find first unused color
    const usedColors = new Set(Object.values(get().bodies).map((b) => b.color));
    const color = BODY_COLORS.find((c) => !usedColors.has(c)) || BODY_COLORS[0];
    // Auto-number: find next available number
    const existingNames = new Set(Object.values(get().bodies).map((b) => b.name));
    let num = 1;
    while (existingNames.has(`${name} ${num}`)) num++;
    const body: Body = { id, name: `${name} ${num}`, color, jointIds: [] };
    set((s) => ({ bodies: { ...s.bodies, [id]: body } }));
    return id;
  },

  removeBody(id) {
    if (id === get().baseBodyId) return; // Cannot remove base
    get().pushHistory();
    const newBodies = { ...get().bodies };
    delete newBodies[id];

    // Regenerate links and update joint types
    const newJoints = { ...get().joints };
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    syncJointTypes(newJoints, newBodies, get().baseBodyId);
    updateJointConnections(newJoints, newLinks);

    set({ bodies: newBodies, joints: newJoints, links: newLinks });
  },

  renameBody(id, name) {
    set((s) => {
      const body = s.bodies[id];
      if (!body) return s;
      return { bodies: { ...s.bodies, [id]: { ...body, name } } };
    });
  },

  setBodyColor(id, color) {
    set((s) => {
      const body = s.bodies[id];
      if (!body) return s;
      return { bodies: { ...s.bodies, [id]: { ...body, color } } };
    });
  },

  addJointToBody(jointId, bodyId) {
    get().pushHistory();
    const newBodies = { ...get().bodies };
    const body = newBodies[bodyId];
    if (!body || body.jointIds.includes(jointId)) return;
    newBodies[bodyId] = { ...body, jointIds: [...body.jointIds, jointId] };

    const newJoints = { ...get().joints };
    syncJointTypes(newJoints, newBodies, get().baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ bodies: newBodies, joints: newJoints, links: newLinks });
  },

  removeJointFromBody(jointId, bodyId) {
    get().pushHistory();
    const newBodies = { ...get().bodies };
    const body = newBodies[bodyId];
    if (!body) return;
    newBodies[bodyId] = { ...body, jointIds: body.jointIds.filter((id) => id !== jointId) };

    const newJoints = { ...get().joints };
    syncJointTypes(newJoints, newBodies, get().baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ bodies: newBodies, joints: newJoints, links: newLinks });
  },

  regenerateLinks() {
    const { bodies, joints, baseBodyId } = get();
    const newJoints = { ...joints };
    syncJointTypes(newJoints, bodies, baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(bodies, newJoints));
    updateJointConnections(newJoints, newLinks);
    set({ joints: newJoints, links: newLinks });
  },
}));

// --- Helpers ---

function buildLinksRecord(links: Link[]): Record<string, Link> {
  const record: Record<string, Link> = {};
  for (const link of links) record[link.id] = link;
  return record;
}

function updateJointConnections(joints: Record<string, Joint>, links: Record<string, Link>) {
  // Clear all connections
  for (const id of Object.keys(joints)) {
    joints[id] = { ...joints[id], connectedLinkIds: [] };
  }
  // Rebuild from links
  for (const link of Object.values(links)) {
    for (const jId of link.jointIds) {
      if (joints[jId]) {
        joints[jId] = { ...joints[jId], connectedLinkIds: [...joints[jId].connectedLinkIds, link.id] };
      }
    }
  }
}

function syncJointTypes(
  joints: Record<string, Joint>,
  bodies: Record<string, Body>,
  baseBodyId: string,
) {
  const baseJointIds = new Set(bodies[baseBodyId]?.jointIds ?? []);
  for (const id of Object.keys(joints)) {
    const shouldBeFixed = baseJointIds.has(id);
    if (joints[id].type !== (shouldBeFixed ? 'fixed' : 'revolute')) {
      joints[id] = { ...joints[id], type: shouldBeFixed ? 'fixed' : 'revolute' };
    }
  }
}
