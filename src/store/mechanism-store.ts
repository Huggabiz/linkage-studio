import { create } from 'zustand';
import type { Joint, Link, Body, Outline, CanvasImage, SliderConstraint, JointType } from '../types';
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
  sliders: Record<string, SliderConstraint>;
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
  sliders: Record<string, SliderConstraint>;

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

  addSlider(jointIdA: string, jointIdC: string, jointIdB: string): string;
  removeSlider(id: string): void;
  updateSliderT(id: string, t: number): void;
  getSliderForJoint(jointId: string): SliderConstraint | undefined;

  addTempJoint(position: Vec2, bodyId: string): string;
  removeTempJoint(id: string): void;
  reprojectOutlinesFromWorld(frozenWorldPoints: Map<string, Vec2[]>): void;

  clearAll(): void;
  loadState(state: { joints: Record<string, Joint>; links: Record<string, Link>; bodies: Record<string, Body>; baseBodyId: string; outlines: Record<string, Outline>; images?: Record<string, CanvasImage>; sliders?: Record<string, SliderConstraint> }): void;
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
  sliders: {},
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

  addSlider(jointIdA, jointIdC, jointIdB) {
    get().pushHistory();
    const id = createId();
    const slider: SliderConstraint = { id, jointIdA, jointIdB, jointIdC, t: 0.5 };
    const newSliders = { ...get().sliders, [id]: slider };
    // Regenerate links to include A-C distance constraint
    const { bodies, joints } = get();
    const newLinks = buildLinksRecord(generateBodyLinks(bodies, joints, newSliders));
    const newJoints = { ...joints };
    updateJointConnections(newJoints, newLinks);
    set({ sliders: newSliders, links: newLinks, joints: newJoints });
    return id;
  },

  removeSlider(id) {
    set((s) => {
      const newSliders = { ...s.sliders };
      delete newSliders[id];
      return { sliders: newSliders };
    });
  },

  updateSliderT(id, t) {
    set((s) => {
      const slider = s.sliders[id];
      if (!slider) return s;
      return { sliders: { ...s.sliders, [id]: { ...slider, t: Math.max(0, Math.min(1, t)) } } };
    });
  },

  getSliderForJoint(jointId) {
    const { sliders } = get();
    return Object.values(sliders).find(
      (s) => s.jointIdA === jointId || s.jointIdB === jointId || s.jointIdC === jointId,
    );
  },

  addTempJoint(position, bodyId) {
    const id = '__temp_' + createId();
    const joint: Joint = { id, type: 'revolute', position, connectedLinkIds: [] };
    const newJoints = { ...get().joints, [id]: joint };
    const { bodies, links } = get();
    const body = bodies[bodyId];
    if (!body) {
      set({ joints: newJoints });
      return id;
    }

    // DON'T add temp joint to body or regenerate body links.
    // Instead, manually create links from temp joint to 2 nearest body joints.
    // This transfers force without changing the body's rigid structure.
    const bodyJoints = body.jointIds
      .map((jid) => newJoints[jid])
      .filter((j): j is Joint => !!j)
      .map((j) => {
        const dx = j.position.x - position.x;
        const dy = j.position.y - position.y;
        return { id: j.id, dist: Math.sqrt(dx * dx + dy * dy) };
      })
      .sort((a, b) => a.dist - b.dist);

    const newLinks = { ...links };
    const targets = bodyJoints.slice(0, Math.min(2, bodyJoints.length));
    for (const target of targets) {
      const linkId = `__templink_${id}_${target.id}`;
      newLinks[linkId] = {
        id: linkId,
        jointIds: [id, target.id],
        restLength: target.dist,
        mass: 1,
      };
      newJoints[id] = { ...newJoints[id], connectedLinkIds: [...newJoints[id].connectedLinkIds, linkId] };
      if (newJoints[target.id]) {
        newJoints[target.id] = { ...newJoints[target.id], connectedLinkIds: [...newJoints[target.id].connectedLinkIds, linkId] };
      }
    }

    set({ joints: newJoints, links: newLinks });
    return id;
  },

  removeTempJoint(id) {
    const newJoints = { ...get().joints };
    const newLinks = { ...get().links };

    // Remove temp links connected to this joint
    for (const linkId of Object.keys(newLinks)) {
      if (linkId.startsWith('__templink_')) {
        const link = newLinks[linkId];
        if (link.jointIds.includes(id)) {
          // Clean up connectedLinkIds on the other joint
          const otherId = link.jointIds[0] === id ? link.jointIds[1] : link.jointIds[0];
          if (newJoints[otherId]) {
            newJoints[otherId] = {
              ...newJoints[otherId],
              connectedLinkIds: newJoints[otherId].connectedLinkIds.filter((lid) => lid !== linkId),
            };
          }
          delete newLinks[linkId];
        }
      }
    }

    delete newJoints[id];
    set({ joints: newJoints, links: newLinks });
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
      sliders: {},
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
      sliders: state.sliders || {},
      past: [],
      future: [],
    });
  },

  pushHistory() {
    const { joints, links, bodies, baseBodyId, outlines, images, sliders, past } = get();
    set({
      past: [...past.slice(-50), { joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId, outlines: { ...outlines }, images: { ...images }, sliders: { ...sliders } }],
      future: [],
    });
  },

  undo() {
    const { past, joints, links, bodies, baseBodyId, outlines, images, sliders } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      joints: prev.joints,
      links: prev.links,
      bodies: prev.bodies,
      baseBodyId: prev.baseBodyId,
      outlines: prev.outlines,
      images: prev.images || {},
      sliders: prev.sliders || {},
      past: past.slice(0, -1),
      future: [{ joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId, outlines: { ...outlines }, images: { ...images }, sliders: { ...sliders } }, ...get().future],
    });
  },

  redo() {
    const { future, joints, links, bodies, baseBodyId, outlines, images, sliders } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      joints: next.joints,
      links: next.links,
      bodies: next.bodies,
      baseBodyId: next.baseBodyId,
      outlines: next.outlines,
      images: next.images || {},
      sliders: next.sliders || {},
      future: future.slice(1),
      past: [...get().past, { joints: { ...joints }, links: { ...links }, bodies: { ...bodies }, baseBodyId, outlines: { ...outlines }, images: { ...images }, sliders: { ...sliders } }],
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
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints, get().sliders));
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

    // Remove sliders that reference this joint, and remove their other joints too
    const newSliders = { ...get().sliders };
    for (const [sid, slider] of Object.entries(newSliders)) {
      if (slider.jointIdA === id || slider.jointIdB === id || slider.jointIdC === id) {
        for (const jid of [slider.jointIdA, slider.jointIdB, slider.jointIdC]) {
          if (jid !== id && newJoints[jid]) {
            for (const bodyId of Object.keys(newBodies)) {
              const body = newBodies[bodyId];
              if (body.jointIds.includes(jid)) {
                newBodies[bodyId] = { ...body, jointIds: body.jointIds.filter((j) => j !== jid) };
              }
            }
            delete newJoints[jid];
          }
        }
        delete newSliders[sid];
      }
    }

    // Regenerate links
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints, get().sliders));
    updateJointConnections(newJoints, newLinks);

    set({ joints: newJoints, links: newLinks, bodies: newBodies, outlines: newOutlines, sliders: newSliders });
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
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints, get().sliders));
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
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints, get().sliders));
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
    const newLinks = buildLinksRecord(generateBodyLinks(newBodies, newJoints, get().sliders));
    updateJointConnections(newJoints, newLinks);

    set({ bodies: newBodies, joints: newJoints, links: newLinks, outlines: newOutlines });
  },

  regenerateLinks() {
    const { bodies, joints, baseBodyId } = get();
    const newJoints = { ...joints };
    syncJointTypes(newJoints, bodies, baseBodyId);
    const newLinks = buildLinksRecord(generateBodyLinks(bodies, newJoints, get().sliders));
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
