import { create } from 'zustand';
import type { Joint, Link, Body, Outline, CanvasImage, JointType } from '../types';
import type { Vec2 } from '../types';
import { createId } from '../utils/id';
import { generateBodyLinks } from '../core/body-links';
import { computeBodyTransform, localToWorld, worldToLocal } from '../core/body-transform';
import { BASE_BODY_COLOR, BODY_COLORS } from '../utils/constants';

interface HistorySnapshot {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
  images: Record<string, CanvasImage>;
}

const BASE_BODY_ID = 'base';

function createBaseBody(): Body {
  return { id: BASE_BODY_ID, name: 'Base', color: BASE_BODY_COLOR, jointIds: [], useOutlineCOM: false };
}

interface MechanismStore {
  joints: Record<string, Joint>;
  links: Record<string, Link>;
  bodies: Record<string, Body>;
  baseBodyId: string;
  outlines: Record<string, Outline>;
  images: Record<string, CanvasImage>;

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

  addOutline(bodyId: string, localPoints: Vec2[]): string;
  removeOutline(id: string): void;
  renameOutline(id: string, name: string): void;
  toggleOutlineCOM(bodyId: string): void;

  addImage(bodyId: string, src: string, naturalWidth: number, naturalHeight: number, position: Vec2): string;
  removeImage(id: string): void;
  updateImage(id: string, updates: Partial<Pick<CanvasImage, 'position' | 'scale' | 'rotation' | 'opacity' | 'visible'>>): void;

  addTempJoint(position: Vec2, bodyId: string): string;
  removeTempJoint(id: string): void;
  reprojectOutlinesFromWorld(frozenWorldPoints: Map<string, Vec2[]>): void;

  clearAll(): void;
  loadState(state: { joints: Record<string, Joint>; links: Record<string, Link>; bodies: Record<string, Body>; baseBodyId: string; outlines: Record<string, Outline>; images?: Record<string, CanvasImage> }): void;
  pushHistory(): void;
  undo(): void;
  redo(): void;
}

