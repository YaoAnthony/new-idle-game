import type { SystemLite } from '../Types/System';

export type SystemRelationshipState = {
    isOwner: boolean;
    isMember: boolean;
    hasExplicitRelationship: boolean;
};

export const sameId = (left?: string | null, right?: string | null) => (
    Boolean(left && right) && String(left) === String(right)
);

export const hasRelationshipPayload = (system: SystemLite) => (
    Boolean(system.relationship)
    || typeof system.isOwner === 'boolean'
    || typeof system.isMember === 'boolean'
);

export const getSystemRelationship = (
    system: SystemLite,
    profileId?: string | null,
): SystemRelationshipState => {
    const explicitOwner = system.relationship?.isOwner ?? system.isOwner;
    const explicitMember = system.relationship?.isMember ?? system.isMember;
    const fallbackOwner = sameId(system.profile || null, profileId || null);

    return {
        isOwner: typeof explicitOwner === 'boolean' ? explicitOwner : fallbackOwner,
        isMember: typeof explicitMember === 'boolean'
            ? explicitMember
            : Boolean(profileId) && !fallbackOwner,
        hasExplicitRelationship: hasRelationshipPayload(system),
    };
};

export const isOwnedSystem = (system: SystemLite, profileId?: string | null) => (
    getSystemRelationship(system, profileId).isOwner
);

export const isMemberSystem = (system: SystemLite, profileId?: string | null) => (
    getSystemRelationship(system, profileId).isMember
);

export const canMaintainSystemInGame = (system: SystemLite, profileId?: string | null) => {
    const relationship = getSystemRelationship(system, profileId);
    return relationship.isOwner && relationship.isMember;
};

export const uniqueSystems = (systems: SystemLite[]) => {
    const seen = new Set<string>();
    return systems.filter((system) => {
        if (!system?._id || seen.has(system._id)) return false;
        seen.add(system._id);
        return true;
    });
};

export const getOwnedSystems = (systems: SystemLite[], profileId?: string | null) => (
    uniqueSystems(systems).filter((system) => isOwnedSystem(system, profileId))
);

export const getMemberSystems = (systems: SystemLite[], profileId?: string | null) => (
    uniqueSystems(systems).filter((system) => isMemberSystem(system, profileId))
);

export const getFirstMemberSystemId = (systems: SystemLite[], profileId?: string | null) => (
    getMemberSystems(systems, profileId)[0]?._id || null
);

export const getVisibleSystems = (systems: SystemLite[]) => uniqueSystems(systems);
