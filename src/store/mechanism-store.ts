import { create } from 'zustand';
import type { Joint, Link, JointType } from '../types';
import type { Vec2 } from '../types';
import { createId } from '../utils/id';
import { distance } from '../core/math/vec2';

interface MechanismStore {
  joints: Record<string, Joint>;
  links: Record<string, Link>;

  past: Array<{ joints: Record<string, Joint>; links: Record<string, Link> }>;
  future: Array<{ joints: Record<string, Joint>; links: Record<string, Link> }>;

  addJoint(type: JointType, position: Vec2): string;
  removeJoint(id: string): void;
  moveJoint(id: string, position: Vec2): void;
  updateJointType(id: string, type: JointType): void;
  addLink(jointIdA: string, jointIdB: string): string | null;
  removeLink(id: string): void;

  pushHistory(): void;
  undo(): void;
  redo(): void;
}

export const useMechanismStore = create<MechanismStore>((set, get) => ({
  joints: {},
  links: {},
  past: [],
  future: [],

  pushHistory() {
    const { joints, links, past } = get();
    set({
      past: [...past.slice(-50), { joints: { ...joints }, links: { ...links } }],
      future: [],
    });
  },

  undo() {
    const { past, joints, links } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      joints: prev.joints,
      links: prev.links,
      past: past.slice(0, -1),
      future: [{ joints: { ...joints }, links: { ...links } }, ...get().future],
    });
  },

  redo() {
    const { future, joints, links } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      joints: next.joints,
      links: next.links,
      future: future.slice(1),
      past: [...get().past, { joints: { ...joints }, links: { ...links } }],
    });
  },

  addJoint(type, position) {
    const id = createId();
    get().pushHistory();
    const joint: Joint = { id, type, position, connectedLinkIds: [] };
    set((s) => ({ joints: { ...s.joints, [id]: joint } }));
    return id;
  },

  removeJoint(id) {
    get().pushHistory();
    const joint = get().joints[id];
    if (!joint) return;
    const linkIds = [...joint.connectedLinkIds];
    const newLinks = { ...get().links };
    const newJoints = { ...get().joints };
    for (const linkId of linkIds) {
      const link = newLinks[linkId];
      if (link) {
        for (const jId of link.jointIds) {
          if (jId !== id && newJoints[jId]) {
            newJoints[jId] = {
              ...newJoints[jId],
              connectedLinkIds: newJoints[jId].connectedLinkIds.filter((l) => l !== linkId),
            };
          }
        }
        delete newLinks[linkId];
      }
    }
    delete newJoints[id];
    set({ joints: newJoints, links: newLinks });
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
      restLength: distance(jA.position, jB.position),
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
}));