export const useMechanismStore = create<MechanismStore>((set, get) => ({
  joints: {},
  links: {},
  bodies: { [BASE_BODY_ID]: createBaseBody() },
  baseBodyId: BASE_BODY_ID,
  outlines: {},
  images: {},
  past: [],
  future: [],

  addImage(bodyId, src, naturalWidth, naturalHeight, position) {
    const id = createId();
    get().pushHistory();
    const image: CanvasImage = {
      id, bodyId, src, position,
      scale: 1, rotation: 0, opacity: 0.5, visible: true,
      naturalWidth, naturalHeight,
    };
    set((s) => ({ images: { ...s.images, [id]: image } }));
    return id;
  },

  removeImage(id) {
    get().pushHistory();
    set((s) => {
      const newImages = { ...s.images };
      delete newImages[id];
      return { images: newImages };
    });
  },

  updateImage(id, updates) {
    set((s) => {
      const img = s.images[id];
      if (!img) return s;
      return { images: { ...s.images, [id]: { ...img, ...updates } } };
    });
  },

  addTempJoint(position, bodyId) {
    const id = '__temp_' + createId();
    const joint: Joint = { id, type: 'revolute', position, connectedLinkIds: [] };
    const newJoints = { ...get().joints, [id]: joint };
    const newBodies = { ...get().bodies };
    const body = newBodies[bodyId];
    if (body) {
      newBodies[bodyId] = { ...body, jointIds: [...body.jointIds, id] };
    }
    // Regenerate links so the temp joint is constrained to the body
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);
    set({ joints: newJoints, links: newLinks, bodies: newBodies });
    return id;
  },

  removeTempJoint(id) {
    const newJoints = { ...get().joints };
    const newBodies = { ...get().bodies };
    // Remove from all bodies
    for (const bodyId of Object.keys(newBodies)) {
      const body = newBodies[bodyId];
      if (body.jointIds.includes(id)) {
        newBodies[bodyId] = { ...body, jointIds: body.jointIds.filter((jid) => jid !== id) };
      }
    }
    delete newJoints[id];
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);
    set({ joints: newJoints, links: newLinks, bodies: newBodies });
  },

  reprojectOutlinesFromWorld(frozenWorldPoints) {
    get().pushHistory();
    const { outlines, bodies, joints } = get();
    const newOutlines = { ...outlines };
    for (const [outlineId, worldPts] of frozenWorldPoints) {
      const outline = newOutlines[outlineId];
      if (!outline) continue;
      const body = bodies[outline.bodyId];
      if (!body) continue;
      const transform = computeBodyTransform(body, joints);
      const newLocalPts = worldPts.map((p) => worldToLocal(p, transform));
      newOutlines[outlineId] = { ...outline, points: newLocalPts };
    }
    set({ outlines: newOutlines });
  },

  clearAll() {
    set({
      joints: {},
      links: {},
      bodies: { [BASE_BODY_ID]: createBaseBody() },
      baseBodyId: BASE_BODY_ID,
      outlines: {},
      images: {},
      past: [],
      future: [],
    });
  },

  loadState(state) {
    set({
      joints: state.joints,
      links: state.links,
      bodies: state.bodies,
      baseBodyId: state.baseBodyId,
      outlines: state.outlines,
      images: state.images || {},
      past: [],
      future: [],
    });
  },

  pushHistory() {
    const { joints, links, bodies, baseBodyId, outlines, images, past } = get();
    set({
      past: [...past.slice(-50), { joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId, outlines: { ...outlines }, images: { ...images } }],
      future: [],
    });
  },

  undo() {
    const { past, joints, links, bodies, baseBodyId, outlines, images } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      joints: prev.joints,
      links: prev.links,
      bodies: prev.bodies,
      baseBodyId: prev.baseBodyId,
      outlines: prev.outlines,
      images: prev.images || {},
      past: past.slice(0, -1),
      future: [{ joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId, outlines: { ...outlines }, images: { ...images } }, ...get().future],
    });
  },

  redo() {
    const { future, joints, links, bodies, baseBodyId, outlines, images } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      joints: next.joints,
      links: next.links,
      bodies: next.bodies,
      baseBodyId: next.baseBodyId,
      outlines: next.outlines,
      images: next.images || {},
      future: future.slice(1),
      past: [...get().past, { joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId, outlines: { ...outlines }, images: { ...images } }],
    });
  },

  addJoint(type, position, bodyIds) {
    const id = createId();
    get().pushHistory();
    const joint: Joint = { id, type, position, connectedLinkIds: [] };

    // Add joint to state
    const newJoints = { ...get().joints, [id]: joint };
    const newBodies = { ...get().bodies };

    // Add to specified bodies, reprojecting outlines to preserve world positions
    const oldBodies = get().bodies;
    const newOutlines = { ...get().outlines };
    if (bodyIds) {
      for (const bodyId of bodyIds) {
        if (newBodies[bodyId]) {
          const oldBody = oldBodies[bodyId];
          newBodies[bodyId] = { ...newBodies[bodyId], jointIds: [...newBodies[bodyId].jointIds, id] };
          reprojectOutlines(newOutlines, bodyId, oldBody, newBodies[bodyId], get().joints, newJoints);
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

    set({ joints: newJoints, links: newLinks, bodies: newBodies, outlines: newOutlines });
    return id;
  },

  removeJoint(id) {
    get().pushHistory();
    const oldBodies = get().bodies;
    const oldJoints = get().joints;
    const newJoints = { ...oldJoints };
    const newBodies = { ...oldBodies };
    const newOutlines = { ...get().outlines };

    // Remove joint from all bodies, reprojecting outlines
    for (const bodyId of Object.keys(newBodies)) {
      const body = newBodies[bodyId];
      if (body.jointIds.includes(id)) {
        const oldBody = oldBodies[bodyId];
        newBodies[bodyId] = { ...body, jointIds: body.jointIds.filter((jid) => jid !== id) };
        delete newJoints[id];
        reprojectOutlines(newOutlines, bodyId, oldBody, newBodies[bodyId], oldJoints, newJoints);
      }
    }

    delete newJoints[id];

    // Regenerate links
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ joints: newJoints, links: newLinks, bodies: newBodies, outlines: newOutlines });
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
    const body: Body = { id, name: `${name} ${num}`, color, jointIds: [], useOutlineCOM: false };
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

    // Remove associated outlines
    const newOutlines = { ...get().outlines };
    for (const [oid, outline] of Object.entries(newOutlines)) {
      if (outline.bodyId === id) delete newOutlines[oid];
    }

    set({ bodies: newBodies, joints: newJoints, links: newLinks, outlines: newOutlines });
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
    const oldBodies = get().bodies;
    const newBodies = { ...oldBodies };
    const body = newBodies[bodyId];
    if (!body || body.jointIds.includes(jointId)) return;
    newBodies[bodyId] = { ...body, jointIds: [...body.jointIds, jointId] };

    const newJoints = { ...get().joints };
    const newOutlines = { ...get().outlines };
    reprojectOutlines(newOutlines, bodyId, oldBodies[bodyId], newBodies[bodyId], get().joints, newJoints);
    syncJointTypes(newJoints, newBodies, get().baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ bodies: newBodies, joints: newJoints, links: newLinks, outlines: newOutlines });
  },

  removeJointFromBody(jointId, bodyId) {
    get().pushHistory();
    const oldBodies = get().bodies;
    const newBodies = { ...oldBodies };
    const body = newBodies[bodyId];
    if (!body) return;
    newBodies[bodyId] = { ...body, jointIds: body.jointIds.filter((id) => id !== jointId) };

    const newJoints = { ...get().joints };
    const newOutlines = { ...get().outlines };
    reprojectOutlines(newOutlines, bodyId, oldBodies[bodyId], newBodies[bodyId], get().joints, newJoints);
    syncJointTypes(newJoints, newBodies, get().baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints));
    updateJointConnections(newJoints, newLinks);

    set({ bodies: newBodies, joints: newJoints, links: newLinks, outlines: newOutlines });
  },

  regenerateLinks() {
    const { bodies, joints, baseBodyId } = get();
    const newJoints = { ...joints };
    syncJointTypes(newJoints, bodies, baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(bodies, newJoints));
    updateJointConnections(newJoints, newLinks);
    set({ joints: newJoints, links: newLinks });
  },

  addOutline(bodyId, localPoints) {
    const id = createId();
    get().pushHistory();
    // Auto-name: find next available "Shape N"
    const existingNames = new Set(Object.values(get().outlines).map((o) => o.name));
    let num = 1;
    while (existingNames.has(`Shape ${num}`)) num++;
    const outline: Outline = { id, bodyId, name: `Shape ${num}`, points: localPoints };
    set((s) => ({ outlines: { ...s.outlines, [id]: outline } }));
    return id;
  },

  renameOutline(id, name) {
    set((s) => {
      const outline = s.outlines[id];
      if (!outline) return s;
      return { outlines: { ...s.outlines, [id]: { ...outline, name } } };
    });
  },

  removeOutline(id) {
    get().pushHistory();
    set((s) => {
      const newOutlines = { ...s.outlines };
      delete newOutlines[id];
      return { outlines: newOutlines };
    });
  },

  toggleOutlineCOM(bodyId) {
    set((s) => {
      const body = s.bodies[bodyId];
      if (!body) return s;
      return { bodies: { ...s.bodies, [bodyId]: { ...body, useOutlineCOM: !body.useOutlineCOM } } };
    });
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

/**
 * Reproject outlines for a body when its joints change.
 * Converts local points to world using the OLD transform, then back to local using the NEW transform.
 * This preserves the world-space positions of the outline.
 */
function reprojectOutlines(
  outlines: Record<string, Outline>,
  bodyId: string,
  oldBody: Body,
  newBody: Body,
  oldJoints: Record<string, Joint>,
  newJoints: Record<string, Joint>,
) {
  const oldTransform = computeBodyTransform(oldBody, oldJoints);
  const newTransform = computeBodyTransform(newBody, newJoints);

  for (const id of Object.keys(outlines)) {
    if (outlines[id].bodyId !== bodyId) continue;
    const worldPts = outlines[id].points.map((p) => localToWorld(p, oldTransform));
    const newLocalPts = worldPts.map((p) => worldToLocal(p, newTransform));
    outlines[id] = { ...outlines[id], points: newLocalPts };
  }
}
